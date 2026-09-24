/**
 * Peças comuns aos cálculos de pedidos: prescrição, contagem do período,
 * salário-hora, adicionais de risco e o fechamento do resultado com reflexos.
 *
 * Cada pedido monta as suas verbas mensais e chama `fecharResultado`, que
 * cuida do que se repete: multiplicar pelo período, aplicar FGTS e multa,
 * somar o aviso prévio e totalizar.
 */

import { FGTS, SALARIO_MINIMO } from '../tabelas.js';
import { parseData, formatarData, diasEntre } from '../calculo.js';
import { formatarNumeroBR } from '../formato.js';
import { apurarBienal, marcoQuinquenal, descreverPrescricao } from '../prescricao.js';

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
 * Prescrição trabalhista (art. 7º, XXIX, da CF), nos dois prazos que a norma
 * reúne e que a Súmula 308 do TST harmoniza — as regras em si moram em
 * `prescricao.js`, comum às duas telas:
 *
 *  - **bienal**: extinto o contrato, a ação tem de ser ajuizada em dois anos,
 *    contados do fim do aviso, inclusive o projetado (OJ 83 da SDI-1).
 *    Perdido esse prazo, nada resta a calcular, nem o quinquênio;
 *  - **quinquenal**: respeitado o biênio, são exigíveis as parcelas dos cinco
 *    anos imediatamente anteriores ao ajuizamento (Súmula 308, I).
 *
 * Sem a data do ajuizamento não há o que afirmar, mas a situação é dita na
 * tela — e, se o biênio já passou em relação a hoje, vira aviso.
 *
 * Roda **antes** de qualquer validação de valor: prescrição é fato
 * impeditivo, e as datas bastam para apurá-la. Pedir o salário de um período
 * prescrito seria pedir um dado que não serve para nada. Por isso aceita
 * período incompleto — o biênio nem depende dele.
 *
 * @param {Date} inicio início do período pedido
 * @param {Date} fim fim do período pedido
 * @param {object} dados campos da tela (dataAjuizamento, dataExtincao, dataReferencia)
 * @returns {{impedimento: object|null, recorte: object|null, inicioCalculo: Date,
 *   descricao: string, alerta: string|null}}
 */
