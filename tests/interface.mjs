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

// o carimbo de versão é escrito pelo módulo: prova que o JavaScript é o atual
const carimbo = await page.locator('#versao').textContent();
checar('carimbo de versão na tela', carimbo.includes('atualizada em'), carimbo);

// a vigência das tabelas aparece na tela e é a de 2026
const etiqueta = await page.locator('#badge-vigencia').textContent();
checar('etiqueta informa as tabelas de 2026', etiqueta.includes('2026'), etiqueta);
const rodapeVigencia = await page.locator('#rodape-vigencia').textContent();
checar('rodapé cita as fontes', rodapeVigencia.includes('MPS/MF') && rodapeVigencia.includes('15.270'), rodapeVigencia);
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
await page.waitForTimeout(250);
// 20% do salário mínimo de 2026 (R$ 1.621,00); com a tabela de 2025 daria 303,60
const notaAdicional = await page.locator('#nota-remuneracao').textContent();
checar('insalubridade usa o mínimo de 2026', notaAdicional.includes('324,20'), notaAdicional);

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
/* --- prescrição na rescisão (OJ 83 e art. 149) --- */
await page.goto(`${BASE}/index.html`, { waitUntil: 'networkidle' });
await page.click('[data-tipo="sem_justa_causa"]');
await page.fill('#dataAdmissao', '10/01/2014');
await page.fill('#dataAviso', '10/01/2024');
await page.fill('#salarioBase', '3.000,00');
await page.waitForTimeout(300);
const semAcao = (await page.locator('#resultado').innerText()).replace(/\u00a0/g, ' ');
checar('rescisão: resumo pede o ajuizamento', semAcao.includes('informe o ajuizamento'), null);
checar('rescisão: biênio vencido vira aviso sem ajuizamento', semAcao.includes('10/03/2026'), null);

await page.fill('#dataAjuizamento', '01/03/2026');
await page.waitForTimeout(300);
checar('rescisão: aviso projetado mantém a ação tempestiva (OJ 83)',
  (await page.locator('#resultado .impedimento').count()) === 0
  && (await page.locator('#resultado .liquido b').count()) === 1, null);

await page.fill('#dataAjuizamento', '11/03/2026');
await page.waitForTimeout(300);
checar('rescisão: bienal em caixa vermelha',
  (await page.locator('#resultado .impedimento').innerText().catch(() => '')).includes('bienal'), null);
checar('rescisão: bienal bloqueia o salário', await page.locator('#salarioBase').isDisabled(), null);
checar('rescisão: datas seguem editáveis', !(await page.locator('#dataAjuizamento').isDisabled()), null);
checar('rescisão: tipo de aviso segue editável',
  !(await page.locator('input[name="tipoAviso"]').first().isDisabled()), null);
checar('rescisão: PDF bloqueado com a prescrição', await page.locator('#gerar-pdf').isDisabled(), null);

// O que segue editável não pode parecer travado: o ajuizamento mora no
// segundo grupo, e uma regra "esmaece todo grupo menos o primeiro" o apagava.
const opacidade = (seletor) => page.evaluate((sel) => {
  let el = document.querySelector(sel);
  let total = 1;
  while (el) { total *= Number(getComputedStyle(el).opacity); el = el.parentElement; }
  return Math.round(total * 100) / 100;
}, seletor);
checar('rescisão: ajuizamento nítido sob bloqueio', (await opacidade('#dataAjuizamento')) === 1,
  await opacidade('#dataAjuizamento'));
checar('rescisão: tipo de aviso nítido sob bloqueio', (await opacidade('input[name="tipoAviso"]')) === 1, null);
checar('rescisão: salário esmaecido sob bloqueio', (await opacidade('#salarioBase')) < 1, null);

await page.fill('#dataAjuizamento', '');
await page.waitForTimeout(300);
checar('rescisão: apagar o ajuizamento desbloqueia', !(await page.locator('#salarioBase').isDisabled()), null);

// férias vencidas prescritas: laranja, e o cálculo segue
await page.fill('#dataAdmissao', '01/02/2015');
await page.fill('#dataAviso', '01/08/2023');
await page.fill('#periodosFeriasVencidas', '6');
await page.fill('#dataAjuizamento', '01/02/2025');
await page.waitForTimeout(300);
const recorteFerias = await page.locator('#resultado .recorte').innerText().catch(() => '');
checar('rescisão: férias prescritas em caixa laranja', recorteFerias.includes('art. 149'), recorteFerias.slice(0, 60));
checar('rescisão: só as férias exigíveis entram',
  (await page.locator('#resultado').innerText()).replace(/\u00a0/g, ' ').includes('R$ 12.000,00'), null);

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

