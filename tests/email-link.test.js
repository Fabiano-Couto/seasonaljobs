// Defeito (10/11/2026): o botão "Candidatar-se" só gerava link mailto:, que o Windows abre no Outlook.
// O usuário quer mandar pelo Gmail no Chrome ("ao invés de abrir o Outlook no Windows, eu gostaria de
// enviar pelo Gmail no Google Chrome"). Regras protegidas aqui:
//   1. sem escolha salva, o link é a tela "Escrever" do Gmail, em aba nova;
//   2. com conta informada, o Gmail abre nessa conta (authuser) — com várias contas Google no Chrome,
//      sem isso o e-mail sairia da conta principal;
//   3. escolhendo "app de e-mail do Windows", volta o mailto: de antes, na mesma aba;
//   4. mudar a escolha no popup refaz os botões já na tela, sem recarregar a página.
//
// Rodar: node --test tests/
// O content.js roda num contexto vm com document/chrome falsos — nada sai para a rede.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const CONTENT_JS = path.join(__dirname, '..', 'content', 'content.js');

function fakeElement() {
  return {
    attrs: {},
    children: [],
    removed: false,
    innerHTML: '',
    style: { cssText: '', setProperty() {} },
    setAttribute(name, value) { this.attrs[name] = String(value); },
    removeAttribute(name) { delete this.attrs[name]; },
    remove() { this.removed = true; },
    appendChild(child) { this.children.push(child); return child; },
    prepend(child) { this.children.unshift(child); },
    querySelector() { return null; },
    addEventListener() {}
  };
}

