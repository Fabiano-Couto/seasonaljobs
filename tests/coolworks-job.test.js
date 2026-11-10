// Defeito (10/11/2026, achado na regressão do envio pelo Gmail): a CoolWorks reformulou a página de vaga
// e o e-mail passou a sair com assunto errado — "Application for Beach Bags at Work Hard I Play Hard I Bank
// The Bucks" em vez de "Application for Houseboat Anchoring Crew at Beach Bags". A extensão lia o título
// no primeiro h3 e a empresa no primeiro h4 do bloco da vaga; no layout novo o título está no h2, a empresa
// no h3 (link para o perfil) e o primeiro h4 é um subtítulo da descrição.
//
// Regras protegidas:
//   1. título e empresa vêm primeiro do JSON-LD JobPosting da página (dado estruturado — sobreviveu à
//      reforma), desde que o @id seja a vaga aberta;
//   2. sem JSON-LD da vaga (ou com o de outra vaga, deixado no <head> pela navegação do Turbo), vale o topo
//      do bloco da vaga: primeiro h2/h3 = cargo, primeiro link para o perfil = empresa (serve no layout
//      novo e no antigo).
//
// O JSON-LD usado é o real da vaga (tests/fixtures). O bloco da vaga é falso: cada seletor devolve o que
// devolve na página real (conferido no HTML de 10/11/2026 e, para o layout antigo, no de 29/09/2026).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const CONTENT_JS = path.join(__dirname, '..', 'content', 'content.js');
const JOB_LD = fs.readFileSync(path.join(__dirname, 'fixtures', 'coolworks-beach-bags-jobposting.json'), 'utf8');
const JOB_PATH = '/beach-bags/highlighted-job/83299-houseboat-anchoring-crew-5';

function el(text, attrs = {}) {
  return { textContent: text, getAttribute: (name) => attrs[name] ?? null, querySelector: () => null };
}

// bySelector: o que cada seletor devolve dentro do bloco da vaga
function jobFrame(bySelector) {
  const howToApply = {
    textContent: 'How to Apply Apply Now Contact Info candidatura@example.com',
    querySelector: (s) => (s === 'a[href^="mailto:"]' ? el('candidatura@example.com', { href: 'mailto:candidatura@example.com' }) : null)
  };
  return {
    textContent: 'Houseboat Anchoring Crew Beach Bags Work Hard I Play Hard I Bank The Bucks',
    querySelector: (s) => (s === '#how-to-apply' ? howToApply : bySelector[s] ?? null)
  };
}

function extractWith({ ldScripts, frame }) {
  const sandbox = {
    console,
    setInterval: () => 0,
    location: { hostname: 'www.coolworks.com', pathname: JOB_PATH },
    document: {
      querySelector: (s) => (s.startsWith('turbo-frame[id^="highlighted_job_"]') ? frame : null),
      querySelectorAll: (s) => (s === 'script[type="application/ld+json"]' ? ldScripts.map(text => ({ textContent: text })) : [])
    },
    chrome: { storage: { local: { get() {} }, onChanged: { addListener() {} } } }
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(CONTENT_JS, 'utf8'), sandbox, { filename: CONTENT_JS });
  const job = sandbox.extractCoolWorks();
  return { email: job.email, jobTitle: job.jobTitle, companyName: job.companyName };
}

// Layout novo (nov/2026), como o HTML real da vaga da Beach Bags
const NEW_LAYOUT = {
  'h2, h3': el('Houseboat Anchoring Crew'),
  'h3': el('Beach Bags'),
  'h4': el('Work Hard I Play Hard I Bank The Bucks'),
  'a[href$="/profile"]': el('Beach Bags')
};

test('vaga no layout novo da CoolWorks: o e-mail sai com o cargo e a empresa certos', () => {
  assert.deepEqual(extractWith({ ldScripts: [JOB_LD], frame: jobFrame(NEW_LAYOUT) }), {
    email: 'candidatura@example.com',
    jobTitle: 'Houseboat Anchoring Crew',
    companyName: 'Beach Bags'
  });
});

// Bloco JSON-LD sem @id nem url passa pela proteção do Turbo: é a conferência do @type que o descarta
const NO_REF_LD = '{"@context": "http://schema.org/", "@type": "WebSite", "name": "CoolWorks"}';

