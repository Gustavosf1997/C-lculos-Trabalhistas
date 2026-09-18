import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calcularRescisao, calcularINSS, calcularIRRF, contarAvos, contarAvosFerias,
  periodosAquisitivos, parseData,
} from '../src/calculo.js';

const base = {
  dataAdmissao: '2019-03-01',
  dataAviso: '2026-09-15',
  salarioBase: 3000,
  saldoFgts: 20000,
  dependentes: 0,
};

const verba = (r, chave) => r.proventos.find((p) => p.chave === chave)?.valor ?? 0;
const desconto = (r, chave) => r.descontos.find((d) => d.chave === chave)?.valor ?? 0;

test('avos consideram fração igual ou superior a 15 dias', () => {
  assert.equal(contarAvos(parseData('2026-01-01'), parseData('2026-11-05')), 10);
  assert.equal(contarAvos(parseData('2026-01-16'), parseData('2026-02-20')), 2);
  assert.equal(contarAvos(parseData('2026-01-20'), parseData('2026-02-14')), 0); // 12 e 14 dias
});

test('INSS progressivo sobre uma faixa intermediária', () => {
  // 1518,00 x 7,5% + 1275,88 x 9% + 206,12 x 12%
  assert.equal(calcularINSS(3000), 253.41);
});

test('dispensa sem justa causa com aviso indenizado projeta o contrato', () => {
  const r = calcularRescisao({ ...base, tipo: 'sem_justa_causa', tipoAviso: 'indenizado' });
  assert.deepEqual(r.erros, []);
  assert.equal(r.contexto.diasAvisoLegais, 51); // 30 + 3 x 7 anos
  assert.equal(r.contexto.dataProjetada.toISOString().slice(0, 10), '2026-11-05');
  assert.equal(verba(r, 'saldo_salario'), 1500);
  assert.equal(verba(r, 'aviso_previo'), 5100);
  assert.equal(r.contexto.avos13, 10);
  assert.equal(verba(r, 'decimo_terceiro'), 2500);
  assert.equal(r.contexto.avosFerias, 8);
  assert.equal(verba(r, 'ferias_proporcionais'), 2000);
  assert.equal(verba(r, 'terco_proporcionais'), 666.67);
  assert.equal(r.fgts.percentualMulta, 0.4);
  // 8% sobre saldo + 13º + aviso, somado ao saldo informado
  assert.equal(r.fgts.rescisao, 728);
  assert.equal(r.fgts.multa, 8291.2);
});

test('justa causa paga apenas saldo de salário e férias vencidas', () => {
  const r = calcularRescisao({ ...base, tipo: 'justa_causa', periodosFeriasVencidas: 1 });
  assert.equal(verba(r, 'decimo_terceiro'), 0);
  assert.equal(verba(r, 'ferias_proporcionais'), 0);
  assert.equal(verba(r, 'aviso_previo'), 0);
  assert.equal(verba(r, 'ferias_vencidas'), 3000);
  assert.equal(verba(r, 'terco_vencidas'), 1000);
  assert.equal(r.fgts.multa, 0);
});

test('pedido de demissão sem cumprir aviso gera desconto de 30 dias', () => {
  const r = calcularRescisao({ ...base, tipo: 'pedido_demissao', tipoAviso: 'nao_cumprido' });
  assert.equal(verba(r, 'aviso_previo'), 0);
  assert.equal(desconto(r, 'aviso_nao_cumprido'), 3000);
  assert.equal(r.fgts.multa, 0);
});

test('comum acordo paga metade do aviso e multa de 20%', () => {
  const r = calcularRescisao({ ...base, tipo: 'comum_acordo', tipoAviso: 'indenizado_metade' });
  assert.equal(r.contexto.diasAvisoDevidos, 26); // metade de 51, arredondada
  assert.equal(verba(r, 'aviso_previo'), 2600);
  assert.equal(r.fgts.percentualMulta, 0.2);
});

test('faltas injustificadas reduzem os dias de férias', () => {
  const r = calcularRescisao({
    ...base,
    tipo: 'sem_justa_causa',
    tipoAviso: 'indenizado',
    faltasInjustificadas: 10,
    periodosFeriasVencidas: 1,
  });
  assert.equal(r.contexto.diasFerias, 24);
  assert.equal(verba(r, 'ferias_vencidas'), 2400);
});

test('campos obrigatórios ausentes retornam erros', () => {
  const r = calcularRescisao({ tipo: 'sem_justa_causa' });
  assert.ok(r.erros.length >= 3);
});

