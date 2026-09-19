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
import { apurarPrescricao } from '../src/pedidos/comum.js';
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

test('período que cruza o marco calcula com o reflexo e avisa', () => {
  const r = calcularHorasExtras({ ...heBase, dataInicio: '2022-01-01', dataFim: '2024-12-31' });
  assert.equal(mensal(r, 'reflexo_13'), 45);
  assert.ok(r.alertas.some((a) => a.includes('em separado')));
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
  const r = calcularRescisao({
    ...avisoBase, tipo: 'pedido_demissao', tipoAviso: 'nao_cumprido',
  });
  assert.equal(r.contexto.diasAvisoLegais, 30);
  assert.equal(r.descontos.find((d) => d.chave === 'aviso_nao_cumprido')?.valor, 3000);
});
