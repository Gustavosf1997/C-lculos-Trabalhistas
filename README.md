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

Há ainda uma verificação da interface no navegador (máscaras, validação e
formato dos campos). Precisa do servidor no ar e do Playwright instalado:

```bash
npx http-server -p 8080 -c-1 . &
node tests/interface.mjs
```

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
| `src/tabelas.js` | Tabelas de INSS, IRRF, salário mínimo e parâmetros do FGTS |
| `src/formato.js` | Leitura e escrita de números e datas no padrão brasileiro |
| `src/memoria.js` | Memória de cálculo para impressão e PDF |
| `src/campos.js` | Máscara, validação e marcação de erro nos campos |
| `src/app-rescisao.js` | Interface da aba de verbas rescisórias |
| `src/app-pedidos.js` | Interface da aba de pedidos |
| `tests/*.test.mjs` | Testes dos motores de cálculo e dos formatos |
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
  demissão não cumprido), com projeção do contrato quando indenizado;
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
  data inexistente (31/02, por exemplo) é recusada;
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
  pedido apurou — a linha do resultado diz quais são;
- **prescrição quinquenal**, apurada antes de qualquer conta quando a data do
  ajuizamento é informada (veja abaixo).

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
Lei 5.889/73). Gera DSR e reflexos. A prorrogação da jornada noturna
(Súmula 60, II, do TST) não é somada sozinha: informe as horas já somadas.

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
  (prazo único desde a Lei 13.467/2017). A tela mostra o dia do vencimento e
  os dias de atraso, e a multa é afastada quando o empregado deu causa à mora;
- **art. 467** — 50% sobre a parte **incontroversa** das verbas rescisórias
  não paga no comparecimento à Justiça do Trabalho.

### Prescrição quinquenal

Informada a data do ajuizamento, o quinquênio do art. 7º, XXIX, da CF é
apurado antes de qualquer conta, em dois desfechos:

- **período inteiro prescrito** — nada a calcular. Caixa vermelha no lugar do
  resultado e demais campos bloqueados; só as datas seguem editáveis, já que é
  por elas que o impedimento se afasta;
- **parte do período prescrita** — o cálculo corre a partir do marco
  quinquenal e só sobre ele. Um aviso no topo do resultado diz quais parcelas
  estão prescritas e qual período foi efetivamente calculado, e o resumo traz
  esse período. O recorte dá o mesmo resultado de pedir o período já ajustado.

## Limitações conhecidas

- **As tabelas em `src/tabelas.js` são as de 2026** — INSS pela Portaria
  Interministerial MPS/MF nº 13, de 09/01/2026 (salário mínimo de R$ 1.621,00,
  teto de R$ 8.475,55) e IRRF com o redutor da Lei 15.270/2025. Confira-as
  contra a fonte oficial antes de qualquer uso profissional, e reveja a cada
  competência.
- O redutor da Lei 15.270/2025 é aplicado também ao 13º salário, tributado em
  separado. O ponto comporta leitura diversa: se a sua for outra, a regra está
  isolada em `calcularRedutorIRRF`.
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
- A insalubridade da aba de **rescisão** tem base fixa no salário mínimo; o
  pedido autônomo, na outra aba, aceita as três bases.
- O pedido de intervalo intrajornada calcula um regime por vez: período que
  cruze 11/11/2017 precisa ser dividido em dois cálculos, e a tela avisa disso.
- As multas dos arts. 467 e 477 não apuram a data em que o empregado
  compareceu à audiência nem o que de fato foi pago: o valor incontroverso é
  informado por quem calcula.
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
- Nos pedidos, não há juros nem correção monetária, e o período usa uma única
  quantidade mensal e um único salário — períodos com jornadas ou salários
  diferentes precisam ser calculados em separado. O cálculo também não faz a
  evolução salarial ao longo do período: a base informada vale para todos os
  meses.
- A pensão alimentícia é aplicada como percentual único sobre o total das
  verbas; casos reais dependem do que consta na decisão judicial.

Os valores são estimativas e não substituem a homologação nem a orientação de
um profissional.
