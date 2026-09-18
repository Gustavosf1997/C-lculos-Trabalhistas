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
