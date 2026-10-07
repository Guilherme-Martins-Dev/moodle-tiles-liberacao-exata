// Gera os banners (fragmentos HTML com estilos inline + runtime de animação + script da sala) para
// a descrição das seções do Moodle (formato Tiles), à prova dos filtros de texto e do editor.
//
// Uso:
//   node banners/gerar.js                          -> dados de banners/dados.json (ou dados.exemplo.json)
//   node banners/gerar.js --dados=arquivo.json     -> outro arquivo de dados
//   node banners/gerar.js --saida=pasta --preview=arquivo.html
//   node banners/gerar.js --logo-url=https://...   -> logo por URL (arquivo enviado uma vez ao Moodle)
//   node banners/gerar.js --img-url=https://...    -> retratos por URL: <base>/<slug>-arco.jpg e <slug>-med.jpg
//   node banners/gerar.js --tratadas=pasta         -> pasta dos retratos tratados (vazia = só monogramas)
//   node banners/gerar.js --sem-js                 -> só a versão estática, sem animações
//
// Retratos: coloque as fotos em img/psicanalistas/ (e temas em img/temas/), rode
// banners/tratar-imagens.ps1 e depois este gerador. Sem foto, entra um monograma.
//
// Saída padrão: banners/saida/*.html (um fragmento por seção), banners/saida/_runtime_moodle.html
// (plano B: HTML adicional do site) e banners/preview.html (revisão).

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const arg = nome => { const a = process.argv.find(x => x.startsWith(`--${nome}=`)); return a ? a.slice(nome.length + 3) : null; };
const ARQ_DADOS = arg('dados') ? path.resolve(arg('dados'))
  : fs.existsSync(path.join(__dirname, 'dados.json')) ? path.join(__dirname, 'dados.json')
  : path.join(__dirname, 'dados.exemplo.json');
const dados = JSON.parse(fs.readFileSync(ARQ_DADOS, 'utf8'));

const SEM_JS = process.argv.includes('--sem-js');
const LOGO_URL = arg('logo-url');
const IMG_URL = arg('img-url');
const TRATADAS = arg('tratadas') ? path.resolve(arg('tratadas')) : path.join(RAIZ, 'img', '_tratadas');

const dataUri = (arquivo, mime) => `data:${mime};base64,${fs.readFileSync(arquivo).toString('base64')}`;
// Marca: { nome, logo } em dados.json. Sem arquivo de logo, o selo mostra o nome em texto.
const MARCA = dados.marca || { nome: 'Instituição' };
const ARQ_LOGO = MARCA.logo && path.join(RAIZ, MARCA.logo);
const LOGO_SRC = LOGO_URL || (ARQ_LOGO && fs.existsSync(ARQ_LOGO) ? dataUri(ARQ_LOGO, 'image/png') : null);

// Imagem tratada (arco ou medalhão) de um slug, ou null se ainda não existir.
function imagem(slug, tipo) {
  const arquivo = path.join(TRATADAS, `${slug}-${tipo}.jpg`);
  if (!fs.existsSync(arquivo)) return null;
  return IMG_URL ? `${IMG_URL.replace(/\/$/, '')}/${slug}-${tipo}.jpg` : dataUri(arquivo, 'image/jpeg');
}

