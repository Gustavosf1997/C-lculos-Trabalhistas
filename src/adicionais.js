/**
 * Adicionais legais que integram a remuneração para o cálculo das verbas.
 *
 * Cada um traz o seu percentual e a base sobre a qual incide, de modo que a
 * tela só precisa perguntar quais o empregado recebia.
 */

import { SALARIO_MINIMO } from './tabelas.js';

/** Divisor mensal padrão (44h semanais). Cada tela pode informar o seu. */
export const DIVISOR_PADRAO = 220;

export const SEM_ADICIONAIS = 'nenhum';

export const ADICIONAIS = [
  {
    id: 'insalubridade_10',
    label: 'Insalubridade 10%',
    detalhe: 'grau mínimo, sobre o salário mínimo',
    percentual: 0.1,
    base: 'salario_minimo',
    exclusivo: 'risco',
  },
  {
    id: 'insalubridade_20',
    label: 'Insalubridade 20%',
    detalhe: 'grau médio, sobre o salário mínimo',
    percentual: 0.2,
    base: 'salario_minimo',
    exclusivo: 'risco',
  },
  {
    id: 'insalubridade_40',
    label: 'Insalubridade 40%',
    detalhe: 'grau máximo, sobre o salário mínimo',
    percentual: 0.4,
    base: 'salario_minimo',
    exclusivo: 'risco',
  },
  {
    id: 'periculosidade_30',
    label: 'Periculosidade 30%',
    detalhe: 'sobre o salário base (art. 193, §1º)',
    percentual: 0.3,
    base: 'salario_base',
    exclusivo: 'risco',
  },
  {
    id: 'transferencia_25',
    label: 'Transferência 25%',
    detalhe: 'sobre o salário base (art. 469, §3º)',
    percentual: 0.25,
    base: 'salario_base',
  },
  {
    id: 'noturno_20',
    label: 'Adicional noturno 20%',
    detalhe: 'sobre as horas noturnas (art. 73)',
    percentual: 0.2,
    base: 'horas_noturnas',
    pedeHoras: true,
  },
];

export const adicionalPorId = (id) => ADICIONAIS.find((a) => a.id === id) ?? null;

function arredondar(valor) {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}

/**
 * Soma os adicionais marcados.
 *
 * @param {object} dados
 * @param {string[]} dados.selecionados ids marcados na tela
 * @param {number} dados.salarioBase
 * @param {number} [dados.horasNoturnas] usadas apenas pelo adicional noturno
 * @returns {{itens: object[], total: number}}
 */
export function calcularAdicionais({
  selecionados = [],
  salarioBase = 0,
  horasNoturnas = 0,
  divisor = DIVISOR_PADRAO,
} = {}) {
  const itens = [];

  for (const id of selecionados) {
    const adicional = adicionalPorId(id);
    if (!adicional) continue;

    let valor = 0;
    if (adicional.base === 'salario_minimo') valor = SALARIO_MINIMO * adicional.percentual;
    else if (adicional.base === 'salario_base') valor = salarioBase * adicional.percentual;
    else if (adicional.base === 'horas_noturnas') {
      valor = (salarioBase / divisor) * horasNoturnas * adicional.percentual;
    }

    itens.push({
      id,
      label: adicional.label,
      detalhe: adicional.base === 'horas_noturnas'
        ? `${horasNoturnas} hora(s) noturna(s) por mês`
        : adicional.detalhe,
      valor: arredondar(valor),
    });
  }

  return { itens, total: arredondar(itens.reduce((soma, i) => soma + i.valor, 0)) };
}

/**
 * Aplica as regras de exclusão entre os adicionais, dado o que acabou de ser
 * marcado. Insalubridade e periculosidade não se acumulam (art. 193, §2º) e
 * "não recebia adicionais" exclui todos.
 *
 * @param {string[]} selecionados
 * @param {string} alterado id que acabou de ser marcado
 * @returns {string[]} seleção já consistente
 */
export function aplicarExclusoes(selecionados, alterado) {
  if (alterado === SEM_ADICIONAIS) return [];

  const grupo = adicionalPorId(alterado)?.exclusivo;
  return selecionados.filter((id) => {
    if (id === SEM_ADICIONAIS) return false;
    if (id === alterado) return true;
    return !grupo || adicionalPorId(id)?.exclusivo !== grupo;
  });
}