export function apurarPrescricao(inicio, fim, dados = {}) {
  const ajuizamento = parseData(dados.dataAjuizamento);
  const bienal = apurarBienal(parseData(dados.dataExtincao), ajuizamento, dados.dataReferencia);
  const marco = ajuizamento ? marcoQuinquenal(ajuizamento) : null;
  const descricao = descreverPrescricao({ ajuizamento, limite: bienal.limite, marco });
  const base = { descricao, alerta: bienal.alerta, impedimento: null, recorte: null, inicioCalculo: inicio };

  if (bienal.impedimento) return { ...base, impedimento: bienal.impedimento };
  if (!ajuizamento) return base;

  // O quinquênio precisa de um período inteiro e em ordem: com o fim antes do
  // início (erro de digitação), acusar "tudo prescrito" seria enganar.
  if (!inicio || !fim || fim < inicio) return base;

  if (fim < marco) {
    return {
      ...base,
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
      ...base,
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

  return base;
}

/**
 * Avisos de coerência entre as datas informadas. Não barram o cálculo: são
 * combinações possíveis, mas que quase sempre denunciam erro de digitação.
 */
export function conferirDatas(inicio, fim, dados = {}) {
  const avisos = [];
  const ajuizamento = parseData(dados.dataAjuizamento);
  const extincao = parseData(dados.dataExtincao);

  if (ajuizamento && fim > ajuizamento) {
    avisos.push(
      `O período pedido vai até ${formatarData(fim)}, depois do ajuizamento em `
        + `${formatarData(ajuizamento)}. Parcelas posteriores à inicial só entram por aditamento ou `
        + 'como pedido de trato sucessivo — confira as datas.',
    );
  }
  if (extincao && fim > extincao) {
    avisos.push(
      `O contrato foi extinto em ${formatarData(extincao)} e o período pedido vai até `
        + `${formatarData(fim)}. Não há parcela devida depois do fim do contrato.`,
    );
  }
  if (extincao && inicio > extincao) {
    avisos.push(
      `O período pedido começa em ${formatarData(inicio)}, depois da extinção do contrato em `
        + `${formatarData(extincao)}. Confira as datas.`,
    );
  }
  return avisos;
}

/**
 * Quantos meses o período vale, para multiplicar uma verba mensal.
 *
 * Conta competência a competência: mês inteiro vale 1, mês partido vale a
 * fração dos seus próprios dias. Um período de 01/01 a 31/12 dá 12 exatos;
 * 20/01 a 10/03 dá 1,71, e não 1.
 *
 * A regra dos 15 dias não serve aqui: ela conta *avos* de 13º e de férias, que
 * são direitos adquiridos por mês de serviço. Uma verba que se repete todo mês
 * — hora extra, adicional, intervalo — é devida na proporção do tempo, sob
 * pena de pagar mês cheio por quinze dias ou de engolir cinquenta dias como se
 * fossem trinta.
 */
export function contarPeriodo(inicio, fim) {
  const diasPeriodo = diasEntre(inicio, fim);

  let proporcao = 0;
  let cursor = new Date(Date.UTC(inicio.getUTCFullYear(), inicio.getUTCMonth(), 1));
  while (cursor <= fim) {
    const primeiroDoMes = cursor;
    const ultimoDoMes = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0));
    const de = inicio > primeiroDoMes ? inicio : primeiroDoMes;
    const ate = fim < ultimoDoMes ? fim : ultimoDoMes;
    proporcao += diasEntre(de, ate) / ultimoDoMes.getUTCDate();
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
  }

  const meses = Math.round(proporcao * 100) / 100;
  return { diasPeriodo, meses, mesesFracionados: !Number.isInteger(meses) };
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
  prescricao = null, baseAviso = 0, chavesFgts = [],
}) {
  const recorte = prescricao?.recorte ?? null;
  if (prescricao?.alerta) alertas = [prescricao.alerta, ...alertas];
  const totalMensal = arredondar(mensais.reduce((soma, m) => soma + m.valor, 0));
  // Uma verba pode trazer o seu total do período já apurado (`valorPeriodo`),
  // quando o período tem trechos com regras diferentes — o DSR majorado antes
  // e depois de 20/03/2023, por exemplo. As demais são o mensal vezes os meses.
  const periodo = mensais.map((m) => ({ ...m, valor: m.valorPeriodo ?? arredondar(m.valor * meses) }));

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
  // apurou — nunca todas: as parcelas indenizatórias ficam de fora. Cada
  // pedido diz quais entram pela chave da verba.
  //
  // As férias são o ponto que depende do caso: gozadas no curso do contrato,
  // elas e o terço integram a base (art. 15 da Lei 8.036/90, sem exclusão
  // legal); indenizadas, não. Só quem calcula sabe qual foi, então a escolha
  // fica na tela — ligada por padrão, que é o que acontece num período dentro
  // do contrato.
  const chaves = chavesFgts.length && dados.fgtsSobreFerias !== false
    ? [...chavesFgts, 'reflexo_ferias']
    : chavesFgts;
  //
  // Uma verba também pode dizer quanto dela entra no FGTS (`fgtsPeriodo`): o
  // DSR majorado, antes de 20/03/2023, é pago mas não recolhe (OJ 394).
  const parcelasFgts = mensais.filter((m) => chaves.includes(m.chave));
  const ajustada = (m) => m.fgtsPeriodo !== undefined || m.valorPeriodo !== undefined;
  const mensalSemAjuste = arredondar(parcelasFgts.filter((m) => !ajustada(m)).reduce((soma, m) => soma + m.valor, 0));
  const periodoAjustado = parcelasFgts.filter(ajustada).reduce((soma, m) => soma + (m.fgtsPeriodo ?? m.valorPeriodo), 0);
  const basePeriodo = arredondar(arredondar(mensalSemAjuste * meses) + periodoAjustado);
  const querFgts = dados.reflexoFGTS !== false && basePeriodo > 0;
  const base = querFgts ? arredondar(basePeriodo + valorAviso) : 0;
  const fgtsDevido = arredondar(base * FGTS.aliquotaDeposito);
  const multaFgts = dados.multaFGTS ? arredondar(fgtsDevido * FGTS.multaSemJustaCausa) : 0;
  const nomes = parcelasFgts
    .filter((m) => (m.fgtsPeriodo ?? 1) > 0)
    .map((m) => m.nomeCurto ?? m.label.toLowerCase());
  if (valorAviso > 0) nomes.push('aviso prévio');
  const detalheFgts = querFgts ? `${porcentagem(FGTS.aliquotaDeposito)} sobre ${listar(nomes)}` : null;

  return {
    erros: [],
    alertas,
    impedimento: null,
    recorte,
    contexto: { ...contexto, meses, mesesFracionados, diasPeriodo, prescricao: prescricao?.descricao },
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

/**
 * Resultado vazio, com os erros de preenchimento.
 *
 * Recebe a prescrição já apurada, quando houver: o recorte do quinquênio e o
 * aviso de biênio vencido valem desde que as datas foram digitadas, antes de
 * o resto do formulário estar pronto.
 */
export const resultadoComErros = (erros, prescricao = null) => ({
  erros,
  alertas: prescricao?.alerta ? [prescricao.alerta] : [],
  impedimento: null,
  recorte: prescricao?.recorte ?? null,
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
