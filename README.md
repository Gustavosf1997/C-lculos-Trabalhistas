# Cálculos Trabalhistas

Ferramenta web para cálculos trabalhistas, em duas abas:

- **Verbas rescisórias** (`index.html`) — o acerto da rescisão;
- **Cálculo de pedidos** (`pedidos.html`) — os pedidos de uma reclamatória.

Esboço (v0.1): sem dependências, sem build. É HTML + CSS + JavaScript (ES modules).

## Como executar

```bash
npx http-server -p 8080 -c-1 .     # ou: python3 -m http.server 8080
```

Depois abra <http://localhost:8080>.

O cabeçalho mostra a versão e a data da última atualização — o texto é escrito
pelo próprio JavaScript, então serve de prova de que a página carregou os
arquivos atuais. Se a data não confere com a do `src/versao.js`, o que está
sendo servido é antigo.

O `-c-1` desliga o cache do servidor. Sem ele, o navegador pode guardar uma
versão antiga do JavaScript e a tela aparece incompleta — nesse caso, recarregue
com `Ctrl+Shift+R` (`Cmd+Shift+R` no Mac). As páginas avisam quando isso
acontece: se um grupo montado por JavaScript ficar vazio, aparece um alerta
pedindo a recarga.

Os cálculos rodam no navegador — nenhum dado é enviado para servidor.

## Testes

```bash
node --test tests/*.test.mjs
```

Há ainda duas verificações no navegador. Precisam do servidor no ar e do
Playwright instalado:

```bash
npx http-server -p 8080 -c-1 . &
node tests/interface.mjs    # máscaras, validação, visibilidade e valores na tela
node tests/robustez.mjs     # uso adverso: troca de modalidade, lixo, limpar, PDF
```

A versão portátil tem a sua própria verificação, que não precisa de servidor
— ela abre o arquivo como o usuário abriria, por `file://`:

```bash
node tests/portatil.mjs
```

`robustez.mjs` não confere valores — confere que a ferramenta não quebra.
Dirige o formulário como um usuário apressado (troca de modalidade no meio do
preenchimento, digita letras, estoura limites, limpa, marca e desmarca tudo) e
vigia três coisas: nenhuma exceção ou erro de console, nenhum `NaN`,
`undefined` ou `[object Object]` na tela, e todo valor em reais no formato
brasileiro com o total batendo com a soma das linhas.

## Versão portátil (arquivo único)

Além da versão web, há um **único arquivo `.html`** que roda sem instalação,
sem servidor e sem internet:

```
portatil/calculos-trabalhistas.html
```

Dois cliques e ele abre no navegador que a pessoa já tem. Pode ir em pen
drive, anexo de e-mail ou pasta de rede — não depende de nenhum outro
arquivo. Nada é gravado fora dele: o que foi digitado se perde ao fechar a
aba, e para guardar um cálculo usa-se o botão **Gerar PDF**.

Para regerá-lo depois de mexer no código:

```bash
node ferramenta/empacotar.mjs
```

O empacotador resolve três coisas que separam a versão web da portátil:

- **módulos ES não abrem por `file://`.** Os módulos são reunidos em um
  script clássico, cada um dentro do seu próprio escopo — `arredondar` e
  `num` existem em três arquivos e não podem se atropelar;
- **as duas páginas repetem ids** (`#formulario`, `#resultado`, `#gerar-pdf`
  e outros cinco). Cada aba vira um `<template>` e só uma está no documento
  por vez, o que faz a colisão desaparecer em vez de ser contornada;
- **as abas navegavam para outro arquivo.** Viram troca de template, com o
  endereço (`#rescisao`, `#pedidos`) acompanhando, de modo que voltar e
  avançar do navegador continuam funcionando.

O arquivo gerado é versionado no repositório, para que se possa baixá-lo sem
ter Node instalado. `tests/portatil.mjs` confere que ele ainda corresponde ao
código-fonte — se alguém mexer em um sem regerar o outro, o teste acusa.

