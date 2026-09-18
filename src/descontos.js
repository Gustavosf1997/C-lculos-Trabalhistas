/**
 * Descontos que podem incidir sobre o acerto rescisório.
 *
 * Cada entrada diz o campo que a tela deve mostrar quando o desconto é
 * marcado e como o valor é apurado. INSS, IRRF e o aviso prévio não cumprido
 * não entram aqui: decorrem da lei e do próprio cálculo, não de uma escolha.
 */

export const SEM_DESCONTOS = 'nenhum';

export const DESCONTOS = [
  {
    id: 'horas_negativas',
    label: 'Horas negativas',
    campo: 'horasNegativas',
    tipo: 'horas',
    rotulo: 'Horas negativas',
    dica: 'Descontadas pela mesma hora normal das extras: salário e adicionais ÷ divisor.',
  },
  {
    id: 'adiantamento_salario',
    label: 'Adiantamento de salário',
    campo: 'adiantamentoSalario',
    tipo: 'valor',
    rotulo: 'Adiantamento de salário',
  },
  {
    id: 'adiantamento_13',
    label: 'Adiantamento do 13º',
    campo: 'adiantamento13',
    tipo: 'valor',
    rotulo: 'Adiantamento do 13º',
  },
  {
    id: 'pensao',
    label: 'Pensão alimentícia',
    campo: 'pensaoPercentual',
    tipo: 'percentual',
    rotulo: 'Pensão alimentícia',
    dica: 'Percentual incidente sobre as verbas rescisórias.',
  },
  {
    id: 'outros',
    label: 'Outros descontos',
    campo: 'outrosDescontos',
    tipo: 'valor',
    rotulo: 'Outros descontos (VT, VR, empréstimos)',
  },
];

export const descontoPorId = (id) => DESCONTOS.find((d) => d.id === id) ?? null;

/** Marcar "não há descontos" limpa os demais, e vice-versa. */
export function aplicarExclusoesDesconto(selecionados, alterado) {
  if (alterado === SEM_DESCONTOS) return [];
  return selecionados.filter((id) => id !== SEM_DESCONTOS);
}

/**
 * Salário-hora: a mesma hora que remunera, agora descontando (art. 64 da CLT).
 * A base mensal é salário mais adicionais — os de natureza salarial integram a
 * hora normal (Súmula 139 do TST).
 */
export function salarioHora(baseMensal, divisor) {
  if (!divisor || divisor <= 0) return 0;
  return baseMensal / divisor;
}
