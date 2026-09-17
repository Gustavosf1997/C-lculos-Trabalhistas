/**
 * Tabelas e parâmetros legais usados nos cálculos.
 *
 * ATENÇÃO: os valores abaixo precisam ser revisados a cada competência.
 * Mantenha `VIGENCIA` sempre coerente com as faixas cadastradas — ela é
 * exibida na interface para que o usuário saiba qual tabela foi aplicada.
 */

export const VIGENCIA = 'Tabelas de referência: 2025 (conferir antes de uso oficial)';

export const SALARIO_MINIMO = 1518.0;

/** Faixas progressivas do INSS (empregado). */
export const INSS = {
  faixas: [
    { limite: 1518.0, aliquota: 0.075 },
    { limite: 2793.88, aliquota: 0.09 },
    { limite: 4190.83, aliquota: 0.12 },
    { limite: 8157.41, aliquota: 0.14 },
  ],
};

/** Tabela progressiva mensal do IRRF. */
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
};

export const FGTS = {
  aliquotaDeposito: 0.08,
  multaSemJustaCausa: 0.4,
  multaComumAcordo: 0.2,
};