## Estrutura

| Arquivo | Papel |
| --- | --- |
| `index.html` | Aba de verbas rescisórias: tipo de rescisão + formulário + resultado |
| `pedidos.html` | Aba de pedidos da reclamatória |
| `assets/estilos.css` | Estilos das duas páginas (paleta em `:root`, marca `#ffc600`) |
| `src/tipos.js` | Catálogo dos tipos de rescisão: verbas devidas, opções de aviso, campos exibidos e regras de FGTS |
| `src/calculo.js` | Motor das verbas rescisórias (módulo puro, sem DOM) |
| `src/adicionais.js` | Catálogo dos adicionais legais, com percentual, base e exclusões |
| `src/descontos.js` | Catálogo dos descontos escolhíveis e o salário-hora |
| `src/pedidos/catalogo.js` | Catálogo dos pedidos: cards, grupos de campos e resumo de cada um |
| `src/pedidos/comum.js` | Base compartilhada dos pedidos: hora normal, prescrição, reflexos e fechamento |
| `src/pedidos/horas-extras.js` | Horas extras, DSR e reflexos (módulo puro) |
| `src/pedidos/noturno.js` | Adicional noturno, com a hora reduzida do art. 73, §1º |
| `src/pedidos/intervalo.js` | Intervalo intrajornada nos dois regimes do art. 71, §4º |
| `src/pedidos/insalubridade.js` | Insalubridade e periculosidade como pedido autônomo |
| `src/pedidos/multas.js` | Multas dos arts. 467 e 477, §8º, da CLT |
| `src/prescricao.js` | Prescrição bienal e quinquenal, comum às duas telas (módulo puro, sem dependências) |
| `src/tabelas.js` | Tabelas de INSS, IRRF, salário mínimo e parâmetros do FGTS |
| `src/formato.js` | Leitura e escrita de números e datas no padrão brasileiro |
| `src/memoria.js` | Memória de cálculo para impressão e PDF |
| `src/campos.js` | Máscara, validação e marcação de erro nos campos |
| `src/app-rescisao.js` | Interface da aba de verbas rescisórias |
| `src/app-pedidos.js` | Interface da aba de pedidos |
| `tests/*.test.mjs` | Testes dos motores de cálculo e dos formatos |
| `tests/revisao.test.mjs` | Testes da revisão de fórmulas: cada um fixa uma regra legal conferida |
| `tests/prescricao.test.mjs` | Prescrição nas três telas: rescisão, pedidos com período e multas |
| `tests/consistencia.test.mjs` | Consistência entre catálogo, HTML e módulos: ids repetidos, campo que o código lê e a tela não tem, limites invertidos |
| `tests/robustez.mjs` | Uso adverso das duas telas no navegador (Playwright) |
| `tests/portatil.mjs` | Abre o arquivo portátil por `file://` e confere que a conta dá o mesmo |
| `ferramenta/empacotar.mjs` | Gera a versão portátil de arquivo único |
| `portatil/calculos-trabalhistas.html` | A versão portátil, gerada — não editar à mão |
| `tests/interface.mjs` | Verificação da interface no navegador (Playwright) |

Para acrescentar um tipo de rescisão (rescisão indireta, morte do empregado,
culpa recíproca, encerramento da empresa), basta adicionar uma entrada em
`src/tipos.js`: os cards, os campos exibidos e as regras de FGTS saem de lá.

Para acrescentar um pedido, o caminho é o mesmo: um módulo de cálculo em
`src/pedidos/` e uma entrada em `src/pedidos/catalogo.js` declarando os grupos
de campos. O formulário de `pedidos.html` é montado a partir desse catálogo —
não há HTML por pedido.

## O que já está implementado

Contrato por prazo **indeterminado**: iniciativa do empregador, pedido de
demissão, comum acordo (art. 484-A) e justa causa.

