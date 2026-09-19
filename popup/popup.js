document.addEventListener('DOMContentLoaded', () => {
  const keywordInput = document.getElementById('keyword-input');
  const addBtn = document.getElementById('add-btn');
  const keywordList = document.getElementById('keyword-list');
  
  const templateSection = document.getElementById('template-section');
  const currentKeywordLabel = document.getElementById('current-keyword-label');
  const emailBodyInput = document.getElementById('email-body');
  const saveStatus = document.getElementById('save-status');
  
  const resumeLinkInput = document.getElementById('resume-link');
  const toggleMonitor = document.getElementById('toggle-monitor');
  const statusText = document.getElementById('status-text');

  let activeKeyword = null;

  // Load saved data
  chrome.storage.local.get(['keywordProfiles', 'resumeLink', 'isMonitorActive'], (data) => {
    const profiles = data.keywordProfiles || {};
    
    // Atualiza a lista
    Object.keys(profiles).forEach(kw => {
      addKeywordToList(kw);
    });
    
    if (data.resumeLink) {
      resumeLinkInput.value = data.resumeLink;
    }
    
    if (data.isMonitorActive !== undefined) {
      toggleMonitor.checked = data.isMonitorActive;
      updateStatusText(data.isMonitorActive);
    }
  });

  // Salvar Resume Link
  resumeLinkInput.addEventListener('input', () => {
    chrome.storage.local.set({resumeLink: resumeLinkInput.value});
  });

  // Adicionar palavra-chave
  addBtn.addEventListener('click', () => {
    const kw = keywordInput.value.trim();
    if (kw) {
      chrome.storage.local.get({keywordProfiles: {}}, (data) => {
        const profiles = data.keywordProfiles;
        if (!profiles[kw]) {
          // Template padrão
          profiles[kw] = `Dear Hiring Manager,\n\nI am writing to express my interest in the ${kw} position.\n\nPlease find my resume attached below.\n\nThank you for your time.`;
          chrome.storage.local.set({keywordProfiles: profiles}, () => {
            addKeywordToList(kw);
            keywordInput.value = '';
            selectKeyword(kw);
          });
        } else {
          alert('Esta vaga já está sendo monitorada!');
        }
      });
    }
  });

  // Salvar template da vaga selecionada
  emailBodyInput.addEventListener('input', () => {
    if (!activeKeyword) return;
    
    chrome.storage.local.get({keywordProfiles: {}}, (data) => {
      const profiles = data.keywordProfiles;
      if (profiles[activeKeyword] !== undefined) {
        profiles[activeKeyword] = emailBodyInput.value;
        chrome.storage.local.set({keywordProfiles: profiles}, () => {
          showSaveStatus();
        });
      }
    });
  });

  // Toggle monitor
  toggleMonitor.addEventListener('change', (e) => {
    const isActive = e.target.checked;
    updateStatusText(isActive);
    chrome.storage.local.set({isMonitorActive: isActive});
  });

  function addKeywordToList(kw) {
    const li = document.createElement('li');
    li.textContent = kw;
    li.dataset.kw = kw;
    
    const removeBtn = document.createElement('button');
    removeBtn.textContent = 'X';
    removeBtn.className = 'remove-btn';
    removeBtn.onclick = (e) => {
      e.stopPropagation(); // Evita selecionar ao remover
      chrome.storage.local.get({keywordProfiles: {}}, (data) => {
        const profiles = data.keywordProfiles;
        delete profiles[kw];
        chrome.storage.local.set({keywordProfiles: profiles}, () => {
          li.remove();
          if (activeKeyword === kw) {
            deselectKeyword();
          }
        });
      });
    };
    
    li.appendChild(removeBtn);
    
    li.onclick = () => {
      selectKeyword(kw);
    };
    
    keywordList.appendChild(li);
  }

  function selectKeyword(kw) {
    activeKeyword = kw;
    currentKeywordLabel.textContent = kw;
    emailBodyInput.disabled = false;
    
    // Atualiza visual da lista
    document.querySelectorAll('#keyword-list li').forEach(li => {
      if (li.dataset.kw === kw) {
        li.classList.add('selected');
      } else {
        li.classList.remove('selected');
      }
    });

    // Carrega o template
    chrome.storage.local.get({keywordProfiles: {}}, (data) => {
      const profiles = data.keywordProfiles;
      emailBodyInput.value = profiles[kw] || '';
    });
  }

  function deselectKeyword() {
    activeKeyword = null;
    currentKeywordLabel.textContent = '...';
    emailBodyInput.value = '';
    emailBodyInput.disabled = true;
    document.querySelectorAll('#keyword-list li').forEach(li => li.classList.remove('selected'));
  }

  let saveTimeout;
  function showSaveStatus() {
    saveStatus.style.opacity = '1';
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      saveStatus.style.opacity = '0';
    }, 1500);
  }

  function updateStatusText(isActive) {
    if (isActive) {
      statusText.textContent = 'Monitoramento Ativo';
      statusText.style.color = '#2e8540';
    } else {
      statusText.textContent = 'Monitoramento Pausado';
      statusText.style.color = '#d83933';
    }
  }
});
