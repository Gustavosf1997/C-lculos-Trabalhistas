/**
 * Conferência independente das verbas rescisórias e dos pedidos.
 *
 * Os valores de `conferencia.json` não saíram deste código: foram calculados
 * por um programa à parte, escrito em Python a partir das regras — CLT, Lei
 * 12.506/2011, Lei 4.090/62, Súmulas e OJs do TST, Lei 8.036/90, as tabelas
 * de INSS (Portaria MPS/MF 13/2026) e IRRF (Lei 15.270/2025) e a série oficial
 * do salário mínimo. Na revisão, 4.000 rescisões e 3.000 pedidos sorteados
 * bateram centavo a centavo (63.125 valores); um caso de cada combinação de
 * tipo de rescisão e aviso, e de cada pedido, fica aqui para que uma mudança
 * que os altere apareça.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calcularRescisao } from '../src/calculo.js';
import { calcularHorasExtras } from '../src/pedidos/horas-extras.js';
import { calcularAdicionalRiscoPedido } from '../src/pedidos/insalubridade.js';
import { calcularAdicionalNoturno } from '../src/pedidos/noturno.js';

const CONFERIDOS = JSON.parse(readFileSync(new URL('./conferencia.json', import.meta.url), 'utf8'));
const porChave = (lista) => Object.fromEntries(lista.map((i) => [i.chave, i.valor]));
const semZeros = (objeto) => Object.fromEntries(Object.entries(objeto).filter(([, v]) => v !== 0));

test('rescisões batem com o cálculo independente, centavo a centavo', () => {
  for (const caso of CONFERIDOS.rescisoes) {
    const r = calcularRescisao(caso.dados);
    const nome = `${caso.dados.tipo}/${caso.dados.tipoAviso}`;
    assert.deepEqual(r.erros, [], nome);
    assert.deepEqual(semZeros(porChave(r.proventos)), semZeros(caso.proventos), `${nome}: proventos`);
    assert.deepEqual(semZeros(porChave(r.descontos)), semZeros(caso.descontos), `${nome}: descontos`);
    assert.equal(r.fgts.rescisao, caso.fgts.rescisao, `${nome}: FGTS`);
    assert.equal(r.fgts.multa, caso.fgts.multa, `${nome}: multa do FGTS`);
    assert.equal(r.totais.liquido, caso.liquido, `${nome}: líquido`);
  }
});

test('pedidos batem com o cálculo independente, centavo a centavo', () => {
  const motores = { he: calcularHorasExtras, insal: calcularAdicionalRiscoPedido, noturno: calcularAdicionalNoturno };
  for (const caso of CONFERIDOS.pedidos) {
    const r = motores[caso.qual](caso.dados);
    const nome = `${caso.qual}/${caso.dados.risco}`;
    assert.deepEqual(r.erros, [], nome);
    assert.deepEqual(porChave(r.periodo), caso.itens, `${nome}: verbas`);
    assert.equal(r.fgts.valor, caso.fgts, `${nome}: FGTS`);
    assert.equal(r.fgts.multa, caso.multa, `${nome}: multa`);
    assert.equal(r.totais.geral, caso.total, `${nome}: total`);
  }
});
