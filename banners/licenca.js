// moodle-tiles-liberacao-exata · Copyright (c) 2026 Guilherme Martins. Todos os direitos reservados.
// Uso, cópia e modificação dependem de autorização por escrito (ver LICENSE).
// https://github.com/Guilherme-Martins-Dev/moodle-tiles-liberacao-exata
//
// Licenças por domínio (ver doc/LICENCIAMENTO.md). A licença de um domínio é a assinatura ECDSA
// P-256 de "psi-licenca:v1:<domínio>", feita com a chave privada do autor. O script dos banners
// (src/psi-licenca.js) confere a assinatura com a chave pública (src/licenca.pub.json).
// A licença de demonstração ("psi-licenca:v1:demo:<domínio>") funciona, mas deixa uma faixa
// "Demonstração" em cada banner: é a única que pode ficar num arquivo público.
//
// Uso:
//   node banners/licenca.js criar-chave           -> cria o par de chaves (uma única vez)
//   node banners/licenca.js emitir <domínio>...   -> imprime a licença para colar em dados.json
//   node banners/licenca.js emitir --demo <domínio>...   -> licença de demonstração
//   node banners/licenca.js conferir [--dados=arquivo.json]
//
// A chave privada fica fora do repositório: %USERPROFILE%\.moodle-tiles-liberacao-exata\
// (ou a pasta em PSI_LICENCA_PASTA). Sem ela não dá para emitir licenças: guarde uma cópia.

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const PASTA_CHAVE = process.env.PSI_LICENCA_PASTA || path.join(os.homedir(), '.moodle-tiles-liberacao-exata');
const ARQ_PRIVADA = path.join(PASTA_CHAVE, 'chave-privada.pem');
const ARQ_PUBLICA = path.join(__dirname, 'src', 'licenca.pub.json');

const mensagem = (dominio, demo) => Buffer.from(`psi-licenca:v1:${demo ? 'demo:' : ''}${dominio}`, 'utf8');
// Aceita "https://AVA.exemplo.edu/moodle" e devolve "ava.exemplo.edu" (o location.hostname do navegador).
const normalizar = texto => String(texto).trim().toLowerCase().replace(/^[a-z]+:\/\//, '').replace(/[/:?#].*$/, '');

// Chave pública { x, y } (JWK), ou null se o par ainda não foi criado.
function chavePublica() {
  if (!fs.existsSync(ARQ_PUBLICA)) return null;
  const { x, y } = JSON.parse(fs.readFileSync(ARQ_PUBLICA, 'utf8'));
  return { x, y };
}

// Assinatura no formato r||s (ieee-p1363), o que o crypto.subtle.verify do navegador espera.
function assinar(dominio, demo = false) {
  const privada = crypto.createPrivateKey(fs.readFileSync(ARQ_PRIVADA, 'utf8'));
  return crypto.sign('sha256', mensagem(dominio, demo), { key: privada, dsaEncoding: 'ieee-p1363' }).toString('base64url');
}

function conferir(dominio, assinatura, demo = false, pub = chavePublica()) {
  if (!pub || typeof assinatura !== 'string') return false;
  try {
    const chave = crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: pub.x, y: pub.y }, format: 'jwk' });
    return crypto.verify('sha256', mensagem(dominio, demo), { key: chave, dsaEncoding: 'ieee-p1363' }, Buffer.from(assinatura, 'base64url'));
  } catch (e) {
    return false;
  }
}

// Licenças de dados.licenca ("dominios" e "demo") separadas em válidas ({ domínio: assinatura }),
// de demonstração válidas e inválidas ([domínio]).
function conferirDados(dados, pub = chavePublica()) {
  const lic = dados.licenca || {};
  const validos = {}, demo = {}, invalidos = [];
  for (const [lista, ehDemo, destino] of [[lic.dominios, false, validos], [lic.demo, true, demo]]) {
    for (const [d, a] of Object.entries(lista || {})) {
      if (d === normalizar(d) && conferir(d, a, ehDemo, pub)) destino[d] = a;
      else invalidos.push(d);
    }
  }
  return { validos, demo, invalidos };
}

module.exports = { chavePublica, assinar, conferir, conferirDados, normalizar };

if (require.main === module) {
  const [comando, ...resto] = process.argv.slice(2);
  const falhar = msg => { console.error(msg); process.exit(1); };

  if (comando === 'criar-chave') {
    if (fs.existsSync(ARQ_PRIVADA)) falhar(`Já existe uma chave privada em ${ARQ_PRIVADA}. Nada foi alterado.`);
    if (fs.existsSync(ARQ_PUBLICA)) falhar(`Já existe uma chave pública em ${ARQ_PUBLICA}, mas a privada não está em ${ARQ_PRIVADA}.\nRestaure a cópia da chave privada; uma chave nova invalida todas as licenças já emitidas.`);
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
    fs.mkdirSync(PASTA_CHAVE, { recursive: true });
    fs.writeFileSync(ARQ_PRIVADA, privateKey.export({ type: 'pkcs8', format: 'pem' }), { encoding: 'utf8', mode: 0o600 });
    const { x, y } = publicKey.export({ format: 'jwk' });
    fs.writeFileSync(ARQ_PUBLICA, JSON.stringify({ kty: 'EC', crv: 'P-256', x, y }, null, 2) + '\n', 'utf8');
    console.log(`Chave privada: ${ARQ_PRIVADA} (fora do repositório; guarde uma cópia)`);
    console.log(`Chave pública: ${ARQ_PUBLICA} (versionada)`);
  } else if (comando === 'emitir') {
    const demo = resto.includes('--demo');
    const dominios = resto.filter(x => x !== '--demo').map(normalizar).filter(Boolean);
    if (!dominios.length) falhar('Informe o domínio: node banners/licenca.js emitir ava.exemplo.edu');
    if (!fs.existsSync(ARQ_PRIVADA)) falhar(`Chave privada não encontrada em ${ARQ_PRIVADA}. Rode "criar-chave" ou restaure a cópia.`);
    console.log(`Cole em dados.json, dentro de "licenca": { "${demo ? 'demo' : 'dominios'}": { … } }:\n`);
    console.log(dominios.map(d => `  ${JSON.stringify(d)}: ${JSON.stringify(assinar(d, demo))}`).join(',\n'));
  } else if (comando === 'conferir') {
    const a = resto.find(x => x.startsWith('--dados='));
    const arquivo = a ? path.resolve(a.slice(8))
      : fs.existsSync(path.join(__dirname, 'dados.json')) ? path.join(__dirname, 'dados.json')
      : path.join(__dirname, 'dados.exemplo.json');
    const { validos, demo, invalidos } = conferirDados(JSON.parse(fs.readFileSync(arquivo, 'utf8')));
    console.log(arquivo);
    Object.keys(validos).forEach(d => console.log(`  ok        ${d}`));
    Object.keys(demo).forEach(d => console.log(`  ok (demo) ${d}`));
    invalidos.forEach(d => console.log(`  INVÁLIDA  ${d}`));
    const total = Object.keys(validos).length + Object.keys(demo).length;
    if (!total && !invalidos.length) console.log('  nenhuma licença');
    process.exit(invalidos.length || !total ? 1 : 0);
  } else {
    falhar('Uso: node banners/licenca.js criar-chave | emitir [--demo] <domínio>... | conferir [--dados=arquivo.json]');
  }
}
