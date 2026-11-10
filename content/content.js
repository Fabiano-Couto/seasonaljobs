const BTN_ID = 'sj-auto-apply-btn';
const CARD_BTN_CLASS = 'sj-card-apply-btn';

function textOf(el) {
  // innerText é undefined em SVG/ícones; textContent cobre esses casos
  return el ? (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim() : '';
}

function emailFromMailto(link) {
  let email = (link.getAttribute('href') || '').replace(/^mailto:\s*/i, '').split('?')[0];
  try { email = decodeURIComponent(email); } catch (e) { /* href já veio decodificado */ }
  return email.trim();
}

function jobKeyOf(job) {
  // Duas vagas da mesma empresa podem ter o mesmo e-mail: a chave inclui título e empresa
  return [job.email, job.jobTitle, job.companyName].join('|');
}

// ---------- SeasonalJobs (seasonaljobs.dol.gov) ----------

function extractSeasonalJobs() {
  let email = null;
  // innerText do corpo uma só vez por verificação (roda a cada 1 s e força o layout da página): o texto com quebras
  // de linha serve para a empresa ("Company Name:\nACME"); o com espaços colapsados, para o e-mail e o modelo
  const rawText = document.body.innerText || document.body.textContent || '';
  const bodyText = rawText.replace(/\s+/g, ' ').trim();

  // Tentativa 1: Regex focada no texto
  const emailMatch = bodyText.match(/Email address to Apply:\s*([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/i);
  if (emailMatch && emailMatch[1]) {
    email = emailMatch[1].trim();
  }

  // Tentativa 2: Busca por links apenas dentro do conteúdo principal (ignora rodapé/cabeçalho)
  if (!email) {
    const mainContainer = document.querySelector('main') || document.body;
    for (const link of mainContainer.querySelectorAll('a[href^="mailto:"]')) {
      // Só aceita o link se o texto visível for de fato um e-mail (contém @)
      if (textOf(link).includes('@')) {
        email = emailFromMailto(link);
      }
    }
  }

  if (!email) return null;

  let jobTitle = 'Job Application';
  for (const el of document.querySelectorAll('h1, h2, h3, .text-2xl, .text-3xl, .font-bold')) {
    const text = textOf(el);
    if (text && !text.toLowerCase().includes('seasonaljobs.dol.gov') && text.length < 60) {
      jobTitle = text;
      break;
    }
  }

  let companyName = 'the company';
  const companyMatch = rawText.match(/Company Name:\s*\n*([^\n]+)/i);
  if (companyMatch && companyMatch[1]) {
    companyName = companyMatch[1].trim();
  }

  return { email, jobTitle, companyName, bodyText };
}

// ---------- CoolWorks (coolworks.com) ----------

function isCoolWorks() {
  return location.hostname.endsWith('coolworks.com');
}

// JSON-LD da página aberta: JobPosting na vaga, Organization no perfil. É a fonte principal de cargo e empresa
// (sobreviveu à reforma do layout de nov/2026). O Turbo pode deixar no <head> o da página anterior: só vale o
// bloco cujo @id (vaga) ou url (perfil) é a página aberta — o Organization da própria CoolWorks tem url "/".
function readCoolWorksLd(type) {
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const data = JSON.parse(script.textContent);
      const ref = data['@id'] || data.url;
      if (data['@type'] === type && (!ref || ref.includes(location.pathname))) return data;
    } catch (e) { /* JSON-LD malformado: segue para o próximo */ }
  }
  return {};
}

// E-mail do bloco "How to Apply" / "Contact Info" (mesmo bloco na página de vaga e no perfil)
function findApplyEmail(howToApply) {
  // O primeiro mailto é o de "How to Apply" quando existe; senão o de "Contact Info"
  const mailLink = howToApply.querySelector('a[href^="mailto:"]');
  const email = mailLink ? emailFromMailto(mailLink) : '';
  if (email.includes('@')) return email;
  const textMatch = textOf(howToApply).match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return textMatch ? textMatch[0] : '';
}

// Página de uma vaga só: /<empresa>/highlighted-job/... ou /<empresa>/help-wanted/...
function extractCoolWorks() {
  const frame = document.querySelector('turbo-frame[id^="highlighted_job_"], turbo-frame[id^="help_wanted_now_ad_"]');
  const howToApply = frame && frame.querySelector('#how-to-apply');
  if (!howToApply) return null;

  // Várias vagas só têm o "Apply Now" para um sistema externo (Paycom, Workday...): sem e-mail, sem botão
  const email = findApplyEmail(howToApply);
  if (!email) return null;

  // Em nov/2026 a CoolWorks reformulou a página: o cargo foi do h3 para o h2 e a empresa do h4 para o h3, e o
  // primeiro h4 virou subtítulo da descrição — o e-mail saía "Application for Beach Bags at Work Hard I Play...".
  // Por isso o JSON-LD vem primeiro; o HTML só cobre página sem ele, com seletores que servem nos dois layouts:
  // primeiro h2/h3 do bloco = cargo, primeiro link para o perfil da empresa = empresa.
  const ld = readCoolWorksLd('JobPosting');
  return {
    email,
    jobTitle: ld.title || textOf(frame.querySelector('h2, h3')) || 'Job Application',
    companyName: (ld.hiringOrganization || {}).name || textOf(frame.querySelector('a[href$="/profile"]')) || 'the company',
    bodyText: textOf(frame)
  };
}

// Perfil da empresa (/<empresa>/profile): lista "Current Job Openings" sem página própria por vaga.
// O "How to Apply" é da empresa e vale para todas as vagas da lista.
function extractCoolWorksOpenings() {
  const profile = document.querySelector('turbo-frame[id^="profile_"]');
  const howToApply = profile && profile.querySelector('#how-to-apply');
  if (!howToApply) return [];

  const email = findApplyEmail(howToApply);
  if (!email) return [];

  // Nome da empresa: JSON-LD do perfil; senão o topo do perfil — primeiro h2 no layout de nov/2026, primeiro h4 no
  // antigo (no novo, o primeiro h4 é o título da primeira vaga: o e-mail saía "Application for Housekeeper at Housekeeper")
  const logo = document.querySelector('.employer-logo img');
  const companyName = readCoolWorksLd('Organization').name || textOf(profile.querySelector('h2, h4'))
    || (logo && logo.title) || 'the company';

  return Array.from(profile.querySelectorAll('#job-openings turbo-frame[id^="job_"]')).map(card => ({
    card,
    email,
    jobTitle: textOf(card.querySelector('h4')) || 'Job Application',
    companyName,
    bodyText: textOf(card)
  }));
}

function extractJob() {
  if (isCoolWorks()) return extractCoolWorks();
  return extractSeasonalJobs();
}

// ---------- Botões ----------

function checkAndInjectButton() {
  let job = null;
  let openings = [];
  try {
    job = extractJob();
    if (!job && isCoolWorks()) openings = extractCoolWorksOpenings();
  } catch (e) {
    console.error('Erro ao ler a vaga:', e);
  }

  // Perfil da CoolWorks: cada vaga da lista ganha o próprio botão
  openings.forEach(injectCardButton);
  // Perfil com uma vaga só: o botão flutuante também serve para ela
  if (!job && openings.length === 1) job = openings[0];

  const btn = document.getElementById(BTN_ID);

  if (!job && openings.length > 1) {
    const listKey = `list|${openings.length}|${openings[0].email}`;
    if (btn && btn.getAttribute('data-job-key') === listKey) return;
    if (btn) btn.remove();
    createListHint(openings.length, listKey);
    return;
  }

  if (!job) {
    // Nenhum e-mail visível na tela, limpa o botão
    if (btn) btn.remove();
    return;
  }

  const jobKey = jobKeyOf(job);
  if (btn && btn.getAttribute('data-job-key') === jobKey) return;

  // Botão sumiu (SPA/Turbo removeu), nunca foi criado ou a vaga mudou
  if (btn) btn.remove();
  createApplyButton(job, jobKey);
}

function pickTemplate(profiles, job) {
  const keywords = Object.keys(profiles);
  const title = job.jobTitle.toLowerCase();
  const body = job.bodyText.toLowerCase();

  // Palavra-chave no título vence palavra-chave que só aparece na descrição
  const keyword = keywords.find(kw => title.includes(kw.toLowerCase())) ||
                  keywords.find(kw => body.includes(kw.toLowerCase()));
  return keyword ? { keyword, template: profiles[keyword] } : null;
}

// Configurações do popup que mudam o e-mail gerado
const EMAIL_SETTINGS = ['keywordProfiles', 'resumeLink', 'emailClient', 'gmailAccount'];

function composeEmail(job, data) {
  const profiles = data.keywordProfiles || {};
  const resumeLink = data.resumeLink || '';
  let { jobTitle, companyName } = job;

  let selectedTemplate = "Dear Hiring Manager,\n\nI am writing to apply for the open position.\n\nThank you.";
  const match = pickTemplate(profiles, job);
  if (match) {
    selectedTemplate = match.template;
    if (jobTitle === 'Job Application') jobTitle = match.keyword;
  }

  selectedTemplate = selectedTemplate.replace(/\[Job Title\]/gi, jobTitle);
  selectedTemplate = selectedTemplate.replace(/\[Company\/Resort Name\]/gi, companyName);
  selectedTemplate = selectedTemplate.replace(/\[Company Name\]/gi, companyName);

  if (resumeLink) {
    selectedTemplate += `\n\nLink to my resume: ${resumeLink}`;
  }

  return { to: job.email, subject: `Application for ${jobTitle} at ${companyName}`, body: selectedTemplate };
}

// Gmail no Chrome é o padrão; "mailto" é o app de e-mail do Windows (Outlook), como era antes
function buildEmailLink(job, data) {
  const { to, subject, body } = composeEmail(job, data);

  if (data.emailClient === 'mailto') {
    return { href: `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, newTab: false };
  }

  // Tela "Escrever" do Gmail. Com várias contas Google no Chrome, sem authuser o e-mail sairia da conta principal.
  // encodeURIComponent em vez de URLSearchParams: este manda espaço como "+".
  const params = [['view', 'cm'], ['fs', '1']];
  if (data.gmailAccount) params.push(['authuser', data.gmailAccount]);
  params.push(['to', to], ['su', subject], ['body', body]);
  const query = params.map(([name, value]) => `${name}=${encodeURIComponent(value)}`).join('&');
  return { href: `https://mail.google.com/mail/?${query}`, newTab: true };
}

function applyEmailLink(btn, link) {
  btn.setAttribute('href', link.href);
  if (link.newTab) {
    btn.setAttribute('target', '_blank');
    btn.setAttribute('rel', 'noopener');
  } else {
    btn.removeAttribute('target');
    btn.removeAttribute('rel');
  }
}

function createFloatingButton(key, html) {
  const btn = document.createElement('a');
  btn.id = BTN_ID;
  btn.setAttribute('data-job-key', key); // Salva o estado no próprio DOM
  btn.innerHTML = html;

  btn.style.cssText = `
    position: fixed !important;
    bottom: 30px !important;
    left: 30px !important;
    right: auto !important;
    width: auto !important;
    height: auto !important;
    display: inline-block !important;
    margin: 0 !important;
    background-color: #2e8540 !important;
    color: white !important;
    padding: 15px 20px !important;
    border-radius: 8px !important;
    text-decoration: none !important;
    font-family: Arial, sans-serif !important;
    font-size: 16px !important;
    box-shadow: 0 4px 6px rgba(0,0,0,0.3) !important;
    z-index: 2147483647 !important;
    text-align: center !important;
    opacity: 0.8 !important;
    pointer-events: none !important;
    transition: transform 0.2s, background-color 0.2s !important;
  `;

  // Injeta no body (seguro e padrão)
  document.body.appendChild(btn);
  return btn;
}

function enableButton(btn) {
  btn.style.setProperty('opacity', '1', 'important');
  btn.style.setProperty('pointer-events', 'auto', 'important');
}

function createApplyButton(job, jobKey) {
  if (document.getElementById(BTN_ID)) return;

  const btn = createFloatingButton(jobKey, '🚀 <b>Candidatar-se Agora</b><br><small>Gerando e-mail...</small>');
  btn.title = `Para: ${job.email}`;

  chrome.storage.local.get(EMAIL_SETTINGS, (data) => {
    try {
      // Atualiza o botão existente
      const link = buildEmailLink(job, data);
      applyEmailLink(btn, link);
      btn.innerHTML = `🚀 <b>Candidatar-se Agora</b><br><small>${link.newTab ? 'Abre no Gmail' : 'Abre no app de e-mail'}</small>`;
      enableButton(btn);

    } catch (e) {
      console.error("Erro Fatal no Seasonal Jobs Ext:", e);
      // Mantém o botão visível mesmo com erro, para sabermos que o script rodou
      btn.innerHTML = '🚀 <b>Erro ao gerar template</b><br><small>Clique para tentar de novo</small>';
      btn.href = '#';
      enableButton(btn);
      btn.style.setProperty('background-color', '#d32f2f', 'important'); // Vermelho para indicar erro
    }
  });
}

// Perfil com várias vagas: o botão flutuante não sabe qual delas; aponta para a lista
function createListHint(count, key) {
  if (document.getElementById(BTN_ID)) return;

  const btn = createFloatingButton(key, `🚀 <b>${count} vagas nesta empresa</b><br><small>Use o botão verde de cada vaga</small>`);
  btn.href = '#job-openings';
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    const list = document.getElementById('job-openings');
    if (list) list.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  enableButton(btn);
}

function injectCardButton(opening) {
  const jobKey = jobKeyOf(opening);
  const existing = opening.card.querySelector(`.${CARD_BTN_CLASS}`);
  if (existing && existing.getAttribute('data-job-key') === jobKey) return;
  if (existing) existing.remove();

  const btn = document.createElement('a');
  btn.className = CARD_BTN_CLASS;
  btn.setAttribute('data-job-key', jobKey);
  btn.title = `Para: ${opening.email}`;
  btn.textContent = '🚀 Candidatar-se';
  btn.style.cssText = `
    display: inline-block !important;
    flex-shrink: 0 !important;
    margin: 0 0 0 12px !important;
    background-color: #2e8540 !important;
    color: white !important;
    padding: 6px 12px !important;
    border-radius: 6px !important;
    text-decoration: none !important;
    font-family: Arial, sans-serif !important;
    font-size: 13px !important;
    font-weight: bold !important;
    white-space: nowrap !important;
    box-shadow: 0 2px 4px rgba(0,0,0,0.2) !important;
    opacity: 0.8 !important;
    pointer-events: none !important;
  `;

  // Fica à direita do título da vaga; se o layout mudar, vai para o topo do card
  const header = opening.card.querySelector('.justify-between');
  if (header) header.appendChild(btn);
  else opening.card.prepend(btn);

  chrome.storage.local.get(EMAIL_SETTINGS, (data) => {
    try {
      applyEmailLink(btn, buildEmailLink(opening, data));
    } catch (e) {
      console.error('Erro ao gerar e-mail da vaga do perfil:', e);
      btn.href = '#';
      btn.style.setProperty('background-color', '#d32f2f', 'important');
    }
    enableButton(btn);
  });
}

// Mudou modelo, currículo ou forma de envio no popup: tira os botões e a próxima verificação refaz com o novo e-mail
chrome.storage.onChanged.addListener((changes) => {
  if (!EMAIL_SETTINGS.some(key => key in changes)) return;
  const floating = document.getElementById(BTN_ID);
  if (floating) floating.remove();
  document.querySelectorAll(`.${CARD_BTN_CLASS}`).forEach(btn => btn.remove());
});

// Verifica a cada 1 segundo. Solução definitiva para SPAs (SeasonalJobs) e Turbo (CoolWorks).
setInterval(checkAndInjectButton, 1000);
