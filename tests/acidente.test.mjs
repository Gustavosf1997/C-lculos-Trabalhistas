/**
 * Indenização acidentária: tabela DPVAT, CIF, pensão do art. 950 do CC,
 * danos do art. 223-G da CLT e prescrição contada da ciência.
 *
 * Os valores esperados foram conferidos à parte (fator de valor presente,
 * datas de termo final), e não copiados da saída do motor.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { calcularAcidente, valorPresente } from '../src/pedidos/acidente.js';
import { classificarCIF, LESOES_DPVAT, eLesaoTotal } from '../src/pedidos/tabelas-acidente.js';
import { pedidoPorId } from '../src/pedidos/catalogo.js';

const item = (r, chave) => r.periodo.find((i) => i.chave === chave)?.valor ?? 0;

// Joelho com perda média da mobilidade: 25% x 50% = 12,5% da tabela.
const joelho = {
  lesao1: 'joelho', grau1: 'media', salarioBase: 2500, outrasParcelas: 500,
  dataCiencia: '2024-03-01', dataAjuizamento: '2025-03-01', sobrevida: 40, dataReferencia: '2026-09-25',
};

/* ------------------------------------------------------ tabela DPVAT --- */

test('a tabela traz os percentuais do anexo da Lei 6.194/74', () => {
  const pct = (id) => LESOES_DPVAT.find((l) => l.id === id).percentual;
  assert.equal(pct('cegueira'), 100);
  assert.equal(pct('membro_superior'), 70);
  assert.equal(pct('membro_inferior'), 70);
  assert.equal(pct('pe'), 50);
  assert.equal(pct('joelho'), 25);
  assert.equal(pct('polegar'), 25);
  assert.equal(pct('dedo_mao'), 10);
  assert.equal(pct('surdez'), 50);
  assert.equal(pct('visao_olho'), 50);
  assert.equal(pct('coluna'), 25);
  assert.equal(pct('baco'), 10);
  const ids = LESOES_DPVAT.map((l) => l.id);
  assert.equal(new Set(ids).size, ids.length, 'id repetido na tabela');
});

test('a repercussão incompleta reduz o percentual da tabela (art. 3º, §1º, II)', () => {
  const r = calcularAcidente(joelho);
  assert.deepEqual(r.erros, []);
  assert.equal(r.contexto.perda.percentual, 12.5);
  assert.equal(r.contexto.referenciaDpvat, 1687.5); // 12,5% de R$ 13.500,00
  for (const [grau, esperado] of [['completa', 25], ['intensa', 18.75], ['leve', 6.25], ['residual', 2.5]]) {
    assert.equal(calcularAcidente({ ...joelho, grau1: grau }).contexto.perda.percentual, esperado, grau);
  }
});

test('danos totais valem 100% e não se graduam', () => {
  assert.ok(eLesaoTotal('cegueira'));
  const r = calcularAcidente({ ...joelho, lesao1: 'cegueira', grau1: 'leve' });
  assert.equal(r.contexto.perda.percentual, 100);
});

test('lesões do mesmo acidente somam, até 100%', () => {
  const r = calcularAcidente({ ...joelho, lesao1: 'dedo_mao', grau1: 'completa', lesao2: 'dedo_mao', grau2: 'completa' });
  assert.equal(r.contexto.perda.percentual, 20); // dois dedos: 10% + 10%

  const teto = calcularAcidente({
    ...joelho, lesao1: 'membro_superior', grau1: 'completa', lesao2: 'pe', grau2: 'intensa',
  });
  assert.equal(teto.contexto.perda.percentual, 100); // 70% + 37,5% = 107,5%
  assert.ok(teto.alertas.some((a) => a.includes('107,5%')));
});

test('a terceira lesão só conta enquanto a segunda estiver escolhida', () => {
  // A tela esconde a terceira quando a segunda volta para "nenhuma"; um valor
  // que ficou lá escondido não pode entrar na conta.
  const r = calcularAcidente({ ...joelho, lesao2: 'nenhuma', lesao3: 'baco', grau3: 'completa' });
  assert.equal(r.contexto.perda.percentual, 12.5);
});

