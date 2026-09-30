import test from 'node:test';
import assert from 'node:assert/strict';
import { calcularAdicionalNoturno } from '../src/pedidos/noturno.js';
import { calcularIntervalo } from '../src/pedidos/intervalo.js';
import { calcularInterjornada } from '../src/pedidos/interjornada.js';
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
  // Período de 2024: o mínimo de então (R$ 1.412,00), e não o de hoje
  assert.equal(verba(r, 'adicional_risco'), 282.4);
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
  // adicional (68,57) + DSR (13,71) + 13º (6,86) + férias 1/3 (9,14) x 12 x 8%
  assert.equal(r.fgts.base, 1179.36);
  assert.equal(r.fgts.valor, 94.35);
  assert.equal(r.fgts.detalhe, '8% sobre adicional noturno, DSR, 13º e férias + 1/3');
});

test('férias indenizadas saem da base do FGTS quando assim marcado', () => {
  // Gozadas, integram a base (art. 15 da Lei 8.036/90); indenizadas, não.
  const r = calcularAdicionalNoturno({
    ...periodo, ...jornada, horasNoturnas: 30, fgtsSobreFerias: false,
  });
  assert.equal(r.fgts.base, 1069.68);
  assert.equal(r.fgts.valor, 85.57);
  assert.equal(r.fgts.detalhe, '8% sobre adicional noturno, DSR e 13º');
  assert.ok(verba(r, 'reflexo_ferias') > 0); // a verba continua devida
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
  assert.equal(r.fgts.detalhe, '8% sobre intervalo, 13º e férias + 1/3');
  assert.equal(r.fgts.valor, 378.4); // (330 + 27,50 + 36,67) x 12 x 8%
});


test('o intervalo salarial da Súmula 437 gera DSR, sem reflexos do DSR', () => {
  const r = calcularIntervalo({
    ...periodo, ...jornada, regimeIntervalo: 'anterior_reforma', minutosSuprimidos: 30,
  });
  assert.equal(verba(r, 'dsr'), 66); // 330 / 25 x 5
  assert.equal(verba(r, 'reflexo_13'), 27.5); // sobre o intervalo, não sobre o DSR (OJ 394)
  assert.ok(!r.fgts.detalhe.includes('DSR')); // nem no FGTS
});

test('o intervalo indenizatório segue sem DSR e sem reflexos', () => {
  const r = calcularIntervalo({ ...periodo, ...jornada, minutosSuprimidos: 30 });
  assert.equal(verba(r, 'dsr'), 0);
  assert.equal(r.mensais.length, 1);
});

/* ------------------------------------------ intervalo interjornadas ------ */

// Hora normal de R$ 10,00; com 50%, R$ 15,00.
const interjornada = (extra = {}) => calcularInterjornada({
  ...periodo, ...jornada, descansoEfetivo: 8, jornadasComSupressao: 22, ...extra,
});

test('interjornadas pós-reforma paga as horas que faltaram das 11, sem reflexos', () => {
  const r = interjornada();
  // 11 − 8 = 3 h por jornada; 3 x 22 = 66 h; 66 x 15,00 = 990,00
  assert.equal(verba(r, 'interjornada'), 990);
  assert.equal(r.contexto.horasPorJornada, 3);
  assert.equal(r.mensais.length, 1); // sem DSR e sem reflexos
  assert.equal(r.fgts.valor, 0); // natureza indenizatória
  assert.equal(r.totais.periodo, 11880); // 12 meses
});

test('interjornadas informado por semana vira média mensal de 52/12 semanas', () => {
  const r = interjornada({ descansoEfetivo: 9, jornadasComSupressao: 5, modoOcorrencias: 'semana' });
  // 2 h x 5 x 52/12 = 43,33 h; x 15,00 = 650,00
  assert.equal(verba(r, 'interjornada'), 650);
});

test('o adicional e a base integrada mudam a hora devida', () => {
  assert.equal(verba(interjornada({ adicionalInterjornada: 100 }), 'interjornada'), 1320); // 66 x 20,00
  // Periculosidade integra a hora (Súmula 264): 2.860 / 220 = 13,00; + 50% = 19,50
  assert.equal(verba(interjornada({ risco: 'periculosidade' }), 'interjornada'), 1287);
});

test('descanso de 35 horas em torno da folga semanal (Súmula 110)', () => {
  const r = interjornada({ intersemanal: true, descansoSemanal: 30, folgasComSupressao: 4 });
  // 35 − 30 = 5 h por folga; 5 x 4 x 15,00 = 300,00
  assert.equal(verba(r, 'intersemanal'), 300);
  assert.equal(r.totais.mensal, 1290);
  assert.equal(r.alertas.length, 0);
});

