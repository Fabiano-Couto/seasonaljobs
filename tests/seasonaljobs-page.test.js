// Achado do revisor (10/11/2026): na página do SeasonalJobs a extensão lia document.body.innerText duas vezes a
// cada verificação de 1 s (uma para o e-mail, outra para a empresa) — cada leitura força o layout da página
// inteira. Regra: uma leitura por verificação, com e-mail, cargo e empresa saindo do mesmo texto.
//
// O texto segue o formato da página de vaga do DOL usado pelas regras desde a sessão 1 ("Email address to
// Apply:", "Company Name:" com o nome na linha de baixo). Este teste foi escrito depois da mudança; o vermelho
// foi provado pela sabotagem (voltar a segunda leitura derruba o teste).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const CONTENT_JS = path.join(__dirname, '..', 'content', 'content.js');
const DOL_PAGE_TEXT = 'Line Cook\nJob Details\nCompany Name:\nAcme Resort LLC\nWorksite: Aspen, CO\nEmail address to Apply: jobs@acme.com\n';

test('SeasonalJobs: a página é lida uma vez por verificação e dá e-mail, cargo e empresa', () => {
  let innerTextReads = 0;
  const body = {
    get innerText() { innerTextReads++; return DOL_PAGE_TEXT; },
    textContent: DOL_PAGE_TEXT
  };
  const sandbox = {
    console,
    setInterval: () => 0,
    location: { hostname: 'seasonaljobs.dol.gov', pathname: '/jobs/H-400-26260-242502' },
    document: {
      body,
      querySelector: () => null,
      querySelectorAll: (s) => (s === 'h1, h2, h3, .text-2xl, .text-3xl, .font-bold' ? [{ textContent: 'Line Cook' }] : [])
    },
    chrome: { storage: { local: { get() {} }, onChanged: { addListener() {} } } }
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(CONTENT_JS, 'utf8'), sandbox, { filename: CONTENT_JS });

  const job = sandbox.extractSeasonalJobs();
  assert.equal(job.email, 'jobs@acme.com');
  assert.equal(job.jobTitle, 'Line Cook');
  assert.equal(job.companyName, 'Acme Resort LLC');
  assert.equal(innerTextReads, 1);
});
