import test from 'node:test';
import assert from 'node:assert/strict';
import { calcularAdicionalNoturno } from '../src/pedidos/noturno.js';
import { calcularIntervalo } from '../src/pedidos/intervalo.js';
import { calcularAdicionalRiscoPedido } from '../src/pedidos/insalubridade.js';
import { calcularMultas } from '../src/pedidos/multas.js';
import { SALARIO_MINIMO } from '../src/tabelas.js';

const periodo = { dataInicio: '2024-01-01', dataFim: '2024-12-31' };
const jornada = { salarioBase: 2200, divisor: 220 }; // hora normal de R$ 10,00
const verba = (r, chave) => r.mensais.find((m) => m.chave === chave)?.valor ?? 0;

/* ----------------------------------------------- adicional noturno ------- */

test('adicional noturno aplica a hora reduzida de 52min30s', () => {
  const r = calcularAdicionalNoturno({ ...periodo, ...jornada, horasNoturnas: 30 });
  // 30 h de relógio = 34,29 h fictas; 34,29 x 10,00 x 20% = 68,57
  assert.equal(r.contexto.horasFictas, 34.29);
  assert.equal(verba(r, 'adicional_noturno'), 68.57);
});

test('sem a hora reduzida o adicional cai proporcionalmente', () => {
  const r = calcularAdicionalNoturno({ ...periodo, ...jornada, horasNoturnas: 30, horaReduzida: false });
  assert.equal(r.contexto.horasFictas, 30);
  assert.equal(verba(r, 'adicional_noturno'), 60); // 30 x 10,00 x 20%
});

test('percentual do noturno é editável para o rural (25%)', () => {
  const r = calcularAdicionalNoturno({
    ...periodo, ...jornada, horasNoturnas: 30, horaReduzida: false, adicionalNoturno: 25,
  });
  assert.equal(verba(r, 'adicional_noturno'), 75);
});

test('noturno gera DSR e reflexos', () => {
  const r = calcularAdicionalNoturno({ ...periodo, ...jornada, horasNoturnas: 30, horaReduzida: false });
  assert.equal(verba(r, 'dsr'), 12); // 60 / 25 x 5
  assert.equal(verba(r, 'reflexo_13'), 6); // (60 + 12) / 12
  assert.equal(verba(r, 'reflexo_ferias'), 8);
});

/* ------------------------------------------- intervalo intrajornada ------ */

test('intervalo pós-reforma paga só o suprimido, sem reflexos', () => {
  const r = calcularIntervalo({ ...periodo, ...jornada, minutosSuprimidos: 30 });
  // 30 min x 22 dias = 11 h; 11 x 15,00 (hora + 50%) = 165,00
  assert.equal(verba(r, 'intervalo'), 165);
  assert.equal(verba(r, 'reflexo_13'), 0);
  assert.equal(verba(r, 'reflexo_ferias'), 0);
  assert.equal(r.fgts.valor, 0); // natureza indenizatória
  assert.equal(r.totais.mensal, 165);
});

test('intervalo anterior à reforma paga o integral, com reflexos', () => {
  const r = calcularIntervalo({
    ...periodo, ...jornada, minutosSuprimidos: 30, regimeIntervalo: 'anterior_reforma',
    dataInicio: '2015-01-01', dataFim: '2016-12-31',
  });
  // Súmula 437: o intervalo inteiro, não só os 30 minutos suprimidos
  assert.equal(verba(r, 'intervalo'), 330); // 60 min x 22 dias = 22 h x 15,00
  assert.equal(verba(r, 'reflexo_13'), 27.5);
  assert.ok(r.fgts.valor > 0);
});

test('regime escolhido fora da sua janela temporal gera alerta', () => {
  const posteriorNoRegimeAntigo = calcularIntervalo({
    ...periodo, ...jornada, minutosSuprimidos: 30, regimeIntervalo: 'anterior_reforma',
  });
  // o regime da Súmula 437 alcança fatos até a véspera da reforma
  assert.ok(posteriorNoRegimeAntigo.alertas.some((a) => a.includes('10/11/2017')));

  const anteriorNoRegimeNovo = calcularIntervalo({
    ...jornada, minutosSuprimidos: 30, dataInicio: '2015-01-01', dataFim: '2016-12-31',
  });
  assert.ok(anteriorNoRegimeNovo.alertas.some((a) => a.includes('Súmula 437')));
});

/* --------------------------------------- insalubridade e periculosidade -- */

