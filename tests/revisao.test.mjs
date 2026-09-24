/**
 * Testes da revisão de fórmulas: cada um fixa uma regra legal que o cálculo
 * precisava observar e não observava, ou que mudou de leitura.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { calcularRescisao, DIAS_AVISO_TRABALHAVEIS } from '../src/calculo.js';
import { calcularMultas } from '../src/pedidos/multas.js';
import { calcularAdicionalNoturno } from '../src/pedidos/noturno.js';
import { calcularHorasExtras } from '../src/pedidos/horas-extras.js';
import { apurarPrescricao, contarPeriodo, conferirDatas } from '../src/pedidos/comum.js';
import { parseData } from '../src/calculo.js';

const verba = (r, chave) => r.proventos.find((p) => p.chave === chave)?.valor ?? 0;
const mensal = (r, chave) => r.mensais.find((m) => m.chave === chave)?.valor ?? 0;

/* ------------------------------- multa do art. 477 (Tema 142 do TST) ----- */

const multaBase = {
  multa477: true, salarioBase: 2500, dataRescisao: '2026-03-01', dataPagamento: '2026-03-30',
};

test('a multa do art. 477 incide sobre a remuneração, não sobre o salário base', () => {
  // Tema 142 de repetitivos: a base é a remuneração dos arts. 457, §1º, e 458.
  const r = calcularMultas({ ...multaBase, outrasParcelas: 400 });
  assert.equal(r.periodo[0].valor, 2900);
  assert.equal(r.contexto.remuneracao, 2900);
});

test('a mora do próprio empregado afasta a multa do art. 477', () => {
  // Parte final do §8º: não basta avisar, tem de deixar de cobrar.
  const r = calcularMultas({ ...multaBase, moraDoEmpregado: true });
  assert.equal(r.totais.geral, 0);
  assert.equal(r.periodo.length, 0);
  assert.ok(r.alertas.some((a) => a.includes('afasta a multa')));
});

test('a mora do empregado não alcança a multa do art. 467', () => {
  const r = calcularMultas({
    ...multaBase, moraDoEmpregado: true, multa467: true, valorIncontroverso: 5000,
  });
  assert.equal(r.totais.geral, 2500);
});

test('pagamento dentro dos dez dias não gera multa', () => {
  const r = calcularMultas({ ...multaBase, dataPagamento: '2026-03-11' });
  assert.equal(r.totais.geral, 0);
  assert.ok(r.alertas.some((a) => a.includes('dentro do prazo')));
});

/* ----------------------- base do adicional noturno (Súmulas 60 e 264) ---- */

const noturnoBase = {
  dataInicio: '2024-01-01', dataFim: '2024-12-31', salarioBase: 2200, divisor: 220, horasNoturnas: 30,
};

test('o adicional de risco integra a hora normal do adicional noturno', () => {
  const sem = calcularAdicionalNoturno(noturnoBase);
  const com = calcularAdicionalNoturno({ ...noturnoBase, risco: 'periculosidade' });
  assert.equal(sem.contexto.baseCalculo, 2200);
  assert.equal(com.contexto.baseCalculo, 2860); // 2.200 + 30%
  // 34,29 h fictas x R$ 13,00 x 20%
  assert.equal(mensal(sem, 'adicional_noturno'), 68.57);
  assert.equal(mensal(com, 'adicional_noturno'), 89.14);
});

test('a insalubridade também integra a base do noturno', () => {
  const r = calcularAdicionalNoturno({
    ...noturnoBase, risco: 'insalubridade', grauInsalubridade: 20,
  });
  assert.equal(r.contexto.baseCalculo, 2524.2); // 2.200 + 20% de 1.621,00
});

/* ------------------------------------- OJ 394, II, da SDI-1 -------------- */

const heBase = { salarioBase: 2200, divisor: 220, quantidadeHoras: 30 };

test('antes de 20/03/2023 o DSR majorado não repercute nas demais verbas', () => {
  const r = calcularHorasExtras({ ...heBase, dataInicio: '2020-01-01', dataFim: '2021-12-31' });
  // reflexo só sobre as horas extras (R$ 450), sem o DSR de R$ 90
  assert.equal(mensal(r, 'reflexo_13'), 37.5);
  assert.ok(r.alertas.some((a) => a.includes('20/03/2023')));
});

test('a partir do marco o DSR majorado entra na base dos reflexos', () => {
  const r = calcularHorasExtras({ ...heBase, dataInicio: '2024-01-01', dataFim: '2024-12-31' });
  assert.equal(mensal(r, 'reflexo_13'), 45); // (450 + 90) / 12
  assert.equal(r.alertas.length, 0);
});