// ---------- Tokens (paleta_cor/ref_color.md + paleta_cor/Roxo.md) ----------
const T = {
  navy: '#0B387A', ceruleo: '#0082C8', verde: '#008744', dourado: '#F8B800',
  serif: "Georgia,'Times New Roman',Times,serif",
  sans: "'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif",
};

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const pad2 = n => String(n).padStart(2, '0');
const rgb = hex => { const n = parseInt(hex.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
const rgba = (hex, a) => `rgba(${rgb(hex).join(',')},${a})`;
const mix = (a, b, t) => '#' + rgb(a).map((v, i) => Math.round(v + (rgb(b)[i] - v) * t).toString(16).padStart(2, '0')).join('');
const profundo = cor => mix(cor, '#06070B', 0.5);
// Monograma: duas letras do sobrenome (Fr, Fe, Kl…), ou a "sigla" definida em dados.json.
const sigla = slug => { const p = dados.pessoas[slug]; return p.sigla || p.nome.split(/\s+/).pop().slice(0, 2); };

// Elemento só de imagem: nunca vazio (o TinyMCE remove spans vazios) e sem <img src="data:">
// (o TinyMCE tenta fazer upload e pode quebrar). O &nbsp; com font-size:0 não ocupa espaço.
const NBSP = '&nbsp;';
const semTexto = 'font-size:0;line-height:0;';

// ---------- Runtime: CFG injetado, comentários removidos e empacotado em base64 ----------
// Constelação do banner principal: posições fixas (fração do painel) de cada núcleo da estante.
const POS_NOS = [[0.20, 0.22], [0.52, 0.19], [0.84, 0.25], [0.34, 0.36], [0.68, 0.37], [0.16, 0.50], [0.48, 0.50], [0.86, 0.48]];
const CFG = { nos: dados.estante.map(([k], i) => ({ cor: mix(dados.nucleos[k].cor, '#FFFFFF', 0.55), px: POS_NOS[i][0], py: POS_NOS[i][1] })) };

// Sala: disciplinas e seções de prática com prazo (nome no tile e dias após a matrícula), mais o
// título da seção Pesquisa de Satisfação (para onde a navegação vai quando o destino está travado).
// Maior número de dias aceito no campo do plugin "Data relativa".
const MAX_DIAS = 59;
const SALA_CFG = {
  pesquisa: (dados.especiais.find(e => e.tipo === 'pesquisa') || {}).titulo || '',
  // r: restrição configurada no plugin "Data relativa" ({ n, u }). Padrão: D dias quando cabe no
  // campo do plugin (MAX_DIAS), senão floor(D/7) semanas — o servidor nunca libera depois do dia
  // certo e o script segura a folga (até 6 dias) até o dia exato.
  disciplinas: [...dados.disciplinas, ...dados.especiais.filter(e => e.dias != null)]
    .map(x => ({ t: x.titulo, d: x.dias, r: restricaoPlugin(x) })),
};
function restricaoPlugin(x) {
  if (x.restricao) return { n: x.restricao.n, u: x.restricao.unidade };
  if (!x.dias) return null;
  return x.dias <= MAX_DIAS ? { n: x.dias, u: 'dias' } : { n: Math.floor(x.dias / 7), u: 'semanas' };
}

const fonte = (arquivo, marca, cfg) => fs.readFileSync(arquivo, 'utf8')
  .replace(marca, JSON.stringify(cfg))
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('//')).join('\n');

// Runtime = animação dos banners + script da sala (src/psi-sala.js; ver doc/SALA_SCRIPT.md).
const RUNTIME = fonte(path.join(__dirname, 'src', 'psi-banners.js'), '__PSI_CFG__', CFG)
  + '\n' + fonte(path.join(__dirname, 'src', 'psi-sala.js'), '__PSI_SALA__', SALA_CFG);

// base64 não contém ":", ".", "(" nem ")": nenhum filtro do Moodle (URLs, emoticons, glossário)
// consegue alterar o script. escape/decodeURIComponent restauram os acentos (UTF-8).
const SCRIPT = `<script>new Function(decodeURIComponent(escape(atob("${Buffer.from(RUNTIME, 'utf8').toString('base64')}"))))();</script>`;

// ---------- Textura estática de contornos (mesma fórmula do canvas, em t = 0) ----------
function contornos(seed) {
  const f = [seed * 1.3 + 0.5, seed * 2.1 + 1.2, seed * 0.7 + 2.4];
  const W = 1100, H = 320, cx = W * 0.8, cy = H * 0.5;
  let paths = '';
  for (let k = 0; k < 12; k++) {
    const base = 34 + k * 30;
    const pts = [];
    for (let i = 0; i <= 60; i++) {
      const th = i / 60 * Math.PI * 2;
      const r = base * (1 + 0.07 * Math.sin(2 * th + f[0] + k * 0.35) + 0.05 * Math.sin(3 * th + f[1] - k * 0.22) + 0.03 * Math.sin(5 * th + f[2] + k * 0.1));
      pts.push(`${(cx + r * Math.cos(th)).toFixed(0)} ${(cy + r * Math.sin(th) * 0.72).toFixed(0)}`);
    }
    paths += `<path d='M${pts.join('L')}Z' stroke-opacity='${k % 4 === 0 ? 0.11 : 0.055}'/>`;
  }
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${W} ${H}' preserveAspectRatio='xMaxYMid slice' fill='none' stroke='white'>${paths}</svg>`;
  return 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
}

// ---------- Glifos estáticos (fallback sem JS; o runtime os troca pela versão animada) ----------
function espiral() {
  const pts = [];
  for (let t = 0; t <= Math.PI * 5.2; t += 0.12) {
    const r = 1.5 + 1.62 * t;
    pts.push(`${(32 + r * Math.cos(t)).toFixed(1)},${(32 + r * Math.sin(t)).toFixed(1)}`);
  }
  return `<polyline points="${pts.join(' ')}"/>`;
}

const GLIFOS = {
  espiral: espiral(),
  objetos: '<circle cx="25" cy="32" r="12"/><circle cx="39" cy="32" r="12" fill="#fff" fill-opacity=".28"/>',
  holding: '<circle cx="32" cy="25" r="8"/><path d="M12 32 Q32 60 52 32"/><path d="M18 30 Q32 48 46 30" stroke-opacity=".5"/>',
  elastico: '<path d="M6 32 C14 14 22 50 32 32 S50 14 58 32"/><circle cx="32" cy="32" r="3" fill="#fff"/>',
  continente: '<path d="M14 26 L14 38 Q14 52 32 52 Q50 52 50 38 L50 26"/><circle cx="32" cy="42" r="2.2" fill="#fff"/><path d="M29 12 L34 11 L35 16 L31 17 Z" fill="#fff" fill-opacity=".5" stroke-width="1"/>',
  borromeano: '<circle cx="24" cy="27" r="13"/><circle cx="40" cy="27" r="13"/><circle cx="32" cy="40" r="13"/>',
  tripe: '<path d="M32 13 L13 49 L51 49 Z" stroke-opacity=".55"/><circle cx="32" cy="13" r="4.5" fill="#fff"/><circle cx="13" cy="49" r="4.5" fill="#fff"/><circle cx="51" cy="49" r="4.5" fill="#fff"/>',
  livro: '<path d="M32 18 Q21 11 8 14 L8 49 Q21 46 32 53 Q43 46 56 49 L56 14 Q43 11 32 18 Z"/><path d="M32 18 L32 53"/><path d="M14 23 Q20 21 27 24 M14 30 Q20 28 27 31 M14 37 Q20 35 27 38 M37 24 Q44 21 50 23 M37 31 Q44 28 50 30 M37 38 Q44 35 50 37" stroke-opacity=".65"/>',
  ramos: '<path d="M32 56 L32 28 M32 28 Q30 16 26 9 M32 28 Q34 16 40 9 M32 32 Q22 26 14 16 M32 32 Q42 26 52 16 M32 42 Q20 42 10 32 M32 42 Q44 42 54 32"/><g fill="#fff" stroke="none"><circle cx="32" cy="56" r="3"/><circle cx="26" cy="9" r="2.4"/><circle cx="40" cy="9" r="2.4"/><circle cx="14" cy="16" r="2.4"/><circle cx="52" cy="16" r="2.4"/><circle cx="10" cy="32" r="2.4"/><circle cx="54" cy="32" r="2.4"/></g>',
  vinculo: '<circle cx="14" cy="32" r="8"/><circle cx="50" cy="32" r="8" fill="#fff" fill-opacity=".25"/><path d="M22 30 Q32 18 42 30"/><path d="M42 34 Q32 46 22 34" stroke-opacity=".6"/><circle cx="32" cy="24" r="2.2" fill="#fff" stroke="none"/>',
  bussola: '<circle cx="32" cy="32" r="22"/><path d="M32 13.5 L32 10 M50.5 32 L54 32 M32 50.5 L32 54 M13.5 32 L10 32" stroke-opacity=".6"/><path d="M32 14 L38 32 L32 50 L26 32 Z"/><path d="M32 14 L38 32 L26 32 Z" fill="#fff"/>',
  conexao: `<circle cx="32" cy="32" r="5.5" fill="${T.dourado}" stroke="${T.dourado}"/><circle cx="32" cy="32" r="14" stroke-opacity=".8"/><circle cx="32" cy="32" r="23" stroke-opacity=".4"/>`,
};

function glifoUri(nome) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${GLIFOS[nome]}</svg>`;
  return 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
}
const glifoBox = (classe, nome, tam) => `<div class="${classe}" aria-hidden="true" style="width:${tam}px;height:${tam}px;background:url('${glifoUri(nome)}') center/contain no-repeat;${semTexto}">${NBSP}</div>`;

// ---------- Peças compartilhadas ----------
function capsulaLogo(h) {
  const w = Math.round(h * 600 / 104);
  const caixa = `<span class="psi-logo" style="position:relative;overflow:hidden;display:inline-block;background:#FFFFFF;border-radius:999px;padding:${Math.round(h * 0.38)}px ${Math.round(h * 0.8)}px;box-shadow:0 8px 22px -8px rgba(0,0,0,.45);`;
  if (!LOGO_SRC) {
    return caixa + `"><span style="display:block;height:${h}px;line-height:${h}px;font-size:${Math.round(h * 0.62)}px;font-weight:700;letter-spacing:.04em;color:${T.navy};white-space:nowrap;">${esc(MARCA.nome)}</span></span>`;
  }
  return caixa + `${semTexto}">`
    + `<span role="img" aria-label="${esc(MARCA.nome)}" style="display:block;width:${w}px;height:${h}px;background:url('${LOGO_SRC}') center/contain no-repeat;${semTexto}">${NBSP}</span></span>`;
}

