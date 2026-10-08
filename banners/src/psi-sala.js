/* Script da sala (moodle-tiles-liberacao-exata)
   Copyright (c) 2026 Guilherme Martins. Todos os direitos reservados.
   Uso, cópia e modificação dependem de autorização por escrito (ver LICENSE).
   https://github.com/Guilherme-Martins-Dev/moodle-tiles-liberacao-exata

   Empacotado pelo gerador (banners/gerar.js) junto com psi-banners.js, no fim de cada
   banner. Os banners ficam na descrição das seções (a do 00_principal, na seção Geral, roda em
   toda visita à página inicial). Feito para Moodle 3.11 + Tiles, sem cmid fixo (sala replicável).

   O plugin "Data relativa" (availability_relativedate) limita o número do campo: cada seção usa
   D dias quando cabe, senão floor(D/7) semanas, que libera até 6 dias antes do dia certo; o
   script segura o bloco até o dia exato (matrícula + D dias):

   1. Matrícula: lida da data que o plugin mostra no tooltip de um tile restrito
      ("Disponível se: De 21 outubro 2026, 15:59") menos o período configurado daquela seção
      (CFG r). Fica em cache no navegador.
   2. Verificador: tile liberado pelo servidor antes do dia exato fica travado na tela
      (selo "Libera …", clique bloqueado), igual ao tile restrito do plugin.
   3. Seção que se trava sozinha: o banner da disciplina está na descrição da seção, então o
      script roda sempre que a seção aparece (tile, AJAX ou link …&section=N). As atividades
      nascem ocultas (classe psi-verificando) e só aparecem no dia exato; antes disso a seção
      mostra o aviso de restrição do plugin com a data exata. A matrícula vem do cache ou, sem
      cache, da página inicial do curso (tooltips dos tiles restritos).
   4. Prazo: tiles restritos mostram a data exata de liberação.
   5. Navegação: seta/link/menu para uma seção ainda travada leva à seção Pesquisa de
      Satisfação (estando nela, à última disciplina liberada). O mapa seção -> disciplina fica
      em cache por curso (psi-secoes-<curso>). No menu lateral, a disciplina travada não aparece.
   Não há conclusão de atividades: a liberação depende só da data (matrícula + D dias).

   Limite: o link direto de uma atividade (mod/…) não carrega o banner; nos dias de folga ele abre.

   Licença: sem a licença do domínio conferida (psi-licenca.js) o script se desliga e desfaz as
   travas; vale só a restrição do servidor.

   Diagnóstico: ?psiDebug=1 (console). Só na prévia local (file: ou localhost),
   ?psiDebug=1&psiAgora=AAAA-MM-DD simula a data de hoje; no AVA o parâmetro é ignorado. */