// buttonsOnPage: simula botões já desenhados na tela (flutuante + 2 cards)
// stored: o que o chrome.storage.local devolve — só as chaves pedidas, como o Chrome faz
function loadContentScript({ buttonsOnPage = true, stored = {} } = {}) {
  const storageListeners = [];
  const floating = fakeElement();
  const cards = [fakeElement(), fakeElement()];
  const body = fakeElement();
  const sandbox = {
    console,
    setInterval: () => 0,
    location: { hostname: 'www.coolworks.com', pathname: '/' },
    document: {
      body,
      createElement: () => fakeElement(),
      getElementById: (id) => (buttonsOnPage && id === 'sj-auto-apply-btn' ? floating : null),
      querySelectorAll: (selector) => (buttonsOnPage && selector === '.sj-card-apply-btn' ? cards : [])
    },
    chrome: {
      storage: {
        local: {
          get: (keys, callback) => callback(Object.fromEntries(keys.filter(k => k in stored).map(k => [k, stored[k]])))
        },
        onChanged: { addListener: (fn) => storageListeners.push(fn) }
      }
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(CONTENT_JS, 'utf8'), sandbox, { filename: CONTENT_JS });
  return { ctx: sandbox, storageListeners, floating, cards, body };
}

// Vaga e configuração do popup como chegam de verdade: modelo com os marcadores e link do currículo
const job = {
  email: 'candidaturas@example.com',
  jobTitle: 'Line Cook',
  companyName: 'Acme Resort & Spa',
  bodyText: 'line cook wanted for the summer season'
};
const settings = {
  keywordProfiles: { 'Line Cook': 'Dear Hiring Manager,\n\nI want the [Job Title] job at [Company Name].' },
  resumeLink: 'https://drive.google.com/cv'
};

const SUBJECT = 'Application%20for%20Line%20Cook%20at%20Acme%20Resort%20%26%20Spa';
const BODY = 'Dear%20Hiring%20Manager%2C%0A%0AI%20want%20the%20Line%20Cook%20job%20at%20Acme%20Resort%20%26%20Spa.'
  + '%0A%0ALink%20to%20my%20resume%3A%20https%3A%2F%2Fdrive.google.com%2Fcv';

test('sem escolha salva, o botão abre a tela Escrever do Gmail em aba nova', () => {
  const { ctx } = loadContentScript();
  const link = ctx.buildEmailLink(job, settings);
  assert.equal(link.href,
    'https://mail.google.com/mail/?view=cm&fs=1&to=candidaturas%40example.com&su=' + SUBJECT + '&body=' + BODY);
  assert.equal(link.newTab, true);
});

test('com a conta do Gmail informada, abre nessa conta (authuser)', () => {
  const { ctx } = loadContentScript();
  const link = ctx.buildEmailLink(job, { ...settings, emailClient: 'gmail', gmailAccount: 'candidato@example.com' });
  assert.equal(link.href,
    'https://mail.google.com/mail/?view=cm&fs=1&authuser=candidato%40example.com&to=candidaturas%40example.com&su=' + SUBJECT + '&body=' + BODY);
});

test('escolhendo o app de e-mail do Windows, volta o mailto: na mesma aba', () => {
  const { ctx } = loadContentScript();
  const link = ctx.buildEmailLink(job, { ...settings, emailClient: 'mailto', gmailAccount: 'candidato@example.com' });
  assert.equal(link.href, 'mailto:candidaturas@example.com?subject=' + SUBJECT + '&body=' + BODY);
  assert.equal(link.newTab, false);
});

test('o link do Gmail vai para o botão com target _blank; o mailto tira o target', () => {
  const { ctx } = loadContentScript();
  const btn = fakeElement();

  ctx.applyEmailLink(btn, { href: 'https://mail.google.com/mail/?view=cm', newTab: true });
  assert.equal(btn.attrs.href, 'https://mail.google.com/mail/?view=cm');
  assert.equal(btn.attrs.target, '_blank');
  assert.equal(btn.attrs.rel, 'noopener');

  ctx.applyEmailLink(btn, { href: 'mailto:candidaturas@example.com', newTab: false });
  assert.equal(btn.attrs.href, 'mailto:candidaturas@example.com');
  assert.equal(btn.attrs.target, undefined);
});

test('o botão flutuante e o botão do card da vaga abrem o Gmail da conta escolhida, em aba nova', () => {
  const GMAIL_DA_CONTA = 'https://mail.google.com/mail/?view=cm&fs=1&authuser=candidato%40example.com&to=candidaturas%40example.com&su='
    + SUBJECT + '&body=' + BODY;
  const { ctx, body } = loadContentScript({
    buttonsOnPage: false,
    stored: { ...settings, emailClient: 'gmail', gmailAccount: 'candidato@example.com' }
  });

  ctx.createApplyButton(job, 'chave-da-vaga');
  const floating = body.children[0];
  assert.equal(floating.attrs.href, GMAIL_DA_CONTA);
  assert.equal(floating.attrs.target, '_blank');
  assert.match(floating.innerHTML, /Abre no Gmail/);

  const header = fakeElement();
  const card = { ...fakeElement(), querySelector: (selector) => (selector === '.justify-between' ? header : null) };
  ctx.injectCardButton({ ...job, card });
  const cardButton = header.children[0];
  assert.equal(cardButton.attrs.href, GMAIL_DA_CONTA);
  assert.equal(cardButton.attrs.target, '_blank');
});

test('mudar a forma de envio no popup refaz os botões já na tela', () => {
  for (const key of ['emailClient', 'gmailAccount']) {
    const { storageListeners, floating, cards } = loadContentScript();
    assert.equal(storageListeners.length, 1);
    storageListeners[0]({ [key]: { newValue: 'x' } }, 'local');
    assert.equal(floating.removed, true, `${key}: botão flutuante não foi refeito`);
    assert.deepEqual(cards.map(c => c.removed), [true, true], `${key}: botões dos cards não foram refeitos`);
  }
});

test('mudança do monitor (lastCheck, vagas vistas) não mexe nos botões', () => {
  const { storageListeners, floating, cards } = loadContentScript();
  storageListeners[0]({ lastCheck: { newValue: {} }, cwSeen: { newValue: [] } }, 'local');
  assert.equal(floating.removed, false);
  assert.deepEqual(cards.map(c => c.removed), [false, false]);
});

// ---------- Regras de antes desta mudança que nenhum teste protegia (revisão independente, 10/11/2026) ----------

test('palavra-chave no título da vaga vence a que só aparece na descrição', () => {
  const { ctx } = loadContentScript();
  const maintenanceJob = {
    email: 'jobs@example.com',
    jobTitle: 'Maintenance Technician',
    companyName: 'Acme Resort & Spa',
    bodyText: 'maintenance technician - help the housekeeping team keep rooms ready'
  };
  const data = { keywordProfiles: { 'Housekeeping': 'HK [Job Title]', 'Maintenance': 'MT [Job Title]' } };
  assert.equal(ctx.composeEmail(maintenanceJob, data).body, 'MT Maintenance Technician');
});

// Perfil da CoolWorks: as vagas da lista vêm prontas (o leitor do perfil é trocado por um falso)
function profileOpening(title) {
  const header = fakeElement();
  return {
    header,
    opening: {
      email: 'vagas@example.com', jobTitle: title, companyName: 'Hampton by Hilton Bar Harbor', bodyText: title.toLowerCase(),
      card: { ...fakeElement(), querySelector: (s) => (s === '.justify-between' ? header : null) }
    }
  };
}

test('perfil com uma vaga: botão no card e botão flutuante para a mesma vaga', () => {
  const { ctx, body } = loadContentScript({ buttonsOnPage: false, stored: settings });
  const { header, opening } = profileOpening('Housekeeper');
  ctx.extractJob = () => null;
  ctx.extractCoolWorksOpenings = () => [opening];
  ctx.checkAndInjectButton();
  assert.equal(header.children.length, 1);
  assert.equal(body.children.length, 1);
  assert.equal(body.children[0].attrs['data-job-key'], 'vagas@example.com|Housekeeper|Hampton by Hilton Bar Harbor');
  assert.match(body.children[0].innerHTML, /Candidatar-se Agora/);
});

test('perfil com várias vagas: um botão em cada card e o flutuante vira a dica que leva à lista', () => {
  const { ctx, body } = loadContentScript({ buttonsOnPage: false, stored: settings });
  const first = profileOpening('Housekeeper');
  const second = profileOpening('Front Desk');
  ctx.extractJob = () => null;
  ctx.extractCoolWorksOpenings = () => [first.opening, second.opening];
  ctx.checkAndInjectButton();
  assert.deepEqual([first.header.children.length, second.header.children.length], [1, 1]);
  assert.equal(body.children.length, 1);
  assert.equal(body.children[0].attrs['data-job-key'], 'list|2|vagas@example.com');
  assert.match(body.children[0].innerHTML, /2 vagas nesta empresa/);
  assert.equal(body.children[0].href, '#job-openings');
});
