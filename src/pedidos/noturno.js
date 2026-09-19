/**
 * Adicional noturno (art. 73 da CLT).
 *
 * Trabalho urbano entre 22h e 5h rende adicional de 20% sobre a hora normal,
 * e cada hora noturna vale 52min30s (§1º) — sete horas de relógio equivalem a
 * oito horas fictas. O percentual é editável porque o rural tem 25% e a norma
 * coletiva pode ser maior.
 */

import { moeda, formatarQuantidade } from '../formato.js';
import {
  FATOR_HORA_NOTURNA, SEMANAS_POR_MES, arredondar, num, valorHoraNormal, calcularAdicionalRisco,
  apurarPrescricao, contarPeriodo, reflexosMensais, fecharResultado, resultadoComErros,
  resultadoImpedido, validarPeriodo,
} from './comum.js';

export function calcularAdicionalNoturno(dados) {
  const { erros, inicio, fim } = validarPeriodo(dados);
  const salarioBase = num(dados.salarioBase);
  const divisor = num(dados.divisor);
  const horasInformadas = num(dados.horasNoturnas);

  if (salarioBase <= 0) erros.push('Informe o salário base do período.');
  if (divisor <= 0) erros.push('Informe o divisor da jornada.');
  if (horasInformadas <= 0) erros.push('Informe a quantidade de horas noturnas.');
  if (erros.length) return resultadoComErros(erros);

  const { impedimento, recorte, inicioCalculo } = apurarPrescricao(inicio, fim, dados);
  if (impedimento) return resultadoImpedido(impedimento);

  // A hora normal já vem integrada pelas parcelas salariais, entre elas o
  // adicional de risco (Súmulas 60, I, e 264 do TST).
  const risco = calcularAdicionalRisco(dados);
  const baseCalculo = arredondar(salarioBase + risco.valor + num(dados.outrasParcelas));
  const horaNormal = valorHoraNormal(baseCalculo, divisor);
  const percentual = num(dados.adicionalNoturno) || 20;

  const horasRelogio =
    dados.modoQuantidade === 'semana' ? horasInformadas * SEMANAS_POR_MES : horasInformadas;
  const horaReduzida = dados.horaReduzida !== false;
  const horasFictas = horaReduzida ? horasRelogio * FATOR_HORA_NOTURNA : horasRelogio;

  const { meses, mesesFracionados, diasPeriodo } = contarPeriodo(inicioCalculo, fim);
  const diasUteis = num(dados.diasUteis) || 25;
  const diasRepouso = num(dados.diasRepouso) || 5;

  const adicionalMes = arredondar(horasFictas * horaNormal * (percentual / 100));

  const mensais = [{
    chave: 'adicional_noturno',
    nomeCurto: 'adicional noturno',
    label: `Adicional noturno ${formatarQuantidade(percentual)}%`,
    detalhe: horaReduzida
      ? `${formatarQuantidade(horasRelogio)} h de relógio = ${formatarQuantidade(arredondar(horasFictas))} h fictas `
        + `x ${moeda.format(arredondar(horaNormal))}`
      : `${formatarQuantidade(horasRelogio)} h x ${moeda.format(arredondar(horaNormal))}`,
    valor: adicionalMes,
  }];

  const querDSR = dados.reflexoDSR !== false;
  const dsrMes = arredondar((adicionalMes / diasUteis) * diasRepouso);
  if (querDSR) {
    mensais.push({
      chave: 'dsr',
      nomeCurto: 'DSR',
      label: 'DSR sobre o adicional noturno',
      detalhe: `${diasRepouso} repousos / ${diasUteis} dias úteis (Lei 605/49)`,
      valor: dsrMes,
    });
  }

  const baseReflexos = adicionalMes + (querDSR ? dsrMes : 0);
  mensais.push(...reflexosMensais(baseReflexos, dados));

  return fecharResultado({
    mensais,
    meses,
    mesesFracionados,
    diasPeriodo,
    dados,
    recorte,
    baseAviso: baseReflexos,
    chavesFgts: ['adicional_noturno', 'dsr', 'reflexo_13'],
    contexto: {
      inicio: inicioCalculo,
      inicioPedido: inicio,
      fim,
      divisor,
      baseCalculo,
      risco,
      valorHora: arredondar(horaNormal),
      percentualAdicional: percentual,
      horasRelogio: arredondar(horasRelogio),
      horasFictas: arredondar(horasFictas),
      horaReduzida,
    },
  });
}