Contrato por prazo **determinado (inclusive experiência)**: término no prazo,
rescisão antecipada pelo empregador (art. 479) e rescisão antecipada pelo
empregado (art. 480). Nesses casos o formulário pede a data do termo final e
oferece a cláusula assecuratória do art. 481 — ao marcá-la, o cálculo passa a
seguir as regras do contrato por prazo indeterminado (entra o aviso prévio,
sai a indenização dos arts. 479/480).

Verbas e descontos:

- saldo de salário pelos dias efetivamente trabalhados no último mês —
  contados a partir da admissão quando ela cai nesse mesmo mês, e pagos como
  mês cheio (30/30) quando o mês foi trabalhado por inteiro, inclusive em
  fevereiro — sobre o salário base e os adicionais, sem as médias de variáveis;
- aviso prévio proporcional (30 dias + 3 por ano, máx. 90 — Lei 12.506/2011),
  indenizado, trabalhado, pela metade (comum acordo) ou descontado (pedido de
  demissão não cumprido), com projeção do contrato quando indenizado. A
  proporcionalidade existe em favor do empregado: **ele só pode ser obrigado a
  cumprir 30 dias em serviço**, e o que passar disso é lançado como indenizado
  e projeta o contrato (Nota Técnica 184/2012 da SRT/MTE). Quem pede demissão
  deve 30 dias, não o proporcional;
- horas extras do mês da rescisão informadas em quantidade, não em média:
  viram verba própria, calculadas pela hora normal (salário e adicionais
  divididos pelo divisor, Súmula 264 do TST) acrescida do adicional — 50% por
  padrão, editável;
- adicionais legais escolhidos por marcação, cada um com percentual e base
  próprios: insalubridade de 10%, 20% ou 40% sobre o salário mínimo,
  periculosidade de 30% e transferência de 25% sobre o salário base, e
  adicional noturno de 20% sobre as horas noturnas informadas — insalubridade
  e periculosidade se excluem (art. 193, §2º);
- 13º proporcional em avos (fração de 15 dias ou mais);
- férias vencidas (com opção de dobro do art. 137) e proporcionais, ambas + 1/3,
  com redução por faltas injustificadas (art. 130). Os períodos vencidos são
  informados por quem calcula — a ferramenta não tem como saber quais férias
  foram gozadas —, e o painel mostra quantos períodos entraram na conta;
- as duas contagens de avos seguem regras diferentes, como na lei: os avos de
  **férias** correm em ciclos mensais a partir do dia da admissão, e o ciclo
  aberto na saída só vira avo com fração superior a 14 dias *dentro dele*
  (art. 146, parágrafo único); os avos do **13º** seguem o mês de competência
  do calendário, com fração igual ou superior a 15 dias no mês
  (Lei 4.090/62, art. 1º, §2º);
- descontos marcados na tela, cada um com o seu campo: horas negativas
  (salário base ÷ divisor, multiplicado pelas horas), adiantamento de salário,
  adiantamento do 13º, pensão alimentícia e outros descontos — ou "não há
  descontos", que limpa a seleção;
- INSS progressivo, com cálculo em separado sobre o 13º;
- IRRF pelo modelo mais favorável (deduções legais x desconto simplificado),
  já com o redutor da Lei 15.270/2025: rendimento mensal de até R$ 5.000,00 não
  paga imposto, e entre R$ 5.000,01 e R$ 7.350,00 o redutor decresce até zerar;
- pensão alimentícia, adiantamentos e outros descontos;
- indenização da rescisão antecipada: metade da remuneração dos dias que
  faltavam até o termo final, paga pelo empregador (art. 479) ou descontada do
  empregado (art. 480);
- FGTS: depósito de 8% sobre as verbas salariais, multa de 40% ou 20%, saque e
  seguro-desemprego.

## PDF da memória de cálculo