test('período que cruza o marco é separado em dois trechos', () => {
  // 36 meses: 14,61 antes de 20/03/2023 e 21,39 depois. O reflexo no 13º é
  // R$ 37,50 por mês antes (só horas extras) e R$ 45,00 depois (com o DSR).
  const r = calcularHorasExtras({ ...heBase, dataInicio: '2022-01-01', dataFim: '2024-12-31' });
  const periodo = (k) => r.periodo.find((p) => p.chave === k)?.valor ?? 0;
  assert.equal(mensal(r, 'reflexo_13'), 45); // o mensal exibido é o do trecho recente
  assert.equal(periodo('reflexo_13'), 1510.43); // 37,50 x 14,61 + 45,00 x 21,39
  assert.equal(periodo('reflexo_ferias'), 2013.9); // 50,00 x 14,61 + 60,00 x 21,39
  assert.ok(r.alertas.some((a) => a.includes('separou')));
});

test('antes do marco o DSR majorado também não vai para o aviso nem para o FGTS', () => {
  // Redação original da OJ 394: férias, 13º, aviso prévio e FGTS.
  const r = calcularHorasExtras({
    ...heBase, dataInicio: '2021-01-01', dataFim: '2022-12-31', reflexoAviso: true, diasAviso: 30,
  });
  const periodo = (k) => r.periodo.find((p) => p.chave === k)?.valor ?? 0;
  assert.equal(periodo('dsr'), 2160); // o DSR é pago...
  assert.equal(periodo('reflexo_aviso'), 450); // ...mas o aviso é só sobre as horas extras
  assert.equal(r.fgts.base, 13350); // 10.800 + 900 + 1.200 + 450, sem o DSR
  assert.ok(!r.fgts.detalhe.includes('DSR'));
});

test('no trecho após o marco, o DSR entra no FGTS só pelos meses majorados', () => {
  const r = calcularHorasExtras({
    ...heBase, dataInicio: '2022-01-01', dataFim: '2024-12-31', reflexoAviso: true, diasAviso: 30,
  });
  // 16.200 + DSR de 21,39 meses (1.925,10) + 13º + férias + aviso de 540
  assert.equal(r.fgts.base, 22189.43);
  assert.ok(r.fgts.detalhe.includes('DSR (desde 20/03/2023)'));
});

/* --------------------------------------- prescrição bienal --------------- */

const inicio = parseData('2018-01-01');
const fim = parseData('2020-12-31');

test('ajuizamento após o biênio fulmina a pretensão inteira', () => {
  const r = apurarPrescricao(inicio, fim, {
    dataAjuizamento: '2026-09-19', dataExtincao: '2021-01-10',
  });
  assert.ok(r.impedimento?.bienal);
  assert.equal(r.recorte, null);
});

test('dentro do biênio vale o recorte quinquenal', () => {
  const r = apurarPrescricao(parseData('2019-01-01'), parseData('2024-12-31'), {
    dataAjuizamento: '2026-09-19', dataExtincao: '2025-06-01',
  });
  assert.equal(r.impedimento, null);
  assert.equal(r.inicioCalculo.toISOString().slice(0, 10), '2021-09-19');
});

test('o último dia do biênio ainda é tempestivo', () => {
  const r = apurarPrescricao(inicio, fim, {
    dataAjuizamento: '2023-01-10', dataExtincao: '2021-01-10',
  });
  assert.equal(r.impedimento?.bienal, undefined);
});

test('sem a data de extinção só a quinquenal é apurada', () => {
  const r = apurarPrescricao(inicio, fim, { dataAjuizamento: '2026-09-19' });
  assert.ok(r.impedimento);
  assert.equal(r.impedimento.bienal, undefined);
});

/* ----------------- aviso prévio proporcional trabalhado (NT 184/2012) ---- */

const avisoBase = {
  tipo: 'sem_justa_causa', dataAdmissao: '2012-01-10', dataAviso: '2026-03-10', salarioBase: 3000,
};

test('o empregado não cumpre mais de 30 dias de aviso em serviço', () => {
  const r = calcularRescisao({ ...avisoBase, tipoAviso: 'trabalhado' });
  const c = r.contexto;
  assert.equal(c.diasAvisoLegais, 72); // 30 + 3 x 14 anos
  assert.equal(c.diasAvisoTrabalhados, DIAS_AVISO_TRABALHAVEIS);
  assert.equal(c.excedenteTrabalhado, 42);
  assert.equal(verba(r, 'aviso_previo'), 4200); // 3.000 / 30 x 42
  assert.ok(r.alertas.some((a) => a.includes('184/2012')));
});

