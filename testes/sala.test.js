// Testes do script da sala (banners/src/psi-sala.js) e do runtime de animação, sobre os banners de
// exemplo (banners/dados.exemplo.json). 'npm test' gera exemplo/saida/ antes de testar.
// Todos os dados são fictícios: domínio, ids de curso/usuário e datas.
//
// Cenário: aluno matriculado em 06/10/2026 16:18.
//   Melanie Klein  D60 (plugin 8 semanas)   -> exata 05/12/2026 16:18
//   Winnicott      D80 (plugin 11 semanas)  -> servidor libera 22/12, exata 25/12/2026 16:18
//   Bion           D100 (plugin 14 semanas) -> servidor 12/01/2027, exata 14/01/2027 16:18
//   Pesquisa de Satisfação = seção 30
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
// Sem o aviso do jsdom de navegação não implementada (o desvio muda location.href).
const vc = () => new VirtualConsole().sendTo(console, { omitJSDOMErrors: true });

const SAIDA = path.join(__dirname, '..', 'exemplo', 'saida');
const W = 'https://ava.exemplo.edu';
const CURSO = 101;
const URL0 = `${W}/course/view.php?id=${CURSO}`;
const MATRICULA = '2026-10-6-16-18';

// ---------------------------------------------------------------- utilitários
let falhas = 0, total = 0;
function ok(cond, msg) {
  total++;
  if (cond) console.log('  ok   ' + msg);
  else { falhas++; console.log('  FALHA ' + msg); }
}
const fragmento = f => fs.readFileSync(path.join(SAIDA, f), 'utf8').replace(/^<!--.*-->\r?\n/, '');
const runtime = f => {
  const b = /atob\("([^"]+)"/.exec(fs.readFileSync(path.join(SAIDA, f), 'utf8'))[1];
  return decodeURIComponent(escape(Buffer.from(b, 'base64').toString('binary')));
};
const sala = (() => { const r = runtime('04_klein.html'); return r.slice(r.lastIndexOf("(function () {\n'use strict';")); })();
const espera = ms => new Promise(r => setTimeout(r, ms));

// Ambiente mínimo do Moodle + stubs de APIs que o jsdom não tem.
function ambiente(w, { cache = true, inicial = '<html></html>' } = {}) {
  w.M = { cfg: { wwwroot: W, sesskey: 'S', userId: 7 } };
  w.__logs = [];
  w.console.info = (...a) => w.__logs.push(a.join(' '));
  w.console.error = (...a) => w.__logs.push('ERR ' + a.join(' '));
  w.HTMLCanvasElement.prototype.getContext = () => null;
  w.requestAnimationFrame = () => 0;
  if (cache) w.localStorage.setItem(`psi-matricula-${CURSO}-7`, JSON.stringify({ iso: MATRICULA }));
  w.__buscas = [];
  w.fetch = u => { w.__buscas.push(u); return Promise.resolve({ text: () => Promise.resolve(/section=/.test(u) ? '<html></html>' : inicial) }); };
}
function pagina(corpo, { url = URL0, agora, ...opc }) {
  const dom = new JSDOM(`<!doctype html><body class="format-tiles course-${CURSO}">${corpo}</body>`,
    { url: `${url}${url.includes('?') ? '&' : '?'}psiDebug=1&psiAgora=${agora}`, runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc() });
  ambiente(dom.window, opc);
  dom.window.eval(sala);
  return dom.window;
}
function clicar(w, sel) {
  const ev = new w.MouseEvent('click', { bubbles: true, cancelable: true });
  w.document.querySelector(sel).dispatchEvent(ev);
  return ev.defaultPrevented;
}

// Marcação real dos tiles do format_tiles (Moodle 3.11).
const tile = (n, t, restrito) => `<li class="tile ${restrito ? 'tile-restricted' : 'tile-clickable'}" id="tile-${n}" data-section="${n}">
 <a class="tile-link" ${restrito ? '' : `href="${URL0}&amp;section=${n}"`} data-section="${n}">
  <div class="tile-content"><div class="tiletopright pull-right"></div>
   <div class="tile-text"><span class="tile-textinner"><h3>${t}</h3></span>
   ${restrito ? `<div class="availabilityinfo isrestricted isfullinfo"><span class="badge badge-info" data-html="true" data-toggle="tooltip" title="&lt;div class=&quot;availabilityinfo isrestricted&quot;&gt;
    &lt;span class=&quot;badge badge-info&quot;&gt;Restrito&lt;/span&gt; Disponível se: De ${restrito}