O botão **Gerar PDF** monta um documento próprio — cabeçalho com a modalidade e
a data de emissão, os dados informados, o resultado completo e o aviso legal —
e abre a janela de impressão do navegador, onde se escolhe "Salvar como PDF".
Não há biblioteca envolvida: a folha de estilos tem um bloco `@media print` que
esconde a interface e imprime só a memória. O botão fica desabilitado enquanto
o cálculo não fecha.

## Campos e validação

Todos os campos digitáveis são de texto com máscara, e não campos nativos de
data ou número — assim o formato não depende do idioma do navegador:

- **datas** em `dd/mm/aaaa`, com as barras inseridas durante a digitação;
  data inexistente (31/02, por exemplo) é recusada. Data colada de outro
  sistema no formato ISO (`2024-03-15`) é virada sozinha para `15/03/2024`;
- **valores e quantidades** em padrão brasileiro: vírgula decimal e ponto de
  milhar (`3.500,75`). Quem digita `12.5` recebe `12,5`; quem cola `1.234`
  recebe mil duzentos e trinta e quatro, pela regra das três casas;
- **letras e símbolos são descartados na digitação**, de modo que nenhum campo
  chega ao cálculo com conteúdo inválido;
- **limites** por campo (`data-min` / `data-max` no HTML): percentual de pensão
  até 100, dias úteis até 31, divisor até 999 e assim por diante.

Não há botão de calcular: o resultado acompanha a digitação, campo a campo.
Campo inválido fica destacado em vermelho, com a mensagem abaixo dele, e o
cálculo é interrompido enquanto durar o erro — em vez de seguir com zero.
Campo escondido pela modalidade escolhida não bloqueia nem entra na conta.

O tipo de cada campo é declarado no HTML (`data-campo="data|moeda|decimal|inteiro"`)
e `src/campos.js` cuida do resto.

## Módulo de pedidos

Cinco pedidos, escolhidos no cartão do topo. Cada um monta o seu próprio
formulário a partir de `src/pedidos/catalogo.js` e mostra, ao ser escolhido, o
que entra e o que não entra na conta.

O que é comum a todos eles:

- **hora normal** — base de cálculo dividida pelo divisor da jornada (220 para
  44h semanais, 200 para 40h e assim por diante, conforme a Súmula 431 do TST;
  o campo é editável para categorias com divisor próprio, como a bancária);
- **base de cálculo** integrando as parcelas de natureza salarial (Súmula 264
  do TST), entre elas o **adicional de insalubridade** (10%, 20% ou 40%, sobre
  o salário mínimo, sobre o salário base ou sobre a base que a norma coletiva
  fixar) e o **adicional de periculosidade** (30% sobre o salário base,
  art. 193, §1º). Os dois não se acumulam (art. 193, §2º), então a tela pede um
  ou outro;
- **reflexos** em 13º, férias + 1/3, FGTS, multa de 40% e aviso prévio, cada um
  ligável e desligável. O FGTS incide só sobre as parcelas salariais que aquele
  pedido apurou — a linha do resultado diz quais são. As férias são o ponto que
  depende do caso: **gozadas** no curso do contrato, elas e o terço integram a
  base do FGTS (art. 15 da Lei 8.036/90, que não as exclui); **indenizadas**,
  não. A escolha fica em uma marcação própria, ligada por padrão, que é o que
  acontece num período dentro do contrato;
- **prescrição**, apurada antes de qualquer conta quando a data do ajuizamento
  é informada (veja abaixo);
- **o período em meses**, contado competência a competência: mês inteiro vale
  1, mês partido vale a fração dos seus próprios dias. De 01/01 a 31/12 dá 12
  exatos; de 20/01 a 10/03 dá 1,71, e não 1. A regra dos 15 dias conta *avos*
  de 13º e de férias, que são direitos adquiridos por mês de serviço — uma
  verba que se repete todo mês é devida na proporção do tempo;
- **avisos de coerência** entre as datas: período que avança para depois do
  ajuizamento ou do fim do contrato é apontado, sem barrar o cálculo.

Os valores são **brutos**: não há juros, correção monetária nem os descontos de
INSS e IRRF, que se apuram na execução.

