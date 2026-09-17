import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseNumeroBR, formatarNumeroBR, formatarQuantidade,
  parseDataBR, formatarDataBR, mascararData, mascararDecimal, mascararInteiro,
} from '../src/formato.js';

test('números seguem o padrão brasileiro', () => {
  assert.equal(parseNumeroBR('1.234,56'), 1234.56);
  assert.equal(parseNumeroBR('1.234.567,89'), 1234567.89);
  assert.equal(parseNumeroBR('12,5'), 12.5);
  assert.equal(parseNumeroBR('1234'), 1234);
  assert.equal(parseNumeroBR('0,5'), 0.5);
});

test('ponto digitado como separador decimal é aceito, milhar continua milhar', () => {
  assert.equal(parseNumeroBR('12.5'), 12.5); // quem digitou queria 12,5
  assert.equal(parseNumeroBR('1.234'), 1234); // três casas depois do ponto: milhar
});

test('texto com letras não vira número', () => {
  for (const entrada of ['abc', '12abc', 'R$', '', '   ']) {
    assert.ok(Number.isNaN(parseNumeroBR(entrada)), entrada);
  }
});

test('máscaras descartam tudo que não for número', () => {
  assert.equal(mascararInteiro('1a2b3'), '123');
  assert.equal(mascararDecimal('12a,3b4'), '12,34');
  assert.equal(mascararDecimal('abc'), '');
  assert.equal(mascararDecimal('12,3,4'), '12,34'); // uma vírgula só
  assert.equal(mascararData('15092026'), '15/09/2026');
  assert.equal(mascararData('1a5/0b9'), '15/09');
  assert.equal(mascararData('150920261234'), '15/09/2026'); // ignora o excesso
});

test('datas são lidas e escritas em dd/mm/aaaa', () => {
  assert.equal(parseDataBR('15/09/2026'), '2026-09-15');
  assert.equal(formatarDataBR('2026-09-15'), '15/09/2026');
});

test('data inexistente ou incompleta é recusada', () => {
  for (const entrada of ['31/02/2026', '32/01/2026', '15/13/2026', '15/9/2026', '15/09/26', '', 'ontem']) {
    assert.equal(parseDataBR(entrada), null, entrada);
  }
  assert.equal(parseDataBR('29/02/2024'), '2024-02-29'); // ano bissexto existe
});

test('saídas formatadas usam vírgula decimal', () => {
  assert.equal(formatarNumeroBR(1234.5), '1.234,50');
  assert.equal(formatarQuantidade(43.333333), '43,33');
  assert.equal(formatarQuantidade(20), '20');
});
