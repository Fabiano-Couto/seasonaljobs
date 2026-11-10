const API_URL = 'https://api.seasonaljobs.dol.gov/datahub/search?api-version=2020-06-30';
const SITE_URL = 'https://seasonaljobs.dol.gov';
const COOLWORKS_URL = 'https://www.coolworks.com';
// Única página monitorada da CoolWorks: vagas e empresas que aceitam visto J1/H2B.
// O RSS que a página anuncia (international-job-seekers.xml) responde 404, por isso o HTML é lido direto.
const COOLWORKS_INTL_URL = `${COOLWORKS_URL}/international-job-seekers`;
const CHECK_INTERVAL_MINUTES = 5;
const MAX_SEEN_JOBS = 2000;
const MAX_SEEN_COOLWORKS = 1000;

// Caminho absoluto: no service worker, 'icons/...' seria resolvido a partir de /background/
const ICON_URL = chrome.runtime.getURL('icons/icon128.png');

let isChecking = false;

// Antes de existir um liga/desliga por site, o único switch (isMonitorActive) valia só para o SeasonalJobs
function resolveSites(data) {
  return data.monitorSites || { seasonaljobs: data.isMonitorActive !== false, coolworks: true };
}

function ensureAlarm() {
  chrome.alarms.get('checkJobsAlarm', (alarm) => {
    if (!alarm || alarm.periodInMinutes !== CHECK_INTERVAL_MINUTES) {
      chrome.alarms.create('checkJobsAlarm', { periodInMinutes: CHECK_INTERVAL_MINUTES, delayInMinutes: 0.1 });
    }
  });
}

chrome.runtime.onInstalled.addListener(async (details) => {
  const data = await chrome.storage.local.get(['isMonitorActive', 'monitorSites']);
  // Os switches do popup nascem marcados; o storage precisa refletir isso desde o início
  if (data.monitorSites === undefined) {
    await chrome.storage.local.set({ monitorSites: resolveSites(data) });
    await chrome.storage.local.remove('isMonitorActive');
  }
  // Histórico da 1ª versão do monitor da CoolWorks (feed whats-new.xml), substituída pela página J1/H2B
  await chrome.storage.local.remove(['seenCoolworks', 'coolworksSeeded']);
  // Só zera o histórico numa instalação nova — num update/reload manteria as vagas já vistas
  if (details.reason === 'install') {
    await chrome.storage.local.set({ seenJobs: [], seededKeywords: [], cwSeen: [], cwSeeded: false });
  }
  ensureAlarm();
  checkNewJobs();
});

chrome.runtime.onStartup.addListener(ensureAlarm);

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'checkJobsAlarm') {
    checkNewJobs();
  }
});

// Popup pede verificação imediata (botão "Verificar agora", ao adicionar vaga e ao ligar um site)
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'checkNow') {
    checkNewJobs().then(sendResponse);
    return true;
  }
});

async function checkNewJobs() {
  if (isChecking) return { skipped: true };
  isChecking = true;

  try {
    const data = await chrome.storage.local.get([
      'keywordProfiles', 'isMonitorActive', 'monitorSites',
      'seenJobs', 'seededKeywords', 'cwSeen', 'cwSeeded'
    ]);

    const sites = resolveSites(data);
    if (!sites.seasonaljobs && !sites.coolworks) return { paused: true };

    const keywords = Object.keys(data.keywordProfiles || {});
    const errors = [];
    let newCount = 0;

    if (sites.seasonaljobs) newCount += await checkSeasonalJobs(keywords, data, errors);
    if (sites.coolworks) newCount += await checkCoolworks(data, errors);

    const lastCheck = { time: Date.now(), newCount, errors };
    await chrome.storage.local.set({ lastCheck });
    return lastCheck;
  } finally {
    isChecking = false;
  }
}

function notify(id, title, message) {
  chrome.notifications.create(id, {
    type: 'basic',
    iconUrl: ICON_URL,
    title,
    message,
    priority: 2,
    requireInteraction: true
  });
}

// ---------- SeasonalJobs (API do Azure Search) ----------

async function fetchJobs(keyword) {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({
      search: keyword,
      searchMode: 'all', // "Line Cook" exige as duas palavras, não uma ou outra
      filter: 'active eq true', // sem isso a API devolve vagas encerradas/pendentes
      orderby: 'dhTimestamp desc',
      // Desde 14/10/2026 a API só aceita top 1, 10 ou 12 (qualquer outro valor = HTTP 400 "The request is invalid.").
      // 10 é o tamanho de página que o próprio site usa; a cada 5 min sobra folga, saem poucas vagas por dia por palavra-chave.
      top: 10,
      select: 'case_number,case_id,job_title,employer_business_name,worksite_city,worksite_state,employer_city'
    })
  });

  if (!response.ok) {
    // A API devolve o motivo em JSON: {"error":"The request is invalid.","hint":"..."}
    const body = await response.json().catch(() => ({}));
    throw new Error(`HTTP ${response.status}${body.error ? ` (${body.error})` : ''}`);
  }

  const json = await response.json();
  return json.value || [];
}