test('fora do critério DPVAT, as lesões escolhidas são ignoradas', () => {
  const r = calcularAcidente({ ...joelho, criterio: 'laudo', percentualLaudo: 30 });
  assert.equal(r.contexto.perda.percentual, 30);
  assert.deepEqual(r.contexto.perda.lesoes, []);
});

test('sem lesão escolhida, o cálculo pede a lesão', () => {
  const r = calcularAcidente({ ...joelho, lesao1: '' });
  assert.ok(r.erros.some((e) => e.includes('lesão')));
});

/* ------------------------------------------------------------------ CIF --- */

test('o percentual cai no qualificador da CIF pelas faixas da OMS', () => {
  const casos = [[0, 0], [4, 0], [4.9, 0], [5, 1], [24, 1], [24.5, 1], [25, 2], [49, 2], [50, 3], [95, 3],
    [95.5, 3], [96, 4], [100, 4]];
  for (const [percentual, codigo] of casos) assert.equal(classificarCIF(percentual).codigo, codigo, String(percentual));
});

test('pelo qualificador da CIF, sem número no laudo, vale o meio da faixa', () => {
  const r = calcularAcidente({ ...joelho, criterio: 'cif', qualificadorCif: '2' });
  assert.equal(r.contexto.perda.percentual, 37); // (25 + 49) / 2
  assert.ok(r.alertas.some((a) => a.includes('meio da faixa')));
  assert.equal(calcularAcidente({ ...joelho, criterio: 'cif', qualificadorCif: '2', percentualCif: 30 })
    .contexto.perda.percentual, 30);
});

test('percentual fora da faixa do qualificador é recusado', () => {
  const r = calcularAcidente({ ...joelho, criterio: 'cif', qualificadorCif: '2', percentualCif: 60 });
  assert.ok(r.erros.some((e) => e.includes('de 25% a 49%')));
});

/* --------------------------------------------------------------- pensão --- */

test('a pensão é a remuneração vezes a perda, com 13º e terço de férias', () => {
  const r = calcularAcidente(joelho);
  // (2.500 + 500) x 12,5% = 375,00; x (1 + 1/12 + 1/36) = 416,67
  assert.equal(r.contexto.pensao.mensal, 416.67);
  const sem = calcularAcidente({ ...joelho, incluir13: false, incluirTerco: false });
  assert.equal(sem.contexto.pensao.mensal, 375);
});

test('incapacidade total para o ofício dá pensão integral', () => {
  const r = calcularAcidente({ ...joelho, incapacidadeTotalOficio: true });
  assert.equal(r.contexto.pensao.percentualPensao, 100);
  assert.equal(r.contexto.pensao.mensal, 3333.33); // 3.000 x (1 + 1/12 + 1/36)
  assert.equal(r.contexto.perda.percentual, 12.5, 'a perda da tabela não muda');
});

test('vencidas vão da ciência ao ajuizamento', () => {
  const r = calcularAcidente(joelho);
  assert.equal(r.contexto.pensao.mesesVencidos, 12);
  assert.equal(item(r, 'pensao_vencida'), 5000.04); // 12 x 416,67
});

test('a fórmula do valor presente confere com a de um financiamento', () => {
  // Fator de 12 prestações a 0,5% ao mês: 11,6189
  assert.equal(Math.round(valorPresente(100, 12, 0.005) * 100) / 100, 1161.89);
  assert.equal(valorPresente(100, 12, 0), 1200);
  assert.equal(valorPresente(100, 0, 0.005), 0);
});

test('parcela única: vincendas a valor presente, a 0,5% ao mês', () => {
  const r = calcularAcidente(joelho);
  const p = r.contexto.pensao;
  // 40 anos de sobrevida a partir de 01/03/2024: termo em 01/03/2064;
  // vincendas de 01/03/2025 em diante = 468 meses
  assert.equal(p.termo.toISOString().slice(0, 10), '2064-03-01');
  assert.equal(p.mesesVincendos, 468);
  assert.equal(p.nominalVincendas, 195001.56);
  assert.equal(item(r, 'pensao_vincenda'), 75259.69);
});

