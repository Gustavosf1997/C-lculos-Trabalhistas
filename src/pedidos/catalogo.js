/**
 * Catálogo dos pedidos: o que cada um calcula e quais campos pede.
 *
 * A tela é montada a partir daqui — acrescentar um pedido é acrescentar uma
 * entrada com os seus grupos de campos e a função que faz a conta.
 *
 * Cada campo declara:
 *   id, rotulo, tipo ('data'|'moeda'|'decimal'|'inteiro'|'percentual'|
 *   'select'|'checkbox'|'radios'), e opcionalmente dica, valor inicial,
 *   limites (min/max), opcoes e `aparece` — condição para ser exibido.
 */

import { calcularHorasExtras } from './horas-extras.js';
import { calcularAdicionalNoturno } from './noturno.js';
import { calcularIntervalo } from './intervalo.js';
import { calcularAdicionalRiscoPedido } from './insalubridade.js';
import { calcularMultas } from './multas.js';
import { DIVISOR_PADRAO } from './comum.js';
import { moeda, formatarQuantidade } from '../formato.js';
import { formatarData } from '../calculo.js';

/** Linhas do resumo comuns aos pedidos apurados por período. */
const resumoDoPeriodo = (c) => [
  ['Período calculado', `${formatarData(c.inicio)} a ${formatarData(c.fim)}`],
  ['Meses no período', c.mesesFracionados ? `${formatarQuantidade(c.meses)} (${c.diasPeriodo} dias)` : String(c.meses)],
];

/** Jornadas usuais e o divisor mensal correspondente (Súmula 431 do TST). */
export const JORNADAS = [
  { valor: '44', divisor: 220, label: '44h semanais — divisor 220' },
  { valor: '40', divisor: 200, label: '40h semanais — divisor 200' },
  { valor: '36', divisor: 180, label: '36h semanais — divisor 180' },
  { valor: '30', divisor: 150, label: '30h semanais — divisor 150' },
  { valor: '20', divisor: 100, label: '20h semanais — divisor 100' },
  { valor: 'outra', divisor: null, label: 'Outra (informar o divisor)' },
];

const grupoPeriodo = {
  titulo: 'Período pedido',
  campos: [
    { id: 'dataInicio', rotulo: 'Início do período', tipo: 'data', obrigatorio: true,
      dica: 'Primeiro mês do pedido.' },
    { id: 'dataFim', rotulo: 'Fim do período', tipo: 'data', obrigatorio: true },
    { id: 'dataAjuizamento', rotulo: 'Data do ajuizamento', tipo: 'data',
      dica: 'Usada para apurar a prescrição quinquenal.' },
  ],
};

const camposRemuneracao = [
  { id: 'salarioBase', rotulo: 'Salário base mensal', tipo: 'moeda', obrigatorio: true },
  { id: 'jornada', rotulo: 'Jornada contratada', tipo: 'select', valor: '44',
    opcoes: JORNADAS.map((j) => ({ valor: j.valor, label: j.label })),
    dica: 'Define o divisor mensal (Súmula 431 do TST).' },
  { id: 'divisor', rotulo: 'Divisor', tipo: 'inteiro', obrigatorio: true, valor: DIVISOR_PADRAO,
    min: 1, max: 999, dica: 'Editável: categorias como a bancária usam 150 ou 180.' },
  { id: 'outrasParcelas', rotulo: 'Outras parcelas salariais habituais', tipo: 'moeda',
    dica: 'Comissões, prêmios e adicionais que integram a hora (Súmula 264 do TST).' },
];

const camposRisco = [
  { id: 'risco', rotulo: 'O trabalho era insalubre ou perigoso?', tipo: 'radios', valor: 'nenhum', largo: true,
    opcoes: [
      { valor: 'nenhum', label: 'Nenhum' },
      { valor: 'insalubridade', label: 'Insalubridade' },
      { valor: 'periculosidade', label: 'Periculosidade' },
    ],
    dica: 'Não se acumulam (art. 193, §2º, da CLT). O adicional integra a base de cálculo (Súmulas 132 e 264 do TST).' },
  { id: 'grauInsalubridade', rotulo: 'Grau', tipo: 'select', valor: '20',
    aparece: (d) => d.risco === 'insalubridade',
    opcoes: [
      { valor: '10', label: 'Mínimo — 10%' },
      { valor: '20', label: 'Médio — 20%' },
      { valor: '40', label: 'Máximo — 40%' },
    ] },
  { id: 'baseInsalubridade', rotulo: 'Base de cálculo', tipo: 'select', valor: 'salario_minimo',
    aparece: (d) => d.risco === 'insalubridade',
    opcoes: [
      { valor: 'salario_minimo', label: 'Salário mínimo (art. 192 da CLT)' },
      { valor: 'salario_base', label: 'Salário base' },
      { valor: 'valor_informado', label: 'Valor informado' },
    ],
    dica: 'A Súmula 228 do TST está suspensa; a norma coletiva pode fixar base maior.' },
  { id: 'baseInsalubridadeValor', rotulo: 'Base informada', tipo: 'moeda',
    aparece: (d) => d.risco === 'insalubridade' && d.baseInsalubridade === 'valor_informado' },
];

