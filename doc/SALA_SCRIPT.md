# Script da sala (psi-sala.js)

Embutido em todos os banners de `banners/saida/`, junto com o runtime de animação (`psi-banners.js`). Feito para Moodle 3.11 com o formato Tiles.

Não usa cmid nem ids fixos, então serve para qualquer cópia da sala modelo. Validado com aluno de teste.

- Código: [banners/src/psi-sala.js](../banners/src/psi-sala.js)
- Testes: [testes/](../testes/)
- Histórico de falhas: [HISTORICO.md](HISTORICO.md)

## O problema

A restrição usa o plugin "Data relativa" (availability_relativedate), mas o campo do número tem um máximo (59). Com 20 dias funciona; com 80 dias, não.

## A solução (servidor + script)

### 1. No servidor: dias até o limite, depois semanas

Cada seção usa **dias** quando o número cabe no campo. Acima disso, usa **semanas arredondadas para baixo** (`floor(D/7)`). Assim o servidor nunca libera depois do dia certo, no máximo 6 dias antes.

| D | 20 | 40 | 60 | 80 | 100 | 120 | 140 | 160 | 180 | 200 | 220 | 240 | 260 | 280 | 300 | 320 | 340 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| plugin | 20d | 40d | 8s | 11s | 14s | 17s | 20s | 22s | 25s | 28s | 31s | 34s | 37s | 40s | 42s | 45s | 48s |
| folga (dias) | 0 | 0 | 4 | 3 | 2 | 1 | 0 | 6 | 5 | 4 | 3 | 2 | 1 | 0 | 6 | 5 | 4 |

- O limite do campo está em `MAX_DIAS`, em `banners/gerar.js`.
- Para uma seção específica, use o campo `restricao` da disciplina em `banners/dados.json`, por exemplo `"restricao": { "n": 60, "unidade": "dias" }`.
- O que estiver configurado no Moodle tem de ser igual ao que está aqui.

### 2. Data de matrícula

O script calcula a data e a hora de matrícula do aluno a partir do tooltip do selo "Restrito" ("Disponível se: De 21 outubro 2026, 15:59"), menos o período configurado naquela seção.

Com ela, calcula o momento exato de cada bloco: matrícula + D dias, na mesma hora.

### 3. Tile na folga

Entre a liberação do servidor e o dia exato, o tile fica travado com a mesma marcação do tile restrito do Tiles:

- pílula "Libera dd/mm/aaaa";
- cadeado;
- tooltip "Restrito · Disponível se: De 3 fevereiro 2027, 16:18";
- clique bloqueado.

### 4. Tile restrito pelo servidor

Mostra "Libera dd/mm/aaaa". O tooltip passa a mostrar a data exata, e não a das semanas arredondadas.

### 5. Seção aberta por link

O banner da disciplina fica na descrição da seção, então o script roda sempre que a seção aparece: pelo tile, pelo link `…&section=N` ou por um favorito.

- **Enquanto verifica:** as atividades ficam ocultas, sem piscar na tela.
- **Antes do dia exato:** a seção mostra só o aviso de restrição no formato do plugin, com a data exata.
- **Sem cache:** o script consulta a página inicial do curso em segundo plano.

### 6. Navegação

Seta, link ou menu "Ir para" que aponta para uma seção ainda travada:

- mostra a data exata ao passar o mouse;
- ao clicar, leva à seção **Pesquisa de Satisfação**;
- estando na Pesquisa, leva à última disciplina liberada.

Sem a seção da Pesquisa, o clique só é bloqueado.

### 7. Menu lateral

A disciplina travada não aparece no menu da sala (itens de seção do Moodle, `data-type="30"`) até o dia exato.

**Sem conclusão de atividades:** a liberação depende só da data (matrícula + D dias).

## Vários alunos

Cada aluno tem a sua matrícula:

- O script a lê do tooltip do próprio aluno, porque o Moodle calcula a data por usuário.
- Guarda no navegador por curso + usuário (`localStorage "psi-matricula-<curso>-<usuário>"`). Num computador compartilhado, cada login tem a sua.
- Sempre que um tile restrito mostra a data, o cálculo é refeito e o cache é corrigido. Datas que dariam matrícula no futuro são descartadas.

O mapa seção → disciplina fica em `psi-secoes-<curso>`. Ele é lido dos tiles da página inicial ou do menu lateral.

**Quem nunca tem nada travado:**
- professores em modo de edição;
- disciplinas sem prazo (D0);
- a Pesquisa de Satisfação.

## Limite conhecido

O link direto de uma **atividade** (`mod/…/view.php?id=…`) não carrega o banner da seção. Por isso, nos dias de folga (até 6) a atividade abre.

Fechar esse caso exige o script no HTML adicional do site (administrador) ou outra condição na restrição. É raro: o aluno precisaria ter o link da atividade antes de a seção abrir.

## Como gerar

```
node banners/gerar.js
```

O comando regenera `banners/saida/` (um banner por seção e `_runtime_moodle.html`) e `banners/preview.html` (prévia com tiles fictícios).

Os dados vêm de `banners/dados.json`, que fica fora do git. Sem ele, o gerador usa `banners/dados.exemplo.json`. Opções: `--dados=`, `--saida=`, `--preview=` e `--tratadas=`.

Para os testes:

```
cd testes
npm install
npm test
```

## Na sala modelo

1. **Banners:** colar cada `banners/saida/*.html` na **descrição** da seção correspondente (editar seção, editor HTML em modo código). O `00_principal` vai na descrição da seção Geral. Depois de salvar, conferir se o `<script>` final continua lá.
2. **Restrição de cada seção:** "Data relativa" após a data de inscrição do usuário, conforme a tabela acima.
3. **Pesquisa de Satisfação:** criar a seção com esse nome e colar `E_pesquisa.html` na descrição.

**Nas outras salas:** copiar ou restaurar o curso modelo. Nada precisa ser regerado. Não renomeie as seções, porque o script reconhece disciplinas e Pesquisa pelo nome.

## Diagnóstico

| Parâmetro na URL | Efeito |
|---|---|
| `?psiDebug=1` | console com a matrícula calculada (e de onde veio) e, por disciplina, D · plugin · data exata · estado |
| `?psiDebug=1&psiAgora=AAAA-MM-DD` | simula a data de hoje para testar as travas |

Para recalcular, limpe o armazenamento do site no F12 (Aplicativo › Armazenamento local).