### Horas extras (art. 7º, XVI, da CF)

Hora normal acrescida do adicional (50% por padrão, editável), com **DSR**
(Lei 605/49). A repercussão do DSR majorado nas demais verbas segue a
OJ 394, II, da SDI-1, válida para horas extras a partir de 20/03/2023; a tela
avisa quando o período pedido começa antes desse marco. A quantidade pode ser
informada por mês ou por semana.

### Adicional noturno (art. 73 da CLT)

Trabalho entre 22h e 5h, com **hora noturna reduzida de 52min30s**
(art. 73, §1º): as horas de relógio informadas viram horas fictas na razão
60/52,5 antes de receberem o adicional — 30 horas de relógio são 34,29 horas
fictas. O percentual é editável (20% no urbano, 25% no rural da
Lei 5.889/73). A hora normal sobre a qual o adicional incide já vem integrada
pelas demais parcelas salariais, entre elas a insalubridade e a periculosidade
(Súmulas 60, I, e 264 do TST). Gera DSR e reflexos. A prorrogação da jornada
noturna (Súmula 60, II, do TST) não é somada sozinha: informe as horas já
somadas.

### Intervalo intrajornada (art. 71, §4º, da CLT)

Dois regimes, escolhidos na tela, porque a Lei 13.467/2017 mudou a regra:

- **até 10/11/2017** — Súmula 437, I e III, do TST: paga-se o **intervalo
  integral**, ainda que a supressão seja parcial, com natureza salarial e
  reflexos;
- **a partir de 11/11/2017** — paga-se **apenas o período suprimido**, com
  acréscimo de 50% e natureza **indenizatória**: sem reflexos e sem FGTS.

Quando o período pedido cruza o marco, a tela avisa que os dois trechos
precisam ser calculados em separado.

### Insalubridade / periculosidade (arts. 192 e 193 da CLT)

O adicional como pedido autônomo, e não como integrante de outra verba.
Insalubridade em grau mínimo (10%), médio (20%) ou máximo (40%), sobre o
salário mínimo (art. 192, redação da CLT), sobre o salário base ou sobre a base
que a norma coletiva fixar; periculosidade de 30% sobre o salário base
(art. 193, §1º). Gera reflexos em 13º, férias + 1/3 e FGTS (Súmulas 132 e 139
do TST). Não há DSR: o adicional é mensal, não por hora trabalhada.

### Multas dos arts. 467 e 477 da CLT

Pedido sem período e sem FGTS:

- **art. 477, §8º** — uma remuneração do empregado quando as verbas
  rescisórias não são pagas em **10 dias** contados do término do contrato
  (prazo único desde a Lei 13.467/2017). A base é a **remuneração** dos
  arts. 457, §1º, e 458 da CLT, e não o salário base: é a tese vinculante do
  Tema 142 de recursos repetitivos do TST, e por isso a tela pede o salário e
  as parcelas habituais em separado. A tela mostra o dia do vencimento e os
  dias de atraso, e a multa **não é cobrada** quando o empregado deu causa à
  mora (parte final do §8º);
- **art. 467** — 50% sobre a parte **incontroversa** das verbas rescisórias
  não paga no comparecimento à Justiça do Trabalho.

### Prescrição

A prescrição é apurada nas **três telas** — verbas rescisórias, pedidos com
período e multas —, sempre antes de qualquer conta. O art. 7º, XXIX, da CF
reúne dois prazos, e a Súmula 308 do TST os harmoniza:

- **bienal** — extinto o contrato, a ação tem de ser ajuizada em dois anos,
  contados do **fim do aviso prévio, inclusive o projetado** quando ele é
  indenizado (OJ 83 da SDI-1). Um aviso de 60 dias pode ser a diferença entre
  uma ação tempestiva e uma prescrita. Perdido o biênio, nada resta a
  calcular: caixa vermelha no lugar do resultado e campos bloqueados;