const barraMarca = `<div aria-hidden="true" style="position:relative;z-index:2;height:4px;overflow:hidden;${semTexto}background:linear-gradient(90deg,rgba(255,255,255,.10) 0%,rgba(255,255,255,.10) 82%,${T.verde} 82%,${T.verde} 88%,${T.dourado} 88%,${T.dourado} 94%,${T.ceruleo} 94%,${T.ceruleo} 100%);">${NBSP}</div>`;

const chip = txt => `<span class="psi-chip" style="display:inline-block;padding:5px 12px;border:1px solid rgba(255,255,255,.22);border-radius:999px;background:rgba(255,255,255,.07);color:rgba(255,255,255,.92);font-size:12.5px;line-height:1.4;white-space:nowrap;">${esc(txt)}</span>`;

const chipAmeixa = txt => `<span class="psi-chip" style="display:inline-block;padding:5px 12px;border:1px solid rgba(196,172,220,.45);border-radius:999px;background:${dados.nucleos.ameixa.cor};color:#FFFFFF;font-size:12.5px;line-height:1.4;white-space:nowrap;">${esc(txt)}</span>`;

const meta = txt => `<span style="font-size:11.5px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:rgba(255,255,255,.78);"><span style="letter-spacing:0;opacity:.55;margin-right:10px;">——</span>${esc(txt)}</span>`;

const seloAoVivo = txt => `<span style="display:inline-block;padding:4px 11px;border-radius:999px;background:${T.dourado};color:#1E242B;font-size:11.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;line-height:1.4;">● ${esc(txt)}</span>`;

function epigrafe(e, destaque) {
  if (!e) return '';
  const texto = e.fonte ? `“${esc(e.texto)}”` : esc(e.texto);
  const fonte = e.fonte ? ` <span style="font-family:${T.sans};font-style:normal;font-size:11.5px;letter-spacing:.12em;text-transform:uppercase;color:rgba(255,255,255,.55);white-space:nowrap;">— ${esc(e.fonte)}</span>` : '';
  return `<p class="psi-in" style="margin:0 0 12px;padding:0 0 0 14px;border-left:2px solid ${destaque || 'rgba(255,255,255,.35)'};font-family:${T.serif};font-style:italic;font-size:17px;line-height:1.5;color:rgba(255,255,255,.88);max-width:60ch;">${texto}${fonte}</p>`;
}

// ---------- Retratos ----------
const rotuloPessoa = slug => { const p = dados.pessoas[slug]; return `${p.nome} · ${p.datas}`; };

// Duotone: tinta do núcleo (blend "color") sobre a foto em cinza.
const fundoFoto = (url, cor) => `background-color:${profundo(cor)};background-image:linear-gradient(${rgba(mix(cor, '#FFFFFF', 0.2), 0.92)},${rgba(mix(cor, '#FFFFFF', 0.2), 0.92)}),url('${url}');background-blend-mode:color,normal;background-size:cover;background-position:center 20%;`;

function medalhao(slug, cor, tam, extra = '') {
  const p = dados.pessoas[slug], url = imagem(slug, 'med');
  const base = `width:${tam}px;height:${tam}px;box-sizing:border-box;border-radius:50%;${extra}`;
  return url
    ? `<span class="psi-med" title="${esc(rotuloPessoa(slug))}" role="img" aria-label="${esc(p.nome)}" style="display:inline-block;${base}${fundoFoto(url, cor)}${semTexto}">${NBSP}</span>`
    : `<span class="psi-med" title="${esc(rotuloPessoa(slug))}" role="img" aria-label="${esc(p.nome)}" style="display:inline-block;${base}background:linear-gradient(160deg,${mix(cor, '#FFFFFF', 0.22)},${profundo(cor)});color:#FFFFFF;font-family:${T.serif};font-size:${Math.round(tam * 0.36)}px;line-height:${tam - 4}px;text-align:center;">${sigla(slug)}</span>`;
}

const COBRIR = 'position:absolute;left:0;top:0;right:0;bottom:0;';
const nomeCurto = slug => { const p = dados.pessoas[slug]; return p.curto || p.nome.split(/\s+/).pop(); };