test('férias vencidas não são presumidas quando o campo fica vazio', () => {
  const r = calcularRescisao({ ...base, tipo: 'sem_justa_causa', tipoAviso: 'indenizado' });
  assert.equal(verba(r, 'ferias_vencidas'), 0);
  assert.equal(r.contexto.periodosCompletosCalculados, 7); // apenas informativo
});

test('férias vencidas em dobro seguem o art. 137 da CLT', () => {
  const r = calcularRescisao({
    ...base,
    tipo: 'sem_justa_causa',
    tipoAviso: 'indenizado',
    periodosFeriasVencidas: 1,
    feriasDobro: true,
  });
  assert.equal(verba(r, 'ferias_vencidas'), 6000);
  assert.equal(verba(r, 'terco_vencidas'), 2000);
});

/* ------------------------------ contratos por prazo determinado ----------- */

const experiencia = {
  dataAdmissao: '2026-06-01',
  dataTermoFinal: '2026-08-29', // 90 dias
  salarioBase: 2000,
  saldoFgts: 500,
};

test('término no prazo: sem aviso prévio e sem multa do FGTS', () => {
  const r = calcularRescisao({ ...experiencia, tipo: 'determinado_termo_final' });
  assert.deepEqual(r.erros, []);
  assert.equal(r.contexto.ultimoDiaTrabalhado.toISOString().slice(0, 10), '2026-08-29');
  assert.equal(r.contexto.diasAvisoLegais, 0);
  assert.equal(verba(r, 'saldo_salario'), 1933.33);
  assert.equal(r.contexto.avos13, 3);
  assert.equal(verba(r, 'decimo_terceiro'), 500);
  assert.equal(verba(r, 'ferias_proporcionais'), 500);
  assert.equal(r.fgts.multa, 0);
  assert.equal(r.alertas.length, 0); // 90 dias ainda cabe na experiência
});

test('rescisão antecipada pelo empregador paga metade dos salários restantes (art. 479)', () => {
  const r = calcularRescisao({
    ...experiencia,
    tipo: 'determinado_antecipada_empregador',
    dataAviso: '2026-07-15',
  });
  assert.equal(r.contexto.diasRestantes, 45);
  assert.equal(verba(r, 'indenizacao_art_479'), 1500); // (2000/30 x 45) / 2
  assert.equal(verba(r, 'aviso_previo'), 0);
  assert.equal(r.fgts.percentualMulta, 0.4);
});

test('rescisão antecipada pelo empregado desconta a indenização do art. 480', () => {
  const r = calcularRescisao({
    ...experiencia,
    tipo: 'determinado_antecipada_empregado',
    dataAviso: '2026-07-15',
  });
  assert.equal(desconto(r, 'indenizacao_art_480'), 1500);
  assert.equal(r.fgts.multa, 0);
});

test('cláusula assecuratória troca o art. 479 pelo aviso prévio', () => {
  const r = calcularRescisao({
    ...experiencia,
    tipo: 'determinado_antecipada_empregador',
    dataAviso: '2026-07-15',
    clausulaAssecuratoria: true,
    tipoAviso: 'indenizado',
  });
  assert.equal(verba(r, 'indenizacao_art_479'), 0);
  assert.equal(r.contexto.diasAvisoLegais, 30);
  assert.equal(verba(r, 'aviso_previo'), 2000);
  assert.equal(r.contexto.dataProjetada.toISOString().slice(0, 10), '2026-08-14');
  assert.equal(r.fgts.seguroDesemprego, 'Sim, se preenchidos os requisitos legais');
  assert.equal(r.alertas.length, 1);
});

test('contrato a termo valida o termo final', () => {
  const semTermo = calcularRescisao({ ...experiencia, dataTermoFinal: '', tipo: 'determinado_termo_final' });
  assert.ok(semTermo.erros.some((e) => e.includes('termo final')));

  const foraDoPrazo = calcularRescisao({
    ...experiencia,
    tipo: 'determinado_antecipada_empregador',
    dataAviso: '2026-09-10',
  });
  assert.ok(foraDoPrazo.erros.some((e) => e.includes('antes do termo final')));
});

test('contrato a termo com mais de 90 dias alerta que não é experiência', () => {
  const r = calcularRescisao({
    ...experiencia,
    dataTermoFinal: '2026-12-31',
    tipo: 'determinado_termo_final',
  });
  assert.deepEqual(r.erros, []);
  assert.ok(r.alertas.some((a) => a.includes('90 dias')));
});

test('contratos curtos informam meses e dias em vez de anos', () => {
  const r = calcularRescisao({ ...experiencia, tipo: 'determinado_termo_final' });
  assert.equal(r.contexto.anos, 0);
  assert.equal(r.contexto.meses, 2);
  assert.equal(r.contexto.diasContrato, 90);
});

