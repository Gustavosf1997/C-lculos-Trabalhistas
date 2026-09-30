/**
 * Intervalo interjornadas (art. 66 da CLT): 11 horas consecutivas de descanso
 * entre duas jornadas. Emendado ao repouso semanal de 24 horas (art. 67), o
 * descanso passa a ser de 35 horas (Súmula 110 do TST).
 *
 * Paga-se o tempo que faltou para completar o descanso, pela hora normal
 * (Súmula 264) acrescida do adicional. O que muda com a data é a natureza:
 *
 * - até 10/11/2017 (OJ 355 da SDI-1): as horas subtraídas são horas extras,
 *   de natureza salarial — com DSR e reflexos;
 * - a partir de 11/11/2017: a OJ 355 aplicava por analogia o art. 71, §4º, e
 *   a Lei 13.467/2017 deu a ele nova redação — só o período suprimido, com
 *   50%, de natureza indenizatória. O TST cancelou a OJ 355 por perda de
 *   eficácia desde a reforma (Resolução 225/2025), e a jurisprudência aplica a
 *   nova redação por analogia: sem reflexos.
 *
 * Nos dois regimes o pagamento se soma ao das horas extras pela jornada
 * excedida: os fatos geradores são distintos, e não há bis in idem.
 */

import { moeda, formatarQuantidade } from '../formato.js';
import {
  MARCO_REFORMA, VESPERA_REFORMA, arredondar, num, valorHoraNormal, calcularAdicionalRisco,
  apurarPrescricao, conferirDatas, contarPeriodo, reflexosMensais, fecharResultado, resultadoComErros,
  resultadoImpedido, validarPeriodo, AVISO_MINIMO_ANTIGO, SEMANAS_POR_MES,
} from './comum.js';
import { parseData, formatarData } from '../calculo.js';

/** Descanso mínimo entre duas jornadas (art. 66 da CLT). */
export const INTERVALO_INTERJORNADAS = 11;

/** Repouso semanal (art. 67) emendado ao intervalo entre jornadas (Súmula 110). */
export const REPOUSO_SEMANAL = 24;
export const DESCANSO_SEMANAL = REPOUSO_SEMANAL + INTERVALO_INTERJORNADAS;

