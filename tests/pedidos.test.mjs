import test from 'node:test';
import assert from 'node:assert/strict';
import { calcularHorasExtras, calcularAdicionalRisco, SEMANAS_POR_MES } from '../src/pedidos.js';
import { SALARIO_MINIMO } from '../src/tabelas.js';

const base = {
  dataInicio: '2024-01-01',
  dataFim: '2024-12-31',
  salarioBase: 2000,
  divisor: 220,
  quantidadeHoras: 20,
  modoQuantidade: 'mes',
  adicionalHoraExtra: 50,
  diasUteis: 25,
  diasRepouso: 5,
};

const mensal = (r, chave) => r.mensais.find((m) => m.chave === chave)?.valor ?? 0;
const doPeriodo = (r, chave) => r.periodo.find((p) => p.chave === chave)?.valor ?? 0;

test('periculosidade integra a base de cálculo das horas extras', () => {
  const r = calcularHorasExtras({ ...base, risco: 'periculosidade' });
  assert.deepEqual(r.erros, []);
  assert.equal(r.contexto.risco.valor, 600); // 30% de 2000
  assert.equal(r.contexto.baseCalculo, 2600);
  assert.equal(r.contexto.valorHora, 11.82); // 2600 / 220
  assert.equal(r.contexto.valorHoraExtra, 17.73); // + 50%
  assert.equal(mensal(r, 'horas_extras'), 354.55); // 20 h
});

test('insalubridade usa o salário mínimo como base, salvo escolha diferente', () => {
  const minimo = calcularAdicionalRisco({ risco: 'insalubridade', grauInsalubridade: 20, salarioBase: 2000 });
  assert.equal(minimo.valor, Math.round(SALARIO_MINIMO * 0.2 * 100) / 100);

  const sobreSalario = calcularAdicionalRisco({
    risco: 'insalubridade',
    grauInsalubridade: 40,
    baseInsalubridade: 'salario_base',
    salarioBase: 2000,
  });
  assert.equal(sobreSalario.valor, 800);
});

test('insalubridade e periculosidade não se somam', () => {
  const r = calcularHorasExtras({ ...base, risco: 'insalubridade', grauInsalubridade: 20 });
  assert.equal(r.contexto.risco.valor, 324.2);
  assert.equal(r.contexto.baseCalculo, 2324.2); // só um dos adicionais
});

test('o divisor muda o valor da hora', () => {
  const r220 = calcularHorasExtras(base);
  const r200 = calcularHorasExtras({ ...base, divisor: 200 });
  assert.equal(r220.contexto.valorHora, 9.09); // 2000 / 220
  assert.equal(r200.contexto.valorHora, 10); // 2000 / 200
  assert.equal(mensal(r200, 'horas_extras'), 300); // 20 h x 15,00
});

test('DSR segue a proporção de repousos e dias úteis', () => {
  const r = calcularHorasExtras({ ...base, risco: 'periculosidade' });
  assert.equal(mensal(r, 'dsr'), 70.91); // 354,55 / 25 x 5
});

test('horas informadas por semana viram média mensal', () => {
  const r = calcularHorasExtras({ ...base, modoQuantidade: 'semana', quantidadeHoras: 10 });
  assert.equal(r.contexto.horasMes, Math.round(10 * SEMANAS_POR_MES * 100) / 100);
});

test('o total do período multiplica os valores mensais pelos meses', () => {
  const r = calcularHorasExtras(base);
  assert.equal(r.contexto.meses, 12);
  assert.equal(doPeriodo(r, 'horas_extras'), Math.round(mensal(r, 'horas_extras') * 12 * 100) / 100);
  assert.equal(r.totais.periodo, Math.round(r.totais.mensal * 12 * 100) / 100);
});

test('reflexos podem ser desligados', () => {
  const r = calcularHorasExtras({ ...base, reflexo13: false, reflexoFerias: false, reflexoDSR: false });
  assert.equal(mensal(r, 'dsr'), 0);
  assert.equal(mensal(r, 'reflexo_13'), 0);
  assert.equal(mensal(r, 'reflexo_ferias'), 0);
  assert.equal(r.totais.mensal, mensal(r, 'horas_extras'));
});