// Um autor dentro de um painel com vários: faixa vertical (2 a 4 autores) ou célula do mosaico (5+).
// Todos recebem exatamente o mesmo espaço; o destaque é só o rodízio do runtime.
function celulaRetrato(slug, cor, mosaico, primeiraCol, primeiraLinha, total) {
  const tamSigla = mosaico ? 38 : ({ 2: 72, 3: 58 }[total] || 44); // cabe na faixa, sem colidir com a vizinha
  // No mosaico as células têm ~100px: a versão medalhão (120×120) basta e deixa o rótulo bem mais leve.
  const p = dados.pessoas[slug], url = imagem(slug, mosaico ? 'med' : 'arco'), fundo = profundo(cor);
  const foto = url
    ? `<div class="psi-foto" style="${COBRIR}${fundoFoto(url, cor)}${semTexto}">${NBSP}</div>`
    : `<div class="psi-foto" style="${COBRIR}background:linear-gradient(160deg,${mix(cor, '#FFFFFF', 0.12)} 0%,${fundo} 90%);display:flex;justify-content:center;${mosaico ? 'align-items:center;padding-bottom:12px;' : 'align-items:flex-start;padding-top:24px;'}box-sizing:border-box;overflow:hidden;font-family:${T.serif};font-style:italic;font-size:${tamSigla}px;line-height:1;letter-spacing:-.03em;color:rgba(255,255,255,.16);white-space:nowrap;">${esc(sigla(slug))}</div>`;
  const sombra = `<div aria-hidden="true" style="${COBRIR}pointer-events:none;background:linear-gradient(0deg,${rgba(fundo, 0.85)} 0%,${rgba(fundo, 0)} ${mosaico ? 55 : 42}%);${semTexto}">${NBSP}</div>`;
  const nome = mosaico
    ? `<span class="psi-nome" style="position:absolute;left:0;right:0;bottom:7px;text-align:center;font-size:9px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;line-height:1.2;color:rgba(255,255,255,.9);white-space:nowrap;">${esc(nomeCurto(slug))}</span>`
    : `<span class="psi-nome" style="position:absolute;left:50%;bottom:18px;margin-left:-7px;writing-mode:vertical-rl;transform:rotate(180deg);font-size:10.5px;font-weight:600;letter-spacing:.2em;text-transform:uppercase;line-height:14px;color:rgba(255,255,255,.9);white-space:nowrap;">${esc(nomeCurto(slug))}</span>`;
  const linhas = (primeiraCol ? '' : 'border-left:1px solid rgba(255,255,255,.14);') + (mosaico && !primeiraLinha ? 'border-top:1px solid rgba(255,255,255,.14);' : '');
  return `<div class="psi-faixa${mosaico ? ' psi-celula' : ''}" role="img" aria-label="${esc(p.nome)}" title="${esc(rotuloPessoa(slug))}" style="position:relative;overflow:hidden;flex:1 1 0;min-width:0;box-sizing:border-box;${linhas}">${foto}${sombra}${nome}</div>`;
}

// Painel editorial à direita, que se dissolve no fundo do banner.
//  · 1 autor: a foto ocupa o painel inteiro (sem foto: sigla em serif gigante), com legenda.
//  · 2 a 4 autores: faixas verticais iguais, nomes na vertical como lombadas.
//  · 5+ autores: mosaico de 3 colunas.
//  · tema: foto temática ou o glifo animado.
// O numeral da disciplina fica sobre o painel, como numa capa de revista. Datas só no tooltip.
function painelRetrato(id, cor, glifo, numeral) {
  const r = dados.retratos[id];
  if (!r) return '';
  const fundo = profundo(cor), borda = mix(cor, fundo, 0.55);
  const autores = r.autores || [];
  const multiplo = autores.length > 1;
  let conteudo, atributos, legenda = '';
  if (r.tema) {
    const url = imagem(r.tema, 'arco');
    legenda = dados.temas[r.tema];
    atributos = `role="img" aria-label="${esc(legenda)}"`;
    conteudo = url
      ? `<div class="psi-foto" style="${COBRIR}${fundoFoto(url, cor)}${semTexto}">${NBSP}</div>`
      : `<div class="psi-foto" style="${COBRIR}background:radial-gradient(circle at 60% 42%,${rgba(mix(cor, '#FFFFFF', 0.25), 0.55)} 0%,${rgba(fundo, 0)} 60%);display:flex;align-items:center;justify-content:center;">${glifoBox('psi-tema-glifo', glifo, 120)}</div>`;
  } else if (!multiplo) {
    const slug = autores[0], p = dados.pessoas[slug], url = imagem(slug, 'arco');
    legenda = p.nome;
    atributos = `role="img" aria-label="${esc(p.nome)}" title="${esc(rotuloPessoa(slug))}"`;
    conteudo = url
      ? `<div class="psi-foto" style="${COBRIR}${fundoFoto(url, cor)}${semTexto}">${NBSP}</div>`
      : `<div class="psi-foto" style="${COBRIR}background:linear-gradient(160deg,${mix(cor, '#FFFFFF', 0.12)} 0%,${fundo} 90%);overflow:hidden;padding:18px 0 0 56px;box-sizing:border-box;font-family:${T.serif};font-style:italic;font-size:170px;line-height:1;letter-spacing:-.03em;color:rgba(255,255,255,.1);white-space:nowrap;">${esc(sigla(slug))}</div>`;
  } else if (autores.length <= 4) {
    atributos = `role="group" aria-label="${esc(autores.map(s => dados.pessoas[s].nome).join(', '))}"`;
    conteudo = `<div style="${COBRIR}display:flex;">${autores.map((s, i) => celulaRetrato(s, cor, false, i === 0, true, autores.length)).join('')}</div>`;
  } else {
    atributos = `role="group" aria-label="${esc(autores.map(s => dados.pessoas[s].nome).join(', '))}"`;
    const linhas = [];
    for (let i = 0; i < autores.length; i += 3) linhas.push(autores.slice(i, i + 3));
    conteudo = `<div style="${COBRIR}display:flex;flex-direction:column;">`
      + linhas.map((l, li) => `<div style="flex:1 1 0;min-height:0;display:flex;">${l.map((s, ci) => celulaRetrato(s, cor, true, ci === 0, li === 0)).join('')}</div>`).join('')
      + `</div>`;
  }
  // Fusão com o banner: com vários autores, só uma borda estreita à esquerda (para que nenhuma faixa
  // fique mais apagada que as outras); com um autor, o degradê largo da esquerda e da base.
  // 2 a 4 autores levam as duas: a estreita (visível, para as faixas do HTML estático) e a larga
  // (invisível), que o runtime acende quando transforma as faixas em carrossel.
  const camadaFusao = (classe, fundoCss, opacidade) => `<div class="${classe}" aria-hidden="true" style="${COBRIR}pointer-events:none;${semTexto}background:${fundoCss};${opacidade}">${NBSP}</div>`;
  const larga = `linear-gradient(90deg,${borda} 0%,${rgba(borda, 0.6)} 18%,${rgba(borda, 0)} 55%),linear-gradient(0deg,${rgba(fundo, 0.92)} 0%,${rgba(fundo, 0)} 48%),linear-gradient(180deg,${rgba(fundo, 0.45)} 0%,${rgba(fundo, 0)} 22%)`;
  const estreita = `linear-gradient(90deg,${borda} 0%,${rgba(borda, 0)} 10%)`;
  const fusao = !multiplo ? camadaFusao('psi-fusao', larga, '')
    : autores.length <= 4 ? camadaFusao('psi-fusao-estreita', estreita, 'transition:opacity 1s;') + camadaFusao('psi-fusao-larga', larga, 'opacity:0;transition:opacity 1s;')
    : camadaFusao('psi-fusao', estreita, '');
  const marca = numeral ? `<div class="psi-marca" aria-hidden="true" style="position:absolute;right:-6px;bottom:-44px;font-family:${T.serif};font-size:210px;line-height:1;letter-spacing:-.04em;color:rgba(255,255,255,${multiplo ? 0.08 : 0.12});pointer-events:none;user-select:none;">${numeral}</div>` : '';
  // Legenda única (autor único ou tema), acima da fusão; nos painéis múltiplos cada faixa tem seu nome.
  const rodape = legenda ? `<div style="position:absolute;left:26px;right:18px;bottom:20px;">`
    + `<span style="font-size:10.5px;font-weight:600;letter-spacing:.2em;text-transform:uppercase;color:rgba(255,255,255,.88);"><span style="letter-spacing:0;opacity:.55;margin-right:8px;">——</span>${esc(legenda)}</span></div>` : '';
  return `<div class="psi-painel" ${atributos} style="flex:1 1 280px;min-height:290px;position:relative;overflow:hidden;background-color:${fundo};">${conteudo}${fusao}${marca}${rodape}</div>`;
}

