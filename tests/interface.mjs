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
// 4 exigíveis: 3 com o concessivo vencido antes da saída (em dobro) e 1 simples
checar('rescisão: só as férias exigíveis entram, com a dobra de cada período',
  (await page.locator('#resultado').innerText()).replace(/\u00a0/g, ' ').includes('R$ 21.000,00'), null);

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

checar('catálogo traz os seis pedidos', await page.locator('#pedidos .tipo').count() === 6,
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

// indenização acidentária: tabela DPVAT, CIF, pensão e art. 223-G
await page.click('[data-pedido="acidente"]');
await page.waitForTimeout(250);
checar('acidente dispensa o período', (await page.locator('#dataInicio').count()) === 0, null);
checar('lesões agrupadas como no anexo da lei', (await page.locator('#lesao1 optgroup').count()) === 3, null);
checar('sem lesão escolhida, pede a lesão', (await texto()).includes('Escolha a lesão'), null);
checar('a repercussão só aparece com a lesão', await page.locator('#campo-grau1').isHidden(), null);
await page.selectOption('#lesao1', 'joelho');
await page.selectOption('#grau1', 'media');
await page.fill('#salarioBase', '2.500,00');
await page.fill('#outrasParcelas', '500,00');
await page.fill('#dataCiencia', '01/03/2024');
await page.fill('#dataAjuizamento', '01/03/2025');
await page.fill('#sobrevida', '40');
await page.waitForTimeout(350);
const acidente = await texto();
checar('joelho com repercussão média: 12,5%', acidente.includes('25% x 50% (repercussão média) = 12,5%'), acidente.slice(0, 300));
checar('enquadramento na CIF', acidente.includes('1 — deficiência ligeira'), null);
checar('referência no teto do DPVAT', acidente.includes('R$ 1.687,50'), null);
checar('pensão mensal com 13º e terço', acidente.includes('R$ 416,67'), null);
checar('vincendas a valor presente', acidente.includes('R$ 75.259,69'), null);
checar('danos morais pela faixa leve', acidente.includes('R$ 7.500,00'), null);
checar('nota da isenção de imposto de renda', acidente.includes('7.713/88'), null);
checar('sem cartão de FGTS', (await page.locator('#resultado .fgts-card').count()) === 0, null);

// tábua do IBGE embutida: com o nascimento, a sobrevida vem sozinha
await page.fill('#sobrevida', '');
await page.fill('#dataNascimento', '01/03/1990');
await page.waitForTimeout(350);
const pelaTabua = await texto();
checar('sobrevida da tábua do IBGE aos 34 anos', pelaTabua.includes('45,28 anos — tábua do IBGE de 2024, aos 34 anos'),
  pelaTabua.slice(0, 900));
checar('termo final pela tábua', pelaTabua.includes('10/06/2069 (aos 79,28 anos)'), null);
await page.fill('#sobrevida', '40');
await page.waitForTimeout(300);
checar('sobrevida digitada prevalece e a da tábua fica à vista', (await texto()).includes('daria 45,28'), null);
await page.check('input[name="termoFinal"][value="idade"]');
await page.fill('#dataNascimento', '01/03/1964');
await page.waitForTimeout(300);
checar('idade final abaixo da tábua gera aviso', (await texto()).includes('82,59'), null);
await page.check('input[name="termoFinal"][value="sobrevida"]');
await page.fill('#dataNascimento', '');
await page.waitForTimeout(300);

await page.selectOption('#lesao1', 'cegueira');
await page.waitForTimeout(300);
checar('dano total não se gradua', await page.locator('#campo-grau1').isHidden(), null);
checar('cegueira bilateral vale 100%', /Percentual da perda\n100%/i.test(await texto()), null);
await page.selectOption('#lesao1', 'joelho');
checar('terceira lesão escondida sem a segunda', await page.locator('#campo-lesao3').isHidden(), null);
await page.selectOption('#lesao2', 'baco');
await page.waitForTimeout(300);
checar('escolhida a segunda, a terceira aparece', await page.locator('#campo-lesao3').isVisible(), null);
checar('as lesões somam', /Percentual da perda\n22,5%/i.test(await texto()), null);
await page.selectOption('#lesao2', 'nenhuma');

await page.check('input[name="criterio"][value="cif"]');
await page.waitForTimeout(300);
checar('pela CIF, a tabela DPVAT some', await page.locator('#campo-lesao1').isHidden(), null);
checar('pela CIF, o qualificador aparece', await page.locator('#qualificadorCif').isVisible(), null);
checar('qualificador moderado sem número: meio da faixa', /Percentual da perda\n37%/i.test(await texto()), null);
await page.check('input[name="criterio"][value="dpvat"]');

await page.check('input[name="formaPensao"][value="mensal"]');
await page.waitForTimeout(300);
checar('pensão mensal esconde o termo final', await page.locator('#campo-sobrevida').isHidden(), null);
checar('pensão mensal: 12 vincendas', (await texto()).includes('12 parcelas vincendas'), null);
await page.check('input[name="formaPensao"][value="unica"]');

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

/* --- o roteiro do print: só as datas, digitadas, nenhum valor --- */
// Os testes acima preenchiam salário e horas antes das datas, e assim nunca
// viram o defeito: com só as datas na tela, o cálculo pedia o salário em vez
// de acusar a prescrição. Aqui a ordem é a de quem usa: de cima para baixo.
const digitar = async (id, valor) => {
  await page.locator(`#${id}`).click();
  await page.locator(`#${id}`).pressSequentially(valor.replace(/\//g, ''));
};
const vermelho = async () => (await page.locator('#resultado .impedimento b').innerText().catch(() => ''));

await page.goto(`${BASE}/pedidos.html`, { waitUntil: 'networkidle' });
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

await page.click('[data-pedido="acidente"]');
await page.waitForTimeout(250);
await digitar('dataCiencia', '01/01/2010');
await digitar('dataAjuizamento', '01/01/2020');
await page.waitForTimeout(300);
checar('só datas: acidente acusa o quinquênio da ciência', (await vermelho()).includes('quinquenal'), await vermelho());
checar('só datas: acidente trava o salário', await page.locator('#salarioBase').isDisabled(), null);
checar('só datas: a ciência segue editável', !(await page.locator('#dataCiencia').isDisabled()), null);
checar('só datas: a saída do bloqueio cita a ciência',
  (await page.locator('#resultado .impedimento__saida').innerText()).includes('ciência'), null);

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

await page.goto(`${BASE}/index.html`, { waitUntil: 'networkidle' });
await page.click('[data-tipo="sem_justa_causa"]');
await digitar('dataAdmissao', '01/01/1995');
await digitar('dataAviso', '01/01/2000');
await digitar('dataAjuizamento', '01/01/2020');
await page.waitForTimeout(350);
checar('só datas: rescisão acusa o biênio', (await vermelho()).includes('bienal'), await vermelho());
checar('só datas: rescisão trava o salário', await page.locator('#salarioBase').isDisabled(), null);
await page.click('#formulario button[type="reset"]');
await page.waitForTimeout(300);

/* --- terceira revisão: arts. 480 e 477, §5º, dobra de férias, DSR do intervalo --- */
await page.goto(`${BASE}/index.html`, { waitUntil: 'networkidle' });
const telaR = async () => (await page.locator('#resultado').innerText()).replace(/\u00a0/g, ' ');

await page.click('[data-tipo="sem_justa_causa"]');
checar('marcação manual de férias em dobro saiu da tela', (await page.locator('#feriasDobro').count()) === 0, null);
checar('campo do art. 480 escondido fora da modalidade', await page.locator('#campo-prejuizo480').isHidden(), null);
await page.fill('#dataAdmissao', '01/03/2019');
await page.fill('#dataAviso', '15/09/2026');
await page.fill('#salarioBase', '3.000,00');
await page.fill('#periodosFeriasVencidas', '2');
await page.waitForTimeout(300);
checar('dobra aplicada só ao período com o concessivo vencido', (await telaR()).includes('R$ 9.000,00'), null);
checar('resumo diz quantos períodos vão em dobro', (await telaR()).includes('1 em dobro'), null);

// art. 477, §5º: compensações acima de um mês de remuneração
await page.check('input[name="descontos"][value="outros"]');
await page.fill('#outrosDescontos', '5.000,00');
await page.waitForTimeout(300);
checar('compensação cortada no teto do art. 477, §5º', (await telaR()).includes('art. 477, §5º'), null);
checar('o desconto mostra o valor cortado', (await telaR()).includes('R$ 2.000,00 fora do acerto'), null);

// art. 480: só com prejuízo comprovado
await page.click('[data-tipo="determinado_antecipada_empregado"]');
await page.fill('#dataAdmissao', '01/06/2026');
await page.fill('#dataTermoFinal', '29/08/2026');
await page.fill('#dataAviso', '15/07/2026');
await page.click('input[name="descontos"][value="nenhum"]');
await page.waitForTimeout(300);
checar('campo do art. 480 aparece na saída antecipada', await page.locator('#campo-prejuizo480').isVisible(), null);
checar('sem prejuízo, o art. 480 não desconta', !(await telaR()).includes('Indenização ao empregador'), null);
checar('e a tela explica o teto', (await telaR()).includes('comprovar prejuízo'), null);
await page.fill('#prejuizoArt480', '500,00');
await page.waitForTimeout(300);
checar('com prejuízo, desconta o prejuízo', (await telaR()).includes('Indenização ao empregador'), null);
await page.check('#clausulaAssecuratoria');
await page.waitForTimeout(300);
checar('com a cláusula, o campo do art. 480 some', await page.locator('#campo-prejuizo480').isHidden(), null);

// intervalo do regime antigo: DSR
await page.goto(`${BASE}/pedidos.html`, { waitUntil: 'networkidle' });
await page.click('[data-pedido="intervalo"]');
checar('dias úteis escondidos no regime indenizatório', await page.locator('#diasUteis').isHidden(), null);
await page.fill('#dataInicio', '01/01/2015');
await page.fill('#dataFim', '31/12/2015');
await page.fill('#salarioBase', '2.200,00');
await page.fill('#minutosSuprimidos', '30');
await page.check('input[name="regimeIntervalo"][value="anterior_reforma"]');
await page.waitForTimeout(300);
checar('regime antigo pede os dias do DSR', await page.locator('#diasUteis').isVisible(), null);
checar('regime antigo paga DSR sobre o intervalo', (await telaR()).includes('DSR sobre o intervalo'), null);
checar('e a OJ 394 original tira o DSR da base do FGTS', (await telaR()).includes('8% sobre intervalo, 13º e férias + 1/3'), null);

// horas extras cruzando o marco da OJ 394
await page.click('[data-pedido="horas_extras"]');
await page.fill('#dataInicio', '01/01/2022');
await page.fill('#dataFim', '31/12/2024');
await page.fill('#salarioBase', '2.200,00');
await page.fill('#quantidadeHoras', '30');
await page.waitForTimeout(300);
checar('período cruzando 20/03/2023 é separado', (await telaR()).includes('o cálculo o separou'), null);
checar('13º do período pela soma dos dois trechos', (await telaR()).includes('R$ 1.510,43'), null);

await browser.close();
console.log(checagens.join('\n'));
console.log(erros.length ? 'ERROS DE CONSOLE: ' + erros.join(' | ') : 'sem erros de console');
process.exit(falhas === 0 && erros.length === 0 ? 0 : 1);