test('se o layout mudar de novo e o topo do bloco não for o cargo, vale o JSON-LD da vaga', () => {
  const shifted = jobFrame({ 'h2, h3': el('Job Summary'), 'a[href$="/profile"]': el('View employer profile') });
  const job = extractWith({ ldScripts: [NO_REF_LD, JOB_LD], frame: shifted });
  assert.equal(job.jobTitle, 'Houseboat Anchoring Crew');
  assert.equal(job.companyName, 'Beach Bags');
});

test('JSON-LD de outra vaga (deixado pelo Turbo) é ignorado: vale o topo do bloco da vaga', () => {
  const otherJob = JOB_LD
    .replace(JOB_PATH, '/camp-birch-hill/highlighted-job/83260-equestrian-counselor-5')
    .replace('"title": "Houseboat Anchoring Crew"', '"title": "Equestrian Counselor"')
    .replace('"name": "Beach Bags"', '"name": "Camp Birch Hill"');
  assert.equal(otherJob.includes('Equestrian Counselor') && otherJob.includes('Camp Birch Hill'), true);
  const job = extractWith({ ldScripts: [otherJob], frame: jobFrame(NEW_LAYOUT) });
  assert.equal(job.jobTitle, 'Houseboat Anchoring Crew');
  assert.equal(job.companyName, 'Beach Bags');
});

// ---------- Perfil da empresa (/<empresa>/profile) ----------
// Mesmo defeito no perfil: a empresa era lida no primeiro h4 do perfil; no layout novo ela está no h2 do topo e o
// primeiro h4 é o título da primeira vaga da lista — o e-mail saía "Application for Housekeeper at Housekeeper".

const PROFILE_LD = fs.readFileSync(path.join(__dirname, 'fixtures', 'coolworks-hampton-organization.json'), 'utf8');
const PROFILE_PATH = '/hampton-by-hilton-bar-harbor/profile';
const COOLWORKS_LD = '{"@context": "http://schema.org/", "@type": "Organization", "name": "CoolWorks", "url": "https://www.coolworks.com/"}';

// topBySelector: o que cada seletor devolve no bloco do perfil; os 2 cards são as 2 primeiras vagas da Hampton
// logo: false tira o logo da empresa, para o teste não ser salvo por essa última opção
function openingsWith({ ldScripts, topBySelector, logo = true }) {
  const card = (title) => ({ textContent: `${title} Bar Harbor, Maine`, querySelector: (s) => (s === 'h4' ? el(title) : null) });
  const howToApply = {
    textContent: 'How to Apply Contact Info vagas@example.com',
    querySelector: (s) => (s === 'a[href^="mailto:"]' ? el('vagas@example.com', { href: 'mailto:vagas@example.com' }) : null)
  };
  const profile = {
    querySelector: (s) => (s === '#how-to-apply' ? howToApply : topBySelector[s] ?? null),
    querySelectorAll: (s) => (s === '#job-openings turbo-frame[id^="job_"]' ? [card('Housekeeper'), card('Front Desk')] : [])
  };
  const sandbox = {
    console,
    setInterval: () => 0,
    location: { hostname: 'www.coolworks.com', pathname: PROFILE_PATH },
    document: {
      querySelector: (s) => (s === 'turbo-frame[id^="profile_"]' ? profile
        : s === '.employer-logo img' && logo ? { title: 'Hampton by Hilton Bar Harbor' } : null),
      querySelectorAll: (s) => (s === 'script[type="application/ld+json"]' ? ldScripts.map(text => ({ textContent: text })) : [])
    },
    chrome: { storage: { local: { get() {} }, onChanged: { addListener() {} } } }
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(CONTENT_JS, 'utf8'), sandbox, { filename: CONTENT_JS });
  // Array.from daqui: a lista criada dentro do vm é de outro contexto e o deepEqual estrito a recusaria
  return Array.from(sandbox.extractCoolWorksOpenings(), o => `${o.jobTitle} | ${o.companyName} | ${o.email}`);
}

// Layout novo (nov/2026), como o HTML real do perfil da Hampton
const NEW_PROFILE_TOP = { 'h2, h4': el('Hampton by Hilton Bar Harbor'), 'h4': el('Housekeeper') };

test('perfil no layout novo: o e-mail de cada vaga leva o nome da empresa, não o título da primeira vaga', () => {
  assert.deepEqual(openingsWith({ ldScripts: [COOLWORKS_LD, PROFILE_LD], topBySelector: NEW_PROFILE_TOP }), [
    'Housekeeper | Hampton by Hilton Bar Harbor | vagas@example.com',
    'Front Desk | Hampton by Hilton Bar Harbor | vagas@example.com'
  ]);
});