(function () {
  'use strict';

  var VERSAO = 14;
  if (window.PsiSala && window.PsiSala.v >= VERSAO) { window.PsiSala.scan(); return; }

  // { pesquisa: título da seção Pesquisa de Satisfação,
  //   disciplinas: [{ t: título, d: dias, r: { n, u: horas|dias|semanas|meses } restrição no plugin }] }
  var CFG = __PSI_SALA__;

  // Seletores do Moodle 3.11 / Tiles (ajuste aqui se a versão do plugin usar outra marcação).
  var SEL_TILE = 'li.tile, [id^="tile-"]';
  var SEL_SECAO = 'li.section, [id^="section-"]';
  var SEL_RESTRICAO = '.availabilityinfo, .tile-restricted, [class*="restrict"], [class*="availability"]';
  var RE_SELO = /^(restrito|restricted)$/i;

  var depurar = /[?&]psiDebug=1/.test(location.search);
  var cfgM = (window.M && window.M.cfg) || null;
  var matricula = null; // null · 'buscando' · 'nenhuma' · Date
  var paginas = {};     // seção -> promessa do HTML da página da seção
  var avisado = '';
  var desligado = false; // licença não conferida: nada é travado

  function log() {
    if (depurar && window.console) console.info.apply(console, ['[PsiSala]'].concat([].slice.call(arguments)));
  }
  function norm(t) {
    return String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }
  CFG.disciplinas.forEach(function (c) { c.n = norm(c.t); });

  function ler(chave) {
    try { return JSON.parse(localStorage.getItem(chave)) || {}; } catch (e) { return {}; }
  }
  function gravar(chave, valor) {
    try { localStorage.setItem(chave, JSON.stringify(valor)); } catch (e) { }
  }
  // Id do curso: M.cfg.courseId (não existe em toda versão), a classe "course-N" do <body> ou o
  // ?id= de course/view.php.
  function curso() {
    if (cfgM && cfgM.courseId > 1) return cfgM.courseId;
    var b = /(?:^|\s)course-(\d+)(?:\s|$)/.exec(document.body ? document.body.className : '');
    if (b && +b[1] > 1) return +b[1];
    var u = /\/course\/view\.php\?(?:.*&)?id=(\d+)/.exec(location.pathname + location.search);
    return u ? +u[1] : 0;
  }
  function sufixo() { return curso() + '-' + (cfgM ? cfgM.userId || 0 : 0); }

  // ======================================================================
  // Datas
  // ======================================================================
  var MESES = { jan: 0, fev: 1, feb: 1, mar: 2, abr: 3, apr: 3, mai: 4, may: 4, jun: 5, jul: 6,
    ago: 7, aug: 7, set: 8, sep: 8, out: 9, oct: 9, nov: 10, dez: 11, dec: 11 };

  // Datas com hora (a matrícula tem hora, e o plugin libera nessa mesma hora).
  function dia(a, m, d, h, mi) { return new Date(a, m, d, h || 0, mi || 0); }
  function somar(data, n, u) {
    var a = data.getFullYear(), m = data.getMonth(), d = data.getDate(), h = data.getHours(), mi = data.getMinutes();
    if (u === 'meses') return dia(a, m + n, d, h, mi);
    if (u === 'horas') return dia(a, m, d, h + n, mi);
    return dia(a, m, d + n * (u === 'semanas' ? 7 : 1), h, mi);
  }
  function somarDias(data, n) { return somar(data, n, 'dias'); }
  function fmt(data) {
    var p = function (v) { return (v < 10 ? '0' : '') + v; };
    return p(data.getDate()) + '/' + p(data.getMonth() + 1) + '/' + data.getFullYear();
  }
  function fmtHora(data) {
    var p = function (v) { return (v < 10 ? '0' : '') + v; };
    return fmt(data) + ' ' + p(data.getHours()) + ':' + p(data.getMinutes());
  }
  var NOMES_MES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  // Como o Moodle pt_BR escreve: "3 fevereiro 2027, 16:18".
  function fmtMoodle(data) {
    var p = function (v) { return (v < 10 ? '0' : '') + v; };
    return data.getDate() + ' ' + NOMES_MES[data.getMonth()] + ' ' + data.getFullYear() + ', ' + p(data.getHours()) + ':' + p(data.getMinutes());
  }
  function iso(data) { return [data.getFullYear(), data.getMonth() + 1, data.getDate(), data.getHours(), data.getMinutes()].join('-'); }
  function deIso(s) {
    var p = String(s).split('-');
    return p.length >= 3 ? dia(+p[0], +p[1] - 1, +p[2], +(p[3] || 0), +(p[4] || 0)) : null;
  }
  var SINGULAR = { horas: 'hora', dias: 'dia', semanas: 'semana', meses: 'mês' };
  function periodo(r) { return r ? r.n + ' ' + (r.n === 1 ? SINGULAR[r.u] : r.u) : 'sem restrição'; }

  // Primeira data do texto, com a hora se houver: "21/10/2026 15:59", "De 21 outubro 2026, 15:59",
  // "21 de outubro de 2026"…
  function lerData(texto) {
    var t = String(texto), m = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/.exec(t), r = null, fim = 0;
    var n = /\b(\d{1,2})º?\s+(?:de\s+)?([A-Za-zÀ-ÿ]{3,})\.?\s+(?:de\s+)?(\d{4})\b/.exec(t);
    if (n && (!m || n.index < m.index)) {
      var mes = MESES[norm(n[2]).slice(0, 3)];
      if (mes != null) { r = dia(+n[3], mes, +n[1]); fim = n.index + n[0].length; }
    }
    if (!r && m) { r = dia(+m[3], +m[2] - 1, +m[1]); fim = m.index + m[0].length; }
    if (!r) return null;
    var h = /^\s*(?:,|às|as|-)?\s*(\d{1,2}):(\d{2})/.exec(t.slice(fim));
    if (h) r.setHours(+h[1], +h[2]);
    return r;
  }

  // A data simulada só vale na prévia local: no AVA, qualquer aluno poderia abrir a seção antes da hora.
  var local = location.protocol === 'file:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  function hoje() {
    var a = depurar && local && /[?&]psiAgora=(\d{4}-\d{1,2}-\d{1,2})/.exec(location.search);
    return a ? deIso(a[1]) : new Date();
  }

  // ======================================================================
  // Tiles e seções
  // ======================================================================
  // Item de CFG cujo título aparece no texto (o mais longo vence, para não confundir títulos parecidos).
  // Texto com espaço entre os nós (textContent cola "Psicossexual"+"Libera" e o título deixa de casar).
  function textoDe(el) {
    var t = [];
    (function r(n) {
      if (n.nodeType === 3) t.push(n.nodeValue);
      else for (var i = 0; i < n.childNodes.length; i++) r(n.childNodes[i]);
    })(el);
    return t.join(" ");
  }
  function disciplinaEm(texto) {
    var n = ' ' + norm(texto) + ' ', achado = null;
    CFG.disciplinas.forEach(function (c) {
      if (n.indexOf(' ' + c.n + ' ') >= 0 && (!achado || c.n.length > achado.n.length)) achado = c;
    });
    return achado;
  }
  function numeroDe(el, prefixo) {
    var d = el.getAttribute('data-section');
    if (d) return +d;
    var m = new RegExp('^' + prefixo + '-(\\d+)$').exec(el.id || '');
    return m ? +m[1] : null;
  }
  function tiles() {
    var lista = document.querySelectorAll(SEL_TILE), r = [];
    for (var i = 0; i < lista.length; i++) {
      var el = lista[i], c = disciplinaEm(textoDe(el));
      if (c) r.push({ el: el, c: c, n: numeroDe(el, 'tile') });
    }
    return r;
  }
  function seloDe(el) {
    var els = el.querySelectorAll('*');
    for (var i = 0; i < els.length; i++) {
      if (!els[i].children.length && RE_SELO.test(els[i].textContent.trim())) return els[i];
    }
    return null;
  }
  // Restrito pelo servidor: o Tiles mostra o selo "Restrito". Marca o tile, porque o texto do selo
  // é trocado pelo prazo logo em seguida.
  function restritoNoServidor(el) {
    var selo = el.__psiSelo || seloDe(el);
    if (selo) { el.__psiSelo = selo; return true; }
    return false;
  }

  // Página do curso renderizada pelo servidor, uma vez por página: a de uma seção
  // (course/view.php?id=C&section=N) ou, com n = 'inicial', a página inicial com os tiles.
  function paginaDaSecao(n) {
    if (!curso() || !window.fetch) return Promise.resolve(null);
    if (!paginas[n]) {
      paginas[n] = fetch(cfgM.wwwroot + '/course/view.php?id=' + curso() + (n === 'inicial' ? '' : '&section=' + n), { credentials: 'same-origin' })
        .then(function (r) { return r.text(); })
        .then(function (html) { return new DOMParser().parseFromString(html, 'text/html'); })
        .catch(function () { return null; });
    }
    return paginas[n];
  }

  // ======================================================================
  // 1. Data de matrícula (por aluno: vem do tooltip do próprio aluno; cache por curso + usuário)
  // ======================================================================
  // Texto + atributos (title, data-content de popover, data-original-title de tooltip…).
  function textoComAtributos(el) {
    return (el.textContent || '') + ' ' + String(el.outerHTML || '').replace(/&nbsp;/g, ' ').replace(/<[^>]*?\s(?:title|data-[\w-]*content|data-[\w-]*title)="([^"]*)"[^>]*>/g, ' $1 ');
  }
  function textoRestricao(raiz) {
    var els = raiz.querySelectorAll(SEL_RESTRICAO), t = '';
    for (var i = 0; i < els.length; i++) t += ' ' + textoComAtributos(els[i]);
    return t;
  }

  // A data mostrada pelo plugin = matrícula + período configurado na seção. Só aceita matrícula no
  // passado (a data lida pode ser de outra coisa); se mudar (matrícula alterada), atualiza o cache.
  function definirMatricula(c, data, origem) {
    var m = somar(data, -c.r.n, c.r.u);
    if (m.getTime() > Date.now()) { avisar('matrícula descartada (no futuro): ' + fmtHora(m) + ' (de "' + c.t + '", ' + origem + ')'); return false; }
    var mudou = !(matricula instanceof Date) || Math.abs(matricula.getTime() - m.getTime()) > 6e4;
    matricula = m;
    if (mudou) {
      gravar('psi-matricula-' + sufixo(), { iso: iso(m) });
      log('matrícula: ' + fmtHora(m) + ' (de "' + c.t + '", ' + fmtHora(data) + ' − ' + periodo(c.r) + ', ' + origem + ')');
    }
    return true;
  }

  // Disciplina de um tooltip/popover: pelo próprio texto ou pelo tile que o abriu
  // (o elemento com aria-describedby = id do tooltip).
  function disciplinaDaJanela(j) {
    var c = disciplinaEm(textoDe(j));
    if (c || !j.id) return c;
    var gatilho = document.querySelector('[aria-describedby="' + j.id + '"]');
    var tile = gatilho && gatilho.closest && gatilho.closest(SEL_TILE);
    return tile ? disciplinaEm(textoDe(tile)) : null;
  }

  // Só janelas do Tiles/Bootstrap (o conteúdo das seções pode ter outras datas).
  var SEL_JANELA = '.modal, .popover, .tooltip, [role="dialog"]';
  function procurarNaPagina() {
    var janelas = document.querySelectorAll(SEL_JANELA);
    for (var i = 0; i < janelas.length; i++) {
      var j = janelas[i];
      if (j.matches && j.matches(SEL_TILE) || j.className === 'psi-dica') continue;
      var c = disciplinaDaJanela(j), d = c && c.r && lerData(textoComAtributos(j));
      if (d && definirMatricula(c, d, 'tooltip/janela')) return true;
    }
    return false;
  }

  // A cada varredura: primeiro os tiles restritos (mesmo com cache, para corrigi-lo); depois o
  // cache; depois as janelas; por fim, uma única vez, a página inicial (se esta página não tem
  // tiles: seção aberta por link) ou as páginas das seções restritas.
  // esgotado = todas as fontes falharam (ex.: não há mais tiles restritos: tudo já foi liberado).
  var buscouPaginas = false, buscouInicial = false, esgotado = false, ultimoAviso = '';
  function avisar(txt) { if (txt !== ultimoAviso) { ultimoAviso = txt; log(txt); } }

  // Tiles restritos de um documento (desta página ou da página inicial buscada).
  function matriculaDosTiles(doc, origem) {
    var lista = doc.querySelectorAll(SEL_TILE);
    for (var i = 0; i < lista.length; i++) {
      var c = disciplinaEm(textoDe(lista[i]));
      if (!c || !c.r || !seloDe(lista[i])) continue;
      var d = lerData(textoComAtributos(lista[i]));
      if (d && definirMatricula(c, d, origem)) return true;
    }
    return false;
  }

  function descobrirMatricula(lista) {
    var candidatos = lista.filter(function (t) { return t.c.r && restritoNoServidor(t.el); });
    for (var i = 0; i < candidatos.length; i++) {
      var d = dataDoPlugin(candidatos[i].el);
      if (d && definirMatricula(candidatos[i].c, d, 'tile')) return;
    }
    if (matricula instanceof Date || matricula === 'buscando') return;
    var cache = ler('psi-matricula-' + sufixo()), m = cache.iso && deIso(cache.iso);
    if (m && m.getTime() <= Date.now()) { matricula = m; log('matrícula (cache): ' + fmtHora(m)); return; }
    if (procurarNaPagina()) return;
    matricula = 'nenhuma';
    if (!lista.length) {
      // Sem tiles: página inicial ainda carregando (nada a decidir) ou seção aberta por link.
      if (!secoesComBanner().some(function (x) { return x.c.d; })) { avisar('matrícula: aguardando os tiles'); return; }
      if (buscouInicial || !curso() || !window.fetch) { esgotado = true; avisar('matrícula: não encontrada (cache vazio e nenhum tile restrito na página inicial)'); return; }
      buscouInicial = true;
      matricula = 'buscando';
      buscarInicial().then(function (doc) {
        if (!(doc && matriculaDosTiles(doc, 'página inicial'))) { matricula = 'nenhuma'; esgotado = true; }
        scan();
      });
      return;
    }
    if (!candidatos.length) {
      esgotado = true;
      avisar('matrícula: nenhum tile restrito para calcular');
      return;
    }
    if (buscouPaginas || !curso()) {
      esgotado = true;
      avisar('matrícula: nenhuma data de restrição encontrada. HTML do 1º tile restrito para diagnóstico:\n' + String(candidatos[0].el.outerHTML || '').slice(0, 3000));
      return;
    }
    // Sem data no tile: busca a página das seções restritas (só o elemento da seção), uma por vez.
    buscouPaginas = true;
    matricula = 'buscando';
    var k = 0;
    (function proxima() {
      var t = candidatos[k++];
      if (!t) { matricula = 'nenhuma'; esgotado = true; scan(); return; }
      if (t.n == null) { proxima(); return; }
      paginaDaSecao(t.n).then(function (doc) {
        var s = doc && doc.querySelector('#section-' + t.n), d = s && lerData(textoRestricao(s));
        if (d && definirMatricula(t.c, d, 'página da seção ' + t.n)) { scan(); return; }
        proxima();
      });
    })();
  }

  function liberacao(c) { return !desligado && matricula instanceof Date ? somarDias(matricula, c.d) : null; }

  // ======================================================================
  // 2 e 3. Verificador e prazos · visual igual ao da restrição do plugin
  // ======================================================================
  var ESTILO_PILULA = 'display:inline-block;padding:1px 7px;border-radius:4px;background:#9FD8F5;color:#1E242B;font-size:11px;font-weight:700;line-height:1.5;white-space:nowrap;';

  function bloquear(ev) {
    if (!this.getAttribute('data-psi-trava')) return;
    if (ev.type === 'keydown' && ev.key !== 'Enter' && ev.key !== ' ') return;
    ev.preventDefault();
    ev.stopPropagation();
    if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
  }

  // Tooltip no formato do plugin: pílula "Restrito" + "Disponível se: De 3 fevereiro 2027, 16:18".
  var dica = null;
  function mostrarDica(alvo, data) {
    if (!dica) {
      dica = document.createElement('div');
      dica.className = 'psi-dica';
      dica.setAttribute('role', 'tooltip');
      dica.setAttribute('style', 'position:absolute;z-index:1080;max-width:260px;padding:6px 9px;background:#fff;border:1px solid rgba(0,0,0,.2);border-radius:4px;box-shadow:0 3px 10px rgba(0,0,0,.18);color:#1E242B;font-size:12px;line-height:1.45;text-align:center;pointer-events:none;');
      document.body.appendChild(dica);
    }
    dica.innerHTML = '';
    var p = document.createElement('span');
    p.setAttribute('style', ESTILO_PILULA + 'margin-right:5px;');
    p.textContent = 'Restrito';
    dica.appendChild(p);
    dica.appendChild(document.createTextNode('Disponível se: De ' + fmtMoodle(data)));
    var seta = document.createElement('span');
    seta.setAttribute('style', 'position:absolute;left:50%;bottom:-6px;margin-left:-6px;width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:6px solid #fff;filter:drop-shadow(0 1px 0 rgba(0,0,0,.2));');
    dica.appendChild(seta);
    dica.style.display = 'block';
    var r = alvo.getBoundingClientRect(), sx = window.pageXOffset || 0, sy = window.pageYOffset || 0;
    dica.style.left = Math.max(4, r.left + sx + r.width / 2 - dica.offsetWidth / 2) + 'px';
    dica.style.top = (r.top + sy - dica.offsetHeight - 8) + 'px';
  }
  function esconderDica() { if (dica) dica.style.display = 'none'; }

  // Trava com a MESMA marcação que o Tiles usa num tile restrito (Moodle 3.11, format_tiles):
  //   li.tile.tile-restricted (sem tile-clickable) · a.tile-link sem href
  //   .tiletopright > i.icon.fa.fa-lock.fa-fw[title=Restrito]
  //   .tile-text > div.availabilityinfo.isrestricted.isfullinfo > span.badge.badge-info[data-toggle=tooltip]
  // Assim cores, posição e tooltip vêm do próprio CSS/JS do Tiles e ficam iguais aos do plugin.
  function htmlDica(data) {
    return '<div class="availabilityinfo isrestricted">\n    <span class="badge badge-info">Restrito</span> Disponível se: De ' + fmtMoodle(data) + '\n</div>';
  }

  // Tooltip do Bootstrap (o mesmo do plugin); sem jQuery/Bootstrap, o tooltip próprio equivalente.
  function ativarDica(badge, data) {
    var req = window.require;
    if (typeof req === 'function' && req.amd !== false) {
      try {
        req(['jquery'], function ($) {
          if ($ && $.fn && $.fn.tooltip) $(badge).tooltip();
          else dicaPropria(badge, data);
        });
        return;
      } catch (e) { }
    }
    dicaPropria(badge, data);
  }
  function dicaPropria(badge, data) {
    if (badge.__psiDica) return;
    badge.__psiDica = true;
    badge.removeAttribute('title');
    badge.addEventListener('mouseenter', function () { mostrarDica(badge, data); });
    badge.addEventListener('mouseleave', esconderDica);
  }

  function travar(el, data) {
    var texto = 'Libera ' + fmt(data);
    if (el.getAttribute('data-psi-trava') === texto) return;
    destravar(el);
    el.setAttribute('data-psi-trava', texto);
    el.setAttribute('aria-disabled', 'true');
    if (!el.__psiBloqueio) {
      el.__psiBloqueio = true;
      el.addEventListener('click', bloquear, true);
      el.addEventListener('keydown', bloquear, true);
      el.addEventListener('mouseleave', esconderDica);
    }
    // Classes: igual ao tile restrito do plugin.
    el.__psiClicavel = /(^|\s)tile-clickable(\s|$)/.test(el.className);
    el.className = el.className.replace(/(^|\s)tile-clickable(?=\s|$)/g, ' ').replace(/\s+/g, ' ').trim() + ' tile-restricted';
    // Link sem destino, como no tile restrito.
    var link = el.querySelector('a.tile-link');
    if (link && link.getAttribute('href')) { el.__psiHref = link.getAttribute('href'); link.removeAttribute('href'); }
    // Cadeado no canto superior direito.
    var topo = el.querySelector('.tiletopright');
    if (topo && !topo.querySelector('.fa-lock')) {
      var cad = document.createElement('i');
      cad.className = 'icon fa fa-lock fa-fw psi-trava-extra';
      cad.setAttribute('title', 'Restrito');
      cad.setAttribute('role', 'img');
      cad.setAttribute('aria-label', 'Restrito');
      topo.appendChild(cad);
    }
    // Pílula, no mesmo contêiner do plugin.
    var info = document.createElement('div');
    info.className = 'availabilityinfo isrestricted isfullinfo psi-trava-extra';
    var badge = document.createElement('span');
    badge.className = 'badge badge-info';
    badge.setAttribute('data-html', 'true');
    badge.setAttribute('data-toggle', 'tooltip');
    badge.setAttribute('title', htmlDica(data));
    badge.style.whiteSpace = 'nowrap';
    badge.textContent = texto;
    info.appendChild(badge);
    (el.querySelector('.tile-text') || el.querySelector('.tile-content') || el).appendChild(info);
    ativarDica(badge, data);
  }

  function destravar(el) {
    if (!el.getAttribute('data-psi-trava')) return;
    el.removeAttribute('data-psi-trava');
    el.removeAttribute('aria-disabled');
    el.className = el.className.replace(/(^|\s)tile-restricted(?=\s|$)/g, ' ').replace(/\s+/g, ' ').trim() + (el.__psiClicavel ? ' tile-clickable' : '');
    var link = el.querySelector('a.tile-link');
    if (link && el.__psiHref) link.setAttribute('href', el.__psiHref);
    var extras = el.querySelectorAll('.psi-trava-extra');
    for (var i = 0; i < extras.length; i++) extras[i].parentNode.removeChild(extras[i]);
    esconderDica();
  }

  // Data que o plugin mostra no tile (guardada antes de o script reescrever o tooltip com a data
  // exata, para o cálculo da matrícula usar sempre a data original do plugin).
  function dataDoPlugin(el) {
    if (!el.__psiDataPlugin) el.__psiDataPlugin = lerData(textoComAtributos(el));
    return el.__psiDataPlugin;
  }

  // Pílula do plugin: "Libera dd/mm/aaaa" curto, numa linha (a do Tiles tem largura fixa), e o
  // tooltip do plugin reescrito com a data exata (o plugin mostra a data das semanas arredondadas).
  function trocarSelo(el, c, lib) {
    var selo = el.__psiSelo;
    var curto = lib ? 'Libera ' + fmt(lib) : c.d ? 'Libera D+' + c.d : '';
    if (!selo || !curto || selo.textContent === curto) return;
    dataDoPlugin(el); // guarda a data original antes de reescrever
    if (!selo.__psiOriginal) selo.__psiOriginal = { txt: selo.textContent, attr: selo.getAttribute('data-original-title') ? 'data-original-title' : 'title' };
    if (selo.__psiOriginal.dica == null) selo.__psiOriginal.dica = selo.getAttribute(selo.__psiOriginal.attr) || '';
    selo.textContent = curto;
    selo.style.whiteSpace = 'nowrap';
    if (!lib) return;
    var attr = selo.getAttribute('data-original-title') ? 'data-original-title' : 'title';
    selo.setAttribute(attr, htmlDica(lib));
  }

  // Desfaz trocarSelo (script desligado): a pílula e o tooltip voltam a ser os do plugin.
  function restaurarSelo(el) {
    var selo = el.__psiSelo, o = selo && selo.__psiOriginal;
    if (!o) return;
    selo.textContent = o.txt;
    if (o.dica) selo.setAttribute(o.attr, o.dica);
    selo.__psiOriginal = null;
  }

  // ======================================================================
  // 3. Seção que se trava sozinha (aberta pelo tile, via AJAX ou por link &section=N)
  // ======================================================================
  // Enquanto verifica, as atividades ficam ocultas (CSS, então o que o Moodle ainda vai desenhar
  // já nasce oculto); travada, a seção mostra só o aviso de restrição no formato do plugin.
  function estilo() {
    if (document.getElementById('psi-sala-estilo')) return;
    var st = document.createElement('style');
    st.id = 'psi-sala-estilo';
    st.textContent =
      '.psi-verificando ul.section,.psi-verificando .section_availability:not(.psi-aviso-trava),.psi-verificando [data-for="cmlist"]{visibility:hidden!important}' +
      '.psi-travada>*:not(.psi-aviso-trava){display:none!important}' +
      '.psi-aviso-trava{margin:16px 0;padding:14px 16px;border-radius:8px;background:#F8F9FA;border:1px solid #DEE2E6}' +
      '.psi-aviso-trava h3{margin:0 0 8px;font-size:1.2rem}' +
      '.psi-aviso-trava .badge-info{background:#9FD8F5;color:#1E242B}' +
      '.psi-oculto{display:none!important}';
    (document.head || document.documentElement).appendChild(st);
  }

  // Seções com banner de disciplina: o banner fica na descrição, dentro do li.section.
  function secoesComBanner() {
    var hs = document.querySelectorAll('.psi-banner h2'), r = [];
    for (var i = 0; i < hs.length; i++) {
      var c = disciplinaEm(hs[i].textContent);
      var s = c && hs[i].closest && (hs[i].closest('li.section') || hs[i].closest(SEL_SECAO));
      if (s && !(s.matches && s.matches(SEL_TILE)) && !r.some(function (x) { return x.s === s; })) r.push({ s: s, c: c });
    }
    return r;
  }

  function travarSecao(s, c, lib) {
    var txt = fmtMoodle(lib);
    s.classList.remove('psi-verificando');
    s.classList.add('psi-travada');
    if (s.__psiAviso && s.__psiAviso.parentNode === s && s.__psiAviso.getAttribute('data-psi-data') === txt) return;
    if (s.__psiAviso && s.__psiAviso.parentNode) s.__psiAviso.parentNode.removeChild(s.__psiAviso);
    // Mesma marcação da restrição do Moodle 3.11: .section_availability > .availabilityinfo.isrestricted.
    var aviso = document.createElement('div');
    aviso.className = 'section_availability psi-aviso-trava';
    aviso.setAttribute('data-psi-data', txt);
    var h = document.createElement('h3');
    h.className = 'sectionname';
    h.textContent = c.t;
    var info = document.createElement('div');
    info.className = 'availabilityinfo isrestricted';
    var badge = document.createElement('span');
    badge.className = 'badge badge-info';
    badge.textContent = 'Restrito';
    info.appendChild(badge);
    info.appendChild(document.createTextNode(' Disponível se: De ' + txt));
    aviso.appendChild(h);
    aviso.appendChild(info);
    s.insertBefore(aviso, s.firstChild);
    s.__psiAviso = aviso;
  }

  function liberarSecao(s) {
    s.classList.remove('psi-verificando');
    s.classList.remove('psi-travada');
    if (s.__psiAviso && s.__psiAviso.parentNode) s.__psiAviso.parentNode.removeChild(s.__psiAviso);
    s.__psiAviso = null;
  }

  // Decide cada seção: antes do dia exato, travada; depois, liberada. Sem matrícula ainda, fica
  // verificando (oculta); se todas as fontes falharam, o servidor é quem manda (libera).
  function decidirSecoes(agora, editando) {
    var r = [];
    secoesComBanner().forEach(function (x) {
      var lib = liberacao(x.c), estado;
      if (editando || !x.c.d) { liberarSecao(x.s); estado = 'liberada'; }
      else if (lib && agora < lib) { travarSecao(x.s, x.c, lib); estado = 'travada até ' + fmtHora(lib); }
      else if (lib || esgotado) { liberarSecao(x.s); estado = lib ? 'liberada' : 'liberada (sem matrícula)'; }
      else { x.s.classList.add('psi-verificando'); estado = 'verificando'; }
      r.push('seção "' + x.c.t.slice(0, 32) + '" · ' + estado);
    });
    return r;
  }

  // ======================================================================
  // 5. Navegação entre seções (setas anterior/próxima, links …&section=N, menu "Ir para")
  // ======================================================================
  // Mapa da sala (por curso, igual para todos os alunos): número da seção -> disciplina, e a seção
  // da Pesquisa de Satisfação. Vem dos tiles da página inicial; sem eles, da página inicial buscada.
  var mapa = null, mapaTxt = '', pediuMapa = false, inicial = null;
  function ehPesquisa(texto) {
    return !!CFG.pesquisa && (' ' + norm(texto) + ' ').indexOf(' ' + norm(CFG.pesquisa) + ' ') >= 0;
  }
  function atualizarMapa(doc) {
    var lista = doc.querySelectorAll(SEL_TILE), m = { t: {}, pesquisa: null }, achou = false;
    for (var i = 0; i < lista.length; i++) {
      var n = numeroDe(lista[i], 'tile'), txt = textoDe(lista[i]);
      if (n == null) continue;
      if (ehPesquisa(txt)) { m.pesquisa = n; achou = true; continue; }
      var c = disciplinaEm(txt);
      if (c) { m.t[n] = c.t; achou = true; }
    }
    if (!achou) return false;
    mapa = m;
    var txt2 = JSON.stringify(m);
    if (txt2 !== mapaTxt) { mapaTxt = txt2; gravar('psi-secoes-' + curso(), m); log('mapa das seções: ' + txt2); }
    return true;
  }
  // Sem tiles na página: completa o mapa pelo menu lateral (itens de seção, data-type 30), que lista
  // número e nome das seções que o servidor já mostra, inclusive a Pesquisa.
  function mapaDoMenu() {
    var els = document.querySelectorAll('a[data-type="30"][href*="section="]');
    if (!els.length) return;
    var m = lerMapa() || { t: {}, pesquisa: null }, antes = JSON.stringify(m);
    for (var i = 0; i < els.length; i++) {
      var n = destinoDe(els[i]), txt = textoDe(els[i]);
      if (n == null) continue;
      if (ehPesquisa(txt)) { m.pesquisa = n; continue; }
      var c = disciplinaEm(txt);
      if (c) m.t[n] = c.t;
    }
    var txt2 = JSON.stringify(m);
    if (txt2 === antes || txt2 === JSON.stringify({ t: {}, pesquisa: null })) return;
    mapa = m; mapaTxt = txt2;
    gravar('psi-secoes-' + curso(), m);
    log('mapa das seções (menu): ' + txt2);
  }
  function lerMapa() {
    if (!mapa) { var m = ler('psi-secoes-' + curso()); if (m.t) { mapa = m; mapaTxt = JSON.stringify(m); } }
    return mapa;
  }
  // Página inicial buscada uma única vez (serve à matrícula e ao mapa).
  function buscarInicial() {
    if (!inicial) inicial = paginaDaSecao('inicial').then(function (doc) { if (doc) atualizarMapa(doc); return doc; });
    return inicial;
  }
  function porTitulo(t) {
    for (var i = 0; i < CFG.disciplinas.length; i++) if (CFG.disciplinas[i].t === t) return CFG.disciplinas[i];
    return null;
  }

  // Elemento de navegação clicado e o número da seção de destino. Os tiles têm a própria trava.
  var SEL_NAV = 'a[href*="section="], a[href*="#section-"], a[data-section], button[data-section]';
  function destinoDe(el) {
    if (!el || !el.getAttribute || (el.closest && el.closest(SEL_TILE + ', .psi-aviso-trava'))) return null;
    var href = el.getAttribute('href') || el.value || '', n = null;
    var m = /course\/view\.php\?(?:.*&)?section=(\d+)/.exec(href) || /#section-(\d+)$/.exec(href);
    if (m) n = +m[1];
    else if (el.getAttribute('data-section')) n = +el.getAttribute('data-section');
    return n == null || isNaN(n) ? null : n;
  }
  // Disciplina da seção n: pelo mapa ou pelo texto/título do próprio link ("Teoria das Pulsões ►").
  function disciplinaDaSecao(n, el) {
    var m = lerMapa();
    if (m && m.pesquisa === n) return null;
    var c = m && m.t[n] ? porTitulo(m.t[n]) : null;
    if (c || !el) return c;
    var txt = (el.textContent || '') + ' ' + (el.getAttribute('title') || '') + ' ' + (el.getAttribute('aria-label') || '');
    return ehPesquisa(txt) ? null : disciplinaEm(txt);
  }
  // Data exata de liberação, se a seção n ainda estiver travada; senão null.
  function travadaAte(n, el, agora) {
    var c = disciplinaDaSecao(n, el), lib = c && c.d ? liberacao(c) : null;
    return lib && agora < lib ? lib : null;
  }
  function secaoAtual(el) {
    var s = el && el.closest && (el.closest('li.section') || el.closest(SEL_SECAO));
    var n = s ? numeroDe(s, 'section') : null;
    if (n != null) return n;
    var u = /[?&]section=(\d+)/.exec(location.search);
    return u ? +u[1] : null;
  }
  // Disciplina liberada mais recente (para a volta a partir da pesquisa).
  function ultimaLiberada(agora) {
    var m = lerMapa(), melhor = null, dMelhor = -1;
    if (!m) return null;
    Object.keys(m.t).forEach(function (k) {
      var c = porTitulo(m.t[k]), lib = c && liberacao(c);
      if (c && (!c.d || (lib && agora >= lib)) && c.d > dMelhor) { dMelhor = c.d; melhor = +k; }
    });
    return melhor;
  }
  // Destino travado: vai para a Pesquisa de Satisfação; estando nela, para a última liberada.
  function desvio(atual, agora) {
    var m = lerMapa();
    if (m && m.pesquisa != null && atual !== m.pesquisa) return m.pesquisa;
    return m && m.pesquisa != null ? ultimaLiberada(agora) : null;
  }
  function irPara(n) {
    // Na página inicial, abre pelo próprio tile (o Tiles carrega a seção); senão, pela URL.
    var link = document.querySelector('#tile-' + n + ' a.tile-link, li.tile[data-section="' + n + '"] a.tile-link');
    if (link && link.getAttribute('href')) { link.click(); return; }
    location.href = cfgM.wwwroot + '/course/view.php?id=' + curso() + '&section=' + n;
  }

  function aoNavegar(ev) {
    try {
      if (!cfgM || document.body.className.indexOf('editing') >= 0) return;
      var el = ev.target && ev.target.closest ? ev.target.closest(ev.type === 'change' ? 'select' : 'a, button') : null;
      if (!el) return;
      var alvo = el;
      if (ev.type === 'change') { alvo = el.options && el.options[el.selectedIndex]; if (!alvo) return; }
      var n = destinoDe(alvo), agora = hoje();
      if (n == null || !travadaAte(n, alvo, agora)) return;
      ev.preventDefault();
      ev.stopPropagation();
      if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
      var atual = secaoAtual(el), para = desvio(atual, agora);
      log('navegação para a seção ' + n + ' bloqueada (travada) · ' + (para != null ? 'indo para a seção ' + para : 'sem desvio'));
      if (ev.type === 'change') el.selectedIndex = 0;
      if (para != null && para !== atual) irPara(para);
    } catch (e) {
      if (window.console) console.error('[PsiSala]', e);
    }
  }

  // Setas para seção travada: título "Restrito · Disponível se: De …" ao passar o mouse.
  function marcarSetas(agora) {
    var els = document.querySelectorAll(SEL_NAV);
    for (var i = 0; i < els.length; i++) {
      var el = els[i], n = destinoDe(el);
      if (n == null) continue;
      var lib = travadaAte(n, el, agora), txt = lib ? 'Restrito · Disponível se: De ' + fmtMoodle(lib) : '';
      // Item de menu de seção (navegação do Moodle: data-type 30, no menu do tema ou na gaveta do
      // Boost): some enquanto a disciplina estiver travada, para não parecer liberada.
      var item = el.getAttribute('data-type') === '30' ? (el.closest('li') || el) : null;
      if (lib) {
        if (item) item.classList.add('psi-oculto');
        if (el.getAttribute('data-psi-nav') === txt) continue;
        if (el.getAttribute('data-psi-nav') == null) el.__psiTitulo = el.getAttribute('title');
        el.setAttribute('data-psi-nav', txt);
        el.setAttribute('title', txt);
      } else if (el.getAttribute('data-psi-nav') != null) {
        if (item) item.classList.remove('psi-oculto');
        el.removeAttribute('data-psi-nav');
        if (el.__psiTitulo != null) el.setAttribute('title', el.__psiTitulo); else el.removeAttribute('title');
      }
    }
  }

  // ======================================================================
  // Ciclo
  // ======================================================================
  var avisoSecoes = '';
  function scan() {
    try {
      if (!cfgM || !document.body) return;
      estilo();
      var agora = hoje();
      // Editando: nada travado (o professor precisa ver e editar o conteúdo).
      if (document.body.className.indexOf('editing') >= 0) { decidirSecoes(agora, true); return; }
      var lista = tiles(), resumo = [];
      // Mapa seção -> disciplina: dos tiles desta página; sem tiles e sem cache, da página inicial.
      if (lista.length) atualizarMapa(document);
      else mapaDoMenu();
      if (!lista.length && !lerMapa() && !pediuMapa && curso() && document.querySelector('.psi-banner')) {
        pediuMapa = true;
        buscarInicial().then(function (doc) { if (doc) scan(); });
      }
      if (!desligado) descobrirMatricula(lista);

      lista.forEach(function (t) {
        var serv = restritoNoServidor(t.el), lib = liberacao(t.c), estado;
        if (serv) {
          if (desligado) restaurarSelo(t.el); else trocarSelo(t.el, t.c, lib);
          destravar(t.el);
          estado = 'restrito (servidor)';
        } else if (lib && t.c.d && agora < lib) {
          travar(t.el, lib);
          estado = 'travado (script)';
        } else {
          destravar(t.el);
          estado = 'liberado';
        }
        resumo.push(t.c.t.slice(0, 32) + ' · D' + t.c.d + ' · plugin ' + periodo(t.c.r) + ' · ' + (lib ? fmtHora(lib) : '?') + ' · ' + estado);
      });

      // Seções abertas na página (pelo tile, AJAX ou link &section=N): decide pelo banner de cada uma.
      var secoes = decidirSecoes(agora, false).join('\n');
      if (secoes && secoes !== avisoSecoes) { avisoSecoes = secoes; log(secoes); }
      marcarSetas(agora);

      var txt = resumo.join('\n');
      if (txt && txt !== avisado) { avisado = txt; log('hoje ' + fmt(agora) + '\n' + txt); }
    } catch (e) {
      if (window.console) console.error('[PsiSala]', e);
    }
  }

  // Decisão das seções sem esperar a varredura completa: roda antes de a página ser desenhada, então
  // a seção que acabou de chegar (AJAX do Tiles) não pisca o conteúdo.
  function decidirJa() {
    try {
      if (!cfgM || !document.body) return;
      estilo();
      var editando = document.body.className.indexOf('editing') >= 0;
      decidirSecoes(hoje(), editando);
      if (!editando) marcarSetas(hoje());
    } catch (e) { }
  }

  window.PsiSala = { v: VERSAO, scan: scan };
  log('ativo · v' + VERSAO);

  // Captura: roda antes do JS do Tiles e do Moodle (setas, links e menu "Ir para").
  document.addEventListener('click', aoNavegar, true);
  document.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') aoNavegar(ev); }, true);
  document.addEventListener('change', aoNavegar, true);

  // O Tiles injeta o conteúdo das seções via AJAX: observa o DOM e reavalia.
  if (window.MutationObserver) {
    var pendente = false;
    new MutationObserver(function () {
      decidirJa();
      if (pendente) return;
      pendente = true;
      setTimeout(function () { pendente = false; scan(); }, 300);
    }).observe(document.documentElement, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan);
  scan();

  // Licença do domínio (psi-licenca.js). O script começa na hora, para a seção não piscar; se a
  // licença não for conferida, ou o módulo de licença não existir, tudo o que foi travado é desfeito.
  function desligar() {
    desligado = true;
    esgotado = true;
    log('licença não conferida: script desativado');
    scan();
  }
  var lic = window.PsiLicenca;
  if (lic && lic.ok && lic.ok.then) lic.ok.then(function (v) { if (v !== true) desligar(); }, desligar);
  else desligar();
})();
