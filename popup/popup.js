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
  const lastCheckText = document.getElementById('last-check-text');
  const checkNowBtn = document.getElementById('check-now-btn');
  const keywordHint = document.getElementById('keyword-hint');

  let activeKeyword = null;

  document.getElementById('open-site-btn').addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://seasonaljobs.dol.gov/' });
  });

  document.getElementById('close-template-btn').addEventListener('click', deselectKeyword);

  checkNowBtn.addEventListener('click', () => {
    checkNowBtn.disabled = true;
    checkNowBtn.classList.add('spinning');
    lastCheckText.textContent = 'Verificando...';
    chrome.runtime.sendMessage({ type: 'checkNow' }, () => {
      checkNowBtn.disabled = false;
      checkNowBtn.classList.remove('spinning');
      chrome.storage.local.get(['lastCheck'], (data) => renderLastCheck(data.lastCheck));
    });
  });

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.lastCheck) renderLastCheck(changes.lastCheck.newValue);
  });

  // Load saved data
  chrome.storage.local.get(['keywordProfiles', 'resumeLink', 'isMonitorActive', 'lastCheck'], (data) => {
    const profiles = data.keywordProfiles || {};
    
    // Atualiza a lista
    Object.keys(profiles).forEach(kw => {
      addKeywordToList(kw);
    });
    
    if (data.resumeLink) {
      resumeLinkInput.value = data.resumeLink;
    }
    
    // undefined = nunca mexeu no switch = ativo (mesma regra do background)
    const isActive = data.isMonitorActive !== false;
    toggleMonitor.checked = isActive;
    updateStatusText(isActive);
    if (data.isMonitorActive === undefined) {
      chrome.storage.local.set({isMonitorActive: true});
    }

    updateKeywordHint();
    renderLastCheck(data.lastCheck);
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
            updateKeywordHint();
            // Busca inicial registra as vagas que já existem, para só notificar as novas
            chrome.runtime.sendMessage({ type: 'checkNow' });
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
          updateKeywordHint();
        });
      });
    };
    
    li.appendChild(removeBtn);
    
    // Clicar de novo na vaga aberta fecha a mensagem
    li.onclick = () => {
      if (activeKeyword === kw) {
        deselectKeyword();
      } else {
        selectKeyword(kw);
      }
    };
    
    keywordList.appendChild(li);
  }

  function selectKeyword(kw) {
    activeKeyword = kw;
    currentKeywordLabel.textContent = kw;
    templateSection.classList.remove('hidden');

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
      emailBodyInput.focus();
    });
  }

  function deselectKeyword() {
    activeKeyword = null;
    currentKeywordLabel.textContent = '';
    emailBodyInput.value = '';
    templateSection.classList.add('hidden');
    document.querySelectorAll('#keyword-list li').forEach(li => li.classList.remove('selected'));
  }

  function updateKeywordHint() {
    keywordHint.style.display = keywordList.children.length ? 'block' : 'none';
  }

  function renderLastCheck(lastCheck) {
    if (!lastCheck) {
      lastCheckText.textContent = 'Ainda não verificou';
      lastCheckText.className = '';
      return;
    }
    const hora = new Date(lastCheck.time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    if (lastCheck.errors && lastCheck.errors.length) {
      lastCheckText.textContent = `${hora} · erro na busca`;
      lastCheckText.title = lastCheck.errors.join('\n');
      lastCheckText.className = 'error';
    } else {
      const novas = lastCheck.newCount === 1 ? '1 vaga nova' : `${lastCheck.newCount} vagas novas`;
      lastCheckText.textContent = `Última verificação ${hora} · ${novas}`;
      lastCheckText.title = '';
      lastCheckText.className = '';
    }
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