async function checkSeasonalJobs(keywords, data, errors) {
  const seen = new Set(data.seenJobs || []);
  const seeded = new Set((data.seededKeywords || []).filter(kw => keywords.includes(kw)));
  let newCount = 0;

  for (const keyword of keywords) {
    try {
      const jobs = await fetchJobs(keyword);
      // Primeira busca de uma palavra-chave só registra o que já existe, sem notificar
      const isBaseline = !seeded.has(keyword);

      for (const job of jobs) {
        const jobId = job.case_number || job.case_id;
        if (!jobId || seen.has(jobId)) continue;
        seen.add(jobId);
        if (isBaseline) continue;

        newCount++;
        const city = job.worksite_city || job.employer_city || '';
        const state = job.worksite_state || '';
        notify(
          `job-${jobId}`,
          `Nova vaga: ${job.job_title}`,
          `${job.employer_business_name || ''}\n${city}${state ? ', ' + state : ''} · busca "${keyword}"`
        );
      }

      seeded.add(keyword);
    } catch (err) {
      console.error('Erro ao buscar vagas para', keyword, err);
      errors.push(`SeasonalJobs · ${keyword}: ${err.message}`);
    }
  }

  let seenJobs = [...seen];
  if (seenJobs.length > MAX_SEEN_JOBS) {
    seenJobs = seenJobs.slice(seenJobs.length - MAX_SEEN_JOBS);
  }

  await chrome.storage.local.set({ seenJobs, seededKeywords: [...seeded] });
  return newCount;
}

// ---------- CoolWorks (página J1/H2B) ----------

// fromCodePoint, não fromCharCode: emoji (acima de 0xFFFF) viraria outro caractere. Código inválido fica como veio.
const fromCode = (code, original) => (code <= 0x10FFFF ? String.fromCodePoint(code) : original);