const camposDSR = [
  { id: 'diasUteis', rotulo: 'Dias úteis no mês', tipo: 'inteiro', valor: 25, min: 1, max: 31 },
  { id: 'diasRepouso', rotulo: 'Repousos no mês', tipo: 'inteiro', valor: 5, min: 0, max: 15,
    dica: 'Domingos e feriados, para o DSR.' },
];

const reflexo = (id, label, marcado = true, extra = {}) =>
  ({ id, rotulo: label, tipo: 'checkbox', valor: marcado, largo: true, ...extra });

const grupoReflexos = (opcoes = {}) => ({
  titulo: 'Reflexos',
  campos: [
    ...(opcoes.dsr === false ? [] : [
      reflexo('reflexoDSR', 'DSR sobre a verba (Lei 605/49, Súmula 172 do TST)'),
      reflexo('dsrNosReflexos', 'DSR majorado repercute nas demais verbas (OJ 394, II, da SDI-1 — a partir de 20/03/2023)',
        true, { aparece: (d) => d.reflexoDSR !== false }),
    ]),
    reflexo('reflexo13', '13º salário'),
    reflexo('reflexoFerias', 'Férias + 1/3'),
    reflexo('reflexoFGTS', 'FGTS (8%)'),
    reflexo('multaFGTS', 'Multa de 40% do FGTS (dispensa sem justa causa)', false),
    reflexo('reflexoAviso', 'Aviso prévio indenizado', false),
    { id: 'diasAviso', rotulo: 'Dias de aviso prévio', tipo: 'inteiro', valor: 30, min: 0, max: 90,
      aparece: (d) => d.reflexoAviso },
  ],
});

