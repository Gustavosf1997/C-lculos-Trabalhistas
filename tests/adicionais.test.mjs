import test from 'node:test';
import assert from 'node:assert/strict';
import { calcularAdicionais, aplicarExclusoes, SEM_ADICIONAIS } from '../src/adicionais.js';
import { SALARIO_MINIMO } from '../src/tabelas.js';

test('cada grau de insalubridade incide sobre o salário mínimo', () => {
  for (const [id, percentual] of [['insalubridade_10', 0.1], ['insalubridade_20', 0.2], ['insalubridade_40', 0.4]]) {
    const { total } = calcularAdicionais({ selecionados: [id], salarioBase: 5000 });
    assert.equal(total, Math.round(SALARIO_MINIMO * percentual * 100) / 100, id);
  }
});

test('periculosidade e transferência incidem sobre o salário base', () => {
  assert.equal(calcularAdicionais({ selecionados: ['periculosidade_30'], salarioBase: 2000 }).total, 600);
  assert.equal(calcularAdicionais({ selecionados: ['transferencia_25'], salarioBase: 2000 }).total, 500);
});

test('adicional noturno depende das horas noturnas', () => {
  const semHoras = calcularAdicionais({ selecionados: ['noturno_20'], salarioBase: 2200 });
  assert.equal(semHoras.total, 0);
  const comHoras = calcularAdicionais({ selecionados: ['noturno_20'], salarioBase: 2200, horasNoturnas: 30 });
  assert.equal(comHoras.total, 60); // (2200/220) x 30 x 20%
});

test('adicionais compatíveis se somam', () => {
  const { itens, total } = calcularAdicionais({
    selecionados: ['periculosidade_30', 'transferencia_25'],
    salarioBase: 2000,
  });
  assert.equal(itens.length, 2);
  assert.equal(total, 1100);
});

test('insalubridade e periculosidade se excluem (art. 193, §2º)', () => {
  assert.deepEqual(aplicarExclusoes(['insalubridade_20', 'periculosidade_30'], 'periculosidade_30'), ['periculosidade_30']);
  assert.deepEqual(aplicarExclusoes(['insalubridade_10', 'insalubridade_40'], 'insalubridade_40'), ['insalubridade_40']);
});

test('adicionais de grupos diferentes convivem', () => {
  assert.deepEqual(
    aplicarExclusoes(['periculosidade_30', 'noturno_20'], 'noturno_20').sort(),
    ['noturno_20', 'periculosidade_30'],
  );
});

test('"não recebia adicionais" limpa a seleção', () => {
  assert.deepEqual(aplicarExclusoes(['insalubridade_20', 'noturno_20'], SEM_ADICIONAIS), []);
  assert.deepEqual(aplicarExclusoes([SEM_ADICIONAIS, 'noturno_20'], 'noturno_20'), ['noturno_20']);
});

test('id desconhecido é ignorado', () => {
  assert.equal(calcularAdicionais({ selecionados: ['inventado'], salarioBase: 2000 }).total, 0);
});
