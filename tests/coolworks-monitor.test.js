// Defeitos (10/11/2026, apontados pelo revisor antes do commit e conferidos no código) no monitor da página
// J1/H2B da CoolWorks (background.js, checkCoolworks):
//   1. um perfil de empresa que falhava sempre (403 do Cloudflare, perfil removido) deixava o monitor preso no
//      "registro inicial" — cwSeeded nunca virava true e nenhuma vaga da CoolWorks avisava mais;
//   3. a página voltando sem nenhuma vaga nem empresa (layout mudou, desafio do Cloudflare com 200) passava
//      calada; no registro inicial, a leitura boa seguinte avisava tudo de uma vez;
//   4. ao passar de 1000 chaves guardadas, o corte tirava as mais antigas mesmo ainda listadas na página —
//      e elas eram avisadas de novo;
//   6. o caminho da vaga ia para a notificação com "&amp;" sem decodificar (clique abria a URL quebrada);
//   7. entidade numérica acima de 0xFFFF (emoji) virava outro caractere (fromCharCode).
//
// Entrada real: os cards <article> da página J1/H2B e os cards de vaga dos 2 perfis listados nela, copiados em
// 10/11/2026 (tests/fixtures). A "vaga nova" é um card real clonado com outro número. Rede e chrome são falsos.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const BACKGROUND_JS = path.join(__dirname, '..', 'background', 'background.js');
const fixture = (name) => fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');

const INTL_URL = 'https://www.coolworks.com/international-job-seekers';
const ISLAND_URL = 'https://www.coolworks.com/the-island-house/profile';
const HAMPTON_URL = 'https://www.coolworks.com/hampton-by-hilton-bar-harbor/profile';

const INTL = fixture('coolworks-intl-articles.html');
const ISLAND = fixture('coolworks-profile-island-house-openings.html');
const HAMPTON = fixture('coolworks-profile-hampton-openings.html');