export function calcularInterjornada(dados) {
  const { erros, inicio, fim } = validarPeriodo(dados);

  // Prescrição primeiro: é fato impeditivo, e as datas bastam para apurá-la.
  // Só depois se pedem os valores — de um período prescrito, nenhum serve.
  const prescricao = apurarPrescricao(inicio, fim, dados);
  if (prescricao.impedimento) return resultadoImpedido(prescricao.impedimento);

  const salarioBase = num(dados.salarioBase);
  const divisor = num(dados.divisor);
  const descanso = num(dados.descansoEfetivo);
  const ocorrenciasInformadas = num(dados.jornadasComSupressao);
  const intersemanal = Boolean(dados.intersemanal);
  const descansoSemanal = num(dados.descansoSemanal);
  const folgasComSupressao = num(dados.folgasComSupressao);

  if (salarioBase <= 0) erros.push('Informe o salário base do período.');
  if (divisor <= 0) erros.push('Informe o divisor da jornada.');
  // A tela entrega o campo vazio como zero: exigir descanso positivo impede
  // que um campo esquecido vire 11 horas suprimidas por jornada.
  if (descanso <= 0) {
    erros.push('Informe as horas de descanso que houve entre as jornadas.');
  } else if (descanso >= INTERVALO_INTERJORNADAS) {
    erros.push('Com 11 horas ou mais de descanso entre as jornadas não há violação do art. 66 da CLT.');
  }
  if (ocorrenciasInformadas <= 0) erros.push('Informe quantas jornadas tiveram descanso menor que 11 horas.');
  if (intersemanal) {
    if (descansoSemanal <= 0) erros.push('Informe as horas de descanso em torno da folga semanal.');
    else if (descansoSemanal >= DESCANSO_SEMANAL) {
      erros.push('Com 35 horas ou mais em torno da folga semanal não há violação da Súmula 110 do TST.');
    }
    if (folgasComSupressao <= 0) erros.push('Informe quantas folgas por mês tiveram descanso menor que 35 horas.');
  }
  if (erros.length) return resultadoComErros(erros, prescricao);
  const { inicioCalculo } = prescricao;

  const alertas = conferirDatas(inicio, fim, dados);
  const risco = calcularAdicionalRisco(dados, { inicio: inicioCalculo, fim });
  if (risco.minimoAntesDaSerie) alertas.push(AVISO_MINIMO_ANTIGO);
  const baseCalculo = arredondar(salarioBase + risco.valor + num(dados.outrasParcelas));
  const horaNormal = valorHoraNormal(baseCalculo, divisor);
  const percentual = num(dados.adicionalInterjornada) || 50;
  const valorHoraDevida = horaNormal * (1 + percentual / 100);

  const indenizatorio = dados.regimeInterjornada !== 'anterior_reforma';
  if (!indenizatorio && fim >= parseData(MARCO_REFORMA)) {
    alertas.push(
      `O regime da OJ 355 vale para fatos até ${formatarData(parseData(VESPERA_REFORMA))}. `
        + 'Parte do período pedido é posterior: calcule os dois trechos em separado.',
    );
  }
  if (indenizatorio && inicioCalculo < parseData(MARCO_REFORMA)) {
    alertas.push(
      `O regime indenizatório vale para fatos a partir de ${formatarData(parseData(MARCO_REFORMA))}. `
        + 'Parte do período pedido é anterior: nele as horas subtraídas são horas extras, com reflexos '
        + '(OJ 355 da SDI-1).',
    );
  }

  // Horas que faltaram em cada descanso, vezes quantas vezes por mês.
  const horasPorJornada = INTERVALO_INTERJORNADAS - descanso;
  const jornadasMes = dados.modoOcorrencias === 'semana'
    ? ocorrenciasInformadas * SEMANAS_POR_MES
    : ocorrenciasInformadas;
  const horasInterjornadaMes = horasPorJornada * jornadasMes;
  const valorHoraDevidaTexto = moeda.format(arredondar(valorHoraDevida));

  const mensais = [{
    chave: 'interjornada',
    nomeCurto: 'intervalo interjornadas',
    label: indenizatorio
      ? 'Intervalo interjornadas suprimido (art. 66 c/c art. 71, §4º)'
      : 'Horas extras do intervalo interjornadas (OJ 355)',
    detalhe: `${formatarQuantidade(arredondar(horasPorJornada))} h x ${formatarQuantidade(arredondar(jornadasMes))} `
      + `jornadas/mês x ${valorHoraDevidaTexto} a hora`,
    valor: arredondar(horasInterjornadaMes * valorHoraDevida),
  }];

  // Descanso semanal de 35 horas (Súmula 110). Abaixo de 24 horas o que falta
  // é do próprio repouso semanal, que tem regra e pedido próprios (pagamento
  // em dobro — art. 9º da Lei 605/49 e Súmula 146): aqui entram só as 11 horas
  // do intervalo emendado a ele.
  let horasPorFolga = 0;
  if (intersemanal) {
    horasPorFolga = Math.min(DESCANSO_SEMANAL - descansoSemanal, INTERVALO_INTERJORNADAS);
    if (descansoSemanal < REPOUSO_SEMANAL) {
      alertas.push(
        `O descanso em torno da folga ficou abaixo de ${REPOUSO_SEMANAL} horas: faltou parte do próprio repouso `
          + 'semanal, que é pago em dobro em pedido próprio (art. 9º da Lei 605/49 e Súmula 146 do TST). Aqui '
          + `entram só as ${INTERVALO_INTERJORNADAS} horas do intervalo emendado a ele.`,
      );
    }
    mensais.push({
      chave: 'intersemanal',
      nomeCurto: 'descanso semanal de 35 h',
      label: 'Descanso semanal de 35 horas suprimido (Súmula 110)',
      detalhe: `${formatarQuantidade(arredondar(horasPorFolga))} h x ${formatarQuantidade(folgasComSupressao)} `
        + `folgas/mês x ${valorHoraDevidaTexto} a hora`,
      valor: arredondar(horasPorFolga * folgasComSupressao * valorHoraDevida),
    });
  }
  const horasMes = horasInterjornadaMes + horasPorFolga * (intersemanal ? folgasComSupressao : 0);
  const valorMes = arredondar(mensais.reduce((soma, m) => soma + m.valor, 0));

  const { meses, mesesFracionados, diasPeriodo, proporcao } = contarPeriodo(inicioCalculo, fim);

  // Natureza indenizatória não repercute em outras verbas. No regime salarial
  // as horas subtraídas são horas extras habituais: geram DSR (Súmula 172) e
  // reflexos. Como esse regime é todo anterior a 20/03/2023, vale a redação
  // original da OJ 394: o DSR majorado é pago, mas não repercute em férias,
  // 13º, aviso nem FGTS.
  if (!indenizatorio) {
    if (dados.reflexoDSR !== false) {
      const diasUteis = num(dados.diasUteis) || 25;
      const diasRepouso = num(dados.diasRepouso) || 5;
      mensais.push({
        chave: 'dsr',
        nomeCurto: 'DSR',
        label: 'DSR sobre as horas do intervalo',
        detalhe: `${diasRepouso} repousos / ${diasUteis} dias úteis (Lei 605/49) — sem reflexos (OJ 394)`,
        valor: arredondar((valorMes / diasUteis) * diasRepouso),
        fgtsPeriodo: 0,
      });
    }
    mensais.push(...reflexosMensais(valorMes, dados));
  }

  return fecharResultado({
    mensais,
    meses,
    proporcao,
    mesesFracionados,
    diasPeriodo,
    dados,
    alertas,
    prescricao,
    baseAviso: indenizatorio ? 0 : valorMes,
    chavesFgts: indenizatorio ? [] : ['interjornada', 'intersemanal', 'dsr', 'reflexo_13'],
    contexto: {
      inicio: inicioCalculo,
      inicioPedido: inicio,
      fim,
      divisor,
      baseCalculo,
      valorHora: arredondar(horaNormal),
      valorHoraDevida: arredondar(valorHoraDevida),
      percentualAdicional: percentual,
      descanso,
      horasPorJornada: arredondar(horasPorJornada),
      jornadasMes: arredondar(jornadasMes),
      intersemanal,
      descansoSemanal,
      horasPorFolga: arredondar(horasPorFolga),
      folgasComSupressao,
      horasMes: arredondar(horasMes),
      indenizatorio,
    },
  });
}