- **quinquenal** — respeitado o biênio, são exigíveis as parcelas dos cinco
  anos imediatamente anteriores ao **ajuizamento**, e não à extinção do
  contrato (Súmula 308, I).

Os prazos em anos vencem no dia de igual número; faltando esse dia (29 de
fevereiro), no imediato (art. 132, §3º, do Código Civil). Ajuizar no último
dia do biênio é tempestivo; no dia seguinte, não.

Em cada tela:

- **verbas rescisórias** — o biênio corre da data projetada que o próprio
  cálculo já apura. O quinquênio só alcança as **férias vencidas**, que têm
  marco próprio: prescrevem em cinco anos contados do fim do período
  concessivo (art. 149 da CLT). Os períodos não gozados são os últimos
  completos; os mais antigos, com o concessivo encerrado antes do marco
  quinquenal, saem da conta, e uma caixa laranja diz quais. As demais verbas
  nascem com a rescisão e, dentro do biênio, nunca estão prescritas;
- **pedidos com período** — o quinquênio recorta o período pedido; se tudo
  estiver antes do marco, o pedido inteiro está prescrito. Para o biênio,
  informe a extinção do contrato, já com a projeção do aviso;
- **multas dos arts. 467 e 477** — nascem com a rescisão, então só o biênio
  as alcança. Se houve aviso indenizado, informe o fim dele: é de lá que o
  biênio corre.

**Sem a data do ajuizamento**, a ferramenta não afirma prescrição nenhuma — a
ação pode já ter sido proposta —, mas também não fica em silêncio: o resumo
traz a linha "Prescrição" dizendo até quando se pode ajuizar, e, se esse prazo
já passou em relação a hoje, um aviso diz isso com todas as letras.

Quando o impedimento trava a tela, seguem livres só as entradas que podem
afastá-lo: as datas e, na rescisão, o tipo de aviso (o indenizado projeta o
contrato e empurra o biênio). O que está travado aparece esmaecido; o que está
livre, não.

## Base legal conferida

Cada regra de cálculo foi confrontada com a lei, a súmula ou a orientação que
a sustenta, e cada uma tem um teste que a fixa em `tests/revisao.test.mjs`.

