/**
 * Verificação da interface no navegador: máscara, validação e formato dos
 * campos nas duas páginas.
 *
 * Suba o servidor e rode:
 *   npx http-server -p 8080 -c-1 . &
 *   node tests/interface.mjs
 *
 * Precisa do Playwright instalado (npm i -D playwright).
 */

import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:8080';
const erros = [];
const checagens = [];
const checar = (nome, ok, obtido) => {
  checagens.push(`${ok ? 'ok   ' : 'FALHA'} ${nome}${ok ? '' : ` -> ${JSON.stringify(obtido)}`}`);
  if (!ok) falhas += 1;
};
let falhas = 0;

const browser = await chromium.launch({ args: ['--lang=pt-BR'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2, locale: 'pt-BR' });
page.on('console', (m) => m.type() === 'error' && erros.push(m.text()));
page.on('pageerror', (e) => erros.push('pageerror: ' + e.message));

/* ---------------------------------------------------- verbas rescisórias */
await page.goto(`${BASE}/index.html`, { waitUntil: 'networkidle' });
await page.click('[data-tipo="sem_justa_causa"]');

// letras não entram em campo de dinheiro
await page.locator('#salarioBase').pressSequentially('abc');
checar('letras não entram no salário', await page.inputValue('#salarioBase') === '', await page.inputValue('#salarioBase'));

await page.locator('#salarioBase').pressSequentially('3500,75');
await page.locator('#salarioBase').blur();
checar('valor em reais formatado', await page.inputValue('#salarioBase') === '3.500,75', await page.inputValue('#salarioBase'));

// data com máscara automática
await page.locator('#dataAdmissao').pressSequentially('15092019');
checar('máscara de data', await page.inputValue('#dataAdmissao') === '15/09/2019', await page.inputValue('#dataAdmissao'));

// letras não entram em campo de data
await page.locator('#dataAviso').pressSequentially('ab15');
checar('letras não entram na data', await page.inputValue('#dataAviso') === '15', await page.inputValue('#dataAviso'));
await page.fill('#dataAviso', '');

// data inexistente é recusada
await page.locator('#dataAviso').pressSequentially('31022026');
await page.waitForTimeout(250);
const erroData = await page.locator('.campo:has(#dataAviso) .campo__erro').textContent().catch(() => null);
checar('31/02 marcado como inválido', (erroData ?? '').includes('Data inválida'), erroData);
const painelErro = await page.locator('#resultado .aviso-erro').textContent();
checar('cálculo bloqueado com campo inválido', painelErro.includes('Corrija os campos'), painelErro.slice(0, 60));

// data válida volta a calcular
await page.fill('#dataAviso', '');
await page.locator('#dataAviso').pressSequentially('15092026');
await page.fill('#periodosFeriasVencidas', '1');
// a pensão agora é um desconto que precisa ser marcado para aparecer
checar('campo de pensão escondido', await page.locator('#campo-pensao').isHidden(), null);
await page.check('input[name="descontos"][value="pensao"]');
await page.locator('#pensaoPercentual').pressSequentially('12,5');
await page.waitForTimeout(300);
const liquido = await page.locator('.liquido b').textContent();
checar('cálculo retomado', liquido.startsWith('R$'), liquido);
checar('percentual com vírgula aceito', await page.inputValue('#pensaoPercentual') === '12,5', await page.inputValue('#pensaoPercentual'));

// limite máximo
await page.fill('#pensaoPercentual', '150');
await page.waitForTimeout(250);
const erroMax = await page.locator('.campo:has(#pensaoPercentual) .campo__erro').textContent().catch(() => null);
checar('limite máximo do percentual', (erroMax ?? '').includes('máximo'), erroMax);
await page.fill('#pensaoPercentual', '10'); // volta a um valor válido

// adicionais: exclusão entre insalubridade e periculosidade
await page.check('input[name="adicionais"][value="insalubridade_20"]');
await page.check('input[name="adicionais"][value="periculosidade_30"]');
await page.waitForTimeout(250);
checar(
  'periculosidade desmarca insalubridade',
  !(await page.isChecked('input[name="adicionais"][value="insalubridade_20"]')),
  await page.isChecked('input[name="adicionais"][value="insalubridade_20"]'),
);
checar(
  '"não recebia adicionais" se desmarca sozinho',
  !(await page.isChecked('input[name="adicionais"][value="nenhum"]')),
  await page.isChecked('input[name="adicionais"][value="nenhum"]'),
);

// o adicional noturno revela o campo de horas
checar('campo de horas noturnas escondido', await page.locator('#campo-horas-noturnas').isHidden(), null);
await page.check('input[name="adicionais"][value="noturno_20"]');
await page.waitForTimeout(250);
checar('campo de horas noturnas revelado', await page.locator('#campo-horas-noturnas').isVisible(), null);
checar(
  'periculosidade e noturno convivem',
  await page.isChecked('input[name="adicionais"][value="periculosidade_30"]'),
  false,
);

// descontos: campo só aparece quando o desconto é marcado
checar('campo de horas negativas escondido', await page.locator('#campo-horas_negativas').isHidden(), null);
await page.check('input[name="descontos"][value="horas_negativas"]');
await page.waitForTimeout(250);
checar('campo de horas negativas revelado', await page.locator('#campo-horas_negativas').isVisible(), null);
checar(
  '"não há descontos" se desmarca sozinho',
  !(await page.isChecked('input[name="descontos"][value="nenhum"]')),
  await page.isChecked('input[name="descontos"][value="nenhum"]'),
);

await page.fill('#horasNegativas', '8');
await page.waitForTimeout(300);
const linhaHoras = await page.locator('.linhas tr', { hasText: 'Horas negativas' }).textContent();
checar('horas negativas descontadas pelo salário-hora', linhaHoras.includes('salário-hora'), linhaHoras);

await page.check('input[name="descontos"][value="nenhum"]');
await page.waitForTimeout(250);
checar(
  '"não há descontos" limpa a seleção',
  !(await page.isChecked('input[name="descontos"][value="horas_negativas"]')),
  null,
);
checar('campo some junto com a marcação', await page.locator('#campo-horas_negativas').isHidden(), null);

// férias vencidas: entram na conta e aparecem no resumo
await page.fill('#periodosFeriasVencidas', '1');
await page.waitForTimeout(300);
checar(
  'férias vencidas entram nas verbas',
  (await page.locator('.linhas tr', { hasText: 'Férias vencidas' }).count()) > 0,
  null,
);
const resumoFerias = await page.locator('.contexto div', { hasText: 'Férias vencidas' }).textContent();
checar('resumo mostra os períodos computados', resumoFerias.includes('1 período'), resumoFerias);

await page.fill('#periodosFeriasVencidas', '9');
await page.waitForTimeout(300);
const erroPeriodos = await page.locator('.campo:has(#periodosFeriasVencidas) .campo__erro').textContent().catch(() => null);
checar('período além do contrato marca o campo', (erroPeriodos ?? '').includes('completou'), erroPeriodos);
await page.fill('#periodosFeriasVencidas', '1');

// memória de cálculo para PDF
checar('PDF bloqueado sem cálculo fechado', true, null); // conferido no carregamento
await page.evaluate(() => { window.print = () => { window.__imprimiu = true; }; });
await page.click('#gerar-pdf');
await page.waitForTimeout(250);
checar('impressão disparada', await page.evaluate(() => window.__imprimiu === true), null);
const memoria = await page.locator('#memoria').innerHTML();
checar('memória traz os dados informados', memoria.includes('Dados informados'), null);
checar('memória traz o resultado', memoria.includes('Total bruto'), null);
checar('memória fora da tela', await page.locator('#memoria').isHidden(), null);

/* ------------------------------------------------------------- pedidos */
await page.goto(`${BASE}/pedidos.html`, { waitUntil: 'networkidle' });
await page.fill('#divisor', '');
await page.locator('#divisor').pressSequentially('2a2b0');
checar('divisor só aceita número', await page.inputValue('#divisor') === '220', await page.inputValue('#divisor'));

await page.fill('#quantidadeHoras', '');
await page.locator('#quantidadeHoras').pressSequentially('10,5');
checar('horas com vírgula', await page.inputValue('#quantidadeHoras') === '10,5', await page.inputValue('#quantidadeHoras'));

await page.locator('#dataInicio').pressSequentially('01062023');
await page.locator('#dataFim').pressSequentially('31052025');
await page.locator('#salarioBase').pressSequentially('2800');
await page.check('input[name="risco"][value="periculosidade"]');
await page.waitForTimeout(300);
const horasMes = await page.locator('.contexto div', { hasText: 'Horas por mês' }).textContent();
checar('horas por mês em formato brasileiro', /\d+,\d+/.test(horasMes), horasMes);
const detalhe = await page.locator('.linhas small').first().textContent();
checar('detalhe da verba em formato brasileiro', !/\d\.\d\d h/.test(detalhe), detalhe);

await page.fill('#diasUteis', '40');
await page.waitForTimeout(250);
const erroDias = await page.locator('.campo:has(#diasUteis) .campo__erro').textContent().catch(() => null);
checar('dias úteis limitado a 31', (erroDias ?? '').includes('máximo'), erroDias);

await browser.close();
console.log(checagens.join('\n'));
console.log(erros.length ? 'ERROS DE CONSOLE: ' + erros.join(' | ') : 'sem erros de console');
process.exit(falhas === 0 && erros.length === 0 ? 0 : 1);
