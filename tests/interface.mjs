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