test('DSR majorado nos reflexos alerta sobre o marco da OJ 394', () => {
  const antes = calcularHorasExtras({ ...base, dataInicio: '2022-01-01' });
  assert.ok(antes.alertas.some((a) => a.includes('20/03/2023')));

  const depois = calcularHorasExtras({ ...base, dataInicio: '2024-01-01' });
  assert.equal(depois.alertas.length, 0);
});

test('prescrição quinquenal impede o cálculo, e não apenas alerta', () => {
  const r = calcularHorasExtras({ ...base, dataInicio: '2024-01-01', dataAjuizamento: '2030-06-01' });
  assert.ok(r.impedimento);
  assert.equal(r.totais, null);
  assert.equal(r.contexto, null);
  assert.deepEqual(r.mensais, []);
});

test('prescrição integral e parcial recebem mensagens distintas', () => {
  const integral = calcularHorasExtras({
    ...base, dataInicio: '2015-01-01', dataFim: '2020-01-01', dataAjuizamento: '2026-09-18',
  });
  assert.ok(integral.impedimento.integral);
  assert.match(integral.impedimento.titulo, /integralmente prescrito/);
  assert.ok(integral.impedimento.mensagem.includes('18/09/2021')); // marco quinquenal

  const parcial = calcularHorasExtras({
    ...base, dataInicio: '2019-01-01', dataFim: '2024-01-01', dataAjuizamento: '2026-09-18',
  });
  assert.equal(parcial.impedimento.integral, false);
  assert.match(parcial.impedimento.titulo, /parcelas prescritas/);
});

test('período dentro do quinquênio calcula normalmente', () => {
  const r = calcularHorasExtras({
    ...base, dataInicio: '2022-01-01', dataFim: '2024-01-01', dataAjuizamento: '2026-09-18',
  });
  assert.equal(r.impedimento, null);
  assert.ok(r.totais.periodo > 0);
});

test('sem data de ajuizamento não há impedimento a reconhecer', () => {
  const r = calcularHorasExtras({ ...base, dataInicio: '2010-01-01', dataFim: '2012-01-01' });
  assert.equal(r.impedimento, null);
  assert.ok(r.totais.periodo > 0);
});

test('FGTS e multa entram em bloco próprio', () => {
  const r = calcularHorasExtras({ ...base, multaFGTS: true });
  const baseEsperada = Math.round((mensal(r, 'horas_extras') + mensal(r, 'dsr') + mensal(r, 'reflexo_13')) * 12 * 100) / 100;
  assert.equal(r.fgts.base, baseEsperada);
  assert.equal(r.fgts.valor, Math.round(baseEsperada * 0.08 * 100) / 100);
  assert.equal(r.fgts.multa, Math.round(r.fgts.valor * 0.4 * 100) / 100);
  assert.equal(r.totais.geral, Math.round((r.totais.periodo + r.fgts.valor + r.fgts.multa) * 100) / 100);
});

test('campos obrigatórios ausentes retornam erros', () => {
  const r = calcularHorasExtras({});
  assert.ok(r.erros.length >= 4);
});

test('período menor que uma competência vira fração de mês, não zero', () => {
  const r = calcularHorasExtras({ ...base, dataInicio: '2024-01-20', dataFim: '2024-02-10' });
  assert.equal(r.contexto.diasPeriodo, 22);
  assert.ok(r.contexto.mesesFracionados);
  assert.equal(r.contexto.meses, 0.73); // 22 / 30
  assert.ok(r.totais.periodo > 0);
});

test('período com competências fechadas conta meses inteiros', () => {
  const r = calcularHorasExtras({ ...base, dataInicio: '2024-01-01', dataFim: '2024-03-31' });
  assert.equal(r.contexto.meses, 3);
  assert.equal(r.contexto.mesesFracionados, false);
});
