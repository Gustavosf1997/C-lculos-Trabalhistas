# Cálculos Trabalhistas

Ferramenta web para cálculos trabalhistas. O primeiro módulo é o de **verbas rescisórias**.

Esboço (v0.1): sem dependências, sem build. É HTML + CSS + JavaScript (ES modules).

## Como executar

```bash
npx http-server -p 8080 -c-1 .     # ou: python3 -m http.server 8080
```

Depois abra <http://localhost:8080>.

Os cálculos rodam no navegador — nenhum dado é enviado para servidor.

## Testes

```bash
node --test tests/calculo.test.mjs
```

## Estrutura

| Arquivo | Papel |
| --- | --- |
| `index.html` | Tela única: seleção do tipo de rescisão + formulário + painel de resultado |
| `assets/estilos.css` | Estilos |
| `src/tipos.js` | Catálogo dos tipos de rescisão: verbas devidas, opções de aviso, campos exibidos e regras de FGTS |
| `src/calculo.js` | Motor de cálculo (módulo puro, sem DOM) |
| `src/tabelas.js` | Tabelas de INSS, IRRF e parâmetros do FGTS |
| `src/app.js` | Interface: monta os campos conforme o tipo e apresenta a memória de cálculo |
| `tests/calculo.test.mjs` | Testes do motor de cálculo |

Para acrescentar um tipo de rescisão (contrato de experiência, rescisão indireta,
morte do empregado, término de contrato por prazo determinado), basta adicionar
uma entrada em `src/tipos.js`.

## O que já está implementado

Tipos de rescisão: **iniciativa do empregador**, **pedido de demissão**,
**comum acordo (art. 484-A)** e **justa causa**.

Verbas e descontos:

- saldo de salário pelos dias trabalhados no mês;
- aviso prévio proporcional (30 dias + 3 por ano, máx. 90 — Lei 12.506/2011),
  indenizado, trabalhado, pela metade (comum acordo) ou descontado (pedido de
  demissão não cumprido), com projeção do contrato quando indenizado;
- 13º proporcional em avos (fração de 15 dias ou mais);
- férias vencidas (com opção de dobro do art. 137) e proporcionais, ambas + 1/3,
  com redução por faltas injustificadas (art. 130);
- INSS progressivo, com cálculo em separado sobre o 13º;
- IRRF pelo modelo mais favorável (deduções legais x desconto simplificado);
- pensão alimentícia, adiantamentos e outros descontos;
- FGTS: depósito de 8% sobre as verbas salariais, multa de 40% ou 20%, saque e
  seguro-desemprego.

## Limitações conhecidas

- **As tabelas de INSS e IRRF em `src/tabelas.js` são de referência (2025) e
  precisam ser conferidas e atualizadas antes de qualquer uso oficial.**
- Não trata contrato por prazo determinado/experiência, rescisão indireta,
  empregado doméstico, rural ou estabilidades (gestante, CIPA, acidentária).
- Não aplica convenção coletiva (multa normativa, pisos, adicionais próprios).
- Não gera TRCT nem guias (GRRF, DARF, GPS) e não persiste os cálculos.
- A pensão alimentícia é aplicada como percentual único sobre o total das
  verbas; casos reais dependem do que consta na decisão judicial.

Os valores são estimativas e não substituem a homologação nem a orientação de
um profissional.
