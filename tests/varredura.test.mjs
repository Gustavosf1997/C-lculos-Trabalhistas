/**
 * Varredura: milhares de combinações de entrada, conferidas por invariantes.
 *
 * Os outros testes fixam casos conferidos à mão; este procura os que ninguém
 * pensou em conferir. Foi assim que apareceu o "líquido a receber" negativo —
 * impossível num acerto, porque o art. 477, §5º, limita as compensações e o
 * empregador cobra o excedente por outra via.
 *
 * O gerador é determinístico (semente fixa): uma falha se reproduz sempre.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { calcularRescisao } from '../src/calculo.js';
import { TIPOS, ORDEM_TIPOS } from '../src/tipos.js';
import { PEDIDOS } from '../src/pedidos/catalogo.js';
import { FGTS } from '../src/tabelas.js';

function gerador(semente) {
  let estado = semente;
  const aleatorio = () => ((estado = (estado * 1103515245 + 12345) % 2147483648) / 2147483648);
  return {
    aleatorio,
    escolher: (lista) => lista[Math.floor(aleatorio() * lista.length)],
    dias: (max) => Math.floor(aleatorio() * max),
  };
}
const iso = (d) => d.toISOString().slice(0, 10);
const somarDias = (d, n) => new Date(d.getTime() + n * 86400000);
const r2 = (v) => Math.round(v * 100) / 100;
const quebrado = (texto) => /NaN|undefined|Infinity|Invalid Date|\[object/.test(String(texto));

/* ------------------------------------------------- verbas rescisórias --- */

test('rescisão: 4.000 combinações respeitam as invariantes', () => {
  const { aleatorio, escolher, dias } = gerador(2026);
  for (let i = 0; i < 4000; i += 1) {
    const tipo = escolher(ORDEM_TIPOS);
    const admissao = somarDias(new Date(Date.UTC(2005, 0, 1)), dias(7000));
    const saida = somarDias(admissao, 1 + dias(4000));
    const dados = {
      tipo,
      dataAdmissao: iso(admissao),
      dataAviso: iso(saida),
      dataTermoFinal: iso(somarDias(admissao, 30 + dias(700))),
      salarioBase: escolher([1621, 2500, 4000.55, 9000, 25000]),
      divisor: escolher([220, 200, 180]),
      horasExtras: escolher([0, 10, 37.5]),
      mediaComissoes: escolher([0, 800]),
      periodosFeriasVencidas: escolher([0, 1, 2, 3]),
      faltasInjustificadas: escolher([0, 6, 20, 40]),
      saldoFgts: escolher([0, 12000]),
      dependentes: escolher([0, 2]),
      clausulaAssecuratoria: aleatorio() < 0.3,
      tipoAviso: escolher(['indenizado', 'trabalhado', 'dispensado', 'nao_cumprido', 'indenizado_metade']),
      adicionais: escolher([[], ['insalubridade_20'], ['periculosidade_30', 'noturno_20']]),
      horasNoturnas: 20,
      prejuizoArt480: escolher([0, 800, 50000]),
      descontos: escolher([[], ['horas_negativas', 'pensao', 'outros', 'adiantamento_salario']]),
      horasNegativas: 5, pensaoPercentual: 20, outrosDescontos: escolher([300, 9000]), adiantamentoSalario: 1500,
      dataAjuizamento: aleatorio() < 0.3 ? iso(somarDias(saida, dias(900))) : '',
    };
    const r = calcularRescisao(dados);
    if (r.erros.length || r.impedimento) continue;
    const caso = JSON.stringify(dados);
    const c = r.contexto;

    for (const item of [...r.proventos, ...r.descontos]) {
      assert.ok(Number.isFinite(item.valor) && item.valor >= 0, `${item.chave}=${item.valor} em ${caso}`);
      assert.ok(!quebrado(`${item.label} ${item.detalhe}`), `texto quebrado em ${item.chave}: ${caso}`);
    }
    assert.ok(c.avos13 >= 0 && c.avos13 <= 12, caso);
    assert.ok(c.avosFerias >= 0 && c.avosFerias <= 12, caso);
    assert.ok(c.diasAvisoLegais <= 90, caso);
    assert.ok(c.dataProjetada >= c.ultimoDiaTrabalhado, caso);
    assert.ok(c.diasSaldo >= 1 && c.diasSaldo <= 30, caso);

    const somaP = r2(r.proventos.reduce((s, p) => s + p.valor, 0));
    const somaD = r2(r.descontos.reduce((s, d) => s + d.valor, 0));
    assert.ok(Math.abs(somaP - r.totais.proventos) < 0.011, `proventos não fecham: ${caso}`);
    assert.ok(Math.abs(somaD - r.totais.descontos) < 0.011, `descontos não fecham: ${caso}`);
    assert.ok(Math.abs(r2(somaP - somaD) - r.totais.liquido) < 0.011, `líquido não fecha: ${caso}`);

    // O acerto nunca termina com o empregado devendo.
    assert.ok(r.totais.liquido >= 0, `líquido negativo: ${caso}`);
    // Art. 477, §5º: compensações até um mês de remuneração.
    const compensacoes = r2(r.descontos.filter((d) => d.natureza === 'compensacao').reduce((s, d) => s + d.valor, 0));
    assert.ok(compensacoes <= c.remuneracao + 0.01, `compensações ${compensacoes} > ${c.remuneracao}: ${caso}`);

    // O que a modalidade não deve, não aparece.
    const t = TIPOS[tipo];
    const tem = (k) => r.proventos.some((p) => p.chave === k && p.valor > 0);
    if (!t.campos.decimoTerceiro) assert.ok(!tem('decimo_terceiro'), caso);
    if (!t.campos.feriasProporcionais) assert.ok(!tem('ferias_proporcionais'), caso);
    if (t.fgts.multa === 0) assert.equal(r.fgts.multa, 0, caso);
    // Art. 480: nunca acima do teto do art. 479.
    const art480 = r.descontos.find((d) => d.chave === 'indenizacao_art_480')?.valor ?? 0;
    assert.ok(art480 <= c.tetoArt480 + 0.01, `art. 480 acima do teto: ${caso}`);
  }
});

