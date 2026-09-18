/**
 * Peças comuns aos cálculos de pedidos: prescrição, contagem do período,
 * salário-hora, adicionais de risco e o fechamento do resultado com reflexos.
 *
 * Cada pedido monta as suas verbas mensais e chama `fecharResultado`, que
 * cuida do que se repete: multiplicar pelo período, aplicar FGTS e multa,
 * somar o aviso prévio e totalizar.
 */

import { FGTS, SALARIO_MINIMO } from '../tabelas.js';
import { parseData, formatarData, contarMeses, diasEntre } from '../calculo.js';
import { formatarNumeroBR } from '../formato.js';

/** Divisor mensal padrão (44h semanais). */
export const DIVISOR_PADRAO = 220;

/** 52 semanas / 12 meses. */
export const SEMANAS_POR_MES = 52 / 12;

/** Marco da nova redação da OJ 394 da SDI-1 (Tema 9 de repetitivos). */
export const MARCO_OJ_394 = '2023-03-20';

/** Reforma Trabalhista: divide os regimes do intervalo intrajornada. */
export const MARCO_REFORMA = '2017-11-11';

/** Último dia do regime anterior à Lei 13.467/2017, para os avisos de tela. */
export const VESPERA_REFORMA = '2017-11-10';

/** Hora noturna reduzida: 52min30s (art. 73, §1º, da CLT). */
export const FATOR_HORA_NOTURNA = 60 / 52.5;

export const arredondar = (valor) => Math.round((valor + Number.EPSILON) * 100) / 100;
export const num = (valor) => (Number.isFinite(Number(valor)) ? Number(valor) : 0);

/** Hora normal: base mensal dividida pelo divisor da jornada (art. 64 da CLT). */
export const valorHoraNormal = (baseMensal, divisor) =>
  !divisor || divisor <= 0 ? 0 : baseMensal / divisor;

/**
 * Adicional de risco que integra a base de cálculo. Insalubridade e
 * periculosidade não se acumulam (art. 193, §2º, da CLT).
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
 * Prescrição quinquenal (art. 7º, XXIX, da CF).
 *
 * @returns {{impedimento: object|null, recorte: object|null, inicioCalculo: Date}}
 */
export function apurarPrescricao(inicio, fim, dataAjuizamento) {
  const ajuizamento = parseData(dataAjuizamento);
  if (!ajuizamento) return { impedimento: null, recorte: null, inicioCalculo: inicio };

  const marco = new Date(
    Date.UTC(ajuizamento.getUTCFullYear() - 5, ajuizamento.getUTCMonth(), ajuizamento.getUTCDate()),
  );

  if (fim < marco) {
    return {
      inicioCalculo: inicio,
      recorte: null,
      impedimento: {
        integral: true,
        marco,
        titulo: 'Pedido integralmente prescrito',
        mensagem: `Todo o período pedido é anterior a ${formatarData(marco)}, marco da prescrição `
          + `quinquenal contado do ajuizamento em ${formatarData(ajuizamento)}. Não há parcela exigível a calcular.`,
      },
    };
  }

  if (inicio < marco) {
    return {
      impedimento: null,
      inicioCalculo: marco,
      recorte: {
        marco,
        inicioPedido: inicio,
        titulo: 'Parte do período está prescrita',
        mensagem: `As parcelas anteriores a ${formatarData(marco)} estão prescritas, contadas do `
          + `ajuizamento em ${formatarData(ajuizamento)}. O cálculo abaixo considera apenas o período `
          + `imprescrito, de ${formatarData(marco)} a ${formatarData(fim)}.`,
      },
    };
  }

  return { impedimento: null, recorte: null, inicioCalculo: inicio };
}

/** Meses de competência do período; período curto vira fração de mês. */
export function contarPeriodo(inicio, fim) {
  const diasPeriodo = diasEntre(inicio, fim);
  const mesesInteiros = contarMeses(inicio, fim);
  return {
    diasPeriodo,
    mesesInteiros,
    meses: mesesInteiros > 0 ? mesesInteiros : Math.round((diasPeriodo / 30) * 100) / 100,
    mesesFracionados: mesesInteiros === 0,
  };
}

/** Enumera em português: "a", "a e b", "a, b e c". */
function listar(nomes) {
  if (nomes.length <= 1) return nomes[0] ?? '';
  return `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`;
}

/** Alíquota em porcentagem, sem casas desnecessárias: 0,08 -> "8%". */
function porcentagem(fracao) {
  return `${formatarNumeroBR(fracao * 100, 0)}%`;
}

