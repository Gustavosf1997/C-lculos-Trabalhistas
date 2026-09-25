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
checar('a aba de pedidos abre', (await page.locator('#pedidos .tipo').count()) === 6, null);
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

/* --- indenização acidentária --- */
await page.click('[data-pedido="acidente"]');
await page.waitForTimeout(250);
await page.selectOption('#lesao1', 'joelho');
await page.selectOption('#grau1', 'media');
await page.fill('#salarioBase', '2.500,00');
await page.fill('#outrasParcelas', '500,00');
await page.fill('#dataCiencia', '01/03/2024');
await page.fill('#dataAjuizamento', '01/03/2025');
await page.fill('#sobrevida', '40');
await page.waitForTimeout(350);
checar('acidente: total igual ao da versão web',
  (await page.locator('#resultado .liquido b').innerText()).replace(/\u00a0/g, ' ') === 'R$ 87.759,73',
  await page.locator('#resultado .liquido b').innerText());
await page.fill('#sobrevida', '');
await page.fill('#dataNascimento', '01/03/1990');
await page.waitForTimeout(300);
checar('acidente: sobrevida da tábua do IBGE embutida', (await texto()).includes('tábua do IBGE de 2024, aos 34 anos'), null);
await page.fill('#dataAjuizamento', '01/04/2029');
await page.waitForTimeout(300);
checar('acidente: quinquênio da ciência bloqueia', await page.locator('#salarioBase').isDisabled(), null);
await page.click('[data-pedido="horas_extras"]');
await page.waitForTimeout(250);

/* --- voltar pela aba monta a tela de novo, zerada --- */
await page.click('[data-pagina="rescisao"]');
await page.waitForTimeout(350);
checar('voltar à rescisão remonta a tela', (await page.locator('#tipos .tipo').count()) === 7, null);
checar('a tela volta em branco', (await page.inputValue('#salarioBase')) === '', null);

/* --- botão de voltar do navegador --- */
await page.goBack();
await page.waitForTimeout(350);
checar('o botão voltar troca de aba', (await page.locator('#pedidos .tipo').count()) === 6, null);
await page.goForward();
await page.waitForTimeout(350);
checar('o botão avançar também', (await page.locator('#tipos .tipo').count()) === 7, null);

/* --- prescrição na rescisão: biênio da OJ 83 e férias do art. 149 --- */
await page.click('[data-tipo="sem_justa_causa"]');
await page.fill('#dataAdmissao', '10/01/2014');
await page.fill('#dataAviso', '10/01/2024');
await page.fill('#salarioBase', '3.000,00');
await page.waitForTimeout(300);
checar('rescisão: o campo de ajuizamento existe', (await page.locator('#dataAjuizamento').count()) === 1, null);
checar('rescisão: sem ajuizamento, o resumo diz que não apurou', (await texto()).includes('informe o ajuizamento'), null);
checar('rescisão: sem ajuizamento, avisa do biênio vencido', (await texto()).includes('10/03/2026'), null);
await page.fill('#dataAjuizamento', '01/03/2026');
await page.waitForTimeout(300);
checar('rescisão: projeção do aviso mantém a ação no prazo', (await page.locator('#resultado .impedimento').count()) === 0, null);
await page.fill('#dataAjuizamento', '11/03/2026');
await page.waitForTimeout(300);
checar('rescisão: prescrição bienal em caixa vermelha', (await texto()).includes('prescrição bienal'), null);
checar('rescisão: bienal bloqueia a digitação', await page.locator('#salarioBase').isDisabled(), null);
await page.fill('#dataAdmissao', '01/02/2015');
await page.fill('#dataAviso', '01/08/2023');
await page.fill('#dataAjuizamento', '01/02/2025');
await page.waitForTimeout(300);
await page.fill('#periodosFeriasVencidas', '6');
await page.waitForTimeout(300);
checar('rescisão: férias do art. 149 prescritas em caixa laranja',
  (await page.locator('#resultado .recorte').innerText().catch(() => '')).includes('art. 149'), null);
// 4 exigíveis: 3 com o concessivo vencido antes da saída (em dobro) e 1 simples
checar('rescisão: só 4 dos 6 períodos entram, com a dobra de cada um', (await texto()).includes('R$ 21.000,00'), null);
await page.click('#formulario button[type="reset"]');
await page.waitForTimeout(300);

/* --- prescrição nos pedidos e nas multas --- */
await page.click('[data-pagina="pedidos"]');
await page.waitForTimeout(300);
await page.fill('#salarioBase', '2.200,00');
await page.fill('#quantidadeHoras', '30');
await page.fill('#dataInicio', '01/01/2019');
await page.fill('#dataFim', '31/12/2023');
await page.waitForTimeout(300);
checar('pedidos: sem ajuizamento, o resumo diz que não apurou', (await texto()).includes('informe o ajuizamento'), null);
await page.fill('#dataAjuizamento', '23/09/2026');
await page.waitForTimeout(300);
checar('pedidos: quinquenal parcial em caixa laranja',
  (await page.locator('#resultado .recorte').innerText().catch(() => '')).includes('23/09/2021'), null);
