/**
 * Horas extras: hora normal do divisor contratado, acrescida do adicional,
 * com DSR (Lei 605/49) e reflexos.
 */

import { parseData, formatarData } from '../calculo.js';
import { moeda, formatarQuantidade } from '../formato.js';
import {
  MARCO_OJ_394, SEMANAS_POR_MES, arredondar, num, valorHoraNormal, calcularAdicionalRisco,
  apurarPrescricao, conferirDatas, contarPeriodo, reflexosMensais, fecharResultado, resultadoComErros,
  resultadoImpedido, validarPeriodo,
} from './comum.js';

export function calcularHorasExtras(dados) {
  const { erros, inicio, fim } = validarPeriodo(dados);

  // Prescrição primeiro: é fato impeditivo, e as datas bastam para apurá-la.
  // Só depois se pedem os valores — de um período prescrito, nenhum serve.
  const prescricao = apurarPrescricao(inicio, fim, dados);
  if (prescricao.impedimento) return resultadoImpedido(prescricao.impedimento);

  const salarioBase = num(dados.salarioBase);
  const divisor = num(dados.divisor);
  const horasInformadas = num(dados.quantidadeHoras);

  if (salarioBase <= 0) erros.push('Informe o salário base do período.');
  if (divisor <= 0) erros.push('Informe o divisor da jornada (220 para 44h semanais).');
  if (horasInformadas <= 0) erros.push('Informe a quantidade de horas extras.');
  if (erros.length) return resultadoComErros(erros, prescricao);
  const { inicioCalculo } = prescricao;

  const alertas = conferirDatas(inicio, fim, dados);
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

  // OJ 394 da SDI-1. Na redação original, o DSR majorado pelas horas extras
  // não repercute em férias, 13º, aviso prévio nem FGTS. Na nova (item II),
  // repercute em todos eles — mas só para as horas extras prestadas a partir
  // de 20/03/2023. O período é partido nesse marco, e cada trecho segue a sua
  // regra: nada de aplicar a nova a meses que ela não alcança.
  const marcoOJ394 = parseData(MARCO_OJ_394);
  const pediuDsrMajorado = querDSR && dados.dsrNosReflexos !== false;
  const mesesDesdeOMarco = fim >= marcoOJ394
    ? contarPeriodo(inicioCalculo > marcoOJ394 ? inicioCalculo : marcoOJ394, fim).meses
    : 0;
  const mesesMajorados = pediuDsrMajorado ? Math.min(mesesDesdeOMarco, meses) : 0;
  const mesesSemMajoracao = arredondar(meses - mesesMajorados);
  const partido = mesesMajorados > 0 && mesesSemMajoracao > 0;

  if (pediuDsrMajorado && mesesMajorados === 0) {
    alertas.push(
      `Todo o período pedido é anterior a ${formatarData(marcoOJ394)}. Pela redação original da OJ 394 da `
        + 'SDI-1, o DSR majorado pelas horas extras não repercute em férias, 13º, aviso prévio nem FGTS, e o '
        + 'cálculo o afastou desses reflexos.',
    );
  } else if (partido) {
    alertas.push(
      `O período cruza ${formatarData(marcoOJ394)}, e o cálculo o separou. Nos `
        + `${formatarQuantidade(mesesSemMajoracao)} meses anteriores, o DSR majorado não repercute em férias, `
        + '13º, aviso nem FGTS (OJ 394, redação original); nos '
        + `${formatarQuantidade(mesesMajorados)} meses seguintes, repercute (OJ 394, II).`,
    );
  }

  // O DSR é pago no período todo; o FGTS sobre ele, só nos meses majorados.
  const dsr = mensais.find((m) => m.chave === 'dsr');
  if (dsr && mesesMajorados < meses) {
    dsr.fgtsPeriodo = arredondar(dsrMes * mesesMajorados);
    if (partido) dsr.nomeCurto = `DSR (desde ${formatarData(marcoOJ394)})`;
  }

  // Reflexos em 13º e férias: sobre as horas extras no período todo, e sobre
  // o DSR só nos meses majorados. O mensal exibido é o do trecho mais recente.
  const semDsr = reflexosMensais(horasExtrasMes, dados);
  const comDsr = reflexosMensais(horasExtrasMes + dsrMes, dados);
  if (mesesMajorados === 0) mensais.push(...semDsr);
  else if (!partido) mensais.push(...comDsr);
  else {
    mensais.push(...comDsr.map((item) => {
      const antes = semDsr.find((s) => s.chave === item.chave)?.valor ?? 0;
      return {
        ...item,
        detalhe: `${item.detalhe}; sem o DSR antes de ${formatarData(marcoOJ394)}`,
        valorPeriodo: arredondar(antes * mesesSemMajoracao + item.valor * mesesMajorados),
      };
    }));
  }

  return fecharResultado({
    mensais,
    meses,
    mesesFracionados,
    diasPeriodo,
    dados,
    alertas,
    prescricao,
    // O aviso é pago na saída: segue a regra do fim do período.
    baseAviso: horasExtrasMes + (mesesMajorados > 0 ? dsrMes : 0),
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