test('insalubridade pedida como verba incide sobre o salário mínimo', () => {
  const r = calcularAdicionalRiscoPedido({
    ...periodo, salarioBase: 2200, risco: 'insalubridade', grauInsalubridade: 20,
  });
  assert.equal(verba(r, 'adicional_risco'), Math.round(SALARIO_MINIMO * 0.2 * 100) / 100);
  assert.equal(verba(r, 'dsr'), 0); // parcela mensal fixa não gera DSR
  assert.ok(verba(r, 'reflexo_13') > 0);
});

test('periculosidade incide sobre o salário base', () => {
  const r = calcularAdicionalRiscoPedido({ ...periodo, salarioBase: 2200, risco: 'periculosidade' });
  assert.equal(verba(r, 'adicional_risco'), 660);
});

test('o pedido de adicional exige escolher qual', () => {
  const r = calcularAdicionalRiscoPedido({ ...periodo, salarioBase: 2200 });
  assert.ok(r.erros.some((e) => e.includes('insalubridade e periculosidade')));
});

/* ------------------------------------------------ multas 467 e 477 ------- */

test('multa do art. 477 é devida quando não há pagamento no prazo de 10 dias', () => {
  const semPagamento = calcularMultas({ multa477: true, salarioBase: 2500, dataRescisao: '2026-01-10' });
  assert.equal(semPagamento.totais.geral, 2500);
  assert.ok(semPagamento.periodo[0].detalhe.includes('20/01/2026')); // prazo

  const atrasado = calcularMultas({
    multa477: true, salarioBase: 2500, dataRescisao: '2026-01-10', dataPagamento: '2026-01-25',
  });
  assert.equal(atrasado.contexto.diasAtraso, 5);
  assert.equal(atrasado.totais.geral, 2500);
});

test('pagamento dentro do prazo afasta a multa do art. 477', () => {
  const r = calcularMultas({
    multa477: true, salarioBase: 2500, dataRescisao: '2026-01-10', dataPagamento: '2026-01-20',
  });
  assert.equal(r.totais.geral, 0);
  assert.ok(r.alertas.some((a) => a.includes('não é devida')));
});

test('multa do art. 467 é a metade do incontroverso', () => {
  const r = calcularMultas({ multa467: true, valorIncontroverso: 5000 });
  assert.equal(r.totais.geral, 2500);
});

test('as duas multas somam e dispensam período e FGTS', () => {
  const r = calcularMultas({
    multa477: true, salarioBase: 2500, dataRescisao: '2026-01-10', multa467: true, valorIncontroverso: 5000,
  });
  assert.equal(r.totais.geral, 5000);
  assert.equal(r.fgts, null);
  assert.deepEqual(r.mensais, []);
  assert.ok(r.contexto.semPeriodo);
});

test('sem escolher multa nenhuma, o pedido acusa', () => {
  const r = calcularMultas({});
  assert.ok(r.erros.some((e) => e.includes('ao menos uma')));
});

/* --------------------------------------------- base do FGTS por pedido --- */

test('o FGTS incide só sobre as parcelas salariais que o pedido apurou', () => {
  const r = calcularAdicionalNoturno({ ...periodo, ...jornada, horasNoturnas: 30 });
  // adicional (68,57) + DSR (13,71) + 13º (6,86) x 12 meses x 8%
  assert.equal(r.fgts.base, 1069.68);
  assert.equal(r.fgts.valor, 85.57);
  assert.equal(r.fgts.detalhe, '8% sobre adicional noturno, DSR e 13º');
  // o reflexo de férias + 1/3 é indenizatório: fica fora da base
  assert.ok(verba(r, 'reflexo_ferias') > 0);
});

test('o intervalo indenizatório não gera FGTS', () => {
  const r = calcularIntervalo({ ...periodo, ...jornada, minutosSuprimidos: 30 });
  assert.equal(r.fgts.base, 0);
  assert.equal(r.fgts.valor, 0);
  assert.equal(r.fgts.detalhe, null);
});

test('o intervalo salarial da Súmula 437 gera FGTS sem DSR', () => {
  const r = calcularIntervalo({
    ...periodo, ...jornada, regimeIntervalo: 'anterior_reforma', minutosSuprimidos: 30,
  });
  assert.equal(r.fgts.detalhe, '8% sobre intervalo e 13º');
  assert.equal(r.fgts.valor, 343.2); // (330 + 27,50) x 12 x 8%
});
