/**
 * Verificação da versão portátil.
 *
 * O arquivo de `portatil/` é gerado a partir do mesmo código da versão web,
 * mas roda por outro caminho: script clássico em vez de módulos ES, duas abas
 * no mesmo documento em vez de duas páginas, e `file://` em vez de servidor.
 * Cada uma dessas diferenças é uma chance de divergir — então o teste abre o
 * arquivo como o usuário abriria e confere que a conta dá o mesmo.
 *
 * Uso: `node tests/portatil.mjs` (precisa do Playwright; não precisa de servidor).
 */

import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gerar, DESTINO } from '../ferramenta/empacotar.mjs';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const checagens = [];
let falhas = 0;

function checar(nome, condicao, detalhe) {
  if (condicao) checagens.push(`ok    ${nome}`);
  else {
    falhas += 1;
    checagens.push(`FALHA ${nome}${detalhe === undefined ? '' : ` -> ${JSON.stringify(detalhe)}`}`);
  }
}

/* ------------------------------ o arquivo versionado está em dia? ------- */

const noDisco = readFileSync(join(RAIZ, DESTINO), 'utf8');
const recemGerado = await gerar();
checar('o arquivo portátil corresponde ao código-fonte', noDisco === recemGerado,
  'rode `node ferramenta/empacotar.mjs` e versione o resultado');

checar('cabe em um anexo de e-mail', noDisco.length < 1024 * 1024, `${(noDisco.length / 1024).toFixed(0)} KB`);
checar('não sobrou referência a arquivo externo',
  !/<(script|link)[^>]+(src|href)="(?!#)[^"]*\.(js|css)"/.test(noDisco), null);
