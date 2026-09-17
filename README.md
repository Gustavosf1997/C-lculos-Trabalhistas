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
| `src/pedidos.js` | Motor dos pedidos — hoje, horas extras (módulo puro) |
| `src/tabelas.js` | Tabelas de INSS, IRRF, salário mínimo e parâmetros do FGTS |
| `src/formato.js` | Leitura e escrita de números e datas no padrão brasileiro |
| `src/campos.js` | Máscara, validação e marcação de erro nos campos |
| `src/app-rescisao.js` | Interface da aba de verbas rescisórias |
| `src/app-pedidos.js` | Interface da aba de pedidos |
| `tests/*.test.mjs` | Testes dos motores de cálculo e dos formatos |
| `tests/interface.mjs` | Verificação da interface no navegador (Playwright) |

Para acrescentar um tipo de rescisão (rescisão indireta, morte do empregado,
culpa recíproca, encerramento da empresa), basta adicionar uma entrada em
`src/tipos.js`: os cards, os campos exibidos e as regras de FGTS saem de lá.

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

- saldo de salário pelos dias trabalhados no mês;
- aviso prévio proporcional (30 dias + 3 por ano, máx. 90 — Lei 12.506/2011),
  indenizado, trabalhado, pela metade (comum acordo) ou descontado (pedido de
  demissão não cumprido), com projeção do contrato quando indenizado;
- adicionais legais escolhidos por marcação, cada um com percentual e base
  próprios: insalubridade de 10%, 20% ou 40% sobre o salário mínimo,
  periculosidade de 30% e transferência de 25% sobre o salário base, e
  adicional noturno de 20% sobre as horas noturnas informadas — insalubridade
  e periculosidade se excluem (art. 193, §2º);
- 13º proporcional em avos (fração de 15 dias ou mais);
- férias vencidas (com opção de dobro do art. 137) e proporcionais, ambas + 1/3,
  com redução por faltas injustificadas (art. 130);
- descontos marcados na tela, cada um com o seu campo: horas negativas
  (salário base ÷ divisor, multiplicado pelas horas), adiantamento de salário,
  adiantamento do 13º, pensão alimentícia e outros descontos — ou "não há
  descontos", que limpa a seleção;
- INSS progressivo, com cálculo em separado sobre o 13º;
- IRRF pelo modelo mais favorável (deduções legais x desconto simplificado);
- pensão alimentícia, adiantamentos e outros descontos;
- indenização da rescisão antecipada: metade da remuneração dos dias que
  faltavam até o termo final, paga pelo empregador (art. 479) ou descontada do
  empregado (art. 480);
- FGTS: depósito de 8% sobre as verbas salariais, multa de 40% ou 20%, saque e
  seguro-desemprego.

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

Começa pelas **horas extras**. O cálculo parte da hora normal — base de cálculo
dividida pelo divisor da jornada (220 para 44h semanais, 200 para 40h e assim
por diante, conforme a Súmula 431 do TST; o campo é editável para categorias
com divisor próprio, como a bancária).

A base de cálculo integra as parcelas de natureza salarial (Súmula 264 do TST),
entre elas o **adicional de insalubridade** (10%, 20% ou 40%, sobre o salário
mínimo, sobre o salário base ou sobre a base que a norma coletiva fixar) e o
**adicional de periculosidade** (30% sobre o salário base, art. 193, §1º). Os
dois não se acumulam (art. 193, §2º), então a tela pede um ou outro.

Sobre isso incidem o adicional de hora extra (50% por padrão), o **DSR**
(Lei 605/49) e os reflexos em 13º, férias + 1/3, FGTS, multa de 40% e aviso
prévio — cada um ligável e desligável. A repercussão do DSR majorado nas demais
verbas segue a OJ 394, II, da SDI-1, válida para horas extras a partir de
20/03/2023; a tela avisa quando o período pedido começa antes desse marco.
Informada a data do ajuizamento, avisa também sobre a prescrição quinquenal.

Próximos pedidos previstos na tela: adicional noturno, intervalo intrajornada,
insalubridade/periculosidade como pedido autônomo e as multas dos arts. 467 e 477.

## Limitações conhecidas

- **As tabelas de INSS e IRRF em `src/tabelas.js` são de referência (2025) e
  precisam ser conferidas e atualizadas antes de qualquer uso oficial.**
- Quando o aviso indenizado projeta o contrato para o ano seguinte, o 13º de
  cada ano é calculado em separado, mas o INSS e o IRRF incidem sobre a soma.
- As faltas injustificadas reduzem todos os períodos de férias informados, e
  não apenas o período aquisitivo em que ocorreram.
- A insalubridade é calculada sobre o salário mínimo (art. 192 da CLT); norma
  coletiva que fixe outra base precisa ser ajustada em `src/adicionais.js`.
- O adicional noturno não aplica a hora noturna reduzida de 52min30s
  (art. 73, §1º).
- O salário-hora, usado nas horas negativas e no adicional noturno, sai do
  salário base dividido pelo divisor informado — não inclui adicionais nem
  médias de variáveis.
- Não trata rescisão indireta, culpa recíproca, morte do empregado, empregado
  doméstico, rural ou estabilidades (gestante, CIPA, acidentária).
- Não inclui a indenização do art. 479 na base do FGTS (tema controvertido) e
  não calcula a redução do art. 480 por prejuízo comprovado — usa sempre o teto
  do art. 479.
- Não aplica convenção coletiva (multa normativa, pisos, adicionais próprios).
- Não gera TRCT nem guias (GRRF, DARF, GPS) e não persiste os cálculos.
- Nos pedidos, não há juros nem correção monetária, e o período usa uma única
  média de horas extras e um único salário — períodos com jornadas ou salários
  diferentes precisam ser calculados em separado.
- A pensão alimentícia é aplicada como percentual único sobre o total das
  verbas; casos reais dependem do que consta na decisão judicial.

Os valores são estimativas e não substituem a homologação nem a orientação de
um profissional.