&lt;/div&gt;">Restrito</span></div>` : ''}
   </div></div></a></li>`;
const TILES = '<ul class="tiles">'
  + tile(6, 'Melanie Klein')
  + tile(7, 'Winnicott e o Ambiente')
  + tile(8, 'Bion e o Pensar', '12 janeiro 2027, 16:18')
  + tile(30, 'Pesquisa de Satisfação') + '</ul>';
const secao = (n, titulo, setas = '') => `<li class="section main" id="section-${n}" data-section="${n}"><div class="content">
  <div class="summary"><div class="psi-banner"><h2>${titulo}</h2></div></div>
  <div class="section-navigation">${setas}</div>
  <ul class="section"><li class="activity">Atividade</li></ul></div></li>`;
const seta = (n, txt, cls) => `<a class="${cls}" href="${URL0}&amp;section=${n}">${txt}</a>`;
const itemMenu = (n, nome) => `<li><a class="nav-link" href="${URL0}&amp;section=${n}" data-type="30"><span>${nome}</span></a></li>`;
const MENU = `<ul class="sidebar-menu"><li><a class="nav-link" href="${URL0}" data-type="60"><span>Sala</span></a></li>`
  + itemMenu(6, 'Melanie Klein')
  + itemMenu(7, 'Winnicott e o Ambiente')
  + itemMenu(30, 'Pesquisa de Satisfação') + '</ul>';

// ---------------------------------------------------------------- cenários
async function geracao() {
  console.log('\nGeração');
  ok(runtime('04_klein.html').includes('var VERSAO = 13'), 'banners trazem o script da sala v13');
  ok(runtime('04_klein.html').includes('var VERSAO = 7'), 'banners trazem o runtime de animação v7');
  ok(fs.existsSync(path.join(SAIDA, 'E_pesquisa.html')), 'banner da Pesquisa de Satisfação gerado');
  const pesquisa = fs.readFileSync(path.join(SAIDA, 'E_pesquisa.html'), 'utf8');
  ok(pesquisa.includes('O que você avalia') && pesquisa.includes('Experiência no AVA') && !/<svg|<img/i.test(pesquisa),
    'banner da Pesquisa traz os itens avaliados, sem <svg> nem <img>');
  const dv = ['material', 'questionario'].map(c => fragmento(`divisores/05_winnicott_${c}.html`));
  ok(dv[0].includes('Material de Estudo') && dv[1].includes('Questionário')
    && !dv.some(h => /<script|<svg|<img|<h2|psi-banner/i.test(h)), 'divisores da disciplina gerados, sem script, <h2> nem psi-banner');
  const nomes = fs.readFileSync(path.join(SAIDA, 'nomes_questionarios.md'), 'utf8');
  ok(/\| 05 \| Questionário 05 · Winnicott e o Ambiente \| CUR-D05-QST \|/.test(nomes)
    && nomes.split('\n').filter(l => /-QST \|$/.test(l)).length === 8, 'nomes dos questionários: uma linha por disciplina, no padrão');
}

// Os divisores ficam em Rótulos (atividades da seção): não podem mudar a trava da seção.
async function divisores() {
  console.log('\nDivisores na seção');
  const rotulos = ['material', 'questionario'].map(c => `<li class="activity label">${fragmento(`divisores/05_winnicott_${c}.html`)}</li>`).join('');
  const corpo = '<ul class="topics">' + secao(7, 'Winnicott e o Ambiente').replace('<li class="activity">', rotulos + '<li class="activity">') + '</ul>';
  const url = `${URL0}&section=7`;
  let w = pagina(corpo, { url, agora: '2026-12-23' });
  await espera(100);
  ok(w.document.getElementById('section-7').classList.contains('psi-travada') && w.document.querySelectorAll('.psi-aviso-trava').length === 1,
    'seção com divisores trava na folga, com um só aviso');
  w = pagina(corpo, { url, agora: '2026-12-26' });
  await espera(100);
  ok(!w.document.getElementById('section-7').classList.contains('psi-travada') && w.document.querySelectorAll('.psi-divisor').length === 2,
    'no dia exato a seção abre e os divisores aparecem');
}

async function tiles() {
  console.log('\nTiles na página inicial');
  const w = pagina(TILES, { agora: '2026-12-23' });
  await espera(100);
  const t7 = w.document.getElementById('tile-7'), t8 = w.document.getElementById('tile-8');
  ok(/tile-restricted/.test(t7.className) && !t7.querySelector('a.tile-link').getAttribute('href'), 'tile na folga travado como restrito, sem link');
  ok(t7.querySelector('.availabilityinfo .badge-info').textContent === 'Libera 25/12/2026', 'pílula com a data exata (25/12)');
  ok(clicar(w, '#tile-7 h3'), 'clique no tile travado bloqueado');
  ok(t8.querySelector('.badge').textContent === 'Libera 14/01/2027', 'tile restrito no servidor mostra a data exata (D100, não a do plugin)');
  ok(/tile-clickable/.test(w.document.getElementById('tile-6').className), 'disciplina já liberada continua clicável');
  const w2 = pagina(TILES, { agora: '2026-12-26' });
  await espera(100);
  ok(!/tile-restricted/.test(w2.document.getElementById('tile-7').className), 'no dia exato o tile é liberado');
}

async function secaoPorLink() {
  console.log('\nSeção aberta por link');
  const corpo = '<ul class="topics">' + secao(7, 'Winnicott e o Ambiente') + '</ul>';
  const url = `${URL0}&section=7`;
  let w = pagina(corpo, { url, agora: '2026-12-23' });
  await espera(100);
  let s = w.document.getElementById('section-7');
  ok(s.classList.contains('psi-travada'), 'com cache: seção travada na folga');
  ok(/Disponível se: De 25 dezembro 2026, 16:18/.test(s.querySelector('.psi-aviso-trava').textContent), 'aviso com a data exata');
  w = pagina(corpo, { url, agora: '2026-12-23', cache: false, inicial: '<html><body>' + TILES + '</body></html>' });
  ok(w.document.getElementById('section-7').classList.contains('psi-verificando'), 'sem cache: conteúdo oculto enquanto verifica');
  await espera(150);
  ok(w.document.getElementById('section-7').classList.contains('psi-travada'), 'sem cache: matrícula lida da página inicial e seção travada');
  w = pagina(corpo, { url, agora: '2026-12-26' });
  await espera(100);
  s = w.document.getElementById('section-7');
  ok(!s.classList.contains('psi-travada') && !s.querySelector('.psi-aviso-trava'), 'no dia exato o conteúdo aparece');
}

async function navegacao() {
  console.log('\nNavegação e menu lateral');
  const chegou = w => {
    const r = [];
    w.document.addEventListener('click', ev => { const a = ev.target.closest('a'); if (a) { r.push(a.getAttribute('data-section') || a.className); ev.preventDefault(); } });
    return r;
  };
  let w = pagina(TILES + '<ul class="sections">' + secao(6, 'Melanie Klein', seta(7, 'Winnicott e o Ambiente ►', 'next')) + '</ul>', { agora: '2026-12-23' });
  let r = chegou(w);
  await espera(100);
  clicar(w, 'a.next');
  ok(r.join() === '30', 'seta para disciplina na folga leva à Pesquisa');
  ok(/25 dezembro 2026/.test(w.document.querySelector('a.next').getAttribute('title') || ''), 'seta mostra a data exata ao passar o mouse');

  w = pagina(MENU + '<ul class="topics">' + secao(30, 'Pesquisa de Satisfação', seta(7, '◄ Winnicott e o Ambiente', 'prev')) + '</ul>',
    { url: `${URL0}&section=30`, agora: '2026-12-23' });
  await espera(100);
  const li7 = w.document.querySelector('.sidebar-menu a[href*="section=7"]').closest('li');
  ok(li7.classList.contains('psi-oculto'), 'menu lateral esconde a disciplina na folga');
  ok(!w.document.querySelector('.sidebar-menu a[href*="section=6"]').closest('li').classList.contains('psi-oculto'), 'menu lateral mantém as liberadas');
  ok(clicar(w, 'a.prev'), 'na Pesquisa, a volta para a disciplina travada é desviada');
  ok(w.__logs.some(l => /indo para a seção 6/.test(l)), 'desvio vai para a última disciplina liberada (mapa lido do menu)');

  w = pagina(MENU + TILES + '<ul class="sections">' + secao(6, 'Melanie Klein', seta(7, 'Winnicott e o Ambiente ►', 'next')) + '</ul>', { agora: '2026-12-26' });
  r = chegou(w);
  await espera(100);
  clicar(w, 'a.next');
  ok(r.join() === 'next', 'no dia exato a seta navega normalmente');
  ok(!w.document.querySelector('.sidebar-menu a[href*="section=7"]').closest('li').classList.contains('psi-oculto'), 'no dia exato a disciplina volta ao menu');
}

async function animacao() {
  console.log('\nAnimação (glifo tripe com tempo negativo no 1º quadro)');
  const dom = new JSDOM('<!doctype html><body>' + fragmento('08_tecnica.html') + '</body>', {
    runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc(),
    beforeParse(w) {
      w.M = { cfg: { wwwroot: W } };
      w.console.info = () => {};
      w.__erros = [];
      w.console.error = (...a) => w.__erros.push(a.join(' '));
      w.HTMLCanvasElement.prototype.getContext = () => null;
      w.SVGElement.prototype.getTotalLength = () => 100;
      w.__quadros = [];
      w.requestAnimationFrame = fn => { w.__quadros.push(fn); return w.__quadros.length; };
    }
  });
  const w = dom.window;
  await espera(50);
  // 1º quadro com carimbo ANTERIOR ao início do banner (o que congelava a v5).
  const fn = w.__quadros.shift();
  ok(typeof fn === 'function', 'loop de quadros agendado');
  const inicio = w.document.querySelector('.psi-banner').__psi.inicio;
  let lancou = null;
  try { if (fn) fn(inicio - 200); } catch (e) { lancou = e; }
  ok(!lancou && !w.__erros.length && !w.PsiBanners.erros.length, 'quadro com tempo negativo não gera erro' + (lancou ? ' (' + lancou.message + ')' : ''));
  ok(w.__quadros.length > 0, 'loop continua agendado depois do 1º quadro');
}

(async () => {
  await geracao();
  await tiles();
  await secaoPorLink();
  await divisores();
  await navegacao();
  await animacao();
  console.log(`\n${total - falhas}/${total} verificações ok`);
  process.exit(falhas ? 1 : 0);
})();