/** Reflexos mensais em 13º e férias sobre uma verba de natureza salarial. */
export function reflexosMensais(base, dados) {
  const itens = [];
  if (base <= 0) return itens;

  if (dados.reflexo13 !== false) {
    itens.push({
      chave: 'reflexo_13',
      label: 'Reflexo no 13º salário',
      nomeCurto: '13º',
      detalhe: '1/12 por mês',
      valor: arredondar(base / 12),
    });
  }
  if (dados.reflexoFerias !== false) {
    itens.push({
      chave: 'reflexo_ferias',
      label: 'Reflexo em férias + 1/3',
      nomeCurto: 'férias + 1/3',
      detalhe: '1/12 por mês, acrescido do terço',
      valor: arredondar((base / 12) * (4 / 3)),
    });
  }
  return itens;
}

/**
 * Fecha o resultado: multiplica as verbas mensais pelo período, acrescenta o
 * reflexo no aviso prévio e o FGTS, e totaliza.
 *
 * @param {object} p
 * @param {object[]} p.mensais verbas apuradas por mês
 * @param {number} p.baseAviso base mensal do reflexo no aviso (0 desliga)
 * @param {string[]} p.chavesFgts verbas mensais que compõem a base do FGTS
 */
export function fecharResultado({
  mensais, meses, mesesFracionados, diasPeriodo, contexto, dados, alertas = [],
  recorte = null, baseAviso = 0, chavesFgts = [],
}) {
  const totalMensal = arredondar(mensais.reduce((soma, m) => soma + m.valor, 0));
  const periodo = mensais.map((m) => ({ ...m, valor: arredondar(m.valor * meses) }));

  const diasAviso = dados.reflexoAviso && baseAviso > 0 ? num(dados.diasAviso) || 30 : 0;
  const valorAviso = diasAviso ? arredondar((baseAviso / 30) * diasAviso) : 0;
  if (valorAviso > 0) {
    periodo.push({
      chave: 'reflexo_aviso',
      label: 'Reflexo no aviso prévio indenizado',
      nomeCurto: 'aviso prévio',
      detalhe: `${diasAviso} dias sobre a média mensal`,
      valor: valorAviso,
    });
  }

  const totalPeriodo = arredondar(periodo.reduce((soma, p) => soma + p.valor, 0));

  // A base do FGTS é a soma das verbas de natureza salarial que o cálculo
  // apurou — nunca todas: férias indenizadas e parcelas indenizatórias ficam
  // de fora. Cada pedido diz quais entram pela chave da verba.
  const parcelasFgts = mensais.filter((m) => chavesFgts.includes(m.chave));
  const baseFgtsMes = arredondar(parcelasFgts.reduce((soma, m) => soma + m.valor, 0));
  const querFgts = dados.reflexoFGTS !== false && baseFgtsMes > 0;
  const base = querFgts ? arredondar(baseFgtsMes * meses + valorAviso) : 0;
  const fgtsDevido = arredondar(base * FGTS.aliquotaDeposito);
  const multaFgts = dados.multaFGTS ? arredondar(fgtsDevido * FGTS.multaSemJustaCausa) : 0;
  const nomes = parcelasFgts.map((m) => m.nomeCurto ?? m.label.toLowerCase());
  if (valorAviso > 0) nomes.push('aviso prévio');
  const detalheFgts = querFgts ? `${porcentagem(FGTS.aliquotaDeposito)} sobre ${listar(nomes)}` : null;

  return {
    erros: [],
    alertas,
    impedimento: null,
    recorte,
    contexto: { ...contexto, meses, mesesFracionados, diasPeriodo },
    mensais,
    periodo,
    fgts: { base, valor: fgtsDevido, multa: multaFgts, detalhe: detalheFgts },
    totais: {
      mensal: totalMensal,
      periodo: totalPeriodo,
      fgts: arredondar(fgtsDevido + multaFgts),
      geral: arredondar(totalPeriodo + fgtsDevido + multaFgts),
    },
  };
}

/** Resultado vazio, com os erros de preenchimento. */
export const resultadoComErros = (erros) => ({
  erros, alertas: [], impedimento: null, recorte: null,
  contexto: null, mensais: [], periodo: [], fgts: null, totais: null,
});

/** Resultado barrado pela prescrição integral. */
export const resultadoImpedido = (impedimento) => ({
  erros: [], alertas: [], impedimento, recorte: null,
  contexto: null, mensais: [], periodo: [], fgts: null, totais: null,
});

/** Validação comum a todo pedido com período. */
export function validarPeriodo(dados) {
  const erros = [];
  const inicio = parseData(dados.dataInicio);
  const fim = parseData(dados.dataFim);
  if (!inicio) erros.push('Informe o início do período pedido.');
  if (!fim) erros.push('Informe o fim do período pedido.');
  if (inicio && fim && fim < inicio) erros.push('O fim do período não pode ser anterior ao início.');
  return { erros, inicio, fim };
}