export const PEDIDOS = [
  {
    id: 'horas_extras',
    nome: 'Horas extras',
    tag: 'Art. 7º, XVI, da CF',
    icone: '⏱️',
    descricao: 'Horas além da jornada, calculadas sobre a hora normal do divisor contratado e acrescidas do adicional.',
    itens: [
      { label: 'Base com insalubridade ou periculosidade', devida: true },
      { label: 'DSR sobre as horas extras', devida: true },
      { label: 'Reflexos em 13º, férias + 1/3 e FGTS', devida: true },
      { label: 'Juros e correção monetária', devida: false },
    ],
    calcular: calcularHorasExtras,
    resumo: (c) => [
      ...resumoDoPeriodo(c),
      ['Base de cálculo', moeda.format(c.baseCalculo)],
      ['Divisor', String(c.divisor)],
      ['Valor da hora', moeda.format(c.valorHora)],
      [`Hora extra (+${formatarQuantidade(c.percentualAdicional)}%)`, moeda.format(c.valorHoraExtra)],
      ['Horas por mês', formatarQuantidade(c.horasMes)],
    ],
    grupos: [
      grupoPeriodo,
      { titulo: 'Remuneração e jornada', campos: camposRemuneracao },
      { titulo: 'Adicional de insalubridade ou periculosidade', campos: camposRisco },
      {
        titulo: 'Horas extras',
        campos: [
          { id: 'modoQuantidade', rotulo: 'Como informar a quantidade', tipo: 'radios', valor: 'mes', largo: true,
            opcoes: [
              { valor: 'mes', label: 'Horas por mês' },
              { valor: 'semana', label: 'Horas por semana' },
            ] },
          { id: 'quantidadeHoras', rotulo: 'Quantidade de horas extras', tipo: 'decimal', obrigatorio: true,
            min: 0, max: 400, dica: 'Média do período.' },
          { id: 'adicionalHoraExtra', rotulo: 'Adicional de hora extra', tipo: 'percentual', valor: 50,
            min: 0, max: 300, dica: 'Mínimo de 50% (art. 7º, XVI, da CF); a norma coletiva pode ser maior.' },
          ...camposDSR,
        ],
      },
      grupoReflexos(),
    ],
  },

  {
    id: 'adicional_noturno',
    nome: 'Adicional noturno',
    tag: 'Art. 73 da CLT',
    icone: '🌙',
    descricao: 'Trabalho entre 22h e 5h: adicional sobre a hora normal, com a hora noturna reduzida de 52min30s.',
    itens: [
      { label: 'Hora noturna reduzida (art. 73, §1º)', devida: true },
      { label: 'DSR sobre o adicional', devida: true },
      { label: 'Reflexos em 13º, férias + 1/3 e FGTS', devida: true },
      { label: 'Prorrogação após as 5h (Súmula 60, II)', devida: false, nota: 'informe as horas já somadas' },
    ],
    calcular: calcularAdicionalNoturno,
    resumo: (c) => [
      ...resumoDoPeriodo(c),
      ['Base de cálculo', moeda.format(c.baseCalculo)],
      ['Valor da hora', moeda.format(c.valorHora)],
      ['Horas de relógio', formatarQuantidade(c.horasRelogio)],
      [c.horaReduzida ? 'Horas fictas (52min30s)' : 'Horas consideradas', formatarQuantidade(c.horasFictas)],
    ],
    grupos: [
      grupoPeriodo,
      { titulo: 'Remuneração e jornada', campos: camposRemuneracao },
      {
        titulo: 'Horas noturnas',
        campos: [
          { id: 'modoQuantidade', rotulo: 'Como informar a quantidade', tipo: 'radios', valor: 'mes', largo: true,
            opcoes: [
              { valor: 'mes', label: 'Horas por mês' },
              { valor: 'semana', label: 'Horas por semana' },
            ] },
          { id: 'horasNoturnas', rotulo: 'Horas noturnas trabalhadas', tipo: 'decimal', obrigatorio: true,
            min: 0, max: 400, dica: 'Horas de relógio entre 22h e 5h.' },
          { id: 'adicionalNoturno', rotulo: 'Adicional noturno', tipo: 'percentual', valor: 20, min: 0, max: 200,
            dica: '20% no trabalho urbano (art. 73); 25% no rural (Lei 5.889/73).' },
          { id: 'horaReduzida', rotulo: 'Aplicar a hora noturna reduzida de 52min30s (art. 73, §1º)',
            tipo: 'checkbox', valor: true, largo: true },
          ...camposDSR,
        ],
      },
      grupoReflexos(),
    ],
  },

  {
    id: 'intervalo',
    nome: 'Intervalo intrajornada',
    tag: 'Art. 71, §4º, da CLT',
    icone: '🍽️',
    descricao: 'Intervalo não concedido ou reduzido, pago com acréscimo de 50% sobre a hora normal.',
    itens: [
      { label: 'Período suprimido + 50% (a partir de 11/11/2017)', devida: true },
      { label: 'Intervalo integral e reflexos (até 10/11/2017)', devida: true, nota: 'Súmula 437 do TST' },
      { label: 'Reflexos no regime indenizatório', devida: false, nota: 'art. 71, §4º' },
    ],
    calcular: calcularIntervalo,
    resumo: (c) => [
      ...resumoDoPeriodo(c),
      ['Regime', c.indenizatorio ? 'Indenizatório (art. 71, §4º)' : 'Salarial (Súmula 437)'],
      ['Base de cálculo', moeda.format(c.baseCalculo)],
      ['Valor da hora', moeda.format(c.valorHora)],
      ['Minutos por dia', `${formatarQuantidade(c.minutosDevidos)} min x ${c.diasNoMes} dias`],
    ],
    grupos: [
      grupoPeriodo,
      { titulo: 'Remuneração e jornada', campos: camposRemuneracao },
      { titulo: 'Adicional de insalubridade ou periculosidade', campos: camposRisco },
      {
        titulo: 'Intervalo',
        campos: [
          { id: 'regimeIntervalo', rotulo: 'Regime aplicável', tipo: 'radios', valor: 'reforma', largo: true,
            opcoes: [
              { valor: 'reforma', label: 'A partir de 11/11/2017 — só o suprimido, indenizatório' },
              { valor: 'anterior_reforma', label: 'Até 10/11/2017 — intervalo integral, salarial' },
            ],
            dica: 'A Lei 13.467/2017 limitou o pagamento ao período suprimido e lhe deu natureza indenizatória, sem reflexos.' },
          { id: 'minutosSuprimidos', rotulo: 'Minutos suprimidos por dia', tipo: 'inteiro', obrigatorio: true,
            min: 1, max: 120, dica: 'Quanto do intervalo deixou de ser usufruído.' },
          { id: 'intervaloIntegral', rotulo: 'Intervalo integral do contrato (minutos)', tipo: 'inteiro',
            valor: 60, min: 1, max: 240, aparece: (d) => d.regimeIntervalo === 'anterior_reforma',
            dica: 'Pago por inteiro no regime da Súmula 437, ainda que a supressão seja parcial.' },
          { id: 'diasComSupressao', rotulo: 'Dias com supressão no mês', tipo: 'inteiro', valor: 22, min: 1, max: 31 },
          { id: 'adicionalIntervalo', rotulo: 'Acréscimo', tipo: 'percentual', valor: 50, min: 0, max: 200,
            dica: '50% sobre a hora normal (art. 71, §4º).' },
        ],
      },
      {
        ...grupoReflexos({ dsr: false }),
        aparece: (d) => d.regimeIntervalo === 'anterior_reforma',
      },
    ],
  },

  {
    id: 'adicional_risco',
    nome: 'Insalubridade / periculosidade',
    tag: 'Arts. 192 e 193 da CLT',
    icone: '☣️',
    descricao: 'Adicional de risco pedido como verba própria, com reflexos nas demais parcelas.',
    itens: [
      { label: 'Insalubridade de 10%, 20% ou 40%', devida: true },
      { label: 'Periculosidade de 30%', devida: true },
      { label: 'Reflexos em 13º, férias + 1/3 e FGTS', devida: true },
      { label: 'DSR', devida: false, nota: 'parcela mensal fixa' },
    ],
    calcular: calcularAdicionalRiscoPedido,
    resumo: (c) => [
      ...resumoDoPeriodo(c),
      ['Adicional', c.risco.nome],
      ['Valor mensal', moeda.format(c.valorMensal)],
    ],
    grupos: [
      grupoPeriodo,
      {
        titulo: 'Remuneração',
        campos: [{ id: 'salarioBase', rotulo: 'Salário base mensal', tipo: 'moeda', obrigatorio: true,
          dica: 'Base da periculosidade (art. 193, §1º).' }],
      },
      { titulo: 'Adicional pedido', campos: camposRisco },
      grupoReflexos({ dsr: false }),
    ],
  },

  {
    id: 'multas',
    nome: 'Multas dos arts. 467 e 477',
    tag: 'Atraso e verbas incontroversas',
    icone: '📌',
    descricao: 'Multa pelo pagamento das verbas rescisórias fora do prazo e acréscimo sobre as incontroversas.',
    itens: [
      { label: 'Art. 477: um salário, se paga fora dos 10 dias', devida: true },
      { label: 'Art. 467: 50% sobre as verbas incontroversas', devida: true },
      { label: 'Reflexos e FGTS', devida: false, nota: 'natureza de penalidade' },
    ],
    calcular: calcularMultas,
    semPeriodo: true,
    resumo: (c) => [
      ...(c.rescisao ? [['Término do contrato', formatarData(c.rescisao)]] : []),
      ...(c.prazo ? [['Prazo do art. 477', formatarData(c.prazo)]] : []),
      ...(c.pagamento ? [['Pagamento', formatarData(c.pagamento)]] : []),
      ...(c.prazo ? [['Atraso', c.pagamento ? `${c.diasAtraso} dia(s)` : 'sem pagamento']] : []),
      ...(c.incontroverso ? [['Incontroverso', moeda.format(c.incontroverso)]] : []),
    ],
    grupos: [
      {
        titulo: 'Multa do art. 477',
        campos: [
          { id: 'multa477', rotulo: 'Pedir a multa do art. 477, §8º', tipo: 'checkbox', valor: true, largo: true },
          { id: 'salarioBase', rotulo: 'Salário do empregado', tipo: 'moeda', obrigatorio: true,
            aparece: (d) => d.multa477,
            dica: 'A multa equivale a um salário. Há TRTs que adotam a remuneração integral.' },
          { id: 'dataRescisao', rotulo: 'Término do contrato', tipo: 'data', obrigatorio: true,
            aparece: (d) => d.multa477, dica: 'O prazo de 10 dias corre daí (art. 477, §6º).' },
          { id: 'dataPagamento', rotulo: 'Data do pagamento', tipo: 'data',
            aparece: (d) => d.multa477, dica: 'Em branco: não houve pagamento comprovado.' },
          { id: 'moraDoEmpregado', rotulo: 'O empregado deu causa à mora (afasta a multa)',
            tipo: 'checkbox', valor: false, largo: true, aparece: (d) => d.multa477 },
        ],
      },
      {
        titulo: 'Multa do art. 467',
        campos: [
          { id: 'multa467', rotulo: 'Pedir a multa do art. 467', tipo: 'checkbox', valor: false, largo: true },
          { id: 'valorIncontroverso', rotulo: 'Verbas rescisórias incontroversas', tipo: 'moeda',
            obrigatorio: true, aparece: (d) => d.multa467,
            dica: 'Parcela reconhecida e não paga até a primeira audiência.' },
        ],
      },
    ],
  },
];

export const pedidoPorId = (id) => PEDIDOS.find((p) => p.id === id) ?? null;
