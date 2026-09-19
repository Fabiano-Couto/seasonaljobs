chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create("checkJobsAlarm", { periodInMinutes: 15 });
  chrome.storage.local.set({ seenJobs: [] });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "checkJobsAlarm") {
    checkNewJobs();
  }
});

async function checkNewJobs() {
  chrome.storage.local.get(['keywordProfiles', 'isMonitorActive', 'seenJobs'], async (data) => {
    if (!data.isMonitorActive || !data.keywordProfiles) return;
    
    const keywords = Object.keys(data.keywordProfiles);
    if (keywords.length === 0) return;

    let newSeenJobs = [...(data.seenJobs || [])];
    let foundNew = false;

    for (const keyword of keywords) {
      try {
        // Nova abordagem: Consultando diretamente a API do DataHub (Azure Search)
        const response = await fetch(`https://api.seasonaljobs.dol.gov/datahub/search?api-version=2020-06-30`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({
            search: keyword,
            top: 15 // Traz as 15 vagas mais relevantes/recentes para essa palavra
          })
        });
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const json = await response.json();
        const jobs = json.value || [];
        
        for (const job of jobs) {
          // O identificador único da vaga pode ser o case_number ou case_id
          const jobId = job.case_number || job.case_id;
          
          if (jobId && !newSeenJobs.includes(jobId)) {
            newSeenJobs.push(jobId);
            foundNew = true;
            
            // Dispara notificação para a nova vaga
            chrome.notifications.create(`job-${jobId}`, {
              type: 'basic',
              iconUrl: 'icons/icon128.png',
              title: 'Nova Vaga Encontrada!',
              message: `Uma vaga para "${keyword}" foi publicada: ${job.job_title} em ${job.employer_city}. Clique para ver!`,
              priority: 2
            });
          }
        }
      } catch (err) {
        console.error("Erro ao buscar vagas via API para", keyword, err);
      }
    }

    if (foundNew) {
      // Limita o histórico para não estourar a memória (ex: últimas 500 vagas)
      if (newSeenJobs.length > 500) {
        newSeenJobs = newSeenJobs.slice(newSeenJobs.length - 500);
      }
      chrome.storage.local.set({ seenJobs: newSeenJobs });
    }
  });
}

// Quando clicar na notificação, abre a aba da vaga
chrome.notifications.onClicked.addListener((notificationId) => {
  if (notificationId.startsWith('job-')) {
    const jobId = notificationId.replace('job-', '');
    chrome.tabs.create({ url: `https://seasonaljobs.dol.gov/job-order/${jobId}` });
  }
});