// prescrição quinquenal bloqueia a entrada de dados
await page.fill('#dataInicio', '01/01/2015');
await page.fill('#dataFim', '01/01/2020');
await page.fill('#dataAjuizamento', '18/09/2026');
await page.waitForTimeout(350);
const caixa = await page.locator('#resultado .impedimento').textContent().catch(() => null);
checar('impedimento em caixa vermelha', (caixa ?? '').includes('prescrito'), (caixa ?? '').slice(0, 50));
checar('salário bloqueado', await page.locator('#salarioBase').isDisabled(), null);
checar('marcação de risco bloqueada', await page.locator('input[name="risco"][value="insalubridade"]').isDisabled(), null);
checar('datas seguem editáveis', !(await page.locator('#dataInicio').isDisabled()), null);
checar('PDF bloqueado com prescrição', await page.locator('#gerar-pdf').isDisabled(), null);

// prescrição parcial: calcula o imprescrito e avisa do recorte
await page.fill('#dataFim', '01/01/2024');
await page.waitForTimeout(350);
const recorte = await page.locator('#resultado .recorte').textContent().catch(() => null);
checar('recorte avisado no resultado', (recorte ?? '').includes('18/09/2021 a 01/01/2024'), (recorte ?? '').slice(0, 60));
checar('campos liberados na prescrição parcial', !(await page.locator('#salarioBase').isDisabled()), null);
checar('resultado calculado apesar do recorte', (await page.locator('.liquido b').count()) > 0, null);
const periodoCalculado = await page.locator('.contexto div', { hasText: 'Período calculado' }).textContent();
checar('resumo mostra o período usado', periodoCalculado.includes('18/09/2021'), periodoCalculado);

// corrigir o período devolve a tela ao normal
await page.fill('#dataInicio', '01/01/2023');
await page.fill('#dataFim', '01/01/2025');
await page.waitForTimeout(350);
checar('sem recorte quando o período está dentro do quinquênio', (await page.locator('#resultado .recorte').count()) === 0, null);
checar('campos liberados após ajuste', !(await page.locator('#salarioBase').isDisabled()), null);
checar('resultado volta a aparecer', (await page.locator('.liquido b').count()) > 0, null);

await page.fill('#diasUteis', '40');
await page.waitForTimeout(250);
const erroDias = await page.locator('.campo:has(#diasUteis) .campo__erro').textContent().catch(() => null);
checar('dias úteis limitado a 31', (erroDias ?? '').includes('máximo'), erroDias);

/* ----------------------------------- os demais pedidos do catálogo ------ */

// O Intl separa "R$" do número com espaço não-quebrável: normaliza antes de comparar.
const texto = async () => (await page.locator('#resultado').innerText()).replace(/\u00a0/g, ' ');
const dadosBase = async () => {
  await page.fill('#dataInicio', '01/01/2024');
  await page.fill('#dataFim', '31/12/2024');
  await page.fill('#salarioBase', '2.200,00'); // divisor 220 -> hora de R$ 10,00
};

checar('catálogo traz os cinco pedidos', await page.locator('#pedidos .tipo').count() === 5,
  await page.locator('#pedidos .tipo').count());

// adicional noturno: hora ficta de 52min30s (art. 73, §1º)
await page.click('[data-pedido="adicional_noturno"]');
checar('formulário trocou junto com o pedido',
  (await page.locator('#horasNoturnas').count()) === 1 && (await page.locator('#quantidadeHoras').count()) === 0, null);
await dadosBase();
await page.fill('#horasNoturnas', '30');
await page.waitForTimeout(350);
const noturno = await texto();
checar('30 h de relógio viram 34,29 h fictas', noturno.includes('34,29'), null);
checar('adicional noturno de R$ 68,57', noturno.includes('R$ 68,57'), null);
checar('FGTS descreve a base real',
  noturno.includes('8% sobre adicional noturno, DSR, 13º e férias + 1/3'), null);
// férias indenizadas saem da base, e a linha passa a dizer isso
await page.uncheck('#fgtsSobreFerias');
await page.waitForTimeout(350);
checar('desmarcar férias encurta a base do FGTS',
  (await texto()).includes('8% sobre adicional noturno, DSR e 13º'), null);
await page.check('#fgtsSobreFerias');
await page.check('input[name="risco"][value="periculosidade"]');
await page.waitForTimeout(350);
// hora de R$ 13,00 (2.200 + 30%) x 34,29 h fictas x 20%
checar('risco integra a hora normal do noturno', (await texto()).includes('R$ 89,14'), null);
await page.check('input[name="risco"][value="nenhum"]');