/* ------------------------------------------------------------ pedidos --- */

test('pedidos: 3.000 combinações respeitam as invariantes', () => {
  const { aleatorio, escolher, dias } = gerador(1943);
  for (let i = 0; i < 3000; i += 1) {
    const pedido = escolher(PEDIDOS);
    const inicio = somarDias(new Date(Date.UTC(2012, 0, 1)), dias(5000));
    const fim = somarDias(inicio, dias(2000));
    const dados = {
      dataInicio: iso(inicio), dataFim: iso(fim),
      dataAjuizamento: aleatorio() < 0.4 ? iso(somarDias(fim, dias(1500))) : '',
      dataExtincao: aleatorio() < 0.3 ? iso(fim) : '',
      salarioBase: escolher([1621, 2200, 5000.5]), divisor: escolher([220, 180, 150]),
      outrasParcelas: escolher([0, 400]),
      risco: escolher(['nenhum', 'insalubridade', 'periculosidade']),
      grauInsalubridade: escolher([10, 20, 40]), baseInsalubridade: escolher(['salario_minimo', 'salario_base']),
      quantidadeHoras: escolher([1, 30, 60.5]), modoQuantidade: escolher(['mes', 'semana']),
      horasNoturnas: escolher([5, 40]), horaReduzida: aleatorio() < 0.8,
      minutosSuprimidos: escolher([15, 30, 60]), intervaloIntegral: 60,
      regimeIntervalo: escolher(['reforma', 'anterior_reforma']),
      reflexoDSR: aleatorio() < 0.8, dsrNosReflexos: aleatorio() < 0.8,
      reflexo13: aleatorio() < 0.9, reflexoFerias: aleatorio() < 0.9, reflexoFGTS: aleatorio() < 0.9,
      fgtsSobreFerias: aleatorio() < 0.7, multaFGTS: aleatorio() < 0.5,
      reflexoAviso: aleatorio() < 0.5, diasAviso: escolher([30, 60]),
      multa477: aleatorio() < 0.7, multa467: aleatorio() < 0.5, valorIncontroverso: 4000,
      dataRescisao: iso(fim), dataPagamento: aleatorio() < 0.5 ? iso(somarDias(fim, dias(40))) : '',
      dataReferencia: '2026-09-24',
    };
    const r = pedido.calcular(dados);
    if (r.erros.length || r.impedimento) continue;
    const caso = `${pedido.id} ${JSON.stringify(dados)}`;

    for (const item of [...r.mensais, ...r.periodo]) {
      assert.ok(Number.isFinite(item.valor) && item.valor >= 0, `${item.chave}=${item.valor} em ${caso}`);
      assert.ok(!quebrado(`${item.label} ${item.detalhe}`), `texto quebrado em ${item.chave}: ${caso}`);
    }
    const somaPeriodo = r2(r.periodo.reduce((s, p) => s + p.valor, 0));
    assert.ok(Math.abs(somaPeriodo - r.totais.periodo) < 0.011, `período não fecha: ${caso}`);
    if (r.fgts) {
      assert.ok(Math.abs(r2(r.fgts.base * FGTS.aliquotaDeposito) - r.fgts.valor) < 0.011, `FGTS ≠ 8%: ${caso}`);
      assert.ok(r.fgts.base <= somaPeriodo + 0.011, `base do FGTS maior que as verbas: ${caso}`);
      assert.ok(Math.abs(r2(r.totais.periodo + r.fgts.valor + r.fgts.multa) - r.totais.geral) < 0.011, caso);
      if (r.fgts.valor > 0) assert.ok(!quebrado(r.fgts.detalhe), caso);
    }
    for (const [rotulo, valor] of pedido.resumo(r.contexto)) {
      if (valor !== undefined && valor !== null) assert.ok(!quebrado(valor), `${rotulo}: ${valor} em ${caso}`);
    }
  }
});
