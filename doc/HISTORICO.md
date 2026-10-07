# Histórico de versões, falhas e dificuldades

Este registro cobre o script da sala (`banners/src/psi-sala.js`) e o runtime de animação dos banners (`banners/src/psi-banners.js`). Ele não contém endereços do AVA, identificadores de cursos ou de usuários, nem outros dados internos. Os exemplos usam datas e valores fictícios.

O repositório git foi criado depois das versões abaixo. Por isso os commits agrupam o estado final por componente, e a cronologia está registrada aqui.

**Ambiente:** Moodle 3.11, formato Tiles, plugin de restrição "Data relativa" (availability_relativedate). Sem acesso de administrador do site.

---

## Script da sala

### v1 a v3: conclusão automática por rótulo

- **Objetivo inicial:** marcar como concluído um rótulo de cada bloco quando a restrição liberasse, e mostrar o prazo nos blocos ainda restritos.
- **Dificuldade:** os banners não ficam em rótulos, e sim na descrição de cada seção.
  - **Solução:** um "rótulo-marco" por seção e o banner principal na seção Geral.
- **Dificuldade:** a sala é um modelo replicado, então o cmid de cada rótulo muda de cópia para cópia.
  - **Solução:** localizar o marco pelo texto e pela classe, com cache do cmid por curso.

### v4 e v5: Moodle 3.11 e limite do plugin

- **Falha:** o serviço de estado do curso usado nas versões novas do Moodle não existe na 3.11.
  - **Solução:** usar o serviço de conclusão manual pelo endpoint AJAX padrão.
- **Dificuldade (principal do projeto):** o campo do número no plugin "Data relativa" tem um máximo. 20 dias funcionam, 80 não.
  - **Solução:** usar dias até o limite e, acima dele, semanas arredondadas para baixo. O servidor nunca libera depois do dia certo, no máximo 6 dias antes (a "folga"), e o script segura o bloco até o dia exato (matrícula + D dias).
  - O limite foi confirmado depois em 59, o que mudou 40 dias de "5 semanas" para "40 dias".
- **Falha:** o id do curso era lido como 0, e as buscas das páginas das seções davam 404.
  - **Solução:** ler o id da classe `course-N` do `<body>`.
- **Falha:** a matrícula ficava "nenhuma" porque o script rodava antes de os tiles existirem.
  - **Solução:** novas tentativas a cada mudança do DOM.

### v6 e v7: vários alunos e falso bloqueio

- **Falha:** uma disciplina já liberada foi travada por engano. O script leu uma data qualquer do conteúdo da seção como se fosse a data da restrição.
  - **Solução:** aceitar só datas de tooltips e janelas do Tiles, e descartar qualquer matrícula calculada no futuro.
- **Requisito:** a sala tem muitos alunos.
  - **Solução:** a matrícula é calculada pelo tooltip do próprio aluno (o Moodle calcula a data por usuário), com cache por curso + usuário. O cache é corrigido sempre que um tile restrito mostra outra data.

### v8 e v9: visual igual ao do plugin

- **Falha:** a pílula do script aparecia diferente da do plugin, numa coluna alta e com outras cores.
  - **Solução:** replicar a marcação real do tile restrito do Tiles: classes, `.availabilityinfo > .badge.badge-info`, cadeado no canto e tooltip do Bootstrap com "Restrito · Disponível se: De <dia mês ano, hora>".
- **Detalhe:** o tooltip do plugin é reescrito com a data exata. A data original fica guardada antes, para o cálculo da matrícula continuar usando a data do plugin.

### v10: acesso por link direto durante a folga (abordagem descartada)

- **Falha:** durante a folga, a seção aberta por link mostrava o conteúdo antes do dia exato.
- **Tentativa:** "liberadores", rótulos extras concluídos pelo script e uma restrição composta (Data relativa E (liberador OU garantia)).
- **Descartada:** gerava trabalho extra de configuração e saía do padrão da sala.

### v11: a seção se trava sozinha