await page.fill('#dataExtincao', '31/12/2023');
await page.waitForTimeout(300);
checar('pedidos: prescrição bienal em caixa vermelha', (await texto()).includes('prescrição bienal'), null);
await page.fill('#dataExtincao', '');
await page.waitForTimeout(300);

await page.click('[data-pedido="multas"]');
await page.waitForTimeout(250);
await page.fill('#salarioBase', '2.500,00');
await page.fill('#dataRescisao', '01/03/2023');
await page.fill('#dataPagamento', '30/03/2023');
await page.waitForTimeout(300);
checar('multas: sem ajuizamento, avisa do biênio vencido', (await texto()).includes('01/03/2025'), null);
await page.fill('#dataAjuizamento', '02/03/2025');
await page.waitForTimeout(300);
checar('multas: prescrição bienal em caixa vermelha', (await texto()).includes('prescrição bienal'), null);
await page.fill('#dataFimAviso', '15/05/2023');
await page.waitForTimeout(300);
checar('multas: aviso projetado afasta a prescrição (OJ 83)',
  (await page.locator('#resultado .impedimento').count()) === 0, null);
await page.click('[data-pagina="rescisao"]');
await page.waitForTimeout(300);

/* --- o roteiro do print: só as datas, digitadas, nenhum valor --- */
// Os testes acima preenchiam salário e horas antes das datas, e assim nunca
// viram o defeito: com só as datas na tela, o cálculo pedia o salário em vez
// de acusar a prescrição. Aqui a ordem é a de quem usa: de cima para baixo.
const digitar = async (id, valor) => {
  await page.locator(`#${id}`).click();
  await page.locator(`#${id}`).pressSequentially(valor.replace(/\//g, ''));
};
const vermelho = async () => (await page.locator('#resultado .impedimento b').innerText().catch(() => ''));

await page.click('[data-pagina="pedidos"]');
await page.waitForTimeout(300);
await page.click('[data-pedido="horas_extras"]');
await page.waitForTimeout(250);
await digitar('dataInicio', '01/01/2000');
await digitar('dataFim', '01/01/2000');
await digitar('dataAjuizamento', '01/01/2020');
await digitar('dataExtincao', '01/01/2000');
await page.waitForTimeout(350);
checar('só datas (o print): prescrição bienal acusada', (await vermelho()).includes('bienal'), await vermelho());
checar('só datas (o print): nada de "faltam informações"',
  (await page.locator('#resultado .aviso-erro').count()) === 0, null);
checar('só datas (o print): salário travado', await page.locator('#salarioBase').isDisabled(), null);

await page.fill('#dataExtincao', '');
await page.waitForTimeout(300);
checar('só datas: quinquênio total acusado sem a extinção', (await vermelho()).includes('integralmente'), await vermelho());

for (const pedido of ['adicional_noturno', 'intervalo', 'adicional_risco']) {
  await page.click(`[data-pedido="${pedido}"]`);
  await page.waitForTimeout(250);
  await digitar('dataInicio', '01/01/2000');
  await digitar('dataFim', '31/12/2001');
  await digitar('dataAjuizamento', '01/01/2020');
  await page.waitForTimeout(300);
  checar(`só datas: ${pedido} acusa a prescrição`, (await vermelho()).includes('prescrito'), await vermelho());
}

await page.click('[data-pedido="multas"]');
await page.waitForTimeout(250);
await digitar('dataRescisao', '01/01/2000');
await digitar('dataAjuizamento', '01/01/2020');
await page.waitForTimeout(300);
checar('só datas: multas acusam o biênio', (await vermelho()).includes('bienal'), await vermelho());

await page.click('[data-pedido="horas_extras"]');
await page.waitForTimeout(250);
await digitar('dataInicio', '01/01/2019');
await digitar('dataFim', '31/12/2023');
await digitar('dataAjuizamento', '23/09/2026');
await page.waitForTimeout(300);
checar('só datas: prescrição parcial já aparece em laranja',
  (await page.locator('#resultado .recorte').count()) === 1, null);
checar('só datas: e junto dela, a lista do que falta',
  (await page.locator('#resultado .aviso-erro').count()) === 1, null);

await page.click('[data-pagina="rescisao"]');
await page.waitForTimeout(300);
await page.click('[data-tipo="sem_justa_causa"]');
await digitar('dataAdmissao', '01/01/1995');
await digitar('dataAviso', '01/01/2000');
await digitar('dataAjuizamento', '01/01/2020');
await page.waitForTimeout(350);
checar('só datas: rescisão acusa o biênio', (await vermelho()).includes('bienal'), await vermelho());
checar('só datas: rescisão trava o salário', await page.locator('#salarioBase').isDisabled(), null);
await page.click('#formulario button[type="reset"]');
await page.waitForTimeout(300);

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