// Card real da vaga 83520 (F&B Supervisor, Yellowstone Club) clonado como vaga nova
const REAL_POST = INTL.match(/<article class='job-post[\s\S]*?<\/article>/)[0];
const newPost = (title, hrefSuffix = '') => REAL_POST
  .replaceAll('83520', '99001')
  .replace('F&amp;B Supervisor', title)
  .replace('/99001-f-and-b-supervisor-9"', `/99001-f-and-b-supervisor-9${hrefSuffix}"`);
const withNewPost = (card) => INTL.replace(REAL_POST, card + '\n' + REAL_POST);

// Card real da vaga 2127 (1852 Grill Room Cook, The Island House) clonado como vaga nova do perfil
const REAL_OPENING = ISLAND.match(/<turbo-frame id="job_2127">[\s\S]*?<\/turbo-frame>/)[0];
const ISLAND_WITH_NEW = ISLAND.replace(REAL_OPENING,
  REAL_OPENING.replace('job_2127', 'job_99502').replace('1852 Grill Room Cook', 'Night Auditor') + '\n' + REAL_OPENING);

function loadBackground(pages, initialStore = { monitorSites: { seasonaljobs: false, coolworks: true } }) {
  const store = { ...initialStore };
  const notifications = [];
  const opened = [];
  const clickListeners = [];
  const requests = [];
  const installedListeners = [];
  const sandbox = {
    console: { log() {}, error() {} }, // os erros esperados do teste não poluem a saída
    fetch: async (url, options = {}) => {
      requests.push({ url, credentials: options.credentials });
      const page = pages[url];
      if (typeof page === 'string') return { ok: true, status: 200, text: async () => page };
      if (page && page.json) return { ok: true, status: 200, json: async () => page.json };
      return { ok: false, status: page || 404, text: async () => '', json: async () => ({}) };
    },
    chrome: {
      runtime: { getURL: (p) => `chrome-extension://teste/${p}`, onInstalled: { addListener: (fn) => installedListeners.push(fn) }, onStartup: { addListener() {} }, onMessage: { addListener() {} } },
      alarms: { onAlarm: { addListener() {} }, get() {}, create() {} },
      notifications: {
        create: (id, options) => notifications.push({ id, title: options.title, message: options.message }),
        onClicked: { addListener: (fn) => clickListeners.push(fn) },
        clear() {}
      },
      tabs: { create: (options) => opened.push(options.url) },
      storage: {
        local: {
          get: async (keys) => Object.fromEntries(keys.filter(k => k in store).map(k => [k, store[k]])),
          set: async (values) => Object.assign(store, values),
          remove: async (keys) => [].concat(keys).forEach(k => delete store[k])
        }
      }
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(BACKGROUND_JS, 'utf8'), sandbox, { filename: BACKGROUND_JS });
  return { ctx: sandbox, store, notifications, opened, clickListeners, pages, requests, installedListeners };
}

const titles = (notifications) => notifications.map(n => n.title);

test('um perfil que falha sempre não trava o monitor: vaga nova na lista avisa mesmo assim', async () => {
  const bg = loadBackground({ [INTL_URL]: INTL, [ISLAND_URL]: 403, [HAMPTON_URL]: HAMPTON });
  const first = await bg.ctx.checkNewJobs();
  assert.equal(first.errors.join(' / '), 'CoolWorks · The Island House: HTTP 403');
  assert.equal(bg.notifications.length, 0);

  bg.pages[INTL_URL] = withNewPost(newPost('Line Cook'));
  await bg.ctx.checkNewJobs();
  assert.deepEqual(titles(bg.notifications), ['Nova vaga J1/H2B: Line Cook']);
  assert.equal(bg.notifications[0].message, 'Yellowstone Club\nBig Sky, Montana');
});

test('perfil que falhou no registro inicial, quando volta, é registrado em silêncio e depois avisa só o novo', async () => {
  const bg = loadBackground({ [INTL_URL]: INTL, [ISLAND_URL]: 403, [HAMPTON_URL]: HAMPTON });
  await bg.ctx.checkNewJobs();
  bg.pages[ISLAND_URL] = ISLAND;
  await bg.ctx.checkNewJobs();
  assert.deepEqual(titles(bg.notifications), [], 'as 20 vagas que já existiam no perfil não podem chegar como novas');

  bg.pages[ISLAND_URL] = ISLAND_WITH_NEW;
  await bg.ctx.checkNewJobs();
  assert.deepEqual(bg.notifications.map(n => `${n.title} | ${n.message} | ${n.id}`), [
    'Nova vaga J1/H2B: Night Auditor | The Island House | cw-/the-island-house/profile#job_99502'
  ]);
});

test('página J1/H2B sem vagas nem empresas vira erro e não conta como registro inicial', async () => {
  const bg = loadBackground({ [INTL_URL]: '<html><head><title>Just a moment...</title></head><body></body></html>', [ISLAND_URL]: ISLAND, [HAMPTON_URL]: HAMPTON });
  const first = await bg.ctx.checkNewJobs();
  assert.equal(first.errors.join(' / '), 'CoolWorks: página J1/H2B sem vagas nem empresas');

  bg.pages[INTL_URL] = INTL;
  await bg.ctx.checkNewJobs();
  assert.deepEqual(titles(bg.notifications), [], 'a primeira leitura boa é o registro inicial: nada avisa');

  bg.pages[INTL_URL] = withNewPost(newPost('Line Cook'));
  await bg.ctx.checkNewJobs();
  assert.deepEqual(titles(bg.notifications), ['Nova vaga J1/H2B: Line Cook']);
});

test('vaga ainda listada não sai da memória quando o limite de 1000 chaves enche', async () => {
  const bg = loadBackground({ [INTL_URL]: INTL, [ISLAND_URL]: ISLAND, [HAMPTON_URL]: HAMPTON });
  await bg.ctx.checkNewJobs();
  // 1000 vagas vistas depois, que já saíram da página
  bg.store.cwSeen = [...bg.store.cwSeen, ...Array.from({ length: 1000 }, (_, i) => `post:old-${i}`)];
  await bg.ctx.checkNewJobs();
  assert.equal(bg.store.cwSeen.length, 1000);
  assert.equal(bg.store.cwSeen.includes('post:83520'), true, 'vaga listada foi cortada da memória');

  await bg.ctx.checkNewJobs();
  assert.deepEqual(titles(bg.notifications), [], 'vagas já vistas e ainda listadas foram avisadas de novo');
});

test('endereço com &amp; vai decodificado para a notificação e o clique abre a vaga certa', async () => {
  const bg = loadBackground({ [INTL_URL]: INTL, [ISLAND_URL]: ISLAND, [HAMPTON_URL]: HAMPTON });
  await bg.ctx.checkNewJobs();
  bg.pages[INTL_URL] = withNewPost(newPost('Line Cook', '?ref=intl&amp;src=j1'));
  await bg.ctx.checkNewJobs();
  assert.equal(bg.notifications[0].id, 'cw-/yellowstone-club/highlighted-job/99001-f-and-b-supervisor-9?ref=intl&src=j1');

  bg.clickListeners[0](bg.notifications[0].id);
  assert.deepEqual(bg.opened, ['https://www.coolworks.com/yellowstone-club/highlighted-job/99001-f-and-b-supervisor-9?ref=intl&src=j1']);
});

// Card real da Hampton na página J1/H2B; tirando ele, a Hampton "entra" na página na leitura seguinte
const HAMPTON_CARD = INTL.match(/<article class='employer-profile[^']*'[^>]*>(?:(?!<\/article>)[\s\S])*?\/hampton-by-hilton-bar-harbor\/profile[\s\S]*?<\/article>/)[0];
const INTL_WITHOUT_HAMPTON = INTL.replace(HAMPTON_CARD, '');

test('empresa nova na página avisa uma vez só, com o número de vagas do perfil — sem um aviso por vaga', async () => {
  const bg = loadBackground({ [INTL_URL]: INTL_WITHOUT_HAMPTON, [ISLAND_URL]: ISLAND, [HAMPTON_URL]: HAMPTON });
  await bg.ctx.checkNewJobs();
  bg.pages[INTL_URL] = INTL;
  await bg.ctx.checkNewJobs();
  assert.deepEqual(bg.notifications.map(n => `${n.title} | ${n.message} | ${n.id}`), [
    'Nova empresa J1/H2B: Hampton by Hilton Bar Harbor | 5 vagas no perfil | cw-/hampton-by-hilton-bar-harbor/profile#job-openings'
  ]);

  await bg.ctx.checkNewJobs();
  assert.equal(bg.notifications.length, 1, 'as 5 vagas da empresa nova chegaram uma a uma na leitura seguinte');
});

test('empresa nova cujo perfil não responde avisa uma vez e manda ver o perfil', async () => {
  const bg = loadBackground({ [INTL_URL]: INTL_WITHOUT_HAMPTON, [ISLAND_URL]: ISLAND, [HAMPTON_URL]: 503 });
  await bg.ctx.checkNewJobs();
  bg.pages[INTL_URL] = INTL;
  const result = await bg.ctx.checkNewJobs();
  assert.equal(result.errors.join(' / '), 'CoolWorks · Hampton by Hilton Bar Harbor: HTTP 503');
  assert.deepEqual(bg.notifications.map(n => `${n.title} | ${n.message}`), [
    'Nova empresa J1/H2B: Hampton by Hilton Bar Harbor | veja as vagas no perfil'
  ]);

  bg.pages[HAMPTON_URL] = HAMPTON;
  await bg.ctx.checkNewJobs();
  assert.equal(bg.notifications.length, 1, 'quando o perfil voltou, as vagas dele chegaram como novas');
});

// Achado da revisão independente (10/11/2026): perfil que responde 200 sem o conteúdo (desafio do Cloudflare,
// manutenção) era lido como "lista com 0 vagas" e marcado como conhecido; na leitura boa seguinte, as vagas antigas
// chegavam todas como novas (20 avisos da Island House). Página de perfil sem o bloco do perfil agora é erro.
const BLOCKED = '<html><head><title>Just a moment...</title></head><body>Checking your browser</body></html>';
const PROFILE_ERROR = 'perfil sem o bloco da empresa (bloqueio ou layout mudou)';

test('perfil que devolve página de bloqueio com 200 vira erro e não marca a lista: as vagas antigas não chegam como novas', async () => {
  const bg = loadBackground({ [INTL_URL]: INTL, [ISLAND_URL]: BLOCKED, [HAMPTON_URL]: HAMPTON });
  const first = await bg.ctx.checkNewJobs();
  assert.equal(first.errors.join(' / '), `CoolWorks · The Island House: ${PROFILE_ERROR}`);

  bg.pages[ISLAND_URL] = ISLAND;
  await bg.ctx.checkNewJobs();
  assert.deepEqual(titles(bg.notifications), []);
});

test('empresa nova cujo perfil devolve bloqueio com 200 avisa uma vez e depois registra as vagas em silêncio', async () => {
  const bg = loadBackground({ [INTL_URL]: INTL_WITHOUT_HAMPTON, [ISLAND_URL]: ISLAND, [HAMPTON_URL]: BLOCKED });
  await bg.ctx.checkNewJobs();
  bg.pages[INTL_URL] = INTL;
  await bg.ctx.checkNewJobs();
  assert.deepEqual(bg.notifications.map(n => `${n.title} | ${n.message}`), [
    'Nova empresa J1/H2B: Hampton by Hilton Bar Harbor | veja as vagas no perfil'
  ]);

  bg.pages[HAMPTON_URL] = HAMPTON;
  await bg.ctx.checkNewJobs();
  assert.equal(bg.notifications.length, 1, 'as 5 vagas da Hampton chegaram uma a uma quando o perfil voltou');
});

test('emoji no título (&#127957; e &#x1F3D5;) chega inteiro na notificação', async () => {
  const bg = loadBackground({ [INTL_URL]: INTL, [ISLAND_URL]: ISLAND, [HAMPTON_URL]: HAMPTON });
  await bg.ctx.checkNewJobs();
  bg.pages[INTL_URL] = withNewPost(newPost('Camp Host &#127957; &#x1F3D5;'));
  await bg.ctx.checkNewJobs();
  assert.deepEqual(titles(bg.notifications), ['Nova vaga J1/H2B: Camp Host \u{1F3D5} \u{1F3D5}']);
});

// ---------- Regras de antes desta mudança que nenhum teste protegia (revisão independente, 10/11/2026) ----------

test('consultas à CoolWorks mandam os cookies do Chrome (credentials include), por causa do Cloudflare', async () => {
  const bg = loadBackground({ [INTL_URL]: INTL, [ISLAND_URL]: ISLAND, [HAMPTON_URL]: HAMPTON });
  await bg.ctx.checkNewJobs();
  assert.deepEqual(bg.requests.map(r => `${r.url} ${r.credentials}`), [
    `${INTL_URL} include`, `${ISLAND_URL} include`, `${HAMPTON_URL} include`
  ]);
});

test('quem tinha pausado o monitor único antigo continua com o SeasonalJobs desligado; instalação nova liga os dois', async () => {
  const API = 'https://api.seasonaljobs.dol.gov/datahub/search?api-version=2020-06-30';
  const pages = { [INTL_URL]: INTL, [ISLAND_URL]: ISLAND, [HAMPTON_URL]: HAMPTON };
  const keywords = { keywordProfiles: { 'Cook': 'x' } };

  const paused = loadBackground(pages, { ...keywords, isMonitorActive: false });
  await paused.ctx.checkNewJobs();
  assert.deepEqual([paused.requests.some(r => r.url === API), paused.requests.some(r => r.url === INTL_URL)], [false, true]);

  const fresh = loadBackground(pages, { ...keywords });
  await fresh.ctx.checkNewJobs();
  assert.deepEqual([fresh.requests.some(r => r.url === API), fresh.requests.some(r => r.url === INTL_URL)], [true, true]);
});

test('clique na notificação do SeasonalJobs abre a vaga no site do DOL', () => {
  const bg = loadBackground({});
  bg.clickListeners[0]('job-H-400-26260-242502');
  assert.deepEqual(bg.opened, ['https://seasonaljobs.dol.gov/jobs/H-400-26260-242502']);
});

// ---------- Revisão independente, rodada 2 (10/11/2026) ----------
// A guarda do perfil exigia o id logo depois do nome da tag; na página real, outros frames já vêm com a classe
// antes do id (<turbo-frame class="scroll-mt-36" id="job-openings">). Uma classe no bloco do perfil faria todo
// perfil virar erro. E a guarda precisa valer pelos dois lados: perfil real sem vaga não é erro; página da
// CoolWorks sem o bloco do perfil é.

const CAMP_NO_OPENINGS = fixture('coolworks-profile-camp-birch-hill-sem-vagas.html');
const HAMPTON_WITH_CLASS = HAMPTON
  .replace('<turbo-frame id="profile_3470">', '<turbo-frame class="mx-auto" id="profile_3470">')
  .replaceAll('<turbo-frame id="job_', '<turbo-frame class="scroll-mt-36" id="job_');
// Página da própria CoolWorks sem perfil (manutenção, perfil fora do ar): só os frames de sempre (tags reais)
const COOLWORKS_WITHOUT_PROFILE = '<turbo-frame id="modal">\n</turbo-frame>\n'
  + '<turbo-frame class="grow bg-linear-to-b from-white to-stone-100" id="main"><main><h1>We will be right back</h1></main></turbo-frame>';

test('perfil com classe antes do id (no bloco do perfil e nos cards) continua sendo lido', async () => {
  const bg = loadBackground({ [INTL_URL]: INTL, [ISLAND_URL]: ISLAND, [HAMPTON_URL]: HAMPTON_WITH_CLASS });
  const first = await bg.ctx.checkNewJobs();
  assert.deepEqual(Array.from(first.errors), []);

  const firstCard = HAMPTON_WITH_CLASS.match(/<turbo-frame class="scroll-mt-36" id="job_21495">[\s\S]*?<\/turbo-frame>/)[0];
  bg.pages[HAMPTON_URL] = HAMPTON_WITH_CLASS.replace(firstCard,
    firstCard.replace('job_21495', 'job_99601').replace(/Housekeeper/g, 'Pool Attendant') + '\n' + firstCard);
  await bg.ctx.checkNewJobs();
  assert.deepEqual(titles(bg.notifications), ['Nova vaga J1/H2B: Pool Attendant']);
});

test('perfil real sem vagas na lista não é erro e não avisa nada', async () => {
  const bg = loadBackground({ [INTL_URL]: INTL, [ISLAND_URL]: ISLAND, [HAMPTON_URL]: CAMP_NO_OPENINGS });
  const first = await bg.ctx.checkNewJobs();
  const second = await bg.ctx.checkNewJobs();
  assert.deepEqual([...first.errors, ...second.errors], []);
  assert.deepEqual(titles(bg.notifications), []);
});

test('página da CoolWorks sem o bloco do perfil (só os frames de sempre) é erro, não "0 vagas"', async () => {
  const bg = loadBackground({ [INTL_URL]: INTL, [ISLAND_URL]: COOLWORKS_WITHOUT_PROFILE, [HAMPTON_URL]: HAMPTON });
  const first = await bg.ctx.checkNewJobs();
  assert.equal(first.errors.join(' / '), `CoolWorks · The Island House: ${PROFILE_ERROR}`);
});

test('atualização de quem tinha pausado o monitor único: SeasonalJobs desligado, CoolWorks ligada', async () => {
  const bg = loadBackground({}, { isMonitorActive: false });
  await bg.installedListeners[0]({ reason: 'update' });
  assert.equal(JSON.stringify(bg.store.monitorSites), '{"seasonaljobs":false,"coolworks":true}');
  assert.equal('isMonitorActive' in bg.store, false);
});

test('instalação nova: os dois sites ligados e o histórico de vagas vistas zerado', async () => {
  const bg = loadBackground({}, {});
  await bg.installedListeners[0]({ reason: 'install' });
  assert.equal(JSON.stringify(bg.store.monitorSites), '{"seasonaljobs":true,"coolworks":true}');
  assert.equal(JSON.stringify([bg.store.seenJobs, bg.store.cwSeen, bg.store.cwSeeded]), '[[],[],false]');
});

// ---------- Aviso-resumo (pedido do usuário, 10/11/2026) ----------
// Muitas vagas novas de uma vez (dias com o computador desligado, site religado) viravam um aviso por vaga, cada um
// esperando clique. Decisão do usuário: até 5 por site, um aviso por vaga; acima de 5, um aviso só, que abre o site.

const postNumber = (n, title) => REAL_POST.replaceAll('83520', String(99000 + n)).replace('F&amp;B Supervisor', title);
const withPosts = (count) => INTL.replace(REAL_POST,
  Array.from({ length: count }, (_, i) => postNumber(i + 1, `Vaga ${i + 1}`)).join('\n') + '\n' + REAL_POST);

test('CoolWorks: 6 vagas novas de uma vez viram um aviso-resumo que abre a página J1/H2B', async () => {
  const bg = loadBackground({ [INTL_URL]: INTL, [ISLAND_URL]: ISLAND, [HAMPTON_URL]: HAMPTON });
  await bg.ctx.checkNewJobs();
  bg.pages[INTL_URL] = withPosts(6);
  const result = await bg.ctx.checkNewJobs();
  assert.equal(result.newCount, 6);
  assert.deepEqual(bg.notifications.map(n => `${n.title} | ${n.message}`), [
    '6 vagas novas — CoolWorks J1/H2B | Vaga 1, Vaga 2, Vaga 3 e mais 3'
  ]);
  bg.clickListeners[0](bg.notifications[0].id);
  assert.deepEqual(bg.opened, [INTL_URL]);
});

test('CoolWorks: 5 vagas novas de uma vez continuam um aviso por vaga', async () => {
  const bg = loadBackground({ [INTL_URL]: INTL, [ISLAND_URL]: ISLAND, [HAMPTON_URL]: HAMPTON });
  await bg.ctx.checkNewJobs();
  bg.pages[INTL_URL] = withPosts(5);
  await bg.ctx.checkNewJobs();
  assert.deepEqual(titles(bg.notifications), [1, 2, 3, 4, 5].map(n => `Nova vaga J1/H2B: Vaga ${n}`));
});

test('SeasonalJobs: 6 vagas novas de uma vez viram um aviso-resumo que abre o site', async () => {
  const API = 'https://api.seasonaljobs.dol.gov/datahub/search?api-version=2020-06-30';
  const job = (n, title) => ({ case_number: `H-400-00000-00000${n}`, job_title: title, employer_business_name: 'Acme Resort', worksite_city: 'Aspen', worksite_state: 'CO' });
  const bg = loadBackground({ [API]: { json: { value: [job(1, 'Cook 1'), job(2, 'Cook 2')] } } },
    { monitorSites: { seasonaljobs: true, coolworks: false }, keywordProfiles: { 'Cook': 'x' } });
  await bg.ctx.checkNewJobs();
  bg.pages[API] = { json: { value: [3, 4, 5, 6, 7, 8].map(n => job(n, `Cook ${n}`)).concat([job(1, 'Cook 1'), job(2, 'Cook 2')]) } };
  const result = await bg.ctx.checkNewJobs();
  assert.equal(result.newCount, 6);
  assert.deepEqual(bg.notifications.map(n => `${n.title} | ${n.message}`), [
    '6 vagas novas — SeasonalJobs | Cook 3, Cook 4, Cook 5 e mais 3'
  ]);
  bg.clickListeners[0](bg.notifications[0].id);
  assert.deepEqual(bg.opened, ['https://seasonaljobs.dol.gov/']);
});