- **Solução adotada:** o banner da disciplina roda dentro da seção.
  - As atividades nascem ocultas (`psi-verificando`) até a data ser conferida.
  - Antes do dia exato, a seção mostra só o aviso de restrição com a data exata.
  - A matrícula vem do cache. Sem cache, vem da página inicial do curso buscada em segundo plano.
  - Cada seção continua com uma única condição no Moodle.

### v12: navegação e fim da conclusão automática

- **Decisão:** a conclusão automática por rótulo-marco não era viável e foi removida. A liberação passou a depender só da data.
- **Requisito:** da disciplina anterior, o aluno não pode chegar a uma disciplina ainda na folga.
  - **Solução:** setas, links `…&section=N` e o menu "Ir para" que apontam para uma seção travada levam à seção Pesquisa de Satisfação. Estando na Pesquisa, levam à última disciplina liberada.
- **Falha:** `textContent` junta o texto dos elementos sem espaço (ex.: "Psicossexual" + "Libera"). O nome da disciplina deixava de ser reconhecido depois que a pílula era inserida, inclusive na leitura da página inicial.
  - **Solução:** leitura do texto nó a nó, com espaço entre eles.

### v13: menu lateral

- **Falha:** o menu lateral do tema listava a disciplina na folga como se estivesse liberada.
  - **Solução:** esconder a entrada (itens de seção do Moodle, `data-type="30"`) até o dia exato.
  - O mesmo menu passou a alimentar o mapa seção → disciplina nas páginas de seção.

### Limite que permanece

O link direto de uma atividade (`mod/…`) não carrega o banner da seção. Nos dias de folga, a atividade abre. Fechar esse caso exige o script no HTML adicional do site ou outra condição na restrição.

---

## Runtime de animação dos banners

### v6: glifo tripe congelava as animações

- **Sintoma:** os banners com o glifo "tripé" (uma disciplina e uma seção de prática) às vezes não terminavam de carregar: glifo sem desenho e fundo pela metade.
- **Diagnóstico:** carregamento repetido no Chrome sem interface, com o console registrado. Apareceu `TypeError: Cannot read properties of undefined (reading '0')` em 4 de 16 cargas.
- **Causa:**
  - O carimbo do 1º quadro do `requestAnimationFrame` pode ser anterior ao início registrado do banner, então o tempo `t` ficava negativo.
  - No tripé, `(t * 0.22) % 1` negativo gerava o índice -1, e a leitura de `V[-1]` lançava a exceção.
  - A exceção interrompia o loop antes de reagendar, e todas as animações da página paravam.
- **Correção:**
  - `t = max(0, …)`;
  - módulo positivo no índice;
  - cada banner roda em `try/catch`, para que um erro tire só aquele banner do loop.
- **Verificação:** 0 erros em 75 cargas (24 banners mais a prévia, 3 vezes cada). Há um teste automatizado que reproduz o quadro com tempo negativo.

### v7: versão pública (dados separados do código)

- **Dificuldade:** publicar o projeto sem expor dados da instituição. Nome, logo, textos do curso, regras de avaliação e horário dos encontros estavam fixos no gerador e no runtime.
- **Solução:**
  - marca (nome e logo), chips comuns das disciplinas e agenda do encontro ao vivo passaram para o arquivo de dados;
  - a agenda chega ao runtime pela classe `psi-ag-<dia>-<início>-<fim>`;
  - os dados reais ficam fora do repositório; o repositório traz `dados.exemplo.json`, com conteúdo fictício e retratos em monograma.
- **Verificação:** os banners de produção gerados com os dados reais saíram idênticos aos anteriores, fora o runtime e a nova classe de agenda.

---

## Dificuldades de desenvolvimento

- **Filtros do Moodle:** o runtime vai empacotado em base64 dentro de `new Function(atob(...))`, para que os filtros de texto (URLs, emoticons, glossário) e o editor não alterem o código.
- **Sem acesso de administrador:** tudo precisa funcionar a partir da descrição das seções. Não há HTML adicional do site nem plugins novos.
- **Testes fora do AVA:** foram feitos com jsdom e com a marcação real dos tiles, usando dados fictícios. O comportamento final foi validado no Moodle com aluno de teste, ajustando a data de inscrição e com `?psiDebug=1&psiAgora=…`.
