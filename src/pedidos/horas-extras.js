/**
 * Horas extras: hora normal do divisor contratado, acrescida do adicional,
 * com DSR (Lei 605/49) e reflexos.
 */

import { parseData, formatarData } from '../calculo.js';
import { moeda, formatarQuantidade } from '../formato.js';
import {
  MARCO_OJ_394, SEMANAS_POR_MES, arredondar, num, valorHoraNormal, calcularAdicionalRisco,
  apurarPrescricao, contarPeriodo, reflexosMensais, fecharResultado, resultadoComErros,
  resultadoImpedido, validarPeriodo,
} from './comum.js';

export function calcularHorasExtras(dados) {
  const { erros, inicio, fim } = validarPeriodo(dados);
  const salarioBase = num(dados.salarioBase);
  const divisor = num(dados.divisor);
  const horasInformadas = num(dados.quantidadeHoras);

  if (salarioBase <= 0) erros.push('Informe o salário base do período.');
  if (divisor <= 0) erros.push('Informe o divisor da jornada (220 para 44h semanais).');
  if (horasInformadas <= 0) erros.push('Informe a quantidade de horas extras.');
  if (erros.length) return resultadoComErros(erros);

  const { impedimento, recorte, inicioCalculo } = apurarPrescricao(inicio, fim, dados.dataAjuizamento);
  if (impedimento) return resultadoImpedido(impedimento);

  const alertas = [];
  const risco = calcularAdicionalRisco(dados);
  const baseCalculo = arredondar(salarioBase + risco.valor + num(dados.outrasParcelas));
  const horaNormal = valorHoraNormal(baseCalculo, divisor);
  const percentual = num(dados.adicionalHoraExtra) || 50;
  const valorHoraExtra = horaNormal * (1 + percentual / 100);

  const horasMes =
    dados.modoQuantidade === 'semana' ? horasInformadas * SEMANAS_POR_MES : horasInformadas;
  const { meses, mesesFracionados, diasPeriodo } = contarPeriodo(inicioCalculo, fim);

  const diasUteis = num(dados.diasUteis) || 25;
  const diasRepouso = num(dados.diasRepouso) || 5;

  const horasExtrasMes = arredondar(horasMes * valorHoraExtra);
  const dsrMes = arredondar((horasExtrasMes / diasUteis) * diasRepouso);

  const mensais = [{
    chave: 'horas_extras',
    label: 'Horas extras',
    nomeCurto: 'horas extras',
    detalhe: `${formatarQuantidade(horasMes)} h/mês x ${moeda.format(arredondar(valorHoraExtra))}`,
    valor: horasExtrasMes,
  }];

  const querDSR = dados.reflexoDSR !== false;
  if (querDSR) {
    mensais.push({
      chave: 'dsr',
      label: 'DSR sobre horas extras',
      nomeCurto: 'DSR',
      detalhe: `${diasRepouso} repousos / ${diasUteis} dias úteis (Lei 605/49)`,
      valor: dsrMes,
    });
  }

  // OJ 394, II, da SDI-1: o DSR majorado repercute nas demais verbas para as
  // horas extras prestadas a partir de 20/03/2023.
  const dsrNosReflexos = querDSR && dados.dsrNosReflexos !== false;
  const baseReflexos = horasExtrasMes + (dsrNosReflexos ? dsrMes : 0);
  if (dsrNosReflexos && inicioCalculo < parseData(MARCO_OJ_394)) {
    alertas.push(
      'O DSR majorado só repercute nas demais verbas para horas extras a partir de '
        + `${formatarData(parseData(MARCO_OJ_394))} (OJ 394, II, da SDI-1). Parte do período é anterior a esse marco.`,
    );
  }

  mensais.push(...reflexosMensais(baseReflexos, dados));

  return fecharResultado({
    mensais,
    meses,
    mesesFracionados,
    diasPeriodo,
    dados,
    alertas,
    recorte,
    baseAviso: horasExtrasMes + (querDSR ? dsrMes : 0),
    chavesFgts: ['horas_extras', 'dsr', 'reflexo_13'],
    contexto: {
      inicio: inicioCalculo,
      inicioPedido: inicio,
      fim,
      divisor,
      baseCalculo,
      risco,
      valorHora: arredondar(horaNormal),
      valorHoraExtra: arredondar(valorHoraExtra),
      percentualAdicional: percentual,
      horasMes: arredondar(horasMes),
    },
  });
}