test('perfil: se o topo mudar de novo, vale o nome do JSON-LD da empresa', () => {
  const shifted = { 'h2, h4': el('About Us'), 'h4': el('Housekeeper') };
  assert.deepEqual(openingsWith({ ldScripts: [NO_REF_LD, COOLWORKS_LD, PROFILE_LD], topBySelector: shifted, logo: false }), [
    'Housekeeper | Hampton by Hilton Bar Harbor | vagas@example.com',
    'Front Desk | Hampton by Hilton Bar Harbor | vagas@example.com'
  ]);
});

test('perfil: JSON-LD de outra empresa (deixado pelo Turbo) é ignorado: vale o topo do perfil', () => {
  const otherProfile = PROFILE_LD
    .replace(PROFILE_PATH, '/the-island-house/profile')
    .replace('"name": "Hampton by Hilton Bar Harbor"', '"name": "The Island House"');
  assert.equal(otherProfile.includes('The Island House'), true);
  assert.deepEqual(openingsWith({ ldScripts: [COOLWORKS_LD, otherProfile], topBySelector: NEW_PROFILE_TOP, logo: false }), [
    'Housekeeper | Hampton by Hilton Bar Harbor | vagas@example.com',
    'Front Desk | Hampton by Hilton Bar Harbor | vagas@example.com'
  ]);
});

test('perfil no layout antigo (set/2026) sem JSON-LD continua certo', () => {
  // No layout antigo o nome da empresa era o primeiro h4 do perfil, antes de qualquer h2
  const oldTop = { 'h2, h4': el('Hampton by Hilton Bar Harbor'), 'h4': el('Hampton by Hilton Bar Harbor') };
  assert.deepEqual(openingsWith({ ldScripts: [], topBySelector: oldTop, logo: false }), [
    'Housekeeper | Hampton by Hilton Bar Harbor | vagas@example.com',
    'Front Desk | Hampton by Hilton Bar Harbor | vagas@example.com'
  ]);
});

test('perfil sem JSON-LD e sem título no topo: o nome vem do logo da empresa', () => {
  assert.deepEqual(openingsWith({ ldScripts: [], topBySelector: {} }), [
    'Housekeeper | Hampton by Hilton Bar Harbor | vagas@example.com',
    'Front Desk | Hampton by Hilton Bar Harbor | vagas@example.com'
  ]);
});

test('vaga no layout antigo (set/2026) sem JSON-LD continua certa', () => {
  // No layout antigo não havia h2 no bloco: o primeiro h2/h3 era o h3 do cargo; a empresa era h4 > a[href$="/profile"]
  const oldLayout = jobFrame({
    'h2, h3': el('Facilities Maintenance Technician'),
    'h3': el('Facilities Maintenance Technician'),
    'h4': el('Theodore Roosevelt Medora Foundation'),
    'a[href$="/profile"]': el('Theodore Roosevelt Medora Foundation')
  });
  const job = extractWith({ ldScripts: [], frame: oldLayout });
  assert.equal(job.jobTitle, 'Facilities Maintenance Technician');
  assert.equal(job.companyName, 'Theodore Roosevelt Medora Foundation');
});

test('vaga da CoolWorks sem e-mail (só o "Apply Now" para um sistema externo) não ganha botão', () => {
  const noEmail = {
    textContent: 'Houseboat Anchoring Crew Beach Bags',
    querySelector: (s) => (s === '#how-to-apply'
      ? { textContent: 'How to Apply Apply Now Contact Info Hiring Team (928) 555-0100', querySelector: () => null }
      : NEW_LAYOUT[s] ?? null)
  };
  const sandbox = {
    console,
    setInterval: () => 0,
    location: { hostname: 'www.coolworks.com', pathname: JOB_PATH },
    document: {
      querySelector: (s) => (s.startsWith('turbo-frame[id^="highlighted_job_"]') ? noEmail : null),
      querySelectorAll: (s) => (s === 'script[type="application/ld+json"]' ? [{ textContent: JOB_LD }] : [])
    },
    chrome: { storage: { local: { get() {} }, onChanged: { addListener() {} } } }
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(CONTENT_JS, 'utf8'), sandbox, { filename: CONTENT_JS });
  assert.equal(sandbox.extractCoolWorks(), null);
});
