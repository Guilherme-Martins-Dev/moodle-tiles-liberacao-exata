/* Runtime de animação dos banners (moodle-tiles-liberacao-exata)
   Copyright (c) 2026 Guilherme Martins. Todos os direitos reservados.
   Uso, cópia e modificação dependem de autorização por escrito (ver LICENSE).
   https://github.com/Guilherme-Martins-Dev/moodle-tiles-liberacao-exata

   O gerador (banners/gerar.js) injeta CFG, empacota este arquivo em base64 e o coloca no fim de
   cada rótulo — assim os filtros do Moodle (URLs, emoticons, glossário) não conseguem alterá-lo.
   Define window.PsiBanners uma única vez e anima todos os .psi-banner da página, inclusive os
   injetados depois via AJAX pelo Tiles format. Sem JS, o HTML estático continua completo.
   Só anima com a licença do domínio conferida (psi-licenca.js); sem ela o banner fica estático.

   Diagnóstico: ?psiDebug=1 na URL contorna os banners ativos; o console mostra "[PsiBanners] ativo". */
(function () {
  'use strict';

  var VERSAO = 8;
  if (window.PsiBanners && window.PsiBanners.v >= VERSAO) { window.PsiBanners.scan(); return; }

  var CFG = __PSI_CFG__;

  // Namespace SVG obtido do próprio DOM (nenhuma URL escrita no código).
  var SVGNS = (function () {
    var d = document.createElement('div');
    d.innerHTML = '\x3csvg\x3e\x3c/svg\x3e';
    return d.firstChild.namespaceURI;
  })();
  var reduzir = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var depurar = /[?&]psiDebug=1/.test(location.search);
  var banners = [];
  var erros = [];
  var agendado = false;

  // ======================================================================
  // Utilitários
  // ======================================================================
  function css(el, s) { for (var k in s) el.style[k] = s[k]; return el; }
  function q(root, papel) { return root.querySelector('.psi-' + papel); }
  function qa(root, papel) { return Array.prototype.slice.call(root.querySelectorAll('.psi-' + papel)); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function easeOut(p) { return 1 - Math.pow(1 - p, 3); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function f2(v) { return v.toFixed(2); }
  function pad2(v) { return (v < 10 ? '0' : '') + v; }
  function classe(el, prefixo) {
    var m = (' ' + el.className + ' ').match(new RegExp(' psi-' + prefixo + '-([a-z0-9]+) '));
    return m ? m[1] : null;
  }
  function s(tag, attrs, pai) {
    var e = document.createElementNS(SVGNS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (pai) pai.appendChild(e);
    return e;
  }
  function animar(el, quadros, opts) {
    if (el.animate) return el.animate(quadros, opts);
    var fim = quadros[quadros.length - 1];
    for (var k in fim) if (k !== 'offset') el.style[k] = fim[k];
    return null;
  }
  function canvasEm(pai) {
    var cv = css(document.createElement('canvas'), {
      position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', zIndex: '0', pointerEvents: 'none'
    });
    cv.setAttribute('aria-hidden', 'true');
    pai.insertBefore(cv, pai.firstChild);
    return cv;
  }
  // Ajusta o canvas ao tamanho real (DPR máx. 2) e devolve [largura, altura].
  function preparar(cv, ctx) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = cv.clientWidth, h = cv.clientHeight;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return [w, h];
  }

  // ======================================================================
  // Laço único de animação (pausa fora da tela e com a aba oculta)
  // ======================================================================
  function agendar() { if (!agendado) { agendado = true; requestAnimationFrame(quadro); } }
  function quadro(agora) {
    agendado = false;
    var algum = false;
    if (!document.hidden) {
      for (var i = 0; i < banners.length; i++) {
        var b = banners[i];
        if (!b.visivel || !b.entrou || !b.el.isConnected) continue;
        algum = true;
        // O carimbo do 1º quadro pode ser anterior a b.inicio: t nunca é negativo.
        var t = Math.max(0, (agora - b.inicio) / 1000);
        try {
          for (var j = 0; j < b.tarefas.length; j++) b.tarefas[j](agora, t);
        } catch (e) {
          // Um banner com erro sai do loop sem congelar os demais.
          b.tarefas = [];
          erros.push(e);
          if (window.console) console.error('[PsiBanners]', e);
        }
      }
    }
    if (algum && !reduzir) agendar();
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) agendar(); });

  var io = window.IntersectionObserver ? new IntersectionObserver(function (entradas) {
    entradas.forEach(function (e) {
      var b = e.target.__psi;
      if (!b) return;
      b.visivel = e.isIntersecting;
      if (b.visivel && !b.entrou) entrar(b);
      if (b.visivel) agendar();
    });
  }, { threshold: 0.15 }) : null;

  // ======================================================================
  // Entrada: textos em sequência, retrato revelado de baixo para cima, medalhões um a um
  // ======================================================================
  function entrar(b) {
    b.entrou = true;
    b.inicio = performance.now() - (reduzir ? 8000 : 0);
    if (!reduzir) {
      var itens = b.el.querySelectorAll('.psi-in');
      for (var i = 0; i < itens.length; i++) (function (e, i) {
        var a = animar(e, [{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'translateY(0)' }],
          { duration: 750, delay: 120 + i * 80, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'both' });
        if (a) a.onfinish = function () { e.style.opacity = ''; };
        else e.style.opacity = '';
      })(itens[i], i);

      // Painel do retrato: revelado da direita para a esquerda.
      qa(b.el, 'painel').forEach(function (p) {
        animar(p, [{ clipPath: 'inset(0 0 0 100%)' }, { clipPath: 'inset(0 0 0 0)' }],
          { duration: 1400, delay: 200, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'both' });
      });
      qa(b.el, 'med').concat(qa(b.el, 'no')).forEach(function (m, i) {
        var a = animar(m, [{ opacity: 0, transform: 'scale(.6)' }, { opacity: 1, transform: 'scale(1)' }],
          { duration: 600, delay: 700 + i * 110, easing: 'cubic-bezier(.3,1.4,.5,1)', fill: 'both' });
        if (a) a.onfinish = function () { m.style.opacity = ''; a.cancel(); };
      });
    }
    b.aoEntrar.forEach(function (fn) { fn(); });
  }

  // ======================================================================
  // Fundo vivo: linhas de contorno ("cartografia") + halo violeta do inconsciente
  // ======================================================================
  function anel(th, k, t, f) {
    return 1 + 0.07 * Math.sin(2 * th + f[0] + k * 0.35 + t * 0.13)
             + 0.05 * Math.sin(3 * th + f[1] - k * 0.22 + t * 0.09)
             + 0.03 * Math.sin(5 * th + f[2] + k * 0.1 + t * 0.21);
  }
  function fundo(b) {
    var el = b.el, m = b.mouse;
    // O canvas substitui a textura estática (primeira camada url(...)) do HTML.
    el.style.backgroundImage = el.style.backgroundImage.replace(/url\([^)]*\)\s*,\s*/, '');
    var cv = canvasEm(el), ctx = cv.getContext('2d');
    if (!ctx) return;
    var n = b.cfg.s || 0, f = [n * 1.3 + 0.5, n * 2.1 + 1.2, n * 0.7 + 2.4];

    b.tarefas.push(function (agora, t) {
      var d = preparar(cv, ctx), w = d[0], h = d[1];
      var surge = reduzir ? 1 : easeOut(clamp(t / 1.8, 0, 1));

      var hx = w * (0.8 + m.x * 0.08), hy = h * (0.3 + m.y * 0.12);
      var rr = Math.max(w, h) * 0.55 * (0.94 + 0.06 * Math.sin(t * 0.6));
      var g = ctx.createRadialGradient(hx, hy, 0, hx, hy, rr);
      g.addColorStop(0, 'rgba(140,116,168,' + (0.3 * surge).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(140,116,168,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      var cx = w * 0.8 + m.x * 10, cy = h * 0.5 + m.y * 6, esc = Math.max(w, 600) / 1100;
      ctx.lineWidth = 1;
      for (var k = 0; k < 16; k++) {
        var base = (34 + k * 30) * esc * (0.9 + 0.1 * surge);
        ctx.strokeStyle = 'rgba(255,255,255,' + ((k % 4 === 0 ? 0.11 : 0.055) * surge).toFixed(3) + ')';
        ctx.beginPath();
        for (var i = 0; i <= 96; i++) {
          var th = i / 96 * 6.2832, r = base * anel(th, k, t, f);
          var x = cx + r * Math.cos(th), y = cy + r * Math.sin(th) * 0.72;
          if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        }
        ctx.stroke();
      }
    });
  }

  // ======================================================================
  // Parallax sutil, chips, brilho na cápsula da logo e tooltip dos retratos
  // ======================================================================
  function interacao(b) {
    var el = b.el, m = b.mouse;
    el.addEventListener('pointermove', function (e) {
      if (e.pointerType && e.pointerType !== 'mouse') return;
      var r = el.getBoundingClientRect();
      m.tx = ((e.clientX - r.left) / r.width) * 2 - 1;
      m.ty = ((e.clientY - r.top) / r.height) * 2 - 1;
    });
    el.addEventListener('pointerleave', function () { m.tx = 0; m.ty = 0; });

    var gl = q(el, 'glifo'), wm = q(el, 'marca'), fotos = qa(el, 'foto');
    b.tarefas.push(function (agora, t) {
      m.x = lerp(m.x, m.tx, 0.06); m.y = lerp(m.y, m.ty, 0.06);
      if (gl) gl.style.transform = 'translate(' + f2(m.x * 6) + 'px,' + f2(m.y * 6) + 'px)';
      if (wm) wm.style.transform = 'translate(' + f2(-m.x * 14) + 'px,' + f2(-m.y * 8) + 'px)';
      // Ken Burns lento em todas as fotos (aproxima e deriva) + parallax de ±6px.
      if (fotos.length) {
        var z = 1.03 + 0.05 * Math.exp(-t / 5) + 0.012 * Math.sin(t * 0.12);
        var tr = 'translate(' + f2(-m.x * 6 + 4 * Math.sin(t * 0.08)) + 'px,' + f2(-m.y * 6) + 'px) scale(' + z.toFixed(4) + ')';
        for (var i = 0; i < fotos.length; i++) fotos[i].style.transform = tr;
      }
    });

    qa(el, 'chip').forEach(function (c) {
      var bg = c.style.background;
      c.style.transition = 'background-color .25s, border-color .25s';
      c.addEventListener('mouseenter', function () { c.style.background = 'rgba(255,255,255,.18)'; });
      c.addEventListener('mouseleave', function () { c.style.background = bg; });
    });

    // Cartões da Apresentação: sobem levemente no hover.
    qa(el, 'cartao').forEach(function (c) {
      c.style.transition = 'transform .3s cubic-bezier(.2,.7,.2,1), border-color .3s';
      c.addEventListener('mouseenter', function () { c.style.transform = 'translateY(-3px)'; c.style.borderColor = 'rgba(255,255,255,.32)'; });
      c.addEventListener('mouseleave', function () { c.style.transform = ''; c.style.borderColor = ''; });
    });

    var cap = q(el, 'logo');
    if (cap && !reduzir) {
      var brilho = css(document.createElement('span'), {
        position: 'absolute', top: '0', bottom: '0', left: '-45%', width: '45%', pointerEvents: 'none',
        background: 'linear-gradient(100deg,rgba(255,255,255,0),rgba(255,255,255,.85),rgba(255,255,255,0))'
      });
      cap.appendChild(brilho);
      var brilhar = function () {
        animar(brilho, [{ transform: 'translateX(0)' }, { transform: 'translateX(330%)' }], { duration: 1100, easing: 'ease-in-out' });
      };
      el.addEventListener('mouseenter', brilhar);
      b.aoEntrar.push(function () { setTimeout(brilhar, 900); });
    }

    // Tooltip com nome e datas (o atributo title fica como fallback sem JS).
    var dica = null;
    qa(el, 'med').concat(qa(el, 'no'), qa(el, 'painel'), qa(el, 'faixa')).forEach(function (alvo) {
      var texto = alvo.getAttribute('title');
      if (!texto) return;
      alvo.removeAttribute('title');
      alvo.style.cursor = 'default';
      alvo.addEventListener('mouseenter', function () {
        if (!dica) {
          dica = css(document.createElement('div'), {
            position: 'absolute', zIndex: '5', pointerEvents: 'none', padding: '6px 11px', borderRadius: '8px',
            background: 'rgba(10,14,24,.92)', color: '#fff', fontSize: '12px', letterSpacing: '.04em',
            whiteSpace: 'nowrap', boxShadow: '0 8px 20px -8px rgba(0,0,0,.6)', opacity: '0'
          });
          el.appendChild(dica);
        }
        dica.textContent = texto;
        var ra = alvo.getBoundingClientRect(), rb = el.getBoundingClientRect();
        dica.style.left = '0px'; dica.style.top = '0px';
        var dw = dica.offsetWidth;
        dica.style.left = f2(clamp(ra.left - rb.left + ra.width / 2 - dw / 2, 8, rb.width - dw - 8)) + 'px';
        dica.style.top = f2(ra.top - rb.top - 36) + 'px';
        animar(dica, [{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 180, fill: 'forwards' });
      });
      alvo.addEventListener('mouseleave', function () {
        if (dica) animar(dica, [{ opacity: 1 }, { opacity: 0 }], { duration: 150, fill: 'forwards' });
      });
    });
  }

  // ======================================================================
  // Contadores (numeral da disciplina e números do banner principal)
  // ======================================================================
  function contadores(b) {
    qa(b.el, 'conta').forEach(function (e) {
      var mm = e.textContent.match(/^(\D*)([\d.]+)(\D*)$/);
      if (!mm) return;
      var bruto = mm[2], alvo = parseInt(bruto.replace(/\./g, ''), 10), milhar = bruto.indexOf('.') >= 0;
      var fmt = function (v) {
        var t = milhar ? v.toLocaleString('pt-BR') : String(v);
        if (bruto.charAt(0) === '0') while (t.length < bruto.length) t = '0' + t;
        return mm[1] + t + mm[3];
      };
      if (reduzir) return;
      e.textContent = fmt(0);
      var feito = false;
      // Garante o valor final mesmo que o laço pare no meio (aba oculta, banner saiu da tela).
      b.aoEntrar.push(function () { setTimeout(function () { feito = true; e.textContent = fmt(alvo); }, 2200); });
      b.tarefas.push(function (agora, t) {
        if (feito) return;
        var p = clamp((t - 0.25) / 1.5, 0, 1);
        e.textContent = fmt(Math.round(alvo * easeOut(p)));
        if (p === 1) feito = true;
      });
    });
  }

  // ======================================================================
  // Glifos animados por núcleo (substituem o glifo estático)
  // Cada construtor desenha no <svg> e devolve update(t).
  // ======================================================================
  var GLIFOS = {
    // Freud: espiral que se desenha e gira devagar, como uma regressão ao centro
    espiral: function (g, D) {
      var pts = [];
      for (var a = 0; a <= Math.PI * 5.2; a += 0.12) {
        var r = 1.5 + 1.62 * a;
        pts.push(f2(32 + r * Math.cos(a)) + ',' + f2(32 + r * Math.sin(a)));
      }
      var grp = s('g', {}, g);
      D.push(s('polyline', { points: pts.join(' ') }, grp));
      var ponto = s('circle', { cx: 32, cy: 32, r: 1.6, fill: '#fff', stroke: 'none' }, grp);
      return function (t) {
        grp.setAttribute('transform', 'rotate(' + f2(-t * 14) + ' 32 32)');
        ponto.setAttribute('r', f2(1.6 + 0.8 * Math.sin(t * 2)));
      };
    },
    // Klein: dois objetos que orbitam, se sobrepõem e alternam o preenchimento (bom/mau)
    objetos: function (g, D) {
      var a = s('circle', { cx: 32, cy: 32, r: 12, fill: '#fff' }, g), b = s('circle', { cx: 32, cy: 32, r: 12, fill: '#fff' }, g);
      D.push(a, b);
      return function (t) {
        var ang = t * 0.7, d = 6.5 + 2 * Math.sin(t * 0.5), c = Math.cos(ang) * d, sn = Math.sin(ang) * d;
        a.setAttribute('cx', f2(32 + c)); a.setAttribute('cy', f2(32 + sn));
        b.setAttribute('cx', f2(32 - c)); b.setAttribute('cy', f2(32 - sn));
        var k = 0.5 + 0.5 * Math.sin(t * 0.9);
        a.setAttribute('fill-opacity', (0.06 + 0.32 * (1 - k)).toFixed(3));
        b.setAttribute('fill-opacity', (0.06 + 0.32 * k).toFixed(3));
      };
    },
    // Winnicott: o arco "respira" e sustenta o círculo (holding)
    holding: function (g, D) {
      var c = s('circle', { cx: 32, cy: 25, r: 8 }, g);
      var a1 = s('path', { d: 'M12 32 Q32 60 52 32' }, g), a2 = s('path', { d: 'M18 30 Q32 48 46 30', 'stroke-opacity': '.5' }, g);
      D.push(c, a1, a2);
      return function (t) {
        var r = Math.sin(t * 1.1);
        c.setAttribute('cy', f2(25 + 1.6 * r));
        a1.setAttribute('d', 'M12 32 Q32 ' + f2(60 + 2.5 * r) + ' 52 32');
        a2.setAttribute('d', 'M18 30 Q32 ' + f2(48 + 2 * Math.sin(t * 1.1 - 0.5)) + ' 46 30');
      };
    },
    // Ferenczi: onda elástica amortecida, relançada de tempos em tempos
    elastico: function (g, D) {
      var p = s('polyline', {}, g), dot = s('circle', { cx: 32, cy: 32, r: 3, fill: '#fff' }, g);
      function forma(t) {
        var amp = 3 + 13 * Math.exp(-(t % 6) * 0.9), pts = [], yc = 32;
        for (var x = 6; x <= 58; x += 2) {
          var yy = 32 + amp * Math.sin((x - 6) / 52 * Math.PI) * Math.sin((x - 6) * 0.24 - t * 3);
          pts.push(x + ',' + f2(yy));
          if (x === 32) yc = yy;
        }
        p.setAttribute('points', pts.join(' '));
        dot.setAttribute('cy', f2(yc));
      }
      forma(0);
      D.push(p);
      return forma;
    },
    // Bion: elementos β (irregulares) caem no continente e viram α (pontos suaves)
    continente: function (g, D) {
      D.push(s('path', { d: 'M14 26 L14 38 Q14 52 32 52 Q50 52 50 38 L50 26' }, g));
      var parts = [];
      for (var i = 0; i < 4; i++) {
        parts.push({
          b: s('path', { d: 'M-3 -2 L2 -3 L3 2 L-1 3 Z', fill: '#fff', 'fill-opacity': '.5', 'stroke-width': '1' }, g),
          a: s('circle', { r: 2.2, fill: '#fff', stroke: 'none' }, g),
          f: i / 4, x: 25 + i * 4.6
        });
      }
      return function (t) {
        parts.forEach(function (p) {
          var f = (t * 0.28 + p.f) % 1, yy = 6 + f * 40, dentro = yy > 30;
          var xx = p.x + Math.sin(t * 2 + p.f * 6) * (dentro ? 0.5 : 1.6);
          p.b.setAttribute('transform', 'translate(' + f2(xx) + ' ' + f2(yy) + ') rotate(' + (t * 90 + p.f * 360).toFixed(1) + ')');
          p.b.setAttribute('opacity', dentro ? 0 : clamp(f * 6, 0, 1).toFixed(2));
          p.a.setAttribute('cx', f2(xx)); p.a.setAttribute('cy', f2(yy));
          p.a.setAttribute('opacity', dentro ? (clamp((1 - f) * 5, 0, 1) * 0.9).toFixed(2) : 0);
        });
      };
    },
    // Lacan: nó borromeano — três registros girando em torno do centro, pulsando ao se enlaçar
    borromeano: function (g, D) {
      var an = [0, 1, 2].map(function () { var c = s('circle', { cx: 32, cy: 32, r: 13 }, g); D.push(c); return c; });
      return function (t) {
        var base = t * 0.35, dist = 8.5 + 1.5 * Math.sin(t * 0.8), pulso = 0.5 + 0.5 * Math.cos(t * 1.2);
        an.forEach(function (c, k) {
          var a = base + k * 2.0944;
          c.setAttribute('cx', f2(32 + dist * Math.cos(a))); c.setAttribute('cy', f2(32 + dist * Math.sin(a)));
          c.setAttribute('stroke-width', f2(1.6 + 0.7 * pulso));
          c.setAttribute('stroke-opacity', f2(0.75 + 0.25 * pulso));
        });
      };
    },
    // Tripé: um pulso percorre teoria, análise e supervisão
    tripe: function (g, D) {
      var V = [[32, 13], [13, 49], [51, 49]];
      D.push(s('path', { d: 'M32 13 L13 49 L51 49 Z', 'stroke-opacity': '.55' }, g));
      var nos = V.map(function (v) { return s('circle', { cx: v[0], cy: v[1], r: 4.5, fill: '#fff' }, g); });
      var viajante = s('circle', { r: 2.2, fill: '#fff', stroke: 'none' }, g);
      return function (t) {
        var u = (((t * 0.22) % 1 + 1) % 1) * 3, i = Math.floor(u) % 3, f = u - Math.floor(u), a = V[i], b = V[(i + 1) % 3];
        viajante.setAttribute('cx', f2(a[0] + (b[0] - a[0]) * f));
        viajante.setAttribute('cy', f2(a[1] + (b[1] - a[1]) * f));
        nos.forEach(function (no, k) { no.setAttribute('r', f2(4.5 + (k === i ? 2.2 * Math.max(0, 1 - f * 3) : 0))); });
      };
    },
    // Transmissão: as linhas da página se escrevem em sequência
    livro: function (g, D) {
      D.push(s('path', { d: 'M32 18 Q21 11 8 14 L8 49 Q21 46 32 53 Q43 46 56 49 L56 14 Q43 11 32 18 Z' }, g));
      D.push(s('path', { d: 'M32 18 L32 53' }, g));
      var L = ['M14 23 Q20 21 27 24', 'M14 30 Q20 28 27 31', 'M14 37 Q20 35 27 38',
               'M37 24 Q44 21 50 23', 'M37 31 Q44 28 50 30', 'M37 38 Q44 35 50 37'].map(function (d) {
        var p = s('path', { d: d, 'stroke-opacity': '.65' }, g);
        p.__len = p.getTotalLength ? p.getTotalLength() : 14;
        p.setAttribute('stroke-dasharray', p.__len);
        return p;
      });
      return function (t) {
        var c = t % 7;
        L.forEach(function (p, i) {
          var pr = clamp((c - 1.5 - i * 0.45) / 0.5, 0, 1), sai = clamp((c - 6.3) / 0.6, 0, 1);
          p.setAttribute('stroke-dashoffset', f2(p.__len * (1 - pr)));
          p.setAttribute('opacity', f2(1 - sai));
        });
      };
    },
    // Escolas: uma raiz, muitos ramos
    ramos: function (g, D) {
      ['M32 56 L32 28', 'M32 28 Q30 16 26 9', 'M32 28 Q34 16 40 9', 'M32 32 Q22 26 14 16',
       'M32 32 Q42 26 52 16', 'M32 42 Q20 42 10 32', 'M32 42 Q44 42 54 32'].forEach(function (d) { D.push(s('path', { d: d }, g)); });
      s('circle', { cx: 32, cy: 56, r: 3, fill: '#fff' }, g);
      var pontas = [[26, 9], [40, 9], [14, 16], [52, 16], [10, 32], [54, 32]].map(function (p) {
        return s('circle', { cx: p[0], cy: p[1], r: 2.4, fill: '#fff', stroke: 'none' }, g);
      });
      return function (t) {
        pontas.forEach(function (c, i) { c.setAttribute('r', f2(2.2 + 1.6 * Math.max(0, Math.sin(t * 1.6 - i * 0.9)))); });
      };
    },
    // Transferência: dois sujeitos, um vínculo e o que circula nos dois sentidos
    vinculo: function (g, D) {
      var A = s('circle', { cx: 14, cy: 32, r: 8, fill: '#fff' }, g), B = s('circle', { cx: 50, cy: 32, r: 8, fill: '#fff' }, g);
      D.push(A, B, s('path', { d: 'M22 30 Q32 18 42 30' }, g), s('path', { d: 'M42 34 Q32 46 22 34', 'stroke-opacity': '.6' }, g));
      var p1 = s('circle', { r: 2.2, fill: '#fff', stroke: 'none' }, g);
      var p2 = s('circle', { r: 2.2, fill: '#fff', stroke: 'none', 'fill-opacity': '.65' }, g);
      function bez(x0, y0, cx, cy, x1, y1, f) {
        var a = (1 - f) * (1 - f), b = 2 * (1 - f) * f, c = f * f;
        return [a * x0 + b * cx + c * x1, a * y0 + b * cy + c * y1];
      }
      return function (t) {
        var f = (t * 0.35) % 1, h = (f + 0.5) % 1;
        var k = bez(22, 30, 32, 18, 42, 30, f), m = bez(42, 34, 32, 46, 22, 34, h);
        p1.setAttribute('cx', f2(k[0])); p1.setAttribute('cy', f2(k[1]));
        p2.setAttribute('cx', f2(m[0])); p2.setAttribute('cy', f2(m[1]));
        B.setAttribute('fill-opacity', (0.3 * Math.max(0, Math.sin(f * Math.PI)) * (f > 0.7 ? 1 : f / 0.7)).toFixed(3));
        A.setAttribute('fill-opacity', (0.3 * Math.max(0, Math.sin(h * Math.PI)) * (h > 0.7 ? 1 : h / 0.7)).toFixed(3));
      };
    },
    // Apresentação: agulha que oscila e se assenta no norte
    bussola: function (g, D) {
      D.push(s('circle', { cx: 32, cy: 32, r: 22 }, g));
      [0, 90, 180, 270].forEach(function (a) {
        var r = a * Math.PI / 180;
        s('path', { d: 'M' + f2(32 + 18.5 * Math.sin(r)) + ' ' + f2(32 - 18.5 * Math.cos(r)) + ' L' + f2(32 + 22 * Math.sin(r)) + ' ' + f2(32 - 22 * Math.cos(r)), 'stroke-opacity': '.6' }, g);
      });
      var ag = s('g', {}, g);
      s('path', { d: 'M32 14 L38 32 L32 50 L26 32 Z' }, ag);
      s('path', { d: 'M32 14 L38 32 L26 32 Z', fill: '#fff' }, ag);
      return function (t) {
        var a = 70 * Math.exp(-t * 0.9) * Math.cos(t * 3.2) + 4 * Math.sin(t * 0.6);
        ag.setAttribute('transform', 'rotate(' + f2(a) + ' 32 32)');
      };
    },
    // Conexões: ondas que emanam do ponto dourado
    conexao: function (g) {
      var aneis = [0, 1, 2].map(function () { return s('circle', { cx: 32, cy: 32, r: 7 }, g); });
      var c = s('circle', { cx: 32, cy: 32, r: 5.5, fill: '#F8B800', stroke: '#F8B800' }, g);
      return function (t) {
        aneis.forEach(function (a, k) {
          var f = (t * 0.45 + k / 3) % 1;
          a.setAttribute('r', f2(7 + f * 23));
          a.setAttribute('stroke-opacity', (0.9 * (1 - f)).toFixed(3));
        });
        c.setAttribute('r', f2(5 + 0.8 * Math.sin(t * 3)));
      };
    }
  };

  // Desenha o glifo animado dentro de "box" (o glifo principal e o do arco temático).
  function glifoEm(b, box, nome) {
    var construir = GLIFOS[nome];
    if (!box || !construir) return;
    var svg = s('svg', {
      viewBox: '0 0 64 64', width: '100%', height: '100%', fill: 'none', stroke: '#fff',
      'stroke-width': '1.8', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true'
    });
    css(svg, { display: 'block', overflow: 'visible' });
    box.style.backgroundImage = 'none';
    box.innerHTML = '';
    box.appendChild(svg);
    var desenhar = [];
    var atualizar = construir(svg, desenhar);
    if (!reduzir) desenhar.forEach(function (e) {
      e.__len = e.getTotalLength ? e.getTotalLength() : 150;
      e.setAttribute('stroke-dasharray', f2(e.__len));
      e.setAttribute('stroke-dashoffset', f2(e.__len));
    });
    var pronto = reduzir;
    b.tarefas.push(function (agora, t) {
      if (!pronto) {
        var p = easeOut(clamp((t - 0.1) / 1.6, 0, 1));
        desenhar.forEach(function (e) { e.setAttribute('stroke-dashoffset', f2(e.__len * (1 - p))); });
        if (p === 1) {
          desenhar.forEach(function (e) { e.removeAttribute('stroke-dasharray'); e.removeAttribute('stroke-dashoffset'); });
          pronto = true;
        }
      }
      atualizar(t);
    });
  }

  // ======================================================================
  // Especiais
  // ======================================================================
  // 00 · lombadas que sobem + constelação: os medalhões dos autores ligados por linhas
  function principal(b) {
    var el = b.el;
    var lombadas = qa(el, 'lombada');
    if (!reduzir) lombadas.forEach(function (l) { l.style.transformOrigin = 'bottom'; l.style.transform = 'scaleY(0)'; });
    b.aoEntrar.push(function () {
      if (reduzir) return;
      lombadas.forEach(function (l, i) {
        animar(l, [{ transform: 'scaleY(0)' }, { transform: 'scaleY(1)' }],
          { duration: 1000, delay: 350 + i * 90, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' });
      });
    });

    var painel = q(el, 'constelacao');
    if (!painel) return;
    var cv = canvasEm(painel), ctx = cv.getContext('2d');
    if (!ctx) return;
    qa(painel, 'ponto').forEach(function (p) { p.style.display = 'none'; }); // o canvas desenha os pontos
    var medalhoes = qa(painel, 'no');
    var nos = (CFG.nos || []).map(function (n, i) {
      var med = null;
      medalhoes.forEach(function (m) { if (classe(m, 'n') === String(i)) med = m; });
      return { cor: n.cor, px: n.px, py: n.py, fase: i * 0.785, med: med };
    });
    b.tarefas.push(function (agora, t) {
      var d = preparar(cv, ctx), w = d[0], h = d[1];
      var surge = reduzir ? 1 : easeOut(clamp((t - 0.6) / 1.6, 0, 1));
      var pos = nos.map(function (n) {
        var x = n.px + 0.04 * Math.sin(t * 0.45 + n.fase), y = n.py + 0.03 * Math.cos(t * 0.38 + n.fase * 1.3);
        if (n.med) { n.med.style.left = f2(x * 100) + '%'; n.med.style.top = f2(y * 100) + '%'; }
        return [x * w, y * h];
      });
      var maxd = w * 0.55;
      ctx.lineWidth = 1;
      for (var i = 0; i < pos.length; i++) for (var j = i + 1; j < pos.length; j++) {
        var dx = pos[i][0] - pos[j][0], dy = pos[i][1] - pos[j][1], dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > maxd) continue;
        var a = (1 - dist / maxd) * 0.45 * surge * (0.6 + 0.4 * Math.sin(t * 0.7 + i + j));
        ctx.strokeStyle = 'rgba(255,255,255,' + a.toFixed(3) + ')';
        ctx.beginPath(); ctx.moveTo(pos[i][0], pos[i][1]); ctx.lineTo(pos[j][0], pos[j][1]); ctx.stroke();
      }
      // Núcleos sem retrato viram pontos luminosos na cor do núcleo.
      pos.forEach(function (p, i) {
        if (nos[i].med) return;
        var g = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], 14);
        g.addColorStop(0, 'rgba(255,255,255,' + (0.35 * surge).toFixed(3) + ')');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(p[0], p[1], 14, 0, 6.2832); ctx.fill();
        ctx.globalAlpha = surge;
        ctx.fillStyle = nos[i].cor;
        ctx.beginPath(); ctx.arc(p[0], p[1], 3.4 + 0.6 * Math.sin(t * 1.3 + i), 0, 6.2832); ctx.fill();
        ctx.globalAlpha = 1;
      });
    });
  }

  // 2 a 4 autores: o HTML traz faixas iguais (é o que fica sem JS ou com "reduzir movimento");
  // aqui elas viram um carrossel em fusão — cada autor ocupa o painel inteiro por 5s, em revezamento.
  // O hover pausa; os indicadores levam direto a um autor.
  function carrossel(b, faixas) {
    var painel = q(b.el, 'painel');
    if (!painel) return;
    var n = faixas.length, atual = -1, proxima = 5, ultimoT = 0, pausado = false;

    faixas.forEach(function (f) {
      css(f, {
        position: 'absolute', left: '0', top: '0', right: '0', bottom: '0', flex: 'none', borderLeft: 'none',
        opacity: '0', pointerEvents: 'none', transition: 'opacity 1.1s ease'
      });
      var nome = f.querySelector('.psi-nome');
      if (nome) nome.style.display = 'none';
      // Sem foto: a sigla ganha o tamanho e a posição do painel de autor único.
      var foto = f.querySelector('.psi-foto');
      if (foto && foto.textContent.trim()) {
        css(foto, { fontSize: '170px', justifyContent: 'flex-start', alignItems: 'flex-start', padding: '18px 0 0 56px', color: 'rgba(255,255,255,.1)' });
      }
    });
    var estreita = q(painel, 'fusao-estreita'), larga = q(painel, 'fusao-larga');
    if (estreita) estreita.style.opacity = '0';
    if (larga) larga.style.opacity = '1';

    // Legenda (mesmo estilo do painel de autor único), acima da fusão.
    var legenda = css(document.createElement('div'), { position: 'absolute', left: '26px', right: '18px', bottom: '20px', zIndex: '3', pointerEvents: 'none' });
    var traco = css(document.createElement('span'), { letterSpacing: '0', opacity: '.55', marginRight: '8px' });
    traco.textContent = '——';
    var nomeLeg = css(document.createElement('span'), {
      fontSize: '10.5px', fontWeight: '600', letterSpacing: '.2em', textTransform: 'uppercase',
      color: 'rgba(255,255,255,.88)', transition: 'opacity .35s'
    });
    var rotulo = css(document.createElement('span'), { fontSize: '10.5px', color: 'rgba(255,255,255,.88)' });
    rotulo.appendChild(traco); rotulo.appendChild(nomeLeg);
    legenda.appendChild(rotulo);
    painel.appendChild(legenda);

    // Indicadores (um por autor) no canto superior direito.
    var barra = css(document.createElement('div'), { position: 'absolute', top: '16px', right: '16px', zIndex: '3', display: 'flex', gap: '7px' });
    var pontos = faixas.map(function (f, i) {
      var p = document.createElement('button');
      p.type = 'button';
      p.setAttribute('aria-label', 'Mostrar ' + (f.getAttribute('aria-label') || ''));
      css(p, {
        width: '9px', height: '9px', padding: '0', margin: '0', border: '0', borderRadius: '50%', cursor: 'pointer',
        background: 'rgba(255,255,255,.4)', boxShadow: '0 0 0 1px rgba(0,0,0,.15)', transition: 'background-color .4s, transform .4s'
      });
      p.addEventListener('click', function () { ir(i); proxima = ultimoT + 5; });
      barra.appendChild(p);
      return p;
    });
    painel.appendChild(barra);

    painel.addEventListener('mouseenter', function () { pausado = true; });
    painel.addEventListener('mouseleave', function () { pausado = false; });

    function ir(k) {
      if (k === atual) return;
      atual = k;
      faixas.forEach(function (f, i) {
        f.style.opacity = i === k ? '1' : '0';
        f.style.pointerEvents = i === k ? 'auto' : 'none';
      });
      pontos.forEach(function (p, i) {
        p.style.background = i === k ? '#FFFFFF' : 'rgba(255,255,255,.4)';
        p.style.transform = i === k ? 'scale(1.25)' : 'scale(1)';
      });
      nomeLeg.style.opacity = '0';
      setTimeout(function () { nomeLeg.textContent = faixas[k].getAttribute('aria-label') || ''; nomeLeg.style.opacity = '1'; }, 180);
    }
    ir(0);

    b.tarefas.push(function (agora, t) {
      ultimoT = t;
      if (pausado) { proxima = Math.max(proxima, t + 1.5); return; }
      if (t >= proxima) { ir((atual + 1) % n); proxima = t + 5; }
    });
  }

  // Mosaico (5+ autores, banner 03): todos com o mesmo espaço; o destaque passa de um em um,
  // em rodízio contínuo (3,2s cada). O hover escolhe um e pausa. Sem rodízio com "reduzir movimento".
  function revezamento(b) {
    var faixas = qa(b.el, 'faixa');
    if (faixas.length < 2 || reduzir) return;
    var mosaico = /(^| )psi-celula( |$)/.test(faixas[0].className);
    if (!mosaico) { carrossel(b, faixas); return; }
    var nomes = faixas.map(function (f) { return f.querySelector('.psi-nome'); });
    var ativo = -1, apontado = -1;
    faixas.forEach(function (f, i) {
      f.style.transition = 'flex-grow .9s cubic-bezier(.3,.7,.2,1), filter .9s, box-shadow .9s';
      if (nomes[i]) nomes[i].style.transition = 'opacity .9s';
      f.addEventListener('mouseenter', function () { apontado = i; });
    });
    var painel = q(b.el, 'painel');
    if (painel) painel.addEventListener('mouseleave', function () { apontado = -1; });

    function destacar(k) {
      ativo = k;
      faixas.forEach(function (f, i) {
        var sim = i === k;
        if (!mosaico) f.style.flexGrow = sim ? '1.7' : '1';
        f.style.filter = sim ? 'brightness(1.08)' : 'brightness(.72) saturate(.85)';
        if (mosaico) f.style.boxShadow = sim ? 'inset 0 0 0 2px rgba(255,255,255,.45)' : 'none';
        if (nomes[i]) nomes[i].style.opacity = sim ? '1' : '.6';
      });
    }
    b.tarefas.push(function (agora, t) {
      var k = apontado >= 0 ? apontado : Math.floor(t / 3.2) % faixas.length;
      if (k !== ativo) destacar(k);
    });
  }

  // A · a barra de carga horária e a trilha dos 6 módulos se preenchem em sequência
  function linhaDoTempo(b) {
    if (reduzir) return;
    [['barra', 300, 220], ['seg', 900, 170]].forEach(function (cfg) {
      var itens = qa(b.el, cfg[0]);
      itens.forEach(function (sg) { sg.style.transformOrigin = 'left'; sg.style.transform = 'scaleX(0)'; });
      b.aoEntrar.push(function () {
        itens.forEach(function (sg, i) {
          animar(sg, [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }],
            { duration: 700, delay: cfg[1] + i * cfg[2], easing: 'cubic-bezier(.3,.7,.2,1)', fill: 'forwards' });
        });
      });
    });
  }

  // B · contagem regressiva real para o próximo encontro ao vivo (horário UTC−3). A agenda vem da
  // classe psi-ag-<dia da semana 0-6>-<hora início>-<hora fim>, gerada a partir de dados.json.
  function aoVivo(b) {
    var txt = q(b.el, 'live-txt'), ponto = q(b.el, 'live-ponto');
    var ag = (' ' + b.el.className + ' ').match(/ psi-ag-(\d)-(\d{1,2})-(\d{1,2}) /);
    if (!txt || !ag) return;
    var DIA_SEM = +ag[1], H_INI = +ag[2], H_FIM = +ag[3];
    // Para testar: ?psiAgora=2026-09-29T19:30:00-03:00
    var desvio = 0;
    try {
      var m = location.search.match(/[?&]psiAgora=([^&]+)/);
      if (m) desvio = new Date(decodeURIComponent(m[1])).getTime() - Date.now();
    } catch (e) { /* ignora */ }
    var H = 3600000, DIA = 24 * H, BRT = -3 * H;
    function atualizar() {
      var agora = Date.now() + desvio, br = new Date(agora + BRT);
      var meiaNoite = Date.UTC(br.getUTCFullYear(), br.getUTCMonth(), br.getUTCDate()) - BRT;
      var inicio = null;
      for (var d = 0; d <= 7 && inicio === null; d++) {
        if ((br.getUTCDay() + d) % 7 !== DIA_SEM) continue;
        var c = meiaNoite + d * DIA + H_INI * H;
        if (c + (H_FIM - H_INI) * H > agora) inicio = c;
      }
      if (inicio === null) return;
      if (agora >= inicio) {
        txt.textContent = 'Ao vivo agora · até as ' + H_FIM + 'h';
      } else {
        var r = inicio - agora, dd = Math.floor(r / DIA), hh = Math.floor(r % DIA / H),
            mi = Math.floor(r % H / 60000), ss = Math.floor(r % 60000 / 1000);
        txt.textContent = 'Próxima live em ' + (dd ? dd + 'd ' : '') + (dd || hh ? pad2(hh) + 'h ' : '') +
          pad2(mi) + 'min' + (dd ? '' : ' ' + pad2(ss) + 's');
      }
    }
    atualizar();
    var id = setInterval(function () { if (!b.el.isConnected) clearInterval(id); else atualizar(); }, 1000);
    if (ponto && !reduzir) animar(ponto, [
      { transform: 'scale(1)', opacity: 1 }, { transform: 'scale(1.6)', opacity: 0.35 }, { transform: 'scale(1)', opacity: 1 }
    ], { duration: 1600, iterations: Infinity });
  }

  // ======================================================================
  // Inicialização
  // ======================================================================
  function iniciar(el) {
    var cfg = { tipo: classe(el, 't'), g: classe(el, 'g'), s: parseInt(classe(el, 's') || '0', 10) };
    var b = {
      el: el, cfg: cfg, tarefas: [], aoEntrar: [], visivel: false, entrou: false, inicio: 0,
      mouse: { x: 0, y: 0, tx: 0, ty: 0 }
    };
    el.__psi = b;
    if (!reduzir) {
      qa(el, 'in').concat(qa(el, 'med'), qa(el, 'no')).forEach(function (e) { e.style.opacity = '0'; });
      qa(el, 'painel').forEach(function (p) { p.style.clipPath = 'inset(0 0 0 100%)'; });
    }
    fundo(b);
    glifoEm(b, q(el, 'glifo'), cfg.g);
    var tema = q(el, 'tema-glifo');
    if (tema) glifoEm(b, tema, cfg.g);
    contadores(b);
    interacao(b);
    revezamento(b);
    if (cfg.tipo === 'principal') principal(b);
    if (cfg.tipo === 'apresentacao') linhaDoTempo(b);
    if (cfg.tipo === 'aovivo') aoVivo(b);
    if (depurar) css(el, { outline: '3px dashed #F8B800', outlineOffset: '3px' });
    banners.push(b);
    if (io) io.observe(el);
    else { b.visivel = true; entrar(b); agendar(); }
    // Salvaguarda: se o observer não disparar e o banner estiver na tela, entra assim mesmo
    // (o texto nunca fica preso invisível).
    setTimeout(function () {
      if (b.entrou || !el.isConnected) return;
      var r = el.getBoundingClientRect();
      if (r.width && r.bottom > 0 && r.top < (window.innerHeight || 0)) { b.visivel = true; entrar(b); agendar(); }
    }, 3000);
  }

  var avisado = 0, licenciado = false;
  function scan() {
    if (!licenciado) return;
    banners = banners.filter(function (b) { return b.el.isConnected; });
    var lista = document.querySelectorAll('.psi-banner');
    for (var i = 0; i < lista.length; i++) {
      if (lista[i].__psi) continue;
      try { iniciar(lista[i]); } catch (e) {
        erros.push(e);
        if (window.console) console.error('[PsiBanners]', e);
      }
    }
    if (banners.length !== avisado && window.console && console.info) {
      avisado = banners.length;
      console.info('[PsiBanners] ativo · v' + VERSAO + ' · ' + banners.length + ' banner(s)' + (erros.length ? ' · ' + erros.length + ' erro(s)' : ''));
    }
  }

  window.PsiBanners = { v: VERSAO, scan: scan, erros: erros, banners: function () { return banners.length; } };

  // O Tiles injeta o conteúdo das seções via AJAX: observa o DOM e inicializa banners novos.
  if (window.MutationObserver) {
    var pendente = false;
    new MutationObserver(function () {
      if (pendente) return;
      pendente = true;
      setTimeout(function () { pendente = false; scan(); }, 150);
    }).observe(document.documentElement, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan);
  // Sem a licença conferida (ou sem o módulo de licença) nada é animado.
  var lic = window.PsiLicenca;
  if (lic && lic.ok && lic.ok.then) lic.ok.then(function (v) { licenciado = v === true; scan(); });
})();