test('parcela única com deságio fixo', () => {
  const r = calcularAcidente({ ...joelho, metodoDesconto: 'desagio', desagio: 25 });
  assert.equal(item(r, 'pensao_vincenda'), 146251.17); // 195.001,56 x 75%
});

test('termo final por idade conta do nascimento', () => {
  const r = calcularAcidente({ ...joelho, termoFinal: 'idade', dataNascimento: '1990-03-01', idadeFinal: 76.6 });
  const p = r.contexto.pensao;
  assert.equal(p.idadeNaCiencia, 34);
  // 76 anos -> 01/03/2066; 0,6 ano = 219 dias -> 06/10/2066
  assert.equal(p.termo.toISOString().slice(0, 10), '2066-10-06');
});

test('termo final por idade já alcançado na ciência é recusado', () => {
  const r = calcularAcidente({ ...joelho, termoFinal: 'idade', dataNascimento: '1940-01-01', idadeFinal: 76.6 });
  assert.ok(r.erros.some((e) => e.includes('já tinha sido alcançada')));
});

test('pensão mensal: vencidas mais doze vincendas no valor do pedido', () => {
  const r = calcularAcidente({ ...joelho, formaPensao: 'mensal' });
  assert.equal(item(r, 'pensao_vincenda'), 5000.04); // 12 x 416,67
  assert.equal(r.contexto.pensao.termo, null);
});

test('sem ajuizamento nem data do cálculo, as vencidas vão até hoje', () => {
  const { dataAjuizamento, ...semAcao } = joelho;
  const r = calcularAcidente({ ...semAcao, dataReferencia: '2025-03-01' });
  assert.equal(r.contexto.pensao.mesesVencidos, 12);
  const escolhida = calcularAcidente({ ...joelho, dataCalculo: '2024-09-01' });
  assert.equal(escolhida.contexto.pensao.mesesVencidos, 6);
});

test('nascimento depois da ciência é recusado', () => {
  const r = calcularAcidente({ ...joelho, dataNascimento: '2025-01-01' });
  assert.ok(r.erros.some((e) => e.includes('nascimento')));
});

/* ------------------------------------------------- danos extrapatrimoniais */

test('danos morais: natureza sugerida pela CIF, sobre o salário contratual', () => {
  const r = calcularAcidente(joelho); // 12,5% -> CIF 1 (ligeira) -> ofensa leve, até 3 salários
  assert.equal(r.contexto.morais.natureza.valor, 'leve');
  assert.equal(item(r, 'danos_morais'), 7500); // 3 x 2.500 — sem as parcelas habituais

  const grave = calcularAcidente({ ...joelho, lesao1: 'membro_superior', grau1: 'completa' }); // 70%
  assert.equal(grave.contexto.morais.natureza.valor, 'grave');
  assert.equal(item(grave, 'danos_morais'), 50000); // 20 x 2.500

  const total = calcularAcidente({ ...joelho, lesao1: 'cegueira' });
  assert.equal(total.contexto.morais.natureza.valor, 'gravissima');
  assert.equal(item(total, 'danos_morais'), 125000); // 50 x 2.500
});

test('natureza e multiplicador escolhidos prevalecem', () => {
  const r = calcularAcidente({ ...joelho, naturezaOfensa: 'media', multiplicadorMorais: 4 });
  assert.equal(item(r, 'danos_morais'), 10000);
  const acima = calcularAcidente({ ...joelho, naturezaOfensa: 'media', multiplicadorMorais: 8 });
  assert.equal(item(acima, 'danos_morais'), 20000);
  assert.ok(acima.alertas.some((a) => a.includes('ADIs 6050')));
});

test('dano estético se soma e não depende da lesão escolhida', () => {
  const r = calcularAcidente({ ...joelho, pedirEsteticos: true, multiplicadorEsteticos: 2 });
  assert.equal(item(r, 'danos_esteticos'), 5000);
  const soEstetico = calcularAcidente({
    salarioBase: 2500, pedirPensao: false, pedirMorais: false, pedirEsteticos: true, multiplicadorEsteticos: 2,
  });
  assert.deepEqual(soEstetico.erros, []);
  assert.equal(soEstetico.totais.geral, 5000);
  assert.ok(calcularAcidente({ ...joelho, pedirEsteticos: true }).erros.some((e) => e.includes('estético')));
});

