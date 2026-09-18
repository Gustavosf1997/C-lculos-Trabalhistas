/**
 * Motor de cálculo dos pedidos de uma reclamatória trabalhista.
 *
 * Começa pelas horas extras. Módulo puro (sem DOM), como `calculo.js`.
 */

import { FGTS, SALARIO_MINIMO } from './tabelas.js';
import { parseData, formatarData, contarMeses, diasEntre } from './calculo.js';
import { moeda, formatarQuantidade } from './formato.js';

/** Jornadas usuais e o divisor mensal correspondente (Súmula 431 do TST). */
export const JORNADAS = [
  { valor: '44', divisor: 220, label: '44h semanais — divisor 220' },
  { valor: '40', divisor: 200, label: '40h semanais — divisor 200' },
  { valor: '36', divisor: 180, label: '36h semanais — divisor 180' },
  { valor: '30', divisor: 150, label: '30h semanais — divisor 150' },
  { valor: '20', divisor: 100, label: '20h semanais — divisor 100' },
  { valor: 'outra', divisor: null, label: 'Outra (informar o divisor)' },
];

export const GRAUS_INSALUBRIDADE = [
  { valor: '10', label: 'Mínimo — 10%' },
  { valor: '20', label: 'Médio — 20%' },
  { valor: '40', label: 'Máximo — 40%' },
];

/** 52 semanas / 12 meses. */
export const SEMANAS_POR_MES = 52 / 12;

/** Marco da nova redação da OJ 394 da SDI-1 (Tema 9 de repetitivos). */
export const MARCO_OJ_394 = '2023-03-20';

const arredondar = (v) => Math.round((v + Number.EPSILON) * 100) / 100;
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/**
 * Adicional de risco. Insalubridade e periculosidade não se acumulam
 * (art. 193, §2º, da CLT): o empregado opta por um deles.
 */
export function calcularAdicionalRisco(dados) {
  const salarioBase = num(dados.salarioBase);

  if (dados.risco === 'insalubridade') {
    const grau = num(dados.grauInsalubridade) / 100;
    const base =
      dados.baseInsalubridade === 'salario_base'
        ? salarioBase
        : dados.baseInsalubridade === 'valor_informado'
          ? num(dados.baseInsalubridadeValor)
          : SALARIO_MINIMO;
    return {
      nome: `Adicional de insalubridade (${num(dados.grauInsalubridade)}%)`,
      detalhe: `${(grau * 100).toFixed(0)}% sobre ${
        dados.baseInsalubridade === 'salario_base'
          ? 'o salário base'
          : dados.baseInsalubridade === 'valor_informado'
            ? 'a base informada'
            : 'o salário mínimo'
      }`,
      valor: arredondar(base * grau),
    };
  }

  if (dados.risco === 'periculosidade') {
    return {
      nome: 'Adicional de periculosidade (30%)',
      detalhe: '30% sobre o salário base (art. 193, §1º, da CLT)',
      valor: arredondar(salarioBase * 0.3),
    };
  }

  return { nome: null, detalhe: null, valor: 0 };
}

/**
 * Horas extras do período, com DSR e reflexos.
 *
 * A base de cálculo integra as parcelas de natureza salarial, entre elas os
 * adicionais de insalubridade e de periculosidade (Súmulas 264 e 132 do TST).
 *
 * @param {object} dados campos do formulário de horas extras
 */