| Regra | Fundamento | Onde |
| --- | --- | --- |
| Aviso prévio proporcional: 30 dias + 3 por ano, teto de 90 | Lei 12.506/2011 | `calculo.js` |
| Só 30 dias de aviso podem ser cumpridos em serviço; o excedente é indenizado | Nota Técnica 184/2012 da SRT/MTE | `DIAS_AVISO_TRABALHAVEIS` |
| Aviso indenizado integra o tempo de serviço e projeta o contrato | OJ 82 da SDI-1 e Súmula 305 do TST | `dataProjetada` |
| Avos do 13º pelo mês de competência, fração de 15 dias ou mais | Lei 4.090/62, art. 1º, §2º | `contarAvos` |
| Avos de férias em ciclos da admissão, fração superior a 14 dias | art. 146, parágrafo único, da CLT | `contarAvosFerias` |
| Redução dos dias de férias por faltas injustificadas | art. 130 da CLT | `diasDeFeriasPorFaltas` |
| Justa causa perde 13º e férias proporcionais | art. 3º da Lei 4.090/62 e Súmula 171 do TST | `tipos.js` |
| Comum acordo: aviso e multa do FGTS pela metade, sem seguro-desemprego | art. 484-A da CLT | `tipos.js` |
| Rescisão antecipada do contrato a termo: metade do que faltava | arts. 479 e 480 da CLT | `indenizacaoAntecipada` |
| Cláusula assecuratória afasta os arts. 479/480 e traz o aviso prévio | art. 481 da CLT | `clausulaAtiva` |
| Hora normal integrada pelas parcelas salariais | Súmula 264 do TST | `valorHoraNormal` |
| Divisor mensal conforme a jornada contratada | Súmula 431 do TST | `JORNADAS` |
| Hora noturna reduzida a 52min30s | art. 73, §1º, da CLT | `FATOR_HORA_NOTURNA` |
| Adicional noturno integra o salário e incide sobre a hora já integrada | Súmulas 60, I, e 264 do TST | `noturno.js` |
| DSR sobre as verbas variáveis: variáveis ÷ dias úteis × repousos | Lei 605/49 e Súmula 172 do TST | `dsrMes` |
| Sábado é dia útil não trabalhado para o DSR | Súmula 113 do TST | dica do campo |
| DSR majorado só repercute nas demais verbas a partir de 20/03/2023 | OJ 394, II, da SDI-1 (Tema 9 de repetitivos) | `MARCO_OJ_394` |
| Intervalo suprimido até 10/11/2017: período integral, natureza salarial | Súmula 437, I e III, do TST | `intervalo.js` |
| Intervalo a partir de 11/11/2017: só o suprimido, natureza indenizatória | art. 71, §4º, da CLT (Lei 13.467/2017) | `MARCO_REFORMA` |
| Insalubridade sobre o salário mínimo, salvo base maior em norma coletiva | art. 192 da CLT; Súmula 228 suspensa (Rcl 6.266 do STF) | `calcularAdicionalRisco` |
| Periculosidade de 30% sobre o salário base, sem gratificações e prêmios | art. 193, §1º, da CLT | `calcularAdicionalRisco` |
| Insalubridade e periculosidade não se acumulam | art. 193, §2º, da CLT | `aplicarExclusoes` |
| Adicional de risco repercute em 13º, férias e FGTS | Súmulas 132 e 139 do TST | `insalubridade.js` |
| FGTS sobre férias gozadas e o respectivo terço | art. 15 da Lei 8.036/90, sem exclusão legal | `fecharResultado` |
| Aviso prévio indenizado e férias indenizadas não sofrem INSS nem IRRF | REsp repetitivo 1.230.957 do STJ e Súmula 386 do STJ | `calcularRescisao` |
| 13º proporcional sofre INSS e IRRF, em cálculo separado | art. 7º da Lei 8.620/93 e tributação exclusiva na fonte | `calcularRescisao` |
| Multa do art. 477: uma remuneração, e não o salário base | Tema 142 de repetitivos do TST | `multas.js` |
| Prazo de 10 dias para pagar as verbas rescisórias | art. 477, §6º, da CLT | `PRAZO_477_DIAS` |
| Multa afastada quando o empregado deu causa à mora | parte final do art. 477, §8º | `multas.js` |
| Multa do art. 467: 50% sobre as verbas incontroversas | art. 467 da CLT | `multas.js` |
| Prescrição bienal de dois anos da extinção do contrato | art. 7º, XXIX, da CF | `apurarBienal` |
| O biênio corre do fim do aviso prévio, inclusive o projetado | OJ 83 da SDI-1 do TST | `apurarBienal` |
| Quinquênio contado do ajuizamento, não da extinção | Súmula 308, I, do TST | `marcoQuinquenal` |
| Férias prescrevem em cinco anos do fim do período concessivo | art. 149 da CLT | `fimDoConcessivo` |
| Prazo em anos vence no dia de igual número, ou no imediato | art. 132, §3º, do Código Civil | `limiteBienal` |
| INSS progressivo e teto de R$ 8.475,55 | Portaria Interministerial MPS/MF nº 13, de 09/01/2026 | `tabelas.js` |
| Desconto simplificado substitui as deduções legais quando for melhor | Lei 14.848/2024 | `calcularIRRF` |
| Redutor mensal de R$ 978,62 − 0,133145 × rendimento | Lei 15.270/2025 | `calcularRedutorIRRF` |

## Limitações conhecidas