test('trabalhado e indenizado projetam o contrato para o mesmo dia', () => {
  const t = calcularRescisao({ ...avisoBase, tipoAviso: 'trabalhado' });
  const i = calcularRescisao({ ...avisoBase, tipoAviso: 'indenizado' });
  assert.equal(
    t.contexto.dataProjetada.toISOString(),
    i.contexto.dataProjetada.toISOString(),
  );
  // mesmo tempo de serviço, mesmos avos
  assert.equal(t.contexto.avos13, i.contexto.avos13);
  assert.equal(t.contexto.avosFerias, i.contexto.avosFerias);
});

test('aviso de até 30 dias é cumprido por inteiro, sem excedente', () => {
  const r = calcularRescisao({
    ...avisoBase, dataAdmissao: '2025-06-01', tipoAviso: 'trabalhado',
  });
  assert.equal(r.contexto.diasAvisoLegais, 30);
  assert.equal(r.contexto.excedenteTrabalhado, 0);
  assert.equal(verba(r, 'aviso_previo'), 0);
  assert.equal(r.alertas.length, 0);
});

test('o pedido de demissão deve 30 dias, não o aviso proporcional', () => {
  // Um período de férias vencidas garante saldo para o desconto caber inteiro.
  const r = calcularRescisao({
    ...avisoBase, tipo: 'pedido_demissao', tipoAviso: 'nao_cumprido', periodosFeriasVencidas: 1,
  });
  assert.equal(r.contexto.diasAvisoLegais, 30);
  assert.equal(r.descontos.find((d) => d.chave === 'aviso_nao_cumprido')?.valor, 3000);
});

test('sem saldo no acerto, o desconto do aviso para no que as verbas comportam', () => {
  // 10 dias de março, 13º e férias proporcionais: R$ 2.166,67. O aviso não
  // cumprido vale R$ 3.000,00, mas o acerto não termina com o empregado devendo.
  const r = calcularRescisao({ ...avisoBase, tipo: 'pedido_demissao', tipoAviso: 'nao_cumprido' });
  assert.equal(r.totais.liquido, 0);
  assert.equal(r.contexto.descontosNaoAbatidos, 945.83);
  assert.ok(r.alertas.some((a) => a.includes('não comportam')));
});


/* ------------------- proporção do período em uma verba mensal ------------ */

const periodoDe = (a, b) => contarPeriodo(parseData(a), parseData(b));

test('meses fechados valem exatamente o número de meses', () => {
  assert.equal(periodoDe('2024-01-01', '2024-12-31').meses, 12);
  assert.equal(periodoDe('2023-06-01', '2024-05-31').meses, 12);
  assert.equal(periodoDe('2024-02-01', '2024-02-29').meses, 1); // fevereiro bissexto
  assert.equal(periodoDe('2024-01-01', '2024-03-31').meses, 3);
});

test('mês partido vale a fração dos seus próprios dias', () => {
  // Meia competência não paga mês cheio de hora extra...
  assert.equal(periodoDe('2024-01-01', '2024-01-15').meses, 0.48); // 15/31
  // ...e cinquenta dias não são engolidos como se fossem trinta.
  assert.equal(periodoDe('2024-01-20', '2024-03-10').meses, 1.71); // 12/31 + 1 + 10/31
});

test('a proporção cresce junto com o período', () => {
  // A regra dos 15 dias dava saltos: 14 dias valiam zero e 15 valiam um mês.
  let anterior = 0;
  for (let dia = 1; dia <= 31; dia += 1) {
    const meses = periodoDe('2024-01-01', `2024-01-${String(dia).padStart(2, '0')}`).meses;
    assert.ok(meses >= anterior, `dia ${dia}: ${meses} < ${anterior}`);
    assert.ok(meses <= 1, `dia ${dia}: ${meses} > 1`);
    anterior = meses;
  }
  assert.equal(anterior, 1);
});

test('o período recortado pela prescrição rende o mesmo que o período certo', () => {
  const comum = { salarioBase: 2200, divisor: 220, quantidadeHoras: 30 };
  const recortado = calcularHorasExtras({
    ...comum, dataInicio: '2017-01-10', dataFim: '2024-12-31', dataAjuizamento: '2026-03-15',
  });
  const direto = calcularHorasExtras({ ...comum, dataInicio: '2021-03-15', dataFim: '2024-12-31' });
  assert.ok(recortado.recorte);
  assert.equal(recortado.contexto.inicio.toISOString(), direto.contexto.inicio.toISOString());
  assert.equal(recortado.totais.geral, direto.totais.geral);
});


/* ---------------------------- coerência entre as datas informadas -------- */