/* --------------------------------------------- correções de fórmula ------- */

test('saldo de salário não passa do mês cheio em meses de 31 dias', () => {
  const r = calcularRescisao({
    ...base,
    tipo: 'sem_justa_causa',
    tipoAviso: 'indenizado',
    dataAviso: '2026-01-31',
    salarioBase: 3000,
  });
  assert.equal(r.contexto.diasSaldo, 30);
  assert.equal(verba(r, 'saldo_salario'), 3000); // e não 3.100,00
});

test('aviso indenizado que projeta para o ano seguinte gera 13º dos dois anos', () => {
  const r = calcularRescisao({
    tipo: 'sem_justa_causa',
    tipoAviso: 'indenizado',
    dataAdmissao: '2020-01-10',
    dataAviso: '2026-12-20',
    salarioBase: 1200,
  });
  assert.equal(r.contexto.dataProjetada.toISOString().slice(0, 10), '2027-02-06');
  assert.equal(r.contexto.avos13, 12);
  assert.equal(r.contexto.avos13AnoSeguinte, 1);
  assert.equal(verba(r, 'decimo_terceiro'), 1200);
  assert.equal(verba(r, 'decimo_terceiro_ano_seguinte'), 100);
});

test('IRRF usa o desconto simplificado quando é mais favorável', () => {
  const inss = calcularINSS(5000);
  assert.equal(inss, 509.6);
  // base legal 4.490,40 -> R$ 334,85; base simplificada 4.392,80 -> R$ 312,89
  assert.equal(calcularIRRF(5000, { inss }), 312.89);
});

test('pensão alimentícia reduz a base do IRRF', () => {
  const inss = calcularINSS(5000);
  const semPensao = calcularIRRF(5000, { inss });
  const comPensao = calcularIRRF(5000, { inss, pensao: 1000 });
  assert.ok(comPensao < semPensao);
  assert.equal(comPensao, 129.4);
});

/* ------------------------------------------------- adicionais legais ------ */

test('adicionais marcados integram a remuneração', () => {
  const r = calcularRescisao({
    ...base,
    tipo: 'sem_justa_causa',
    tipoAviso: 'indenizado',
    salarioBase: 3000,
    adicionais: ['insalubridade_20'],
  });
  assert.equal(r.contexto.totalAdicionais, 303.6); // 20% do salário mínimo
  assert.equal(r.contexto.remuneracao, 3303.6);
});

test('periculosidade incide sobre o salário base', () => {
  const r = calcularRescisao({
    ...base,
    tipo: 'sem_justa_causa',
    tipoAviso: 'indenizado',
    salarioBase: 3000,
    adicionais: ['periculosidade_30'],
  });
  assert.equal(r.contexto.totalAdicionais, 900);
});

test('adicional noturno usa as horas informadas', () => {
  const r = calcularRescisao({
    ...base,
    tipo: 'sem_justa_causa',
    tipoAviso: 'indenizado',
    salarioBase: 3000,
    adicionais: ['noturno_20'],
    horasNoturnas: 20,
  });
  assert.equal(r.contexto.totalAdicionais, 54.55); // (3000/220) x 20 x 20%
});

test('sem adicionais marcados a remuneração é só o salário', () => {
  const r = calcularRescisao({ ...base, tipo: 'sem_justa_causa', tipoAviso: 'indenizado', salarioBase: 3000 });
  assert.equal(r.contexto.totalAdicionais, 0);
  assert.equal(r.contexto.remuneracao, 3000);
});

/* ----------------------------------------------- descontos escolhidos ----- */

test('horas negativas seguem o salário-hora', () => {
  const r = calcularRescisao({
    ...base,
    tipo: 'sem_justa_causa',
    tipoAviso: 'indenizado',
    salarioBase: 2200,
    descontos: ['horas_negativas'],
    horasNegativas: 8,
  });
  assert.equal(r.contexto.valorHora, 10); // 2200 / 220
  assert.equal(desconto(r, 'horas_negativas'), 80);
});

test('o divisor informado muda o salário-hora', () => {
  const r = calcularRescisao({
    ...base,
    tipo: 'sem_justa_causa',
    tipoAviso: 'indenizado',
    salarioBase: 2200,
    divisor: 200,
    descontos: ['horas_negativas'],
    horasNegativas: 8,
  });
  assert.equal(r.contexto.valorHora, 11);
  assert.equal(desconto(r, 'horas_negativas'), 88);
});

