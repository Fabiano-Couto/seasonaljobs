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

function loadBackground(pages) {
  const store = { monitorSites: { seasonaljobs: false, coolworks: true } };
  const notifications = [];
  const opened = [];
  const clickListeners = [];
  const sandbox = {
    console: { log() {}, error() {} }, // os erros esperados do teste não poluem a saída
    fetch: async (url) => {
      const page = pages[url];
      if (typeof page === 'string') return { ok: true, status: 200, text: async () => page };
      return { ok: false, status: page || 404, text: async () => '', json: async () => ({}) };
    },
    chrome: {
      runtime: { getURL: (p) => `chrome-extension://teste/${p}`, onInstalled: { addListener() {} }, onStartup: { addListener() {} }, onMessage: { addListener() {} } },
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
  return { ctx: sandbox, store, notifications, opened, clickListeners, pages };
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

test('emoji no título (&#127957; e &#x1F3D5;) chega inteiro na notificação', async () => {
  const bg = loadBackground({ [INTL_URL]: INTL, [ISLAND_URL]: ISLAND, [HAMPTON_URL]: HAMPTON });
  await bg.ctx.checkNewJobs();
  bg.pages[INTL_URL] = withNewPost(newPost('Camp Host &#127957; &#x1F3D5;'));
  await bg.ctx.checkNewJobs();
  assert.deepEqual(titles(bg.notifications), ['Nova vaga J1/H2B: Camp Host \u{1F3D5} \u{1F3D5}']);
});
