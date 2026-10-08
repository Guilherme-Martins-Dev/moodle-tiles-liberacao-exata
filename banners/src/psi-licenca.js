/* Licença e autoria (moodle-tiles-liberacao-exata)
   Copyright (c) 2026 Guilherme Martins. Todos os direitos reservados.
   Uso, cópia e modificação dependem de autorização por escrito (ver LICENSE).
   https://github.com/Guilherme-Martins-Dev/moodle-tiles-liberacao-exata

   Empacotado pelo gerador (banners/gerar.js) antes de psi-banners.js e psi-sala.js, que só
   funcionam com window.PsiLicenca.ok resolvido como verdadeiro.

   A licença de um domínio é a assinatura ECDSA P-256 de "psi-licenca:v1:<domínio>", emitida com
   banners/licenca.js. O gerador injeta a chave pública e as licenças de dados.json; aqui a
   assinatura do location.hostname é conferida com crypto.subtle (ver doc/LICENCIAMENTO.md).

   · Autorizado: uma linha no console e o crédito no rodapé de cada banner (recriado se faltar).
   · Não autorizado: aviso no console, faixa sobre cada banner e, no primeiro clique ou tecla, uma
     frase em voz alta (uma vez por sessão). As animações e o script da sala ficam desativados.
   · Demonstração (assinatura de "psi-licenca:v1:demo:<domínio>"): tudo funciona, com uma faixa
     "Demonstração" fixa sobre cada banner. É o tipo da licença do exemplo público.
   · file: e localhost (prévia e desenvolvimento) dispensam licença.

   Diagnóstico: window.PsiLicenca.estado ('verificando' · 'autorizado' · 'demo' · 'local' · 'negado'). */
