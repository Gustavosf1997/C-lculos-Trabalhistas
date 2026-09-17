import test from 'node:test';
import assert from 'node:assert/strict';
import { calcularRescisao, calcularINSS, contarAvos, parseData } from '../src/calculo.js';

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