test('abaixo de 24 horas, o que falta do repouso semanal fica de fora', () => {
  const r = interjornada({ intersemanal: true, descansoSemanal: 20, folgasComSupressao: 4 });
  // Só as 11 horas do intervalo emendado; as 4 do repouso são outro pedido (em dobro)
  assert.equal(r.contexto.horasPorFolga, 11);
  assert.equal(verba(r, 'intersemanal'), 660);
  assert.ok(r.alertas.some((a) => a.includes('Súmula 146')));
});

test('interjornadas anterior à reforma é hora extra: DSR, reflexos e FGTS (OJ 355)', () => {
  const r = interjornada({ regimeInterjornada: 'anterior_reforma', dataInicio: '2015-01-01', dataFim: '2016-12-31' });
  assert.equal(verba(r, 'interjornada'), 990);
  assert.equal(verba(r, 'dsr'), 198); // 990 / 25 x 5
  assert.equal(verba(r, 'reflexo_13'), 82.5); // sobre as horas, não sobre o DSR (OJ 394 original)
  assert.equal(verba(r, 'reflexo_ferias'), 110);
  assert.equal(r.fgts.detalhe, '8% sobre intervalo interjornadas, 13º e férias + 1/3');
  assert.equal(r.fgts.valor, 2270.4); // (990 + 82,50 + 110) x 24 x 8%
});

test('interjornadas recusa descanso que não viola o art. 66 e campo vazio', () => {
  assert.ok(interjornada({ descansoEfetivo: 11 }).erros.some((e) => e.includes('11 horas ou mais')));
  assert.ok(interjornada({ descansoEfetivo: 0 }).erros.some((e) => e.includes('horas de descanso')));
  assert.ok(interjornada({ jornadasComSupressao: 0 }).erros.length > 0);
  const semanal = interjornada({ intersemanal: true, descansoSemanal: 35, folgasComSupressao: 4 });
  assert.ok(semanal.erros.some((e) => e.includes('Súmula 110')));
});

test('regime do interjornadas fora da sua janela temporal gera alerta', () => {
  const antigoEm2024 = interjornada({ regimeInterjornada: 'anterior_reforma' });
  assert.ok(antigoEm2024.alertas.some((a) => a.includes('10/11/2017')));
  const novoEm2016 = interjornada({ dataInicio: '2016-01-01', dataFim: '2016-12-31' });
  assert.ok(novoEm2016.alertas.some((a) => a.includes('11/11/2017') && a.includes('OJ 355')));
});

/* ------------------------------- salário mínimo de cada competência ------ */

test('insalubridade usa o salário mínimo de cada mês, e não o de hoje', () => {
  const insal = (inicio, fimP) => calcularAdicionalRiscoPedido({
    dataInicio: inicio, dataFim: fimP, salarioBase: 2200, risco: 'insalubridade', grauInsalubridade: 20,
    reflexo13: false, reflexoFerias: false, reflexoFGTS: false,
  });
  // 2021: R$ 1.100,00 o ano todo -> 20% = 220,00 x 12
  assert.equal(insal('2021-01-01', '2021-12-31').totais.periodo, 2640);
  // 2023: R$ 1.302,00 até abril e R$ 1.320,00 de maio em diante (MP 1.172/2023)
  // 4 x 260,40 + 8 x 264,00 = 3.153,60
  assert.equal(insal('2023-01-01', '2023-12-31').totais.periodo, 3153.6);
  // 2020: R$ 1.039,00 em janeiro e R$ 1.045,00 depois (MP 919/2020)
  // 207,80 + 11 x 209,00 = 2.506,80
  assert.equal(insal('2020-01-01', '2020-12-31').totais.periodo, 2506.8);
  // Atravessando anos: jul/2024 a jun/2025 = 6 x 282,40 + 6 x 303,60 = 3.516,00
  const cruzando = insal('2024-07-01', '2025-06-30');
  assert.equal(cruzando.totais.periodo, 3516);
  assert.ok(cruzando.contexto.risco.detalhe.includes('cada mês'), cruzando.contexto.risco.detalhe);
});

test('o reflexo da insalubridade no aviso usa o mínimo do último mês', () => {
  const r = calcularAdicionalRiscoPedido({
    dataInicio: '2024-07-01', dataFim: '2025-06-30', salarioBase: 2200, risco: 'insalubridade',
    grauInsalubridade: 20, reflexoAviso: true, diasAviso: 30,
  });
  const aviso = r.periodo.find((p) => p.chave === 'reflexo_aviso').valor;
  assert.equal(aviso, 303.6); // 20% de R$ 1.518,00, o mínimo de 2025
});

test('mínimo anterior à série cadastrada gera aviso', () => {
  const r = calcularAdicionalRiscoPedido({
    dataInicio: '2004-01-01', dataFim: '2006-12-31', salarioBase: 2200, risco: 'insalubridade', grauInsalubridade: 20,
  });
  assert.ok(r.alertas.some((a) => a.includes('maio de 2005')));
});