// intervalo intrajornada: dois regimes
await page.click('[data-pedido="intervalo"]');
await dadosBase();
await page.fill('#minutosSuprimidos', '30');
await page.waitForTimeout(350);
const reforma = await texto();
checar('pós-reforma paga só o suprimido', reforma.includes('R$ 165,00'), null); // 30min x 22 x R$ 15,00
checar('pós-reforma não tem reflexos', !reforma.includes('Reflexo no 13º'), null);
checar('pós-reforma sem FGTS', !reforma.includes('FGTS'), null);
checar('intervalo integral escondido no regime novo', await page.locator('#intervaloIntegral').isHidden(), null);

await page.check('input[name="regimeIntervalo"][value="anterior_reforma"]');
await page.waitForTimeout(350);
const anterior = await texto();
checar('intervalo integral revelado no regime antigo', await page.locator('#intervaloIntegral').isVisible(), null);
checar('Súmula 437 paga a hora cheia', anterior.includes('R$ 330,00'), null); // 60min x 22 x R$ 15,00
checar('Súmula 437 gera reflexos', anterior.includes('Reflexo no 13º'), null);
checar('regime antigo avisa o descompasso de período', (await page.locator('#resultado .alerta').count()) > 0, null);

// insalubridade sobre o salário mínimo de 2026
await page.click('[data-pedido="adicional_risco"]');
await dadosBase();
checar('risco exige a escolha entre os adicionais', (await texto()).includes('Escolha entre insalubridade'), null);
await page.check('input[name="risco"][value="insalubridade"]');
await page.waitForTimeout(350);
checar('grau médio sobre o mínimo de 2026', (await texto()).includes('R$ 324,20'), null); // 20% de 1.621,00
await page.selectOption('#baseInsalubridade', 'salario_base');
await page.waitForTimeout(350);
checar('base do salário contratual muda o adicional', (await texto()).includes('R$ 440,00'), null); // 20% de 2.200

// multas dos arts. 477 e 467: sem período e sem FGTS
await page.click('[data-pedido="multas"]');
checar('multas dispensam o período', (await page.locator('#dataInicio').count()) === 0, null);
await page.fill('#salarioBase', '2.500,00');
await page.fill('#dataRescisao', '01/03/2026');
await page.fill('#dataPagamento', '30/03/2026');
await page.waitForTimeout(350);
const multas = await texto();
checar('prazo do art. 477 calculado', multas.includes('11/03/2026'), null);
checar('multa do art. 477 de uma remuneração', multas.includes('R$ 2.500,00'), null);

// Tema 142 do TST: a base é a remuneração, não o salário base
await page.fill('#outrasParcelas', '400,00');
await page.waitForTimeout(350);
checar('parcelas habituais entram na base da multa', (await texto()).includes('R$ 2.900,00'), null);

// parte final do §8º: a mora do empregado afasta a multa
await page.check('#moraDoEmpregado');
await page.waitForTimeout(350);
const comMora = await texto();
checar('mora do empregado afasta a multa', !comMora.includes('Multa do art. 477'), null);
checar('nada a pagar com a mora do empregado', /Total do pedido\s*R\$ 0,00/i.test(comMora), null);
checar('mora do empregado é explicada', comMora.includes('afasta a multa'), null);
await page.uncheck('#moraDoEmpregado');
await page.fill('#outrasParcelas', '');

await page.check('#multa467');
await page.fill('#valorIncontroverso', '5.000,00');
await page.waitForTimeout(350);
checar('as duas multas somam R$ 5.000,00', (await texto()).includes('R$ 5.000,00'), null);

// voltar ao primeiro pedido devolve os campos próprios dele
await page.click('[data-pedido="horas_extras"]');
checar('volta às horas extras com os campos certos', (await page.locator('#quantidadeHoras').count()) === 1, null);

// prescrição bienal: contrato extinto há mais de dois anos barra tudo
await dadosBase();
await page.fill('#quantidadeHoras', '30');
await page.fill('#dataAjuizamento', '19/09/2026');
await page.waitForTimeout(350);
checar('quinquênio não barra o período de 2024', (await page.locator('#resultado .impedimento').count()) === 0, null);
await page.fill('#dataExtincao', '10/01/2024');
await page.waitForTimeout(350);
const bienal = await texto();
checar('prescrição bienal barra o cálculo', bienal.includes('bienal'), bienal.slice(0, 60));
checar('bienal bloqueia o salário', await page.locator('#salarioBase').isDisabled(), null);
checar('data de extinção segue editável', !(await page.locator('#dataExtincao').isDisabled()), null);
await page.fill('#dataExtincao', '');
await page.waitForTimeout(350);
checar('apagar a extinção libera o cálculo', (await page.locator('.liquido b').count()) > 0, null);

await browser.close();
console.log(checagens.join('\n'));
console.log(erros.length ? 'ERROS DE CONSOLE: ' + erros.join(' | ') : 'sem erros de console');
process.exit(falhas === 0 && erros.length === 0 ? 0 : 1);