- **As tabelas em `src/tabelas.js` são as de 2026** — INSS pela Portaria
  Interministerial MPS/MF nº 13, de 09/01/2026 (salário mínimo de R$ 1.621,00,
  teto de R$ 8.475,55) e IRRF com o redutor da Lei 15.270/2025. Confira-as
  contra a fonte oficial antes de qualquer uso profissional, e reveja a cada
  competência.
- O redutor da Lei 15.270/2025 é aplicado também ao 13º salário, tributado em
  separado — é o que orienta a Receita Federal. A regra está isolada em
  `calcularRedutorIRRF`, caso a sua leitura seja outra.
- As faltas injustificadas reduzem todos os períodos de férias informados, e
  não apenas o período aquisitivo em que ocorreram.
- Na aba de rescisão, a insalubridade é calculada sobre o salário mínimo
  (art. 192 da CLT); norma coletiva que fixe outra base precisa ser ajustada em
  `src/adicionais.js`.
- A média de comissões, gorjetas e prêmios integra aviso, 13º e férias, mas não
  o saldo de salário: é média para indenização, não o que o último mês pagou.
- As horas extras informadas são as do mês da rescisão e formam verba própria;
  elas entram nas bases de INSS, IRRF e FGTS do mês, mas não integram aviso,
  13º e férias. Horas extras habituais que devam repercutir nessas verbas ainda
  não têm campo próprio — o módulo de pedidos calcula esses reflexos.
- Na aba de **rescisão**, o adicional noturno não aplica a hora noturna
  reduzida de 52min30s (art. 73, §1º) — o pedido autônomo de adicional noturno,
  na outra aba, aplica.
- A prescrição só é afirmada com a data do ajuizamento; sem ela, a tela diz até
  quando se pode ajuizar e avisa se esse prazo já passou. Nos pedidos, o
  biênio depende também da data de extinção do contrato.
- Não há suspensão nem interrupção de prazo: protesto interruptivo, ação
  anterior arquivada (Súmula 268 do TST) e menoridade (art. 440 da CLT) ficam
  por conta de quem calcula.
- A insalubridade da aba de **rescisão** tem base fixa no salário mínimo; o
  pedido autônomo, na outra aba, aceita as três bases.
- O pedido de intervalo intrajornada calcula um regime por vez: período que
  cruze 11/11/2017 precisa ser dividido em dois cálculos, e a tela avisa disso.
- As multas dos arts. 467 e 477 não apuram a data em que o empregado
  compareceu à audiência nem o que de fato foi pago: o valor incontroverso é
  informado por quem calcula. A remuneração que serve de base à multa do
  art. 477 também é informada, e não deduzida de outro pedido.
- A hora normal do cálculo é uma só: salário e adicionais divididos pelo
  divisor informado. Ela remunera as horas extras e desconta as negativas. O
  adicional noturno incide sobre ela já integrada pelos adicionais de risco;
  médias de variáveis ficam de fora.
- Não trata rescisão indireta, culpa recíproca, morte do empregado, empregado
  doméstico, rural ou estabilidades (gestante, CIPA, acidentária).
- Não inclui a indenização do art. 479 na base do FGTS (tema controvertido) e
  não calcula a redução do art. 480 por prejuízo comprovado — usa sempre o teto
  do art. 479.
- Não aplica convenção coletiva (multa normativa, pisos, adicionais próprios).
- Não gera TRCT nem guias (GRRF, DARF, GPS) e não persiste os cálculos.
- Nos pedidos, não há juros, correção monetária nem desconto de INSS e IRRF, e
  o período usa uma única quantidade mensal e um único salário — períodos com
  jornadas ou salários diferentes precisam ser calculados em separado. O
  cálculo também não faz a evolução salarial ao longo do período: a base
  informada vale para todos os meses.
- O reflexo no aviso prévio indenizado, nos pedidos, não gera avos próprios de
  13º e de férias sobre o período projetado.
- A pensão alimentícia é aplicada como percentual único sobre o total das
  verbas; casos reais dependem do que consta na decisão judicial.

Os valores são estimativas e não substituem a homologação nem a orientação de
um profissional.