test('desconto não marcado não entra no acerto', () => {
  const r = calcularRescisao({
    ...base,
    tipo: 'sem_justa_causa',
    tipoAviso: 'indenizado',
    salarioBase: 2200,
    horasNegativas: 8,
    outrosDescontos: 500,
    pensaoPercentual: 30,
    descontos: [],
  });
  assert.equal(desconto(r, 'horas_negativas'), 0);
  assert.equal(desconto(r, 'outrosDescontos'), 0);
  assert.equal(desconto(r, 'pensao'), 0);
});

test('descontos marcados entram todos', () => {
  const r = calcularRescisao({
    ...base,
    tipo: 'sem_justa_causa',
    tipoAviso: 'indenizado',
    salarioBase: 2200,
    horasNegativas: 4,
    adiantamentoSalario: 300,
    outrosDescontos: 150,
    descontos: ['horas_negativas', 'adiantamento_salario', 'outros'],
  });
  assert.equal(desconto(r, 'horas_negativas'), 40);
  assert.equal(desconto(r, 'adiantamentoSalario'), 300);
  assert.equal(desconto(r, 'outrosDescontos'), 150);
});

/* ------------------------------------- avos de férias por ciclo ----------- */

const avosFeriasDe = (admissao, saida) => {
  const { inicioPeriodoAtual } = periodosAquisitivos(parseData(admissao), parseData(saida));
  return contarAvosFerias(inicioPeriodoAtual, parseData(saida));
};

test('férias contam ciclos a partir do dia da admissão, não meses do calendário', () => {
  // Período aquisitivo em curso desde 10/03/2026; o ciclo aberto vai de 10/09 a 09/10.
  assert.equal(avosFeriasDe('2020-03-10', '2026-09-20'), 6); // 11 dias no ciclo: não conta
  assert.equal(avosFeriasDe('2020-03-10', '2026-09-23'), 6); // 14 dias: ainda não conta
  assert.equal(avosFeriasDe('2020-03-10', '2026-09-24'), 7); // 15 dias: conta
});

test('o mês do calendário não decide o avo de férias', () => {
  // Saída em 20/09: 20 dias no mês de setembro, mas só 11 dias no ciclo.
  const r = calcularRescisao({
    tipo: 'pedido_demissao',
    tipoAviso: 'dispensado',
    dataAdmissao: '2020-03-10',
    dataAviso: '2026-09-20',
    salarioBase: 3000,
  });
  assert.equal(r.contexto.avosFerias, 6);
  assert.equal(r.contexto.avos13, 9); // o 13º, esse sim, conta por competência mensal
});

test('ciclo de férias respeita admissão em dia que não existe em todo mês', () => {
  // Admissão em 31/01: o ciclo seguinte encosta no último dia de fevereiro.
  assert.equal(avosFeriasDe('2024-01-31', '2026-03-20'), 2);
});

test('contrato que começa no dia 1º dá o mesmo resultado nas duas contagens', () => {
  assert.equal(avosFeriasDe('2019-03-01', '2026-11-05'), 8);
  assert.equal(contarAvos(parseData('2026-03-01'), parseData('2026-11-05')), 8);
});

/* --------------------------------- saldo de salário e bases de cálculo ---- */

test('médias de variáveis integram as indenizações, não o saldo de salário', () => {
  const r = calcularRescisao({
    ...base,
    tipo: 'sem_justa_causa',
    tipoAviso: 'indenizado',
    salarioBase: 3000,
    mediaComissoes: 600,
  });
  assert.equal(r.contexto.remuneracaoFixa, 3000);
  assert.equal(r.contexto.remuneracao, 3600);
  assert.equal(verba(r, 'saldo_salario'), 1500); // 3.000 / 30 x 15, e não 3.600
  assert.equal(verba(r, 'aviso_previo'), 6120); // aviso sobre a remuneração integrada
  assert.equal(verba(r, 'decimo_terceiro'), 3000); // 3.600 / 12 x 10
});

test('mês trabalhado por inteiro paga 30/30, inclusive em fevereiro', () => {
  const fevereiro = calcularRescisao({
    tipo: 'pedido_demissao',
    tipoAviso: 'dispensado',
    dataAdmissao: '2020-01-10',
    dataAviso: '2026-02-28',
    salarioBase: 3000,
  });
  assert.equal(fevereiro.contexto.diasSaldo, 30);
  assert.equal(verba(fevereiro, 'saldo_salario'), 3000);

  const janeiro = calcularRescisao({
    tipo: 'pedido_demissao',
    tipoAviso: 'dispensado',
    dataAdmissao: '2020-01-10',
    dataAviso: '2026-01-31',
    salarioBase: 3000,
  });
  assert.equal(janeiro.contexto.diasSaldo, 30);
  assert.equal(verba(janeiro, 'saldo_salario'), 3000);
});

