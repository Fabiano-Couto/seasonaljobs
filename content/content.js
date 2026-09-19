function checkAndInjectButton() {
  let targetEmail = null;
  const bodyText = (document.body.innerText || document.body.textContent || '');
  
  // Tentativa 1: Regex focada no texto
  const emailMatch = bodyText.match(/Email address to Apply:\s*([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/i);
  if (emailMatch && emailMatch[1]) {
      targetEmail = emailMatch[1].trim();
  }
  
  // Tentativa 2: Busca por links
  if (!targetEmail) {
      const mailtoLinks = Array.from(document.querySelectorAll('a[href^="mailto:"]'));
      if (mailtoLinks.length > 0) {
          for (const link of mailtoLinks) {
              const text = (link.innerText || link.textContent || '').trim();
              if (text.includes('@')) {
                  targetEmail = link.href.replace(/^mailto:\s*/i, '').split('?')[0];
              }
          }
          if (!targetEmail) {
              targetEmail = mailtoLinks[mailtoLinks.length - 1].href.replace(/^mailto:\s*/i, '').split('?')[0];
          }
      }
  }

  const btn = document.getElementById('sj-auto-apply-btn');

  if (!targetEmail) {
      // Nenhum e-mail visível na tela, limpa o botão
      if (btn) btn.remove();
      return;
  }

  if (btn) {
      // Botão já existe, verifica se o e-mail mudou
      if (btn.getAttribute('data-email') !== targetEmail) {
          btn.remove();
          createApplyButton(targetEmail);
      }
  } else {
      // Botão sumiu (SPA removeu) ou nunca foi criado
      createApplyButton(targetEmail);
  }
}

function createApplyButton(email) {
  if (document.getElementById('sj-auto-apply-btn')) return;

  const btn = document.createElement('a');
  btn.id = 'sj-auto-apply-btn';
  btn.setAttribute('data-email', email); // Salva o estado no próprio DOM
  btn.innerHTML = '🚀 <b>Candidatar-se Agora</b><br><small>Gerando e-mail...</small>';
  
  btn.style.cssText = `
    position: fixed !important;
    bottom: 30px !important;
    right: 30px !important;
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

  chrome.storage.local.get(['keywordProfiles', 'resumeLink'], (data) => {
    try {
      const profiles = data.keywordProfiles || {};
      const resumeLink = data.resumeLink || '';
      
      let jobTitle = 'Job Application';
      try {
          const possibleTitles = document.querySelectorAll('h1, h2, h3, .text-2xl, .text-3xl, .font-bold');
          for (let el of possibleTitles) {
            const text = (el.innerText || el.textContent || '').trim();
            if (text && !text.toLowerCase().includes('seasonaljobs.dol.gov') && text.length < 60) {
              jobTitle = text;
              break;
            }
          }
      } catch(e) { console.error('Erro ao buscar título:', e); }

      let companyName = "the company";
      try {
          const bodyText = (document.body.innerText || document.body.textContent || '');
          const companyMatch = bodyText.match(/Company Name:\s*\n*([^\n]+)/i);
          if (companyMatch && companyMatch[1]) {
            companyName = companyMatch[1].trim();
          }
      } catch(e) { console.error('Erro ao buscar empresa:', e); }
      
      let selectedTemplate = "Dear Hiring Manager,\n\nI am writing to apply for the open position.\n\nThank you.";
      
      try {
          const bodyText = (document.body.innerText || document.body.textContent || '');
          for (const keyword of Object.keys(profiles)) {
            if (jobTitle.toLowerCase().includes(keyword.toLowerCase()) || 
                bodyText.toLowerCase().includes(keyword.toLowerCase())) {
              selectedTemplate = profiles[keyword];
              if (jobTitle === 'Job Application') jobTitle = keyword;
              break; 
            }
          }
      } catch(e) { console.error('Erro no template:', e); }

      selectedTemplate = selectedTemplate.replace(/\[Job Title\]/gi, jobTitle);
      selectedTemplate = selectedTemplate.replace(/\[Company\/Resort Name\]/gi, companyName);
      selectedTemplate = selectedTemplate.replace(/\[Company Name\]/gi, companyName);

      if (resumeLink) {
        selectedTemplate += `\n\nLink to my resume: ${resumeLink}`;
      }
      
      const subject = encodeURIComponent(`Application for ${jobTitle} at ${companyName}`);
      const body = encodeURIComponent(selectedTemplate);
      const mailtoUrl = `mailto:${email}?subject=${subject}&body=${body}`;

      // Atualiza o botão existente
      btn.href = mailtoUrl;
      btn.innerHTML = '🚀 <b>Candidatar-se Agora</b><br><small>E-mail automático gerado</small>';
      btn.style.setProperty('opacity', '1', 'important');
      btn.style.setProperty('pointer-events', 'auto', 'important');

    } catch (e) {
      console.error("Erro Fatal no Seasonal Jobs Ext:", e);
      // Mantém o botão visível mesmo com erro, para sabermos que o script rodou
      btn.innerHTML = '🚀 <b>Erro ao gerar template</b><br><small>Clique para tentar de novo</small>';
      btn.href = '#';
      btn.style.setProperty('opacity', '1', 'important');
      btn.style.setProperty('pointer-events', 'auto', 'important');
      btn.style.backgroundColor = '#d32f2f'; // Vermelho para indicar erro
    }
  });
}

// Verifica a cada 1 segundo. Solução definitiva para SPAs.
setInterval(checkAndInjectButton, 1000);