// ---------- Casca do banner ----------
function raiz(cfg, cor, conteudo) {
  const fundo = profundo(cor);
  const estilo = [
    'position:relative', 'box-sizing:border-box', 'width:100%', 'max-width:1100px', 'margin:0 auto 20px',
    'border-radius:18px', 'overflow:hidden', 'isolation:isolate', 'color:#FFFFFF', `font-family:${T.sans}`,
    'line-height:1.5', 'text-align:left', 'box-shadow:0 14px 34px -16px rgba(8,14,30,.55)',
    `background-color:${fundo}`,
    `background-image:url('${contornos(cfg.s)}'),radial-gradient(circle at 82% 22%,rgba(140,116,168,.30) 0%,rgba(140,116,168,0) 55%),linear-gradient(135deg,${cor} 0%,${fundo} 100%)`,
    'background-size:cover,auto,auto', 'background-position:right center,0 0,0 0', 'background-repeat:no-repeat',
  ].join(';');
  const classes = ['nolink', 'psi-banner', `psi-t-${cfg.tipo}`, cfg.g ? `psi-g-${cfg.g}` : '', `psi-s-${cfg.s}`, cfg.ag ? `psi-ag-${cfg.ag}` : ''].filter(Boolean).join(' ');
  return `<div lang="pt-BR" class="${classes}" style="${estilo};">${conteudo}${barraMarca}${SEM_JS ? '' : SCRIPT}</div>`;
}

// Layout comum: [glifo + numeral/rótulo | meta, título, epígrafe, texto, extras e chips] [painel do retrato].
// Sem retrato (A e B), o conteúdo ocupa a largura toda; C e D levam o painel de tema.
function bannerPadrao({ cfg, id, cor, glifo, rotulo, topo, titulo, epi, texto, extras = '', chips = '', numeral = '' }) {
  return raiz(cfg, cor,
    `<div style="position:relative;z-index:2;display:flex;flex-wrap:wrap;">`
    + `<div style="flex:999 1 520px;min-width:0;box-sizing:border-box;padding:28px 34px 30px;">`
    + `<div class="psi-in" style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px 18px;margin-bottom:20px;">${topo}${capsulaLogo(20)}</div>`
    + `<div style="display:flex;flex-wrap:wrap;gap:18px 32px;align-items:flex-start;">`
    + `<div class="psi-in" style="flex:0 0 auto;width:112px;display:flex;flex-direction:column;gap:14px;">`
    + glifoBox('psi-glifo', glifo, 92) + rotulo + `</div>`
    + `<div style="flex:1 1 300px;min-width:0;">`
    + `<h2 class="psi-in" style="margin:0 0 12px;padding:0;font-family:${T.serif};font-size:28px;line-height:1.18;font-weight:400;color:#FFFFFF;letter-spacing:-.005em;overflow-wrap:break-word;hyphens:auto;">${esc(titulo)}</h2>`
    + epi
    + `<p class="psi-in" style="margin:0 0 16px;padding:0;font-size:14.5px;line-height:1.6;color:rgba(255,255,255,.72);max-width:68ch;">${esc(texto)}</p>`
    + extras
    + (chips ? `<div class="psi-in" style="display:flex;flex-wrap:wrap;gap:8px;">${chips}</div>` : '')
    + `</div></div></div>`
    + painelRetrato(id, cor, glifo, numeral)
    + `</div>`
  );
}

const rotuloSecao = txt => `<div style="font-size:10.5px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:rgba(255,255,255,.6);margin-bottom:10px;">${esc(txt)}</div>`;