test('período que passa do ajuizamento é apontado', () => {
  const avisos = conferirDatas(parseData('2024-01-01'), parseData('2026-12-31'), {
    dataAjuizamento: '2026-03-15',
  });
  assert.ok(avisos.some((a) => a.includes('depois do ajuizamento')));
});

test('período que passa da extinção do contrato é apontado', () => {
  const avisos = conferirDatas(parseData('2024-01-01'), parseData('2026-12-31'), {
    dataExtincao: '2025-06-30',
  });
  assert.ok(avisos.some((a) => a.includes('depois do fim do contrato')));
});

test('período que começa depois da extinção é apontado', () => {
  const avisos = conferirDatas(parseData('2026-01-01'), parseData('2026-12-31'), {
    dataExtincao: '2025-06-30',
  });
  assert.equal(avisos.length, 2); // começa depois e termina depois
});

test('datas coerentes não geram aviso nenhum', () => {
  const avisos = conferirDatas(parseData('2022-01-01'), parseData('2024-12-31'), {
    dataAjuizamento: '2025-03-15', dataExtincao: '2024-12-31',
  });
  assert.deepEqual(avisos, []);
});

test('o aviso de data chega ao resultado do pedido', () => {
  const r = calcularHorasExtras({
    salarioBase: 2200, divisor: 220, quantidadeHoras: 30,
    dataInicio: '2024-01-01', dataFim: '2026-12-31', dataAjuizamento: '2026-03-15',
  });
  assert.ok(r.alertas.some((a) => a.includes('depois do ajuizamento')));
  assert.ok(r.totais.geral > 0); // avisa, mas não barra
});

/* ------------------------------ limites dos descontos na rescisão -------- */
// Art. 477, §5º, da CLT: nenhuma compensação no acerto passa de um mês de
// remuneração — teto que a SDI-1 do TST aplica a toda compensação. E o acerto
// não termina com o empregado devendo: o que as verbas não comportam, o
// empregador cobra por outra via.

const comDescontos = {
  tipo: 'sem_justa_causa', tipoAviso: 'indenizado', salarioBase: 3000,
  dataAdmissao: '2020-01-10', dataAviso: '2026-03-10', periodosFeriasVencidas: 1,
};
const desconto = (r, chave) => r.descontos.find((d) => d.chave === chave)?.valor ?? 0;

test('compensações acima de um mês de remuneração são cortadas no teto', () => {
  const r = calcularRescisao({
    ...comDescontos,
    descontos: ['adiantamento_salario', 'outros'],
    adiantamentoSalario: 1200,
    outrosDescontos: 2500, // juntos, 3.700: 700 acima do teto de 3.000
  });
  assert.equal(desconto(r, 'adiantamentoSalario') + desconto(r, 'outrosDescontos'), 3000);
  assert.equal(r.contexto.descontosNaoAbatidos, 700);
  assert.ok(r.alertas.some((a) => a.includes('art. 477, §5º')));
});

test('dentro do teto, as compensações entram inteiras', () => {
  const r = calcularRescisao({ ...comDescontos, descontos: ['outros'], outrosDescontos: 2999 });
  assert.equal(desconto(r, 'outrosDescontos'), 2999);
  assert.equal(r.contexto.descontosNaoAbatidos, 0);
});

test('INSS, IRRF e pensão não contam para o teto do §5º', () => {
  // Pensão é ordem judicial em favor de terceiro; INSS e IRRF, retenção legal.
  const r = calcularRescisao({
    ...comDescontos, descontos: ['pensao', 'outros'], pensaoPercentual: 30, outrosDescontos: 3000,
  });
  assert.ok(desconto(r, 'pensao') > 0);
  assert.equal(desconto(r, 'outrosDescontos'), 3000); // no limite, mas inteiro
  assert.equal(r.contexto.descontosNaoAbatidos, 0);
});

test('o teto do §5º é a remuneração, com adicionais e médias', () => {
  const r = calcularRescisao({
    ...comDescontos, adicionais: ['periculosidade_30'], descontos: ['outros'], outrosDescontos: 5000,
  });
  assert.equal(desconto(r, 'outrosDescontos'), 3900); // 3.000 + 30%
});

test('o acerto nunca termina com o empregado devendo', () => {
  // Justa causa, dois dias trabalhados no mês e um empréstimo alto.
  const r = calcularRescisao({
    tipo: 'justa_causa', salarioBase: 3000, dataAdmissao: '2025-06-10', dataAviso: '2026-03-02',
    descontos: ['outros'], outrosDescontos: 2800,
  });
  assert.equal(r.totais.liquido, 0);
  assert.ok(r.contexto.descontosNaoAbatidos > 0);
  assert.ok(r.alertas.some((a) => a.includes('não comportam')));
});
