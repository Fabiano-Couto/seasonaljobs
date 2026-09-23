const API_URL = 'https://api.seasonaljobs.dol.gov/datahub/search?api-version=2020-06-30';
const SITE_URL = 'https://seasonaljobs.dol.gov';
const CHECK_INTERVAL_MINUTES = 5;
const MAX_SEEN_JOBS = 2000;

// Caminho absoluto: no service worker, 'icons/...' seria resolvido a partir de /background/
const ICON_URL = chrome.runtime.getURL('icons/icon128.png');

let isChecking = false;

function ensureAlarm() {
  chrome.alarms.get('checkJobsAlarm', (alarm) => {
    if (!alarm || alarm.periodInMinutes !== CHECK_INTERVAL_MINUTES) {
      chrome.alarms.create('checkJobsAlarm', { periodInMinutes: CHECK_INTERVAL_MINUTES, delayInMinutes: 0.1 });
    }
  });
}

chrome.runtime.onInstalled.addListener(async (details) => {
  const data = await chrome.storage.local.get(['isMonitorActive']);
  // O switch do popup nasce marcado; o storage precisa refletir isso desde o início
  if (data.isMonitorActive === undefined) {
    await chrome.storage.local.set({ isMonitorActive: true });
  }
  // Só zera o histórico numa instalação nova — num update/reload manteria as vagas já vistas
  if (details.reason === 'install') {
    await chrome.storage.local.set({ seenJobs: [], seededKeywords: [] });
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

// Popup pede verificação imediata (botão "Verificar agora" e ao adicionar vaga)
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'checkNow') {
    checkNewJobs({ force: true }).then(sendResponse);
    return true;
  }
});

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
      top: 25,
      select: 'case_number,case_id,job_title,employer_business_name,worksite_city,worksite_state,employer_city'
    })
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const json = await response.json();
  return json.value || [];
}

async function checkNewJobs({ force = false } = {}) {
  if (isChecking) return { skipped: true };
  isChecking = true;

  try {
    const data = await chrome.storage.local.get(['keywordProfiles', 'isMonitorActive', 'seenJobs', 'seededKeywords']);

    // undefined = nunca mexeu no switch = ativo
    if (data.isMonitorActive === false && !force) return { paused: true };

    const keywords = Object.keys(data.keywordProfiles || {});
    const seen = new Set(data.seenJobs || []);
    const seeded = new Set((data.seededKeywords || []).filter(kw => keywords.includes(kw)));
    const errors = [];
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
          chrome.notifications.create(`job-${jobId}`, {
            type: 'basic',
            iconUrl: ICON_URL,
            title: `Nova vaga: ${job.job_title}`,
            message: `${job.employer_business_name || ''}\n${city}${state ? ', ' + state : ''} · busca "${keyword}"`,
            priority: 2,
            requireInteraction: true
          });
        }

        seeded.add(keyword);
      } catch (err) {
        console.error('Erro ao buscar vagas para', keyword, err);
        errors.push(`${keyword}: ${err.message}`);
      }
    }

    let seenJobs = [...seen];
    if (seenJobs.length > MAX_SEEN_JOBS) {
      seenJobs = seenJobs.slice(seenJobs.length - MAX_SEEN_JOBS);
    }

    const lastCheck = { time: Date.now(), newCount, errors };
    await chrome.storage.local.set({ seenJobs, seededKeywords: [...seeded], lastCheck });
    return lastCheck;
  } finally {
    isChecking = false;
  }
}

// Quando clicar na notificação, abre a página da vaga
chrome.notifications.onClicked.addListener((notificationId) => {
  if (notificationId.startsWith('job-')) {
    const jobId = notificationId.replace('job-', '');
    chrome.tabs.create({ url: `${SITE_URL}/jobs/${jobId}` });
    chrome.notifications.clear(notificationId);
  }
});
