/**
 * Tabelas e parâmetros legais usados nos cálculos.
 *
 * ATENÇÃO: os valores abaixo precisam ser revisados a cada competência.
 * Mantenha `VIGENCIA` sempre coerente com as faixas cadastradas — ela é
 * exibida na interface para que o usuário saiba qual tabela foi aplicada.
 */

/** Rótulo curto, para a etiqueta do cabeçalho. */
export const VIGENCIA = 'Tabelas de 2026';

/** Fonte de cada tabela, para o rodapé e para a memória de cálculo. */
export const VIGENCIA_DETALHE =
  'INSS: Portaria Interministerial MPS/MF nº 13, de 09/01/2026 · '
  + 'IRRF: tabela progressiva com o redutor da Lei 15.270/2025 · '
  + 'Salário mínimo: R$ 1.621,00';

/** Salário mínimo nacional de 2026. Base da insalubridade (art. 192 da CLT). */
export const SALARIO_MINIMO = 1621.0;

/**
 * Salário mínimo nacional desde maio de 2005, com a data em que cada valor
 * passou a valer. A insalubridade incide sobre o mínimo **de cada mês**
 * (art. 192 da CLT): um pedido que atravessa anos não pode usar o de hoje.
 * Anos com duas mudanças: 2011 (R$ 540 e, em março, R$ 545), 2020 (R$ 1.039
 * e, em fevereiro, R$ 1.045 — MP 919/2020) e 2023 (R$ 1.302 e, em maio,
 * R$ 1.320 — MP 1.172/2023).
 */
export const SALARIOS_MINIMOS = [
  { desde: '2005-05-01', valor: 300.0 },
  { desde: '2006-04-01', valor: 350.0 },
  { desde: '2007-04-01', valor: 380.0 },
  { desde: '2008-03-01', valor: 415.0 },
  { desde: '2009-02-01', valor: 465.0 },
  { desde: '2010-01-01', valor: 510.0 },
  { desde: '2011-01-01', valor: 540.0 },
  { desde: '2011-03-01', valor: 545.0 },
  { desde: '2012-01-01', valor: 622.0 },
  { desde: '2013-01-01', valor: 678.0 },
  { desde: '2014-01-01', valor: 724.0 },
  { desde: '2015-01-01', valor: 788.0 },
  { desde: '2016-01-01', valor: 880.0 },
  { desde: '2017-01-01', valor: 937.0 },
  { desde: '2018-01-01', valor: 954.0 },
  { desde: '2019-01-01', valor: 998.0 },
  { desde: '2020-01-01', valor: 1039.0 },
  { desde: '2020-02-01', valor: 1045.0 },
  { desde: '2021-01-01', valor: 1100.0 },
  { desde: '2022-01-01', valor: 1212.0 },
  { desde: '2023-01-01', valor: 1302.0 },
  { desde: '2023-05-01', valor: 1320.0 },
  { desde: '2024-01-01', valor: 1412.0 },
  { desde: '2025-01-01', valor: 1518.0 },
  { desde: '2026-01-01', valor: SALARIO_MINIMO },
];

const isoDe = (data) => (data instanceof Date ? data.toISOString().slice(0, 10) : String(data));

/**
 * Salário mínimo vigente numa data. Antes de maio de 2005 devolve o primeiro
 * da série — quem chama avisa, porque aí o valor não é o da época.
 */
export function salarioMinimoEm(data) {
  if (!data) return SALARIO_MINIMO;
  const dia = isoDe(data);
  let valor = SALARIOS_MINIMOS[0].valor;
  for (const faixa of SALARIOS_MINIMOS) {
    if (faixa.desde <= dia) valor = faixa.valor;
    else break;
  }
  return valor;
}

/** A série não alcança a data (anterior a maio de 2005). */
export const antesDaSerieDoMinimo = (data) => Boolean(data) && isoDe(data) < SALARIOS_MINIMOS[0].desde;

/**
 * Média do salário mínimo num período, ponderada como os meses do cálculo:
 * mês inteiro pesa 1, mês partido pesa a fração dos seus dias. Um adicional
 * mensal proporcional ao mínimo, somado mês a mês, dá exatamente o mesmo que
 * essa média vezes os meses — então a média basta, e o total sai certo.
 *
 * @returns {{media: number, valores: number[]}} média e valores distintos que o período atravessou
 */
export function salarioMinimoMedio(inicio, fim) {
  if (!inicio || !fim || fim < inicio) {
    const valor = salarioMinimoEm(fim ?? inicio);
    return { media: valor, valores: [valor] };
  }
  const DIA = 86400000;
  let peso = 0;
  let soma = 0;
  const valores = new Set();
  let cursor = new Date(Date.UTC(inicio.getUTCFullYear(), inicio.getUTCMonth(), 1));
  while (cursor <= fim) {
    const ultimo = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0));
    const de = inicio > cursor ? inicio : cursor;
    const ate = fim < ultimo ? fim : ultimo;
    // O mínimo sempre mudou no dia 1º: dentro do mês, vale um só.
    const valor = salarioMinimoEm(cursor);
    const fracao = (Math.round((ate - de) / DIA) + 1) / ultimo.getUTCDate();
    soma += valor * fracao;
    peso += fracao;
    valores.add(valor);
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
  }
  if (valores.size === 1) return { media: [...valores][0], valores: [...valores] };
  return { media: Math.round((soma / peso) * 10000) / 10000, valores: [...valores] };
}

/**
 * Faixas progressivas do INSS do segurado empregado, vigentes desde a
 * competência de janeiro de 2026 (Portaria Interministerial MPS/MF nº 13,
 * de 09/01/2026). Teto do salário de contribuição: R$ 8.475,55.
 */
export const INSS = {
  faixas: [
    { limite: 1621.0, aliquota: 0.075 },
    { limite: 2902.84, aliquota: 0.09 },
    { limite: 4354.27, aliquota: 0.12 },
    { limite: 8475.55, aliquota: 0.14 },
  ],
};

/**
 * Tabela progressiva mensal do IRRF vigente em 2026. As faixas em si não
 * mudaram na virada do ano: o que entrou foi o redutor da Lei 15.270/2025,
 * que zera o imposto até R$ 5.000,00 de rendimento mensal e decresce
 * linearmente até se anular em R$ 7.350,00.
 */
export const IRRF = {
  faixas: [
    { limite: 2428.8, aliquota: 0, deducao: 0 },
    { limite: 2826.65, aliquota: 0.075, deducao: 182.16 },
    { limite: 3751.05, aliquota: 0.15, deducao: 394.16 },
    { limite: 4664.68, aliquota: 0.225, deducao: 675.49 },
    { limite: Infinity, aliquota: 0.275, deducao: 908.73 },
  ],
  deducaoPorDependente: 189.59,
  descontoSimplificado: 607.2,
  /** Redutor da Lei 15.270/2025, aplicado sobre o imposto apurado. */
  redutor: {
    isencaoAte: 5000.0,
    limite: 7350.0,
    constante: 978.62,
    fator: 0.133145,
  },
};

export const FGTS = {
  aliquotaDeposito: 0.08,
  multaSemJustaCausa: 0.4,
  multaComumAcordo: 0.2,
};
