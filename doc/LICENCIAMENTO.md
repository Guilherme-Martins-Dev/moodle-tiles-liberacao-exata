# Autoria e licenciamento por domínio

O projeto é de **Guilherme Martins** e tem todos os direitos reservados ([LICENSE](../LICENSE)). O código é público para leitura, mas os banners só funcionam em domínios com uma licença assinada pelo autor.

- Código: [banners/src/psi-licenca.js](../banners/src/psi-licenca.js) (navegador) e [banners/licenca.js](../banners/licenca.js) (emissão)
- Chave pública: [banners/src/licenca.pub.json](../banners/src/licenca.pub.json)

## Como funciona

A licença de um domínio é a assinatura (ECDSA P-256) do texto `psi-licenca:v1:<domínio>`, feita com a chave privada do autor.

1. O autor emite a licença do domínio do Moodle e a coloca em `banners/dados.json`.
2. O gerador confere a assinatura e a embute no runtime de cada banner, junto com a chave pública.
3. No navegador, o script compara o domínio da página com as licenças embutidas e confere a assinatura.

Quem clona o repositório consegue gerar banners, mas não consegue emitir uma licença para o próprio domínio, porque não tem a chave privada.

`file:` e `localhost` dispensam licença, para a prévia e o desenvolvimento.

## Com licença

- Uma linha no console: `[PsiLicenca] moodle-tiles-liberacao-exata · © Guilherme Martins · licenciado para <domínio>`.
- A linha "Desenvolvido por Guilherme Martins" no rodapé de cada banner. Se for apagada do HTML, o script a recria.

## Licença de demonstração

A licença do exemplo público (`banners/dados.exemplo.json`, domínio fictício `ava.exemplo.edu`) é de demonstração: assina `psi-licenca:v1:demo:<domínio>` e fica em `"licenca": { "demo": { … } }`.

- Tudo funciona, mas cada banner leva a faixa fixa "Demonstração · © Guilherme Martins · github.com/…".
- É o único tipo de licença que pode ficar em arquivo público. Uma licença plena publicada serviria a qualquer servidor configurado com aquele nome.
- Para emitir: `node banners/licenca.js emitir --demo <domínio>`.

## Sem licença

Vale para domínio sem licença, assinatura inválida, página em `http` (o navegador não confere assinaturas fora de `https`) e runtime sem o bloco de licença.

- **Faixa** sobre cada banner: "Uso não autorizado · © Guilherme Martins · github.com/Guilherme-Martins-Dev/moodle-tiles-liberacao-exata". Se for removida, volta.
- **Console:** aviso com o autor e o endereço do repositório.
- **Voz:** no primeiro clique ou tecla, o navegador lê "Este material usa o projeto Moodle Tiles Liberação Exata, de Guilherme Martins, sem autorização." Uma vez por sessão do navegador.
- **Script desativado:** os banners ficam estáticos e o script da sala desfaz as travas. Vale só a restrição do servidor, que libera até 6 dias antes do dia exato.

## Emitir uma licença

Só o autor consegue, porque depende da chave privada.

```
node banners/licenca.js emitir ava.exemplo.edu
```

O comando imprime a linha para colar em `banners/dados.json`:

```json
"licenca": {
  "titular": "Instituição Exemplo",
  "dominios": {
    "ava.exemplo.edu": "<assinatura>"
  }
}
```

- O domínio é o que aparece na barra de endereço do Moodle, sem `https://` e sem caminho. `ava.exemplo.edu` e `www.ava.exemplo.edu` são domínios diferentes.
- Cada endereço precisa da sua licença, inclusive o de homologação.
- Depois de alterar `dados.json`, gere os banners de novo e cole-os outra vez. A licença vai dentro de cada banner.

Para conferir o que está em `dados.json`:

```
node banners/licenca.js conferir
```

O gerador também confere: o resumo termina com `Licença conferida para: …` ou com um aviso de que os banners sairão sem licença.

**No Moodle:** abra a sala com `?psiDebug=1` e veja a linha `[PsiLicenca]` no console, ou digite `PsiLicenca.estado` (`autorizado`, `demo`, `local` ou `negado`).

## Chave privada

- Fica fora do repositório, em `%USERPROFILE%\.moodle-tiles-liberacao-exata\chave-privada.pem` (ou na pasta indicada em `PSI_LICENCA_PASTA`).
- **Guarde uma cópia.** Sem ela não dá para emitir licenças. Uma chave nova (`node banners/licenca.js criar-chave`) invalida todas as licenças já emitidas e obriga a gerar e colar todos os banners de novo.
- Nunca a coloque no repositório nem a envie a terceiros: quem tem a chave emite licenças. O `.gitignore` recusa `*.pem`, `*.key` e `chave-privada*`, mas não conte só com isso.
- `banners/dados.json` (com as licenças plenas) também fica fora do repositório.

## Marcas de autoria

- Cabeçalho de copyright em todos os arquivos de código.
- Comentário de autoria na primeira linha de cada arquivo gerado.
- Nome do autor dentro do runtime empacotado (`PsiLicenca.autor`), que não leva comentários.
- Marca invisível na barra colorida do rodapé de cada banner: as iniciais do autor em caracteres de largura zero.

## Limites

O script roda no navegador e o código é público. Quem editar o código consegue retirar a verificação. A licença proíbe isso, e a adulteração serve de prova de má-fé, mas a proteção é de dissuasão e de prova, não de bloqueio. Cópias publicadas no GitHub são removidas por notificação de direitos autorais (DMCA) ao GitHub.