// "Você vai estudar" / "As 4 unidades" / rótulo próprio (d.rotulo): lista 2×2 numerada.
function topicos(d) {
  if (!d.topicos || !d.topicos.length) return '';
  const itens = d.topicos.map((t, i) => `<div class="psi-in" style="flex:1 1 240px;min-width:0;display:flex;gap:10px;align-items:baseline;">`
    + `<span style="font-family:${T.serif};font-size:15px;color:rgba(255,255,255,.45);">${pad2(i + 1)}</span>`
    + `<span style="font-size:13.5px;line-height:1.45;color:rgba(255,255,255,.88);">${esc(t)}</span></div>`).join('');
  return `<div style="margin:2px 0 18px;padding:14px 0 0;border-top:1px solid rgba(255,255,255,.12);">`
    + `<div class="psi-in">${rotuloSecao(d.rotulo || (d.unidades ? 'As 4 unidades' : 'Você vai estudar'))}</div>`
    + `<div style="display:flex;flex-wrap:wrap;gap:10px 22px;">${itens}</div></div>`;
}

// Chip da liberação (em dias a partir da matrícula), com destaque dourado discreto.
const chipDias = dias => `<span class="psi-chip" style="display:inline-block;padding:5px 12px;border:1px solid rgba(248,184,0,.5);border-radius:999px;background:rgba(248,184,0,.1);color:#FFE7A3;font-size:12.5px;line-height:1.4;white-space:nowrap;">`
  + (dias ? `Disponível ${dias} dias após a matrícula` : 'Disponível desde a matrícula') + `</span>`;

// ---------- Banners ----------
function bannerDisciplina(d) {
  const nuc = dados.nucleos[d.nucleo];
  const glifo = d.glifo || nuc.glifo;
  return bannerPadrao({
    cfg: { tipo: 'disciplina', g: glifo, s: d.n },
    id: pad2(d.n),
    cor: nuc.cor,
    glifo,
    numeral: pad2(d.n),
    rotulo: `<div><div style="font-size:10.5px;letter-spacing:.18em;text-transform:uppercase;color:rgba(255,255,255,.6);">Disciplina</div>`
      + `<div class="psi-conta" style="font-family:${T.serif};font-size:46px;line-height:1;color:#FFFFFF;">${pad2(d.n)}</div></div>`,
    topo: meta(`Módulo ${d.modulo} · ${nuc.nome}`),
    titulo: d.titulo,
    epi: epigrafe(d.epigrafe),
    texto: d.texto,
    extras: topicos(d),
    // Chips comuns a todas as disciplinas (regras do curso) vêm de dados.chipsDisciplina.
    chips: chipDias(d.dias) + [d.ch, ...(dados.chipsDisciplina || [])].filter(Boolean).map(chip).join(''),
  });
}

// ---------- Apresentação (A): carga horária, "Como funciona" e trilha em dias ----------
function cargaHoraria(c) {
  const fmt = h => h.toLocaleString('pt-BR') + 'h';
  const barra = c.partes.map(p => `<div class="psi-barra" style="flex:${p.horas} 1 0;min-width:4px;height:10px;background:${p.cor};${semTexto}">${NBSP}</div>`).join('');
  const legenda = c.partes.map(p => `<div class="psi-in" style="flex:1 1 280px;min-width:0;display:flex;gap:9px;align-items:baseline;">`
    + `<span style="color:${p.cor};font-size:11px;">●</span>`
    + `<span><span class="psi-conta" style="font-family:${T.serif};font-size:20px;color:#FFFFFF;">${fmt(p.horas)}</span> `
    + `<span style="font-size:13px;color:rgba(255,255,255,.8);">${esc(p.rotulo)}</span> `
    + `<span style="font-size:11.5px;color:rgba(255,255,255,.5);">· ${esc(p.detalhe)}</span></span></div>`).join('');
  return `<div style="margin:6px 0 24px;">`
    + `<div class="psi-in" style="display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:4px 16px;margin-bottom:10px;">`
    + `<span style="font-size:10.5px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:rgba(255,255,255,.6);">Carga horária total</span>`
    + `<span class="psi-conta" style="font-family:${T.serif};font-size:34px;line-height:1;color:#FFFFFF;">${esc(c.total)}</span></div>`
    + `<div class="psi-in" style="display:flex;gap:3px;border-radius:999px;overflow:hidden;margin-bottom:14px;">${barra}</div>`
    + `<div style="display:flex;flex-wrap:wrap;gap:8px 22px;">${legenda}</div></div>`;
}

function cartoes(lista) {
  const ameixa = dados.nucleos.ameixa.cor;
  return `<div style="margin:0 0 24px;">`
    + `<div class="psi-in">${rotuloSecao('Como funciona')}</div>`
    + `<div style="display:flex;flex-wrap:wrap;gap:12px;">`
    + lista.map(c => `<div class="psi-in psi-cartao" style="flex:1 1 230px;min-width:0;box-sizing:border-box;padding:16px 18px 17px;border-radius:14px;`
      + (c.ameixa ? `background:${rgba(ameixa, 0.75)};border:1px solid rgba(196,172,220,.4);` : 'background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14);')
      + `">`
      + `<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">${glifoBox('psi-mini', c.glifo, 26)}`
      + `<span style="font-family:${T.serif};font-size:18px;line-height:1.2;color:#FFFFFF;">${esc(c.titulo)}</span></div>`
      + `<p style="margin:0;padding:0;font-size:13.5px;line-height:1.55;color:rgba(255,255,255,.78);">${esc(c.texto)}</p></div>`).join('')
    + `</div></div>`;
}

function trilha(marcos, marco) {
  const total = 360; // 6 módulos × 60 dias
  const segs = marcos.map(m => `<div style="flex:1 1 0;min-width:0;">`
    + `<div style="height:4px;border-radius:2px;background:rgba(255,255,255,.14);overflow:hidden;${semTexto}"><div class="psi-seg" style="height:4px;background:rgba(255,255,255,.85);${semTexto}">${NBSP}</div></div>`
    + `<div style="margin-top:7px;font-size:11px;font-weight:600;letter-spacing:.14em;color:rgba(255,255,255,.85);">${esc(m.rotulo)}</div>`
    + `<div style="font-size:11px;color:rgba(255,255,255,.55);">${m.dia ? 'dia ' + m.dia : 'imediato'}</div></div>`).join('');
  const pos = (marco.dia / total * 100).toFixed(2);
  const ameixaClaro = mix(dados.nucleos.ameixa.cor, '#FFFFFF', 0.55);
  return `<div class="psi-in" style="margin:0 0 6px;">`
    + rotuloSecao('Trilha · liberação a partir da matrícula')
    + `<div style="position:relative;padding-top:4px;">`
    + `<div style="display:flex;gap:6px;">${segs}</div>`
    + `<span aria-hidden="true" style="position:absolute;left:${pos}%;top:-2px;height:16px;border-left:2px solid ${ameixaClaro};${semTexto}">${NBSP}</span></div>`
    + `<div style="margin-top:12px;">${chipAmeixa(`${marco.rotulo} · a partir do dia ${marco.dia}`)}</div></div>`;
}