export function calcularHorasExtras(dados) {
  const erros = [];
  const alertas = [];

  const inicio = parseData(dados.dataInicio);
  const fim = parseData(dados.dataFim);
  if (!inicio) erros.push('Informe o início do período pedido.');
  if (!fim) erros.push('Informe o fim do período pedido.');
  if (inicio && fim && fim < inicio) erros.push('O fim do período não pode ser anterior ao início.');

  const salarioBase = num(dados.salarioBase);
  if (salarioBase <= 0) erros.push('Informe o salário base do período.');

  const divisor = num(dados.divisor);
  if (divisor <= 0) erros.push('Informe o divisor da jornada (220 para 44h semanais).');

  const horasInformadas = num(dados.quantidadeHoras);
  if (horasInformadas <= 0) erros.push('Informe a quantidade de horas extras.');

  const diasUteis = num(dados.diasUteis) || 25;
  const diasRepouso = num(dados.diasRepouso) || 5;

  if (erros.length) {
    return {
      erros, alertas: [], impedimento: null, contexto: null, mensais: [], periodo: [], fgts: null, totais: null,
    };
  }

  // Prescrição quinquenal (art. 7º, XXIX, da CF): fato impeditivo do direito,
  // apurado antes de qualquer conta. Havendo parcela prescrita no período, não
  // há o que calcular enquanto ele não for ajustado.
  const ajuizamento = parseData(dados.dataAjuizamento);
  if (ajuizamento) {
    const marco = new Date(
      Date.UTC(ajuizamento.getUTCFullYear() - 5, ajuizamento.getUTCMonth(), ajuizamento.getUTCDate()),
    );
    if (inicio < marco) {
      const integral = fim < marco;
      return {
        erros: [],
        alertas: [],
        impedimento: {
          integral,
          marco,
          titulo: integral ? 'Pedido integralmente prescrito' : 'Há parcelas prescritas no período',
          mensagem: integral
            ? `Todo o período pedido é anterior a ${formatarData(marco)}, marco da prescrição `
              + `quinquenal contado do ajuizamento em ${formatarData(ajuizamento)}. Não há parcela exigível a calcular.`
            : `As parcelas anteriores a ${formatarData(marco)} estão prescritas, contadas do ajuizamento `
              + `em ${formatarData(ajuizamento)}. Ajuste o início do período para essa data ou posterior.`,
        },
        contexto: null,
        mensais: [],
        periodo: [],
        fgts: null,
        totais: null,
      };
    }
  }

  /* --- base de cálculo --- */
  const risco = calcularAdicionalRisco(dados);
  const outrasParcelas = num(dados.outrasParcelas);
  const baseCalculo = arredondar(salarioBase + risco.valor + outrasParcelas);

  const valorHora = baseCalculo / divisor;
  const percentualAdicional = num(dados.adicionalHoraExtra) || 50;
  const valorHoraExtra = valorHora * (1 + percentualAdicional / 100);

  /* --- quantidade mensal --- */
  const horasMes =
    dados.modoQuantidade === 'semana' ? horasInformadas * SEMANAS_POR_MES : horasInformadas;

  // Períodos curtos não chegam a fechar uma competência de 15 dias: em vez de
  // devolver zero, o período vira fração de mês.
  const diasPeriodo = diasEntre(inicio, fim);
  const mesesInteiros = contarMeses(inicio, fim);
  const meses = mesesInteiros > 0 ? mesesInteiros : Math.round((diasPeriodo / 30) * 100) / 100;
  const mesesFracionados = mesesInteiros === 0;

  /* --- valores mensais --- */
  const horasExtrasMes = arredondar(horasMes * valorHoraExtra);
  const dsrMes = arredondar((horasExtrasMes / diasUteis) * diasRepouso);

  const mensais = [
    {
      chave: 'horas_extras',
      label: 'Horas extras',
      detalhe: `${formatarQuantidade(horasMes)} h/mês x ${moeda.format(valorHoraExtra)}`,
      valor: horasExtrasMes,
    },
  ];

  const querDSR = dados.reflexoDSR !== false;
  if (querDSR) {
    mensais.push({
      chave: 'dsr',
      label: 'DSR sobre horas extras',
      detalhe: `${diasRepouso} repousos / ${diasUteis} dias úteis (Lei 605/49)`,
      valor: dsrMes,
    });
  }

  // OJ 394, II, da SDI-1: o DSR majorado repercute nas demais verbas para as
  // horas extras prestadas a partir de 20/03/2023.
  const dsrNosReflexos = querDSR && dados.dsrNosReflexos !== false;
  const baseReflexos = horasExtrasMes + (dsrNosReflexos ? dsrMes : 0);

  if (dsrNosReflexos && inicio < parseData(MARCO_OJ_394)) {
    alertas.push(
      'O DSR majorado só repercute nas demais verbas para horas extras a partir de '
        + `${formatarData(parseData(MARCO_OJ_394))} (OJ 394, II, da SDI-1). Parte do período é anterior a esse marco.`,
    );
  }

  const reflexo13 = dados.reflexo13 !== false ? arredondar(baseReflexos / 12) : 0;
  if (reflexo13) {
    mensais.push({ chave: 'reflexo_13', label: 'Reflexo no 13º salário', detalhe: '1/12 por mês', valor: reflexo13 });
  }

  const reflexoFerias = dados.reflexoFerias !== false ? arredondar((baseReflexos / 12) * (4 / 3)) : 0;
  if (reflexoFerias) {
    mensais.push({
      chave: 'reflexo_ferias',
      label: 'Reflexo em férias + 1/3',
      detalhe: '1/12 por mês, acrescido do terço',
      valor: reflexoFerias,
    });
  }

  const totalMensal = arredondar(mensais.reduce((s, m) => s + m.valor, 0));

  /* --- totais do período --- */
  const periodo = mensais.map((m) => ({ ...m, valor: arredondar(m.valor * meses) }));

  const diasAviso = dados.reflexoAviso ? num(dados.diasAviso) || 30 : 0;
  const valorAviso = diasAviso ? arredondar(((horasExtrasMes + (querDSR ? dsrMes : 0)) / 30) * diasAviso) : 0;
  if (valorAviso) {
    periodo.push({
      chave: 'reflexo_aviso',
      label: 'Reflexo no aviso prévio indenizado',
      detalhe: `${diasAviso} dias sobre a média mensal`,
      valor: valorAviso,
    });
  }

  const totalPeriodo = arredondar(periodo.reduce((s, p) => s + p.valor, 0));

  /* --- FGTS --- */
  const baseFgts = dados.reflexoFGTS !== false
    ? arredondar((horasExtrasMes + (querDSR ? dsrMes : 0) + reflexo13) * meses + valorAviso)
    : 0;
  const fgtsDevido = arredondar(baseFgts * FGTS.aliquotaDeposito);
  const multaFgts = dados.multaFGTS ? arredondar(fgtsDevido * FGTS.multaSemJustaCausa) : 0;

  return {
    erros: [],
    alertas,
    impedimento: null,
    contexto: {
      meses,
      mesesFracionados,
      diasPeriodo,
      divisor,
      baseCalculo,
      risco,
      valorHora: arredondar(valorHora),
      valorHoraExtra: arredondar(valorHoraExtra),
      percentualAdicional,
      horasMes: arredondar(horasMes),
      inicio,
      fim,
    },
    mensais,
    periodo,
    fgts: { base: baseFgts, valor: fgtsDevido, multa: multaFgts },
    totais: {
      mensal: totalMensal,
      periodo: totalPeriodo,
      fgts: arredondar(fgtsDevido + multaFgts),
      geral: arredondar(totalPeriodo + fgtsDevido + multaFgts),
    },
  };
}