(function () {
  'use strict';

  var VERSAO = 1;
  if (window.PsiLicenca && window.PsiLicenca.v >= VERSAO) return;

  // { k: { x, y } chave pública (JWK), d: { domínio: assinatura em base64url }, m: idem, de demonstração }
  var CFG = __PSI_LICENCA__;

  var PROJETO = 'moodle-tiles-liberacao-exata';
  var AUTOR = String.fromCharCode(71, 117, 105, 108, 104, 101, 114, 109, 101, 32, 77, 97, 114, 116, 105, 110, 115);
  var REPO = 'github.com/Guilherme-Martins-Dev/' + PROJETO;
  var CREDITO = 'Desenvolvido por ' + AUTOR;
  var AVISO = 'Uso não autorizado · © ' + AUTOR + ' · ' + REPO;
  var FRASE = 'Este material usa o projeto Moodle Tiles Liberação Exata, de ' + AUTOR + ', sem autorização.';
  // Mesmo estilo da linha gerada em banners/gerar.js (raiz).
  var ESTILO_CREDITO = 'position:relative;z-index:2;padding:7px 18px 8px;text-align:right;font-size:10.5px;letter-spacing:.08em;line-height:1.4;color:rgba(255,255,255,.55);background:rgba(0,0,0,.16);';
  var ESTILO_AVISO = 'display:block!important;visibility:visible!important;opacity:1!important;position:absolute!important;left:0;right:0;top:0;z-index:50;box-sizing:border-box;padding:9px 16px;background:#B00020;color:#FFFFFF;font-size:13px;font-weight:700;line-height:1.4;letter-spacing:.02em;text-align:center;overflow-wrap:anywhere;';

  var DEMO = 'Demonstração · © ' + AUTOR + ' · ' + REPO;
  var ESTILO_DEMO = ESTILO_AVISO.replace('#B00020', '#8A6100');

  var dominio = String(location.hostname || '').toLowerCase();
  var estado = 'verificando';

  function bytes(b64url) {
    var bin = atob(String(b64url).replace(/-/g, '+').replace(/_/g, '/')), r = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) r[i] = bin.charCodeAt(i);
    return r;
  }
  function ascii(txt) {
    var r = new Uint8Array(txt.length);
    for (var i = 0; i < txt.length; i++) r[i] = txt.charCodeAt(i);
    return r;
  }

  function doDominio(lista) {
    return lista && Object.prototype.hasOwnProperty.call(lista, dominio) ? lista[dominio] : null;
  }
  function verificar() {
    if (location.protocol === 'file:' || dominio === 'localhost' || dominio === '127.0.0.1') return Promise.resolve('local');
    // A licença plena tem precedência sobre a de demonstração.
    var plena = doDominio(CFG.d), assinatura = plena || doDominio(CFG.m);
    var subtle = window.crypto && window.crypto.subtle;
    // Sem crypto.subtle (página em http) a assinatura não pode ser conferida.
    if (!assinatura || !CFG.k || !subtle) return Promise.resolve('negado');
    try {
      return subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: CFG.k.x, y: CFG.k.y }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
        .then(function (chave) {
          return subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, chave, bytes(assinatura), ascii('psi-licenca:v1:' + (plena ? '' : 'demo:') + dominio));
        })
        .then(function (valida) { return !valida ? 'negado' : plena ? 'autorizado' : 'demo'; }, function () { return 'negado'; });
    } catch (e) {
      return Promise.resolve('negado');
    }
  }

  // ======================================================================
  // Marcas nos banners: crédito (autorizado) ou faixa de aviso (não autorizado)
  // ======================================================================
  function filho(pai, classe) {
    for (var i = 0; i < pai.children.length; i++) {
      if ((' ' + pai.children[i].className + ' ').indexOf(' ' + classe + ' ') >= 0) return pai.children[i];
    }
    return null;
  }
  // Garante no banner o elemento da classe, com o texto e o estilo certos (a faixa vai no topo).
  function marca(banner, classe, txt, st, faixa) {
    var el = filho(banner, classe);
    if (!el) {
      el = document.createElement('div');
      el.className = classe;
      if (faixa) banner.insertBefore(el, banner.firstChild);
      else banner.appendChild(el);
    }
    if (el.textContent !== txt) el.textContent = txt;
    if (el.getAttribute('style') !== st) el.setAttribute('style', st);
  }
  function marcar() {
    if (estado === 'verificando') return;
    var lista = document.querySelectorAll('.psi-banner');
    for (var i = 0; i < lista.length; i++) {
      if (estado === 'negado') { marca(lista[i], 'psi-aviso-licenca', AVISO, ESTILO_AVISO, true); continue; }
      marca(lista[i], 'psi-credito', CREDITO, ESTILO_CREDITO, false);
      if (estado === 'demo') marca(lista[i], 'psi-aviso-licenca', DEMO, ESTILO_DEMO, true);
    }
  }

  // ======================================================================
  // Não autorizado: console e voz
  // ======================================================================
  function avisarConsole() {
    if (!window.console || !console.warn) return;
    console.warn('%c' + PROJETO + ' · uso não autorizado', 'font-size:16px;font-weight:700;color:#B00020;');
    console.warn('Este site (' + (dominio || '?') + ') usa o projeto ' + PROJETO + ', de ' + AUTOR + ', sem licença.\n'
      + 'Copyright (c) 2026 ' + AUTOR + '. Todos os direitos reservados.\n'
      + 'As animações e o script da sala foram desativados. Autorização: ' + REPO);
  }

  // O navegador só fala depois de uma interação do usuário.
  function falar() {
    document.removeEventListener('click', falar, true);
    document.removeEventListener('keydown', falar, true);
    try {
      if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) return;
      if (sessionStorage.getItem('psi-licenca-voz')) return;
      sessionStorage.setItem('psi-licenca-voz', '1');
      var u = new SpeechSynthesisUtterance(FRASE);
      u.lang = 'pt-BR';
      window.speechSynthesis.speak(u);
    } catch (e) { }
  }

  var ok = verificar().then(function (r) {
    estado = window.PsiLicenca.estado = r;
    if (r === 'negado') {
      avisarConsole();
      document.addEventListener('click', falar, true);
      document.addEventListener('keydown', falar, true);
    } else if (window.console && console.info) {
      console.info('[PsiLicenca] ' + PROJETO + ' · © ' + AUTOR + ' · ' + (r === 'local' ? 'ambiente local' : r === 'demo' ? 'licença de demonstração para ' + dominio : 'licenciado para ' + dominio));
    }
    marcar();
    return r !== 'negado';
  });

  window.PsiLicenca = { v: VERSAO, autor: AUTOR, projeto: PROJETO, repositorio: REPO, estado: estado, ok: ok };

  // Banners que chegam depois (AJAX do Tiles) e marcas removidas do DOM.
  if (window.MutationObserver) {
    var pendente = false;
    new MutationObserver(function () {
      if (pendente) return;
      pendente = true;
      setTimeout(function () { pendente = false; marcar(); }, 200);
    }).observe(document.documentElement, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', marcar);
})();