// Encontro ao vivo: agenda { dia (0 = domingo … 6 = sábado), inicio, fim (horas, UTC−3), texto }.
// O runtime recebe a agenda pela classe psi-ag-<dia>-<inicio>-<fim> e mostra a contagem regressiva.
function caixaAoVivo(agenda) {
  return `<div class="psi-in" style="margin:0 0 16px;"><span style="display:inline-block;padding:9px 15px;border-radius:12px;background:rgba(248,184,0,.12);border:1px solid rgba(248,184,0,.38);color:#FFE7A3;font-size:14px;line-height:1.4;">`
    + `<span class="psi-live-ponto" style="display:inline-block;color:${T.dourado};font-size:11px;line-height:1;margin-right:9px;">●</span>`
    + `<span class="psi-live-txt">${esc(agenda ? agenda.texto : '')}</span></span></div>`;
}

function bannerEspecial(e, seed) {
  const cor = dados.nucleos[e.nucleo].cor;
  return bannerPadrao({
    cfg: { tipo: e.tipo, g: e.glifo, s: seed, ag: e.agenda ? [e.agenda.dia, e.agenda.inicio, e.agenda.fim].join('-') : '' },
    id: e.arquivo.charAt(0),
    cor,
    glifo: e.glifo,
    rotulo: `<div style="font-family:${T.serif};font-size:24px;line-height:1.1;color:#FFFFFF;">${esc(e.rotuloPainel)}</div>`,
    topo: `<div style="display:flex;flex-wrap:wrap;align-items:center;gap:8px 14px;">${e.aoVivo ? seloAoVivo(e.aoVivo) : ''}${meta(e.meta)}</div>`,
    titulo: e.titulo,
    epi: epigrafe(e.epigrafe, e.tipo === 'aovivo' ? T.dourado : null),
    texto: e.texto,
    extras: e.apresentacao
      ? cargaHoraria(e.apresentacao.cargaHoraria) + cartoes(e.apresentacao.cartoes) + trilha(e.apresentacao.trilha, e.apresentacao.marcoAmeixa)
      : e.tipo === 'aovivo' ? caixaAoVivo(e.agenda)
      : e.passos ? topicos({ topicos: e.passos, rotulo: 'Como funciona' }) : '',
    chips: (e.dias != null ? chipDias(e.dias) : '') + (e.chips || []).map(chip).join(''),
  });
}

function bannerPrincipal(p) {
  const alturas = [100, 76, 88, 70, 82, 94, 78, 86];
  const estante = dados.estante.map(([k, rot], i) => {
    const c = dados.nucleos[k].cor;
    return `<div class="psi-lombada" style="flex:1 1 0;height:${alturas[i]}%;box-sizing:border-box;border-radius:3px 3px 0 0;overflow:hidden;text-align:center;padding-top:18px;`
      + `background:linear-gradient(180deg,rgba(0,0,0,0) 8px,rgba(248,184,0,.6) 8px,rgba(248,184,0,.6) 10px,rgba(0,0,0,0) 10px),linear-gradient(90deg,${mix(c, '#FFFFFF', 0.16)} 0%,${c} 55%,${mix(c, '#000000', 0.2)} 100%);">`
      + `<span style="display:inline-block;writing-mode:vertical-rl;transform:rotate(180deg);font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:rgba(255,255,255,.82);white-space:nowrap;">${rot}</span></div>`;
  }).join('');

  // Constelação: medalhões dos autores (o runtime os move e liga com linhas); núcleos sem autor viram pontos.
  const nos = dados.estante.map(([k, , slug], i) => {
    const [px, py] = POS_NOS[i], cor = dados.nucleos[k].cor;
    const pos = `position:absolute;z-index:1;left:${(px * 100).toFixed(0)}%;top:${(py * 100).toFixed(0)}%;`;
    if (!slug) return `<span class="psi-ponto" aria-hidden="true" style="${pos}margin:-8px 0 0 -6px;font-size:14px;line-height:16px;color:${CFG.nos[i].cor};">●</span>`;
    return medalhao(slug, cor, 40, `${pos}margin:-20px 0 0 -20px;border:2px solid rgba(255,255,255,.55);box-shadow:0 0 0 4px rgba(255,255,255,.06),0 6px 16px -6px rgba(0,0,0,.6);`)
      .replace('class="psi-med"', `class="psi-no psi-n-${i}"`);
  }).join('');

  const numeros = p.numeros.map((n, i) => `<div style="padding:0 22px 0 ${i ? 22 : 0}px;${i < p.numeros.length - 1 ? 'border-right:1px solid rgba(255,255,255,.18);' : ''}margin-bottom:10px;">`
    + `<div class="psi-conta" style="font-family:${T.serif};font-size:32px;line-height:1.1;color:#FFFFFF;">${esc(n.valor)}</div>`
    + `<div style="font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;color:rgba(255,255,255,.6);">${esc(n.rotulo)}</div></div>`).join('');

  return raiz({ tipo: 'principal', s: 0 }, T.navy,
    `<div style="position:relative;z-index:2;display:flex;flex-wrap:wrap;">`
    + `<div style="flex:999 1 480px;box-sizing:border-box;min-width:0;padding:34px 38px 30px;">`
    + `<div class="psi-in">${capsulaLogo(30)}</div>`
    + `<div class="psi-in" style="margin-top:28px;font-size:12px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:${T.dourado};">${esc(p.sobretitulo)}</div>`
    + `<h2 class="psi-in" style="margin:10px 0 14px;padding:0;font-family:${T.serif};font-size:46px;line-height:1.08;font-weight:400;color:#FFFFFF;letter-spacing:-.01em;">${esc(p.titulo)}</h2>`
    + `<p class="psi-in" style="margin:0 0 26px;padding:0;font-size:16px;line-height:1.6;color:rgba(255,255,255,.75);max-width:54ch;">${esc(p.texto)}</p>`
    + `<div class="psi-in" style="display:flex;flex-wrap:wrap;">${numeros}</div>`
    + `</div>`
    + `<div class="psi-constelacao" style="flex:1 1 280px;box-sizing:border-box;position:relative;min-height:340px;display:flex;flex-direction:column;justify-content:space-between;gap:18px;padding:26px 26px 0;background:rgba(0,0,0,.16);border-left:1px solid rgba(255,255,255,.08);">`
    + `<div style="position:relative;z-index:1;font-size:10.5px;letter-spacing:.18em;text-transform:uppercase;color:rgba(255,255,255,.65);">Cartografia psicanalítica · 8 núcleos</div>`
    + nos
    + `<div style="position:relative;z-index:1;"><div style="display:flex;align-items:flex-end;gap:5px;height:140px;">${estante}</div>`
    + `<div style="height:6px;background:rgba(255,255,255,.22);${semTexto}">${NBSP}</div></div>`
    + `</div></div>`
  );
}