function decodeEntities(text) {
  return text
    .replace(/&#(\d+);/g, (entity, code) => fromCode(Number(code), entity))
    .replace(/&#x([0-9a-f]+);/gi, (entity, code) => fromCode(parseInt(code, 16), entity))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim();
}

async function fetchText(url) {
  // A CoolWorks está atrás do Cloudflare, que barra cliente que não parece navegador ("Just a moment...").
  // Mandar os cookies do Chrome (cf_clearance de quando o usuário navega no site) evita cair no desafio.
  const response = await fetch(url, { cache: 'no-store', credentials: 'include' });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.text();
}

// Service worker não tem DOMParser; o HTML da CoolWorks é gerado por template e é regular o bastante para regex.
// A página tem dois tipos de card: vaga (article.job-post → highlighted-job/help-wanted) e empresa (article.employer-profile).
function parseInternationalPage(html) {
  const posts = [];
  const profiles = [];

  for (const [, attrs, block] of html.matchAll(/<article([^>]*)>([\s\S]*?)<\/article>/g)) {
    // Primeiro link com texto para a vaga (o da foto não tem texto)
    const job = block.match(/<a[^>]*href="(\/[^"]+\/(?:highlighted-job|help-wanted)\/(\d+)[^"]*)"[^>]*>([^<]+)<\/a>/);
    if (job) {
      const company = block.match(/<h5[^>]*>\s*<a[^>]*>([^<]+)<\/a>/);
      const locations = [...block.matchAll(/<span class="location">([^<]+)<\/span>/g)].map(m => decodeEntities(m[1]));
      posts.push({
        id: job[2],
        // href vem do HTML: "&amp;" tem de virar "&" antes de ir para o clique da notificação
        path: decodeEntities(job[1]),
        title: decodeEntities(job[3]),
        company: company ? decodeEntities(company[1]) : '',
        location: locations.join(' · ')
      });
      continue;
    }

    // Cards de artigo/recurso da página também são <article>; empresa só nos cards de perfil
    if (!/employer-profile|featured/.test(attrs)) continue;
    const profile = block.match(/<a[^>]*href="(\/[^"\/]+\/profile)"[^>]*>([^<]+)<\/a>/);
    if (profile) {
      profiles.push({ path: decodeEntities(profile[1]), name: decodeEntities(profile[2]) });
    }
  }

  return { posts, profiles };
}

// Vagas do perfil ("Current Job Openings"): não têm página própria, só o card <turbo-frame id="job_N">
function parseProfileOpenings(html) {
  // Todo perfil real tem o bloco <turbo-frame id="profile_N"> (até o que não tem vaga). Sem ele, a resposta é
  // bloqueio (o desafio do Cloudflare pode vir com 200) ou o layout mudou: lida como "0 vagas", marcaria a lista
  // como conhecida e, na leitura boa seguinte, as vagas antigas chegariam todas como novas.
  if (!/<turbo-frame id="profile_\d+"/.test(html)) throw new Error('perfil sem o bloco da empresa (bloqueio ou layout mudou)');
  const openings = [];
  for (const [, id, block] of html.matchAll(/<turbo-frame id="job_(\d+)">([\s\S]*?)<\/turbo-frame>/g)) {
    const title = block.match(/<h4[^>]*>([^<]+)<\/h4>/);
    openings.push({ id, title: title ? decodeEntities(title[1]) : 'Vaga' });
  }
  return openings;
}

async function checkCoolworks(data, errors) {
  let page;
  try {
    page = parseInternationalPage(await fetchText(COOLWORKS_INTL_URL));
    // Nenhuma vaga nem empresa = layout mudou ou bloqueio (o desafio do Cloudflare pode vir com 200). Vira erro:
    // senão o monitor pararia calado e, no registro inicial, a leitura boa seguinte avisaria tudo de uma vez.
    if (!page.posts.length && !page.profiles.length) throw new Error('página J1/H2B sem vagas nem empresas');
  } catch (err) {
    console.error('Erro ao ler a página J1/H2B da CoolWorks', err);
    errors.push(`CoolWorks: ${err.message}`);
    return 0;
  }

  const seen = new Set(data.cwSeen || []);
  // Primeira leitura só registra o que já existe, sem notificar. Todas as vagas da página aceitam visto,
  // então não há filtro por palavra-chave: toda vaga nova avisa.
  const isBaseline = !data.cwSeeded;
  let newCount = 0;

  // O id da notificação carrega o caminho da vaga: o service worker pode ter sido descarregado até o clique
  const alert = (path, title, message) => {
    newCount++;
    notify(`cw-${path}`, title, message);
  };

  // Devolve se a chave já era conhecida e a põe no fim da lista: o corte do limite só tira o que saiu da página
  const markSeen = (key) => {
    const known = seen.delete(key);
    seen.add(key);
    return known;
  };

  for (const post of page.posts) {
    if (markSeen(`post:${post.id}`) || isBaseline) continue;
    alert(post.path, `Nova vaga J1/H2B: ${post.title}`, `${post.company}\n${post.location}`);
  }

  // As empresas da página listam vagas no próprio perfil, que não aparecem na lista de vagas
  for (const profile of page.profiles) {
    const isNewProfile = !markSeen(`profile:${profile.path}`);
    let openings = null;
    try {
      openings = parseProfileOpenings(await fetchText(COOLWORKS_URL + profile.path));
    } catch (err) {
      console.error('Erro ao ler o perfil', profile.path, err);
      errors.push(`CoolWorks · ${profile.name}: ${err.message}`);
    }

    if (isNewProfile && !isBaseline) {
      // Empresa nova na página: um aviso só, em vez de um por vaga do perfil
      const count = openings === null ? 'veja as vagas no perfil'
        : openings.length === 1 ? '1 vaga no perfil' : `${openings.length} vagas no perfil`;
      alert(`${profile.path}#job-openings`, `Nova empresa J1/H2B: ${profile.name}`, count);
    }
    if (openings === null) continue;

    // Vaga do perfil só avisa depois que a lista dele foi lida uma vez: perfil que falhou no registro inicial
    // ou acabou de entrar na página (já avisado acima como empresa nova) tem as vagas registradas em silêncio.
    const listKnown = markSeen(`openings:${profile.path}`);
    for (const opening of openings) {
      if (markSeen(`opening:${opening.id}`) || isBaseline || !listKnown) continue;
      alert(`${profile.path}#job_${opening.id}`, `Nova vaga J1/H2B: ${opening.title}`, profile.name);
    }
  }

  let cwSeen = [...seen];
  if (cwSeen.length > MAX_SEEN_COOLWORKS) {
    cwSeen = cwSeen.slice(cwSeen.length - MAX_SEEN_COOLWORKS);
  }

  // Página lida = registro inicial feito. Um perfil que falhar não trava mais o monitor: as vagas dele são
  // registradas em silêncio quando voltar a responder (chave openings:<perfil>)
  await chrome.storage.local.set({ cwSeen, cwSeeded: true });
  return newCount;
}

// Quando clicar na notificação, abre a página da vaga
chrome.notifications.onClicked.addListener((notificationId) => {
  if (notificationId.startsWith('job-')) {
    const jobId = notificationId.replace('job-', '');
    chrome.tabs.create({ url: `${SITE_URL}/jobs/${jobId}` });
    chrome.notifications.clear(notificationId);
  } else if (notificationId.startsWith('cw-')) {
    chrome.tabs.create({ url: COOLWORKS_URL + notificationId.slice(3) });
    chrome.notifications.clear(notificationId);
  }
});