checar('não sobrou import de módulo', !/\bimport\s*\{/.test(noDisco), null);

/* ------------------------------------------- o arquivo abre e calcula --- */

const endereco = pathToFileURL(join(RAIZ, DESTINO)).href;
const browser = await chromium.launch({ args: ['--lang=pt-BR'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, locale: 'pt-BR' });

const problemas = [];
page.on('pageerror', (e) => problemas.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') problemas.push(`console: ${m.text()}`); });
// Nada pode sair do arquivo: offline é requisito, não acidente.
page.on('request', (r) => {
  if (!r.url().startsWith('file://')) problemas.push(`pediu rede: ${r.url()}`);
});

await page.goto(endereco, { waitUntil: 'networkidle' });
const texto = async () => (await page.locator('#resultado').innerText()).replace(/ /g, ' ');

checar('abre direto na aba de rescisão', (await page.locator('#tipos .tipo').count()) === 7, null);
checar('carimbo de versão na tela', (await page.locator('#versao').innerText()).includes('atualizada em'), null);

/* --- mesma conta da versão web, conferida à mão --- */
await page.click('[data-tipo="sem_justa_causa"]');
await page.fill('#dataAdmissao', '10/04/2022');
await page.fill('#dataAviso', '20/08/2026');
await page.fill('#salarioBase', '4.000,00');
await page.check('input[name="adicionais"][value="periculosidade_30"]');
await page.fill('#periodosFeriasVencidas', '1');
await page.fill('#dependentes', '1');
await page.fill('#saldoFgts', '15.000,00');
await page.waitForTimeout(400);
const rescisao = await texto();
checar('saldo de salário', rescisao.includes('R$ 3.466,67'), null);
checar('aviso prévio de 42 dias', rescisao.includes('R$ 7.280,00'), null);
checar('13º de 9/12', rescisao.includes('R$ 3.900,00'), null);
checar('INSS sobre o 13º', rescisao.includes('R$ 356,60'), null);
checar('líquido igual ao da versão web',
  (await page.locator('#resultado .liquido b').innerText()).replace(/ /g, ' ') === 'R$ 24.385,47', null);
checar('multa de 40% do FGTS', rescisao.includes('R$ 6.468,69'), null);

/* --- máscara e validação seguem valendo --- */
await page.fill('#salarioBase', '');
await page.locator('#salarioBase').pressSequentially('a2b5c0d0');
checar('máscara descarta letras', (await page.inputValue('#salarioBase')) === '2500', await page.inputValue('#salarioBase'));
await page.fill('#dataAdmissao', '31/02/2024');
await page.waitForTimeout(250);
checar('data inexistente é recusada',
  (await page.locator('.campo:has(#dataAdmissao) .campo__erro').count()) > 0, null);

/* --- troca de aba --- */
await page.click('[data-pagina="pedidos"]');
await page.waitForTimeout(350);
checar('a aba de pedidos abre', (await page.locator('#pedidos .tipo').count()) === 5, null);
checar('a aba anterior sai do documento', (await page.locator('#tipos').count()) === 0, null);
checar('o título acompanha a aba', (await page.title()).includes('Pedidos'), await page.title());

await page.fill('#dataInicio', '01/01/2024');
await page.fill('#dataFim', '31/12/2024');
await page.fill('#salarioBase', '2.200,00');
await page.fill('#quantidadeHoras', '30');
await page.waitForTimeout(400);
const pedido = await texto();
checar('hora extra de R$ 450,00 por mês', pedido.includes('R$ 450,00'), null);
checar('DSR de R$ 90,00', pedido.includes('R$ 90,00'), null);
checar('total do pedido igual ao da versão web',
  (await page.locator('#resultado .liquido b').innerText()).replace(/ /g, ' ') === 'R$ 8.359,20', null);

/* --- prescrição bloqueia aqui também --- */
await page.fill('#dataInicio', '01/01/2010');
await page.fill('#dataFim', '31/12/2012');
await page.fill('#dataAjuizamento', '21/09/2026');
await page.waitForTimeout(350);
checar('prescrição integral bloqueia', await page.locator('#salarioBase').isDisabled(), null);
await page.fill('#dataFim', '31/12/2025');
await page.waitForTimeout(350);
checar('corrigir a data desbloqueia', !(await page.locator('#salarioBase').isDisabled()), null);

/* --- voltar pela aba monta a tela de novo, zerada --- */
await page.click('[data-pagina="rescisao"]');
await page.waitForTimeout(350);
checar('voltar à rescisão remonta a tela', (await page.locator('#tipos .tipo').count()) === 7, null);
checar('a tela volta em branco', (await page.inputValue('#salarioBase')) === '', null);

/* --- botão de voltar do navegador --- */
await page.goBack();
await page.waitForTimeout(350);
checar('o botão voltar troca de aba', (await page.locator('#pedidos .tipo').count()) === 5, null);
await page.goForward();
await page.waitForTimeout(350);
checar('o botão avançar também', (await page.locator('#tipos .tipo').count()) === 7, null);

/* --- PDF --- */
await page.click('[data-tipo="sem_justa_causa"]');
await page.fill('#dataAdmissao', '01/01/2020');
await page.fill('#dataAviso', '01/06/2026');
await page.fill('#salarioBase', '3.000,00');
await page.waitForTimeout(350);
await page.evaluate(() => { window.__imprimiu = false; window.print = () => { window.__imprimiu = true; }; });
checar('PDF liberado com o cálculo fechado', !(await page.locator('#gerar-pdf').isDisabled()), null);
await page.click('#gerar-pdf');
await page.waitForTimeout(250);
checar('impressão disparada', await page.evaluate(() => window.__imprimiu), null);
const memoria = await page.locator('#memoria').innerText();
checar('memória traz os dados informados', memoria.includes('Dados informados'), null);
checar('memória traz o resultado', memoria.includes('Memória de cálculo'), null);

await browser.close();

console.log(checagens.join('\n'));
console.log(problemas.length ? `\nPROBLEMAS:\n${problemas.join('\n')}` : '\nsem erros de console e sem acesso à rede');
console.log(`\n${checagens.length} checagens · ${falhas} falha(s) · ${problemas.length} problema(s)`);
process.exit(falhas === 0 && problemas.length === 0 ? 0 : 1);