// ---------- Montagem ----------
const itens = [
  { arq: dados.principal.arquivo, rot: 'Banner principal · Seção geral (acima dos tiles)', html: bannerPrincipal(dados.principal) },
  ...dados.especiais.map((e, i) => ({ arq: e.arquivo, rot: e.tile, html: bannerEspecial(e, 21 + i) })),
  ...dados.disciplinas.map(d => ({ arq: d.arquivo, rot: `Tile ${d.n + 2} · Disciplina ${pad2(d.n)} · Módulo ${d.modulo}`, html: bannerDisciplina(d) })),
];

const pastaSaida = arg('saida') ? path.resolve(arg('saida')) : path.join(__dirname, 'saida');
const arqPreview = arg('preview') ? path.resolve(arg('preview')) : path.join(__dirname, 'preview.html');
const nomeCurso = dados.principal.titulo;
fs.mkdirSync(pastaSaida, { recursive: true });
for (const it of itens) {
  fs.writeFileSync(path.join(pastaSaida, it.arq + '.html'),
    `<!-- ${it.rot} · Colar no editor HTML (modo código) do rótulo -->\n${it.html}\n`, 'utf8');
}

// Plano B: se o editor do Moodle remover o <script> dos rótulos, cole este arquivo uma única vez em
// Administração do site › Aparência › HTML adicional › "Antes de fechar BODY".
fs.writeFileSync(path.join(pastaSaida, '_runtime_moodle.html'),
  `<!-- PsiBanners · runtime único para o HTML adicional do site (Antes de fechar BODY). Só age onde houver .psi-banner. -->\n${SCRIPT}\n`, 'utf8');


const preview = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Banners · ${esc(nomeCurso)}</title></head>
<body style="margin:0;padding:32px 16px 64px;background:#E9EDF1;font-family:${T.sans};color:#1E242B;">
<div style="max-width:1100px;margin:0 auto;">
<h1 style="font-family:${T.serif};font-weight:400;font-size:28px;margin:0 0 4px;">Banners das seções · ${esc(nomeCurso)}</h1>
<p style="margin:0 0 32px;color:#4A5563;">${itens.length} banners · cada um está em <code>${esc(path.relative(RAIZ, pastaSaida).replace(/\\/g, '/'))}/</code> pronto para colar na descrição da seção.</p>${`
<div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#6B7684;margin:0 0 8px;">Tiles fictícios · o selo "Restrito" deve virar o prazo de liberação</div>
<ul style="display:flex;flex-wrap:wrap;gap:12px;list-style:none;margin:0 0 32px;padding:0;">
${[[dados.disciplinas[0], false], [dados.disciplinas[2], true], [dados.disciplinas[3], true]].map(([d, restrito]) => `<li class="tile" style="flex:1 1 200px;padding:14px;background:#F2F7FC;border-top:4px solid #1672CE;${restrito ? 'opacity:.6;' : ''}">${restrito ? '<span style="display:inline-block;padding:2px 8px;border-radius:6px;background:#9FD8F5;font-size:11px;font-weight:700;">Restrito</span>' : ''}<h3 style="margin:8px 0 0;font-size:15px;font-weight:400;">${esc(d.titulo)}</h3></li>`).join('\n')}
</ul>`}
${itens.map(it => `<div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#6B7684;margin:0 0 8px;">${esc(it.rot)} · <code style="text-transform:none;letter-spacing:0;">${it.arq}.html</code></div>\n${it.html}`).join('\n<div style="height:18px"></div>\n')}
<h2 style="font-family:${T.serif};font-weight:400;font-size:22px;margin:48px 0 12px;">Largura de celular (380px)</h2>
<div style="display:flex;flex-wrap:wrap;gap:20px;align-items:flex-start;">
${[itens[0], ...dados.especiais.filter(e => e.tipo === 'aovivo' || e.tipo === 'pratica').slice(0, 2).map(e => itens.find(it => it.arq === e.arquivo)), itens[itens.length - 1]].filter(Boolean).map(it =>`<div style="width:380px;max-width:100%;">${it.html}</div>`).join('\n')}
</div>
</div></body></html>
`;
fs.mkdirSync(path.dirname(arqPreview), { recursive: true });
fs.writeFileSync(arqPreview, preview, 'utf8');

const tamanhos = itens.map(it => Buffer.byteLength(it.html));
const comFoto = Object.keys(dados.pessoas).filter(s => imagem(s, 'arco')).length;
console.log(`${itens.length} banners gerados em ${pastaSaida}${SEM_JS ? ' (sem JS)' : ''}`);
console.log(`Retratos com foto: ${comFoto}/${Object.keys(dados.pessoas).length} (demais com monograma) · fragmentos de ${Math.round(Math.min(...tamanhos) / 1024)} a ${Math.round(Math.max(...tamanhos) / 1024)} KB`);