test('o total soma as indenizações, sem FGTS', () => {
  const r = calcularAcidente({ ...joelho, danosEmergentes: 1200 });
  assert.equal(r.fgts, null);
  assert.equal(r.totais.geral, 5000.04 + 75259.69 + 7500 + 1200);
});

test('sem nenhuma indenização escolhida, o cálculo avisa', () => {
  const r = calcularAcidente({ ...joelho, pedirPensao: false, pedirMorais: false });
  assert.ok(r.erros.some((e) => e.includes('ao menos uma')));
});

/* ----------------------------------------------------------- prescrição --- */

test('quinquênio contado da ciência prescreve a pretensão inteira', () => {
  const r = calcularAcidente({ dataCiencia: '2015-01-10', dataAjuizamento: '2020-02-01' });
  assert.equal(r.impedimento?.titulo, 'Pretensão atingida pela prescrição quinquenal');
  assert.ok(r.impedimento.mensagem.includes('10/01/2020'));
});

test('biênio do fim do contrato, só com as datas', () => {
  const r = calcularAcidente({
    dataCiencia: '2019-06-01', dataExtincao: '2020-01-10', dataAjuizamento: '2022-02-01',
  });
  assert.ok(r.impedimento?.bienal);
});

test('ciência depois da dispensa: o biênio corre da ciência', () => {
  const dentro = calcularAcidente({
    ...joelho, dataExtincao: '2020-01-10', dataCiencia: '2021-06-01', dataAjuizamento: '2023-01-10',
  });
  assert.equal(dentro.impedimento, null);
  assert.ok(dentro.alertas.some((a) => a.includes('posterior ao fim do contrato')));

  const fora = calcularAcidente({ dataExtincao: '2020-01-10', dataCiencia: '2021-06-01', dataAjuizamento: '2023-07-01' });
  assert.ok(fora.impedimento?.mensagem.includes('01/06/2023'));
});

test('ciência anterior à EC 45/2004 só gera aviso', () => {
  const r = calcularAcidente({ ...joelho, dataCiencia: '2004-06-01', dataAjuizamento: '2012-01-10' });
  assert.equal(r.impedimento, null);
  assert.ok(r.alertas.some((a) => a.includes('EC 45/2004')));
});

test('sem ajuizamento, o quinquênio vencido vira aviso', () => {
  const r = calcularAcidente({ dataCiencia: '2019-01-10', dataReferencia: '2026-09-25' });
  assert.ok(r.alertas.some((a) => a.includes('10/01/2024')));
  assert.ok(r.erros.length, 'e segue pedindo o que falta');
});

test('só com o fim do contrato, o quinquênio fica por apurar', () => {
  const r = calcularAcidente({
    salarioBase: 2500, pedirPensao: false, lesao1: 'joelho', dataExtincao: '2025-01-10', dataAjuizamento: '2025-06-01',
  });
  assert.deepEqual(r.erros, []);
  assert.ok(r.contexto.prescricao.includes('10/01/2027'));
  assert.ok(r.contexto.prescricao.includes('apurar o quinquênio'));
});

test('o resumo do catálogo não quebra em nenhuma das formas', () => {
  const pedido = pedidoPorId('acidente');
  const casos = [
    joelho,
    { ...joelho, formaPensao: 'mensal' },
    { ...joelho, criterio: 'cif', qualificadorCif: '3' },
    { ...joelho, termoFinal: 'idade', dataNascimento: '1990-03-01' },
    { ...joelho, lesao2: 'baco', grau2: 'completa', lesao3: 'surdez', grau3: 'leve' },
    { salarioBase: 2500, pedirPensao: false, pedirMorais: false, pedirEsteticos: true, multiplicadorEsteticos: 1 },
  ];
  for (const dados of casos) {
    const r = calcularAcidente(dados);
    assert.deepEqual(r.erros, []);
    for (const [rotulo, valor] of pedido.resumo(r.contexto)) {
      assert.ok(!/NaN|undefined|Invalid Date|null/.test(String(valor)), `${rotulo}: ${valor}`);
    }
  }
});