test('admissão no mesmo mês da saída conta só os dias do contrato', () => {
  const r = calcularRescisao({
    tipo: 'pedido_demissao',
    tipoAviso: 'dispensado',
    dataAdmissao: '2026-09-10',
    dataAviso: '2026-09-20',
    salarioBase: 3000,
  });
  assert.equal(r.contexto.diasSaldo, 11); // de 10 a 20, e não os 20 dias do mês
  assert.equal(verba(r, 'saldo_salario'), 1100);
});

test('períodos de férias vencidas além dos completos geram alerta', () => {
  const r = calcularRescisao({
    tipo: 'pedido_demissao',
    tipoAviso: 'dispensado',
    dataAdmissao: '2024-01-10',
    dataAviso: '2026-09-20',
    salarioBase: 3000,
    periodosFeriasVencidas: 5,
  });
  assert.equal(r.contexto.periodosVencidos, 2);
  assert.ok(r.alertas.some((a) => a.includes('completou 2')));
});

/* ------------------------------------------ horas extras do mês ----------- */

const comHorasExtras = {
  tipo: 'sem_justa_causa',
  tipoAviso: 'indenizado',
  dataAdmissao: '2019-03-01',
  dataAviso: '2026-09-15',
  salarioBase: 3300,
  divisor: 220,
  horasExtras: 20,
};

test('horas extras do mês viram verba própria pelo salário-hora', () => {
  const r = calcularRescisao(comHorasExtras);
  assert.equal(verba(r, 'horas_extras'), 450); // (3.300 / 220) x 1,5 x 20
  assert.equal(r.contexto.valorHorasExtras, 450);
});

test('o adicional de hora extra pode ser diferente de 50%', () => {
  const r = calcularRescisao({ ...comHorasExtras, adicionalHoraExtra: 100 });
  assert.equal(verba(r, 'horas_extras'), 600); // 15,00 x 2 x 20
});

test('o adicional entra na hora extra pela base integrada (Súmula 264)', () => {
  const r = calcularRescisao({ ...comHorasExtras, adicionais: ['periculosidade_30'] });
  // hora normal: (3.300 + 990) / 220 = 19,50; com 50% = 29,25
  assert.equal(verba(r, 'horas_extras'), 585);
});

test('horas extras do mês não integram aviso, 13º nem férias', () => {
  const r = calcularRescisao(comHorasExtras);
  assert.equal(r.contexto.remuneracao, 3300); // base das indenizações sem as horas
  assert.equal(verba(r, 'aviso_previo'), 5610); // 3.300 / 30 x 51
  assert.equal(verba(r, 'decimo_terceiro'), 2750); // 3.300 / 12 x 10
});

test('INSS, IRRF e FGTS do mês alcançam as horas extras', () => {
  const sem = calcularRescisao({ ...comHorasExtras, horasExtras: 0 });
  const com = calcularRescisao(comHorasExtras);
  assert.ok(desconto(com, 'inss_salario') > desconto(sem, 'inss_salario'));
  assert.equal(com.fgts.rescisao, Math.round((1650 + 450 + 2750 + 5610) * 0.08 * 100) / 100);
});

/* ------------------------------- coerência entre as horas do cálculo ------ */

test('horas negativas usam a mesma hora normal das horas extras', () => {
  const r = calcularRescisao({
    ...base,
    tipo: 'sem_justa_causa',
    tipoAviso: 'indenizado',
    salarioBase: 2200,
    divisor: 220,
    adicionais: ['periculosidade_30'],
    horasExtras: 4,
    descontos: ['horas_negativas'],
    horasNegativas: 8,
  });
  // hora normal: (2.200 + 660) / 220 = 13,00
  assert.equal(desconto(r, 'horas_negativas'), 104); // 8 x 13,00
  assert.equal(verba(r, 'horas_extras'), 78); // 4 x 13,00 x 1,5
});

test('13º de dois anos é tributado como dois fatos, não como um só', () => {
  const r = calcularRescisao({
    tipo: 'sem_justa_causa',
    tipoAviso: 'indenizado',
    dataAdmissao: '2020-01-10',
    dataAviso: '2026-12-20',
    salarioBase: 2500,
  });
  assert.equal(verba(r, 'decimo_terceiro'), 2500);
  assert.equal(verba(r, 'decimo_terceiro_ano_seguinte'), 208.33);
  // INSS de cada ano, e não da soma: 202,23 + 15,62
  assert.equal(desconto(r, 'inss_13'), 217.85);
  assert.notEqual(desconto(r, 'inss_13'), calcularINSS(2708.33));
});
