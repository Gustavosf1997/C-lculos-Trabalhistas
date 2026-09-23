/**
 * Teste de robustez das duas telas.
 *
 * Não confere valores: confere que a ferramenta não quebra no uso. Dirige o
 * formulário como um usuário apressado — troca de modalidade no meio do
 * preenchimento, digita lixo, estoura limites, limpa, marca e desmarca tudo —
 * e vigia três coisas o tempo todo:
 *
 *  1. nenhum erro de console ou exceção de página;
 *  2. nenhum "NaN", "undefined", "null" ou "[object Object]" na tela;
 *  3. todo valor em reais no formato brasileiro, e o total batendo com a soma
 *     das linhas.
 *
 * Uso: `npx http-server -p 8080 -c-1 . &` e depois `node tests/robustez.mjs`.
 */

import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://127.0.0.1:8080';
const problemas = [];
const checagens = [];
let falhas = 0;

function checar(nome, condicao, detalhe) {
  if (condicao) {
    checagens.push(`ok    ${nome}`);
  } else {
    falhas += 1;
    checagens.push(`FALHA ${nome}${detalhe === undefined ? '' : ` -> ${JSON.stringify(detalhe)}`}`);
  }
}

const browser = await chromium.launch({ args: ['--lang=pt-BR'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, locale: 'pt-BR' });

page.on('console', (m) => { if (m.type() === 'error') problemas.push(`console: ${m.text()}`); });
page.on('pageerror', (e) => problemas.push(`pageerror: ${e.message}`));
page.on('requestfailed', (r) => problemas.push(`request: ${r.url()} ${r.failure()?.errorText}`));

/* ------------------------------------------------------------ invariantes */

const LIXO = ['NaN', 'undefined', 'null', '[object Object]', 'Invalid Date', 'Infinity'];
const MOEDA = /R\$\s*-?\d{1,3}(\.\d{3})*,\d{2}/;

/** Varre o painel de resultado atrás de sinais de cálculo quebrado. */
async function vistoriar(rotulo) {
  const alvo = page.locator('#resultado');
  if (!(await alvo.count())) return;
  const texto = (await alvo.innerText()).replace(/ /g, ' ');

  for (const lixo of LIXO) {
    if (texto.includes(lixo)) {
      checar(`${rotulo}: sem "${lixo}" na tela`, false, texto.slice(0, 200));
      return;
    }
  }

  // Todo trecho que começa com R$ tem de estar no formato brasileiro.
  const valores = texto.match(/R\$[^\s]*\s*[^\s]*/g) ?? [];
  const torto = valores.find((v) => !MOEDA.test(v));
  if (torto) {
    checar(`${rotulo}: valores em formato brasileiro`, false, torto);
    return;
  }
  checagens.push(`ok    ${rotulo}`);
}

/** Converte "R$ 1.234,56" em 1234.56. */
const numero = (txt) => Number(String(txt).replace(/[^\d,-]/g, '').replace(',', '.'));

/**
 * O total de cada tabela tem de ser a soma das suas linhas.
 *
 * Compara em módulo: a tabela de descontos mostra cada linha com o sinal de
 * menos e o total sem ele, que é como o holerite se lê.
 */
async function conferirSoma(rotulo, seletorTabela) {
  const tabelas = await page.locator(seletorTabela).all();
  for (const [i, tabela] of tabelas.entries()) {
    const linhas = await tabela.locator('tr:not(.total) td:last-child').allInnerTexts();
    const total = await tabela.locator('tr.total td:last-child').innerText().catch(() => null);
    if (total === null || !linhas.length) continue;
    const soma = Math.abs(linhas.reduce((s, t) => s + numero(t), 0));
    const diferenca = Math.abs(soma - Math.abs(numero(total)));
    checar(`${rotulo}: tabela ${i + 1} fecha com o total`, diferenca < 0.05, { soma, total, diferenca });
  }
}

/* ---------------------------------------------- preenchimento automático */

const EXEMPLOS = {
  data: ['01/03/2024', '15/08/2025', '29/02/2024', '31/12/2023'],
  moeda: ['2.500,00', '1.621,00', '0,01', '12.345,67'],
  decimal: ['10,5', '0,5', '40', '7,25'],
  inteiro: ['22', '5', '1', '30'],
};

/** Preenche todos os campos visíveis com valores plausíveis do seu tipo. */
async function preencherTudo(passo = 0) {
  const seletor = '#formulario input[data-campo]:visible:not([disabled])';
  const total = await page.locator(seletor).count();
  for (let i = 0; i < total; i += 1) {
    const campo = page.locator(seletor).nth(i);
    if (!(await campo.count())) break;
    const tipo = await campo.getAttribute('data-campo').catch(() => null);
    if (!tipo) continue;
    const exemplos = EXEMPLOS[tipo] ?? EXEMPLOS.inteiro;
    await campo.fill(exemplos[passo % exemplos.length], { timeout: 2000 }).catch(() => {});
  }
  await page.waitForTimeout(250);
}

/** Digita lixo em todos os campos visíveis: a máscara tem de descartar. */
async function digitarLixo() {
  const seletor = '#formulario input[data-campo]:visible:not([disabled])';
  const total = await page.locator(seletor).count();
  const sobrou = [];
  for (let i = 0; i < total; i += 1) {
    const campo = page.locator(seletor).nth(i);
    if (!(await campo.count())) break;
    await campo.fill('', { timeout: 2000 }).catch(() => {});
    await campo.pressSequentially('a1b<script>2', { delay: 0, timeout: 4000 }).catch(() => {});
    const valor = await campo.inputValue().catch(() => '');
    if (/[^\d/,.]/.test(valor)) sobrou.push({ id: await campo.getAttribute('id'), valor });
  }
  await page.waitForTimeout(250);
  checar('máscara descarta letras e símbolos', sobrou.length === 0, sobrou);
}

/**
 * Marca e desmarca todas as marcações visíveis, uma a uma.
 *
 * A lista é relida a cada volta de propósito: marcar uma caixa revela ou
 * esconde outras, e é justamente nessa troca que um campo órfão apareceria.
 */
async function alternarMarcacoes() {
  const seletor = '#formulario input[type="checkbox"]:visible:not([disabled])';
  const total = await page.locator(seletor).count();
  for (let i = 0; i < total; i += 1) {
    const caixa = page.locator(seletor).nth(i);
    if (!(await caixa.count())) break;
    await caixa.click({ force: true, timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(60);
  }

  const radios = '#formulario input[type="radio"]:visible:not([disabled])';
  const quantos = await page.locator(radios).count();
  for (let i = 0; i < quantos; i += 1) {
    const radio = page.locator(radios).nth(i);
    if (!(await radio.count())) break;
    await radio.check({ force: true, timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(60);
  }
}

/* ================================================== verbas rescisórias == */

await page.goto(`${BASE}/index.html`, { waitUntil: 'networkidle' });

const tipos = await page.locator('#tipos .tipo').evaluateAll((bs) => bs.map((b) => b.dataset.tipo));
checar('sete modalidades de rescisão', tipos.length === 7, tipos.length);

for (const [i, tipo] of tipos.entries()) {
  await page.click(`[data-tipo="${tipo}"]`);
  await page.waitForTimeout(150);
  await preencherTudo(i);
  await vistoriar(`rescisão/${tipo}`);
  await conferirSoma(`rescisão/${tipo}`, '#resultado table.linhas');

  // marcações revelam campos novos: preenche de novo e revistoria
  await alternarMarcacoes();
  await preencherTudo(i + 1);
  await vistoriar(`rescisão/${tipo} com marcações`);

  // o PDF só é oferecido quando o cálculo fecha
  const temErro = await page.locator('#resultado .aviso-erro').count();
  const pdfDesabilitado = await page.locator('#gerar-pdf').isDisabled();
  checar(`rescisão/${tipo}: PDF coerente com o resultado`, Boolean(temErro) === pdfDesabilitado, { temErro, pdfDesabilitado });
}

// lixo em todos os campos
await page.click('[data-tipo="sem_justa_causa"]');
await digitarLixo();
await vistoriar('rescisão: depois do lixo');

// limpar devolve a tela ao começo
await preencherTudo(0);
await page.click('#formulario button[type="reset"]');
await page.waitForTimeout(300);
checar('limpar esvazia o salário', (await page.inputValue('#salarioBase')) === '', await page.inputValue('#salarioBase'));
checar('limpar remarca "não recebia adicionais"',
  await page.locator('input[name="adicionais"][value="nenhum"]').isChecked(), null);
checar('limpar esconde o campo de horas noturnas',
  await page.locator('#campo-horas-noturnas').isHidden(), null);
checar('limpar esconde os campos de desconto',
  await page.locator('#campo-horas_negativas').isHidden(), null);
await vistoriar('rescisão: depois de limpar');

// valores extremos
await page.fill('#dataAdmissao', '01/01/1990');
await page.fill('#dataAviso', '31/12/2199');
await page.fill('#salarioBase', '999.999,99');
await page.waitForTimeout(300);
await vistoriar('rescisão: contrato de 200 anos');
checar('aviso prévio não passa de 90 dias',
  (await page.locator('#resultado').innerText()).includes('90'), null);

// datas invertidas
await page.fill('#dataAdmissao', '01/01/2025');
await page.fill('#dataAviso', '01/01/2020');
await page.waitForTimeout(250);
checar('data de saída anterior à admissão é recusada',
  (await page.locator('#resultado .aviso-erro').count()) > 0, null);

// data inexistente
await page.fill('#dataAdmissao', '31/02/2024');
await page.waitForTimeout(250);
checar('31/02 é recusado', (await page.locator('.campo:has(#dataAdmissao) .campo__erro').count()) > 0, null);

/* ========================================================= cálculo de pedidos */

await page.goto(`${BASE}/pedidos.html`, { waitUntil: 'networkidle' });

const pedidos = await page.locator('#pedidos .tipo').evaluateAll((bs) => bs.map((b) => b.dataset.pedido));
checar('cinco pedidos no catálogo', pedidos.length === 5, pedidos.length);

for (const [i, pedido] of pedidos.entries()) {
  await page.click(`[data-pedido="${pedido}"]`);
  await page.waitForTimeout(150);
  await preencherTudo(i);
  await vistoriar(`pedido/${pedido}`);
  await conferirSoma(`pedido/${pedido}`, '#resultado table.linhas');

  await alternarMarcacoes();
  await preencherTudo(i + 1);
  await vistoriar(`pedido/${pedido} com marcações`);

  const temErro = await page.locator('#resultado .aviso-erro, #resultado .impedimento').count();
  const pdfDesabilitado = await page.locator('#gerar-pdf').isDisabled();
  checar(`pedido/${pedido}: PDF coerente com o resultado`, Boolean(temErro) === pdfDesabilitado, { temErro, pdfDesabilitado });
}

// troca rápida de pedido no meio do preenchimento
for (let volta = 0; volta < 3; volta += 1) {
  for (const pedido of pedidos) {
    await page.click(`[data-pedido="${pedido}"]`);
    await page.fill('#salarioBase', '3.000,00').catch(() => {});
  }
}
await page.waitForTimeout(300);
await vistoriar('pedidos: depois da troca rápida');
checar('troca rápida não deixa campo órfão',
  (await page.locator('#formulario input[id]:visible').count()) > 0, null);

// lixo
await page.click('[data-pedido="horas_extras"]');
await digitarLixo();
await vistoriar('pedidos: depois do lixo');

// limpar
await preencherTudo(0);
await page.click('#formulario button[type="reset"]');
await page.waitForTimeout(300);
checar('limpar devolve o divisor padrão', (await page.inputValue('#divisor')) === '220', await page.inputValue('#divisor'));
await vistoriar('pedidos: depois de limpar');

// impedimento e desbloqueio. As datas vêm primeiro, como na tela, e bastam:
// o salário tem de travar antes de receber qualquer valor. (Esta sequência
// já preencheu o salário depois das datas — e só passava porque a prescrição
// esperava pelos valores para ser acusada.)
await page.fill('#dataInicio', '01/01/2010');
await page.fill('#dataFim', '31/12/2012');
await page.fill('#dataAjuizamento', '21/09/2026');
await page.waitForTimeout(300);
checar('prescrição integral bloqueia só com as datas', await page.locator('#salarioBase').isDisabled(), null);
await page.fill('#dataFim', '31/12/2025');
await page.waitForTimeout(300);
checar('corrigir a data desbloqueia', !(await page.locator('#salarioBase').isDisabled()), null);
await page.fill('#salarioBase', '2.000,00');
await page.fill('#quantidadeHoras', '20');
await page.waitForTimeout(300);
await vistoriar('pedidos: depois do desbloqueio');

// PDF: a memória tem de sair preenchida, sem lixo
const tituloDaAba = await page.title();
await page.evaluate(() => { window.print = () => {}; });
await page.click('#gerar-pdf');
await page.waitForTimeout(250);
const memoria = await page.locator('#memoria').innerText();
checar('memória traz os dados informados', memoria.includes('Dados informados'), null);
checar('memória traz o resultado', memoria.includes('Resultado'), null);
const lixoNaMemoria = LIXO.find((l) => memoria.includes(l));
checar('memória sem lixo', lixoNaMemoria === undefined, lixoNaMemoria);

// Dois PDFs seguidos: o segundo não pode gravar o nome do arquivo como
// título verdadeiro da aba, ou ela fica renomeada até a página recarregar.
await page.click('#gerar-pdf');
await page.waitForTimeout(1400);
checar('título da aba devolvido depois de dois PDFs',
  (await page.title()) === tituloDaAba, { esperado: tituloDaAba, obtido: await page.title() });

await browser.close();

console.log(checagens.join('\n'));
console.log(problemas.length ? `\nPROBLEMAS:\n${problemas.join('\n')}` : '\nsem erros de console');
console.log(`\n${checagens.length} checagens · ${falhas} falha(s) · ${problemas.length} problema(s)`);
process.exit(falhas === 0 && problemas.length === 0 ? 0 : 1);
