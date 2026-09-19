/**
 * Intervalo intrajornada (art. 71, §4º, da CLT).
 *
 * Dois regimes, e a diferença entre eles muda tudo:
 *
 * - até 10/11/2017 (Súmula 437, I, do TST): a não concessão gera o pagamento
 *   do intervalo **integral**, com natureza salarial — logo, com reflexos;
 * - a partir de 11/11/2017 (Lei 13.467/2017): paga-se **apenas o período
 *   suprimido**, com acréscimo de 50%, e a natureza é indenizatória — sem
 *   reflexos em outras verbas.
 */

import { moeda, formatarQuantidade } from '../formato.js';
import {
  MARCO_REFORMA, VESPERA_REFORMA, arredondar, num, valorHoraNormal, calcularAdicionalRisco,
  apurarPrescricao, contarPeriodo, reflexosMensais, fecharResultado, resultadoComErros,
  resultadoImpedido, validarPeriodo,
} from './comum.js';
import { parseData, formatarData } from '../calculo.js';

export function calcularIntervalo(dados) {
  const { erros, inicio, fim } = validarPeriodo(dados);
  const salarioBase = num(dados.salarioBase);
  const divisor = num(dados.divisor);
  const minutosSuprimidos = num(dados.minutosSuprimidos);

  if (salarioBase <= 0) erros.push('Informe o salário base do período.');
  if (divisor <= 0) erros.push('Informe o divisor da jornada.');
  if (minutosSuprimidos <= 0) erros.push('Informe os minutos de intervalo suprimidos por dia.');
  if (erros.length) return resultadoComErros(erros);

  const { impedimento, recorte, inicioCalculo } = apurarPrescricao(inicio, fim, dados);
  if (impedimento) return resultadoImpedido(impedimento);

  const alertas = [];
  const risco = calcularAdicionalRisco(dados);
  const baseCalculo = arredondar(salarioBase + risco.valor + num(dados.outrasParcelas));
  const horaNormal = valorHoraNormal(baseCalculo, divisor);
  const percentual = num(dados.adicionalIntervalo) || 50;

  const indenizatorio = dados.regimeIntervalo !== 'anterior_reforma';
  const intervaloIntegral = num(dados.intervaloIntegral) || 60;

  // Antes da reforma paga-se o intervalo inteiro; depois, só o que foi suprimido.
  const minutosDevidos = indenizatorio ? minutosSuprimidos : intervaloIntegral;
  const diasNoMes = num(dados.diasComSupressao) || 22;
  const horasMes = (minutosDevidos / 60) * diasNoMes;

  const { meses, mesesFracionados, diasPeriodo } = contarPeriodo(inicioCalculo, fim);
  const valorMes = arredondar(horasMes * horaNormal * (1 + percentual / 100));

  if (!indenizatorio && fim >= parseData(MARCO_REFORMA)) {
    alertas.push(
      `O regime anterior à reforma vale para fatos até ${formatarData(parseData(VESPERA_REFORMA))}. `
        + 'Parte do período pedido é posterior: calcule os dois trechos em separado.',
    );
  }
  if (indenizatorio && inicioCalculo < parseData(MARCO_REFORMA)) {
    alertas.push(
      `O regime indenizatório vale para fatos a partir de ${formatarData(parseData(MARCO_REFORMA))}. `
        + 'Parte do período pedido é anterior: nele aplica-se a Súmula 437 do TST.',
    );
  }

  const mensais = [{
    chave: 'intervalo',
    nomeCurto: 'intervalo',
    label: indenizatorio
      ? 'Intervalo suprimido (art. 71, §4º)'
      : 'Intervalo integral (Súmula 437 do TST)',
    detalhe: `${formatarQuantidade(minutosDevidos)} min x ${diasNoMes} dias x `
      + `${moeda.format(arredondar(horaNormal * (1 + percentual / 100)))} a hora`,
    valor: valorMes,
  }];

  // Natureza indenizatória não repercute em outras verbas.
  if (!indenizatorio) mensais.push(...reflexosMensais(valorMes, dados));

  return fecharResultado({
    mensais,
    meses,
    mesesFracionados,
    diasPeriodo,
    dados,
    alertas,
    recorte,
    baseAviso: indenizatorio ? 0 : valorMes,
    chavesFgts: indenizatorio ? [] : ['intervalo', 'reflexo_13'],
    contexto: {
      inicio: inicioCalculo,
      inicioPedido: inicio,
      fim,
      divisor,
      baseCalculo,
      valorHora: arredondar(horaNormal),
      percentualAdicional: percentual,
      minutosDevidos,
      diasNoMes,
      indenizatorio,
    },
  });
}
