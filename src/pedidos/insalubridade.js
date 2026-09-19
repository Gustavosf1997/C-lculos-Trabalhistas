/**
 * Insalubridade e periculosidade pedidas como verba própria.
 *
 * Insalubridade: 10%, 20% ou 40% sobre o salário mínimo (art. 192 da CLT),
 * salvo base maior fixada em norma coletiva. Periculosidade: 30% sobre o
 * salário base, sem os acréscimos de gratificações, prêmios ou participação
 * nos lucros (art. 193, §1º). Os dois não se acumulam (art. 193, §2º).
 *
 * São parcelas mensais fixas: não geram DSR, mas repercutem em 13º, férias e
 * FGTS.
 */

import {
  arredondar, num, calcularAdicionalRisco, apurarPrescricao, contarPeriodo,
  reflexosMensais, fecharResultado, resultadoComErros, resultadoImpedido, validarPeriodo,
} from './comum.js';

export function calcularAdicionalRiscoPedido(dados) {
  const { erros, inicio, fim } = validarPeriodo(dados);
  const salarioBase = num(dados.salarioBase);

  if (salarioBase <= 0) erros.push('Informe o salário base do período.');
  if (!dados.risco || dados.risco === 'nenhum') {
    erros.push('Escolha entre insalubridade e periculosidade.');
  }
  if (erros.length) return resultadoComErros(erros);

  const { impedimento, recorte, inicioCalculo } = apurarPrescricao(inicio, fim, dados);
  if (impedimento) return resultadoImpedido(impedimento);

  const risco = calcularAdicionalRisco(dados);
  const { meses, mesesFracionados, diasPeriodo } = contarPeriodo(inicioCalculo, fim);

  const mensais = [{
    chave: 'adicional_risco',
    nomeCurto: 'adicional',
    label: risco.nome,
    detalhe: risco.detalhe,
    valor: risco.valor,
  }];
  mensais.push(...reflexosMensais(risco.valor, dados));

  return fecharResultado({
    mensais,
    meses,
    mesesFracionados,
    diasPeriodo,
    dados,
    recorte,
    baseAviso: risco.valor,
    chavesFgts: ['adicional_risco', 'reflexo_13'],
    contexto: {
      inicio: inicioCalculo,
      inicioPedido: inicio,
      fim,
      baseCalculo: salarioBase,
      risco,
      valorMensal: risco.valor,
    },
  });
}
