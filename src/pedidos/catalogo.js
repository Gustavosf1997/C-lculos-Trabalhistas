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
import {
  calcularAcidente, TAXA_VALOR_PRESENTE, DESAGIO_PADRAO, IDADE_FINAL_PADRAO,
} from './acidente.js';
import {
  LESOES_DPVAT, GRUPOS_DPVAT, REPERCUSSOES, QUALIFICADORES_CIF, NATUREZAS_OFENSA, TETO_DPVAT, eLesaoTotal,
} from './tabelas-acidente.js';
import { TABUA_IBGE } from './tabua-ibge.js';
import { DIVISOR_PADRAO } from './comum.js';
import { moeda, formatarQuantidade } from '../formato.js';
import { formatarData } from '../calculo.js';

/** Linhas do resumo comuns aos pedidos apurados por período. */
const resumoDoPeriodo = (c) => [
  ['Período calculado', `${formatarData(c.inicio)} a ${formatarData(c.fim)}`],
  ['Meses no período', c.mesesFracionados ? `${formatarQuantidade(c.meses)} (${c.diasPeriodo} dias)` : String(c.meses)],
  ['Prescrição', c.prescricao],
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
      dica: 'Marco da prescrição quinquenal (Súmula 308, I, do TST).' },
    { id: 'dataExtincao', rotulo: 'Extinção do contrato', tipo: 'data',
      dica: 'Com a projeção do aviso indenizado, se houve: é dela que corre o biênio (OJ 83 da SDI-1). '
        + 'Ajuizamento mais de dois anos depois fulmina a pretensão inteira (art. 7º, XXIX, da CF).' },
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
  { id: 'diasUteis', rotulo: 'Dias úteis no mês', tipo: 'inteiro', valor: 25, min: 1, max: 31,
    dica: 'O sábado conta como dia útil não trabalhado (Súmula 113 do TST), salvo norma coletiva.' },
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
      // Sem sentido onde o período é todo anterior a 20/03/2023, como o
      // intervalo do regime antigo: lá o DSR majorado nunca repercute.
      ...(opcoes.dsrMajorado === false ? [] : [
        reflexo('dsrNosReflexos', 'DSR majorado repercute nas demais verbas (OJ 394, II, da SDI-1 — a partir de 20/03/2023)',
          true, { aparece: (d) => d.reflexoDSR !== false }),
      ]),
    ]),
    reflexo('reflexo13', '13º salário'),
    reflexo('reflexoFerias', 'Férias + 1/3'),
    reflexo('reflexoFGTS', 'FGTS (8%)'),
    reflexo('fgtsSobreFerias', 'FGTS também sobre o reflexo em férias + 1/3 (desmarque se forem indenizadas)',
      true, { aparece: (d) => d.reflexoFGTS !== false && d.reflexoFerias !== false }),
    reflexo('multaFGTS', 'Multa de 40% do FGTS (dispensa sem justa causa)', false),
    reflexo('reflexoAviso', 'Aviso prévio indenizado', false),
    { id: 'diasAviso', rotulo: 'Dias de aviso prévio', tipo: 'inteiro', valor: 30, min: 0, max: 90,
      aparece: (d) => d.reflexoAviso },
  ],
});

/* ------------------------------------------ indenização acidentária --- */

const opcoesDeLesao = (primeira) => [
  primeira,
  ...LESOES_DPVAT.map((l) => ({
    valor: l.id,
    label: `${l.nome} — ${l.percentual}%`,
    grupo: GRUPOS_DPVAT.find((g) => g.id === l.grupo).titulo,
  })),
];

const opcoesDeRepercussao = REPERCUSSOES.map((r) => ({ valor: r.valor, label: r.label }));

/** Campos de uma lesão da tabela; a repercussão some nos danos totais, que não se graduam. */
const camposDeLesao = (n, primeira, visivel) => [
  { id: `lesao${n}`, rotulo: n === 1 ? 'Lesão' : `${n}ª lesão`, tipo: 'select', largo: true,
    valor: primeira.valor, opcoes: opcoesDeLesao(primeira), aparece: visivel },
  { id: `grau${n}`, rotulo: 'Repercussão da perda', tipo: 'select', valor: 'completa', opcoes: opcoesDeRepercussao,
    aparece: (d) => visivel(d) && Boolean(d[`lesao${n}`]) && d[`lesao${n}`] !== 'nenhuma' && !eLesaoTotal(d[`lesao${n}`]),
    dica: 'Perda incompleta: o art. 3º, §1º, II, da Lei 6.194/74 reduz o percentual da tabela.' },
];

const peloDpvat = (d) => (d.criterio ?? 'dpvat') === 'dpvat';
const NENHUMA = { valor: 'nenhuma', label: 'Nenhuma' };

const resumoAcidente = (c) => {
  const p = c.pensao;
  const m = c.morais;
  const curto = (v) => Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  return [
    ...(c.perda ? [
      ['Critério da perda', c.perda.origem],
      ...c.perda.lesoes.map((l, i) => [c.perda.lesoes.length > 1 ? `${i + 1}ª lesão` : 'Lesão', `${l.nome}: ${l.conta}`]),
      ['Percentual da perda', `${curto(c.perda.percentual)}%`],
      ['Enquadramento na CIF', c.cif],
      ['Referência no DPVAT', `${moeda.format(c.referenciaDpvat)} (${curto(c.perda.percentual)}% do teto de ${moeda.format(TETO_DPVAT)})`],
    ] : []),
    ...(p ? [
      ['Remuneração da pensão', moeda.format(p.remuneracao)],
      ['Pensão mensal', `${moeda.format(p.mensal)} — ${curto(p.percentualPensao)}% da remuneração${
        p.acrescimos.length ? ` + ${p.acrescimos.join(' + ')}` : ''}`],
      ['Início da pensão', formatarData(p.inicio)],
      ...(p.idadeNaCiencia !== null ? [['Idade na ciência', `${p.idadeNaCiencia} anos`]] : []),
      ...(p.sobrevida !== null ? [['Expectativa de sobrevida', p.sobrevidaInformada
        ? `${curto(p.sobrevida)} anos, informada${p.tabua
          ? ` (a tábua do IBGE de ${p.tabua.ano} daria ${curto(p.tabua.anos)})` : ''}`
        : `${curto(p.sobrevida)} anos — tábua do IBGE de ${p.tabua.ano}, aos ${p.tabua.idade} anos`]] : []),
      ...(p.unica ? [['Termo final', `${formatarData(p.termo)}${p.idadeNoTermo !== null
        ? ` (aos ${curto(p.idadeNoTermo)} anos)` : ''}`]] : []),
      ...(p.duracaoProvavel ? [['Duração provável', `até ${formatarData(p.duracaoProvavel)} — sobrevida de `
        + `${curto(p.tabua.anos)} anos aos ${p.tabua.idade} (tábua do IBGE de ${p.tabua.ano})`]] : []),
      ...(p.corte ? [['Data do cálculo', formatarData(p.corte)]] : []),
      ['Parcelas', `${curto(p.mesesVencidos)} vencidas · ${curto(p.mesesVincendos)} vincendas${p.unica ? '' : ' (no valor do pedido)'}`],
      ...(p.unica && p.mesesVincendos > 0 ? [['Desconto da antecipação', `${curto(arredondarPct(p.desagioEfetivo))}% sobre ${
        moeda.format(p.nominalVincendas)}${p.porDesagio ? ' (deságio fixo)' : ' (valor presente)'}`]] : []),
    ] : []),
    ...(m ? [['Natureza da ofensa', `${m.natureza.nome} — até ${m.natureza.teto} salários${m.sugerida
      ? ' (sugerida pela CIF)' : ''}${m.peloTeto ? '; estimada pelo teto' : ''}`]] : []),
    ...(c.prescricao ? [['Prescrição', c.prescricao]] : []),
  ];
};

const arredondarPct = (v) => Math.round(v * 100) / 100;

const pedidoAcidente = {
  id: 'acidente',
  nome: 'Indenização acidentária',
  tag: 'Tabela DPVAT e CIF',
  icone: '🩺',
  descricao: 'Acidente do trabalho ou doença ocupacional: o percentual da perda sai da tabela DPVAT, do '
    + 'qualificador da CIF ou do laudo, e estima a pensão (art. 950 do CC) e os danos extrapatrimoniais '
    + '(art. 223-G da CLT).',
  itens: [
    { label: 'Pensão pela perda da capacidade, com 13º e terço', devida: true, nota: 'art. 950 do CC' },
    { label: 'Parcela única com desconto da antecipação', devida: true, nota: 'valor presente ou deságio' },
    { label: 'Danos morais e estéticos', devida: true, nota: 'art. 223-G da CLT; Súmula 387 do STJ' },
    { label: 'FGTS sobre a pensão', devida: false },
    { label: 'INSS e IRRF', devida: false, nota: 'art. 6º, IV, da Lei 7.713/88' },
    { label: 'Pensão aos dependentes, em caso de morte', devida: false, nota: 'art. 948 do CC — não calculada aqui' },
  ],
  calcular: calcularAcidente,
  semPeriodo: true,
  resumo: resumoAcidente,
  saidaDoImpedimento: 'Corrija a data da ciência, a do fim do contrato ou a do ajuizamento',
  observacao: 'Estimativa, sem juros e sem correção monetária. O percentual que vale é o fixado na perícia; '
    + 'a tabela DPVAT e a CIF servem de referência. As indenizações por acidente do trabalho são isentas de '
    + 'imposto de renda (art. 6º, IV, da Lei 7.713/88) e não sofrem contribuição previdenciária.',
  grupos: [
    {
      titulo: 'Acidente e prescrição',
      campos: [
        { id: 'dataCiencia', rotulo: 'Ciência inequívoca da incapacidade', tipo: 'data',
          dica: 'Em regra, a consolidação das lesões ou o laudo que a atesta. É o início da pensão e o marco da '
            + 'prescrição (Súmula 278 do STJ).' },
        { id: 'dataExtincao', rotulo: 'Extinção do contrato', tipo: 'data',
          dica: 'Com a projeção do aviso indenizado, se houve. Em branco, se o contrato continua.' },
        { id: 'dataAjuizamento', rotulo: 'Data do ajuizamento', tipo: 'data',
          dica: 'Cinco anos da ciência, até dois anos do fim do contrato (art. 7º, XXIX, da CF).' },
      ],
    },
    {
      titulo: 'Percentual da perda',
      campos: [
        { id: 'criterio', rotulo: 'Como medir a perda', tipo: 'radios', valor: 'dpvat', largo: true,
          opcoes: [
            { valor: 'dpvat', label: 'Pela tabela DPVAT (escolher a lesão)' },
            { valor: 'cif', label: 'Pelo qualificador da CIF' },
            { valor: 'laudo', label: 'Percentual do laudo' },
          ] },
        ...camposDeLesao(1, { valor: '', label: 'Escolha a lesão…' }, peloDpvat),
        { id: 'qualificadorCif', rotulo: 'Qualificador da CIF', tipo: 'select', valor: '2', largo: true,
          aparece: (d) => d.criterio === 'cif',
          opcoes: QUALIFICADORES_CIF.filter((q) => q.codigo > 0).map((q) => ({
            valor: String(q.codigo), label: `${q.codigo} — ${q.nome} (${q.de}% a ${q.ate}%)`,
          })),
          dica: 'Qualificador genérico da Classificação Internacional de Funcionalidade (OMS).' },
        { id: 'percentualCif', rotulo: 'Percentual dentro da faixa', tipo: 'percentual', min: 0, max: 100,
          aparece: (d) => d.criterio === 'cif',
          dica: 'Se o laudo fixou um número. Em branco: o meio da faixa.' },
        { id: 'percentualLaudo', rotulo: 'Percentual de perda', tipo: 'percentual', min: 0, max: 100,
          aparece: (d) => d.criterio === 'laudo', dica: 'Redução da capacidade de trabalho fixada pelo perito.' },
      ],
    },
    {
      titulo: 'Outras lesões do mesmo acidente',
      aparece: peloDpvat,
      campos: [
        ...camposDeLesao(2, NENHUMA, peloDpvat),
        ...camposDeLesao(3, NENHUMA, (d) => peloDpvat(d) && Boolean(d.lesao2) && d.lesao2 !== 'nenhuma'),
      ],
    },
    {
      titulo: 'Remuneração',
      campos: [
        { id: 'salarioBase', rotulo: 'Último salário contratual', tipo: 'moeda',
          dica: 'Base dos danos extrapatrimoniais (art. 223-G, §1º, da CLT).' },
        { id: 'outrasParcelas', rotulo: 'Parcelas salariais habituais', tipo: 'moeda',
          dica: 'Adicionais, horas extras e comissões: somadas ao salário, dão a remuneração da pensão.' },
      ],
    },
    {
      titulo: 'Danos materiais — pensão (art. 950 do CC)',
      campos: [
        { id: 'pedirPensao', rotulo: 'Pedir a pensão pela perda da capacidade de trabalho', tipo: 'checkbox',
          valor: true, largo: true },
        { id: 'incapacidadeTotalOficio', rotulo: 'Incapacidade total para o ofício que exercia (pensão integral)',
          tipo: 'checkbox', valor: false, largo: true, aparece: (d) => d.pedirPensao },
        { id: 'incluir13', rotulo: 'Incluir o 13º salário (1/12 por mês)', tipo: 'checkbox', valor: true, largo: true,
          aparece: (d) => d.pedirPensao },
        { id: 'incluirTerco', rotulo: 'Incluir o terço de férias (1/12 do terço por mês)', tipo: 'checkbox',
          valor: true, largo: true, aparece: (d) => d.pedirPensao },
        { id: 'formaPensao', rotulo: 'Forma de pagamento', tipo: 'radios', valor: 'unica', largo: true,
          aparece: (d) => d.pedirPensao,
          opcoes: [
            { valor: 'unica', label: 'Parcela única (art. 950, parágrafo único)' },
            { valor: 'mensal', label: 'Pensão mensal vitalícia' },
          ] },
        { id: 'dataCalculo', rotulo: 'Data do cálculo', tipo: 'data', aparece: (d) => d.pedirPensao,
          dica: 'Separa as parcelas vencidas das vincendas. Em branco: o ajuizamento ou, sem ele, hoje.' },
        { id: 'metodoDesconto', rotulo: 'Desconto da antecipação', tipo: 'radios', valor: 'valor_presente', largo: true,
          aparece: (d) => d.pedirPensao && d.formaPensao === 'unica',
          opcoes: [
            { valor: 'valor_presente', label: 'Valor presente (1ª Turma do TST)' },
            { valor: 'desagio', label: 'Deságio fixo (20% a 30%)' },
          ] },
        { id: 'taxaJuros', rotulo: 'Juros ao mês', tipo: 'percentual', valor: String(TAXA_VALOR_PRESENTE).replace('.', ','),
          min: 0, max: 5, aparece: (d) => d.pedirPensao && d.formaPensao === 'unica' && d.metodoDesconto !== 'desagio',
          dica: 'VP = P x [1 - (1 + i)^-n] / i, só sobre as parcelas vincendas.' },
        { id: 'desagio', rotulo: 'Deságio', tipo: 'percentual', valor: DESAGIO_PADRAO, min: 0, max: 60,
          aparece: (d) => d.pedirPensao && d.formaPensao === 'unica' && d.metodoDesconto === 'desagio',
          dica: 'O TST admite de 20% a 30% sobre as parcelas vincendas.' },
        { id: 'termoFinal', rotulo: 'Termo final da parcela única', tipo: 'radios', valor: 'sobrevida', largo: true,
          aparece: (d) => d.pedirPensao && d.formaPensao === 'unica',
          opcoes: [
            { valor: 'sobrevida', label: 'Expectativa de sobrevida na idade da vítima (tábua do IBGE)' },
            { valor: 'idade', label: 'Até uma idade' },
          ] },
        { id: 'dataNascimento', rotulo: 'Data de nascimento', tipo: 'data', aparece: (d) => d.pedirPensao,
          dica: `Com ela, a sobrevida sai da tábua do IBGE de ${TABUA_IBGE.ano}, pela idade na data da ciência.` },
        { id: 'sobrevida', rotulo: 'Sobrevida de outra tábua (anos)', tipo: 'decimal', min: 0, max: 100,
          aparece: (d) => d.pedirPensao && d.formaPensao === 'unica' && d.termoFinal !== 'idade',
          dica: `Em branco: a tábua do IBGE de ${TABUA_IBGE.ano} (ambos os sexos). Preencha só para usar `
            + 'outra — por sexo ou de outro ano.' },
        { id: 'idadeFinal', rotulo: 'Idade final (anos)', tipo: 'decimal',
          valor: String(IDADE_FINAL_PADRAO).replace('.', ','), min: 1, max: 120,
          aparece: (d) => d.pedirPensao && d.formaPensao === 'unica' && d.termoFinal === 'idade',
          dica: `${String(IDADE_FINAL_PADRAO).replace('.', ',')} anos: expectativa de vida ao nascer (tábua do IBGE `
            + `de ${TABUA_IBGE.ano}).` },
      ],
    },
    {
      titulo: 'Danos extrapatrimoniais (art. 223-G da CLT)',
      campos: [
        { id: 'pedirMorais', rotulo: 'Pedir danos morais', tipo: 'checkbox', valor: true, largo: true },
        { id: 'naturezaOfensa', rotulo: 'Natureza da ofensa', tipo: 'select', valor: 'auto',
          aparece: (d) => d.pedirMorais,
          opcoes: [
            { valor: 'auto', label: 'Sugerida pelo qualificador da CIF' },
            ...NATUREZAS_OFENSA.map((n) => ({ valor: n.valor, label: n.label })),
          ],
          dica: 'Faixas do §1º, em múltiplos do último salário contratual. O STF as tem por orientativas.' },
        { id: 'multiplicadorMorais', rotulo: 'Quantos salários', tipo: 'decimal', min: 0, max: 200,
          aparece: (d) => d.pedirMorais, dica: 'Em branco: o teto da faixa.' },
        { id: 'pedirEsteticos', rotulo: 'Pedir danos estéticos (cumuláveis — Súmula 387 do STJ)', tipo: 'checkbox',
          valor: false, largo: true },
        { id: 'multiplicadorEsteticos', rotulo: 'Quantos salários (estético)', tipo: 'decimal', min: 0, max: 200,
          aparece: (d) => d.pedirEsteticos },
        { id: 'danosEmergentes', rotulo: 'Despesas com tratamento', tipo: 'moeda',
          dica: 'Danos emergentes comprovados (art. 949 do CC): somados ao total.' },
      ],
    },
  ],
};

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
      { label: 'Base integrada pelo adicional de risco', devida: true, nota: 'Súmulas 60, I, e 264' },
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
      { titulo: 'Adicional de insalubridade ou periculosidade', campos: camposRisco },
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
      { label: 'Intervalo integral, DSR e reflexos (até 10/11/2017)', devida: true, nota: 'Súmula 437 do TST' },
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
          // No regime salarial o intervalo é pago como hora extra, dia a dia:
          // gera DSR como qualquer verba variável (Súmula 437, III).
          ...camposDSR.map((campo) => ({ ...campo, aparece: (d) => d.regimeIntervalo === 'anterior_reforma' })),
        ],
      },
      {
        ...grupoReflexos({ dsrMajorado: false }),
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
      { label: 'DSR', devida: false, nota: 'o adicional mensal já remunera os repousos — OJ 103 da SDI-1' },
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
      { label: 'Art. 477: uma remuneração, se paga fora dos 10 dias', devida: true, nota: 'Tema 142 do TST' },
      { label: 'Art. 467: 50% sobre as verbas incontroversas', devida: true },
      { label: 'Reflexos e FGTS', devida: false, nota: 'natureza de penalidade' },
      { label: 'Multa do art. 477 quando o empregado deu causa à mora', devida: false, nota: 'parte final do §8º' },
      { label: 'Ajuizamento depois do biênio', devida: false, nota: 'art. 7º, XXIX, da CF' },
    ],
    calcular: calcularMultas,
    semPeriodo: true,
    resumo: (c) => [
      ...(c.rescisao ? [['Término do contrato', formatarData(c.rescisao)]] : []),
      ...(c.prescricao ? [['Prescrição', c.prescricao]] : []),
      ...(c.prazo ? [['Prazo do art. 477', formatarData(c.prazo)]] : []),
      ...(c.pagamento ? [['Pagamento', formatarData(c.pagamento)]] : []),
      ...(c.prazo ? [['Atraso', c.pagamento ? `${c.diasAtraso} dia(s)` : 'sem pagamento']] : []),
      ...(c.remuneracao ? [['Remuneração base da multa', moeda.format(c.remuneracao)]] : []),
      ...(c.incontroverso ? [['Incontroverso', moeda.format(c.incontroverso)]] : []),
    ],
    grupos: [
      {
        titulo: 'Contrato e prescrição',
        campos: [
          { id: 'dataRescisao', rotulo: 'Término do contrato', tipo: 'data',
            dica: 'O prazo de 10 dias do art. 477, §6º, corre daí.' },
          { id: 'dataFimAviso', rotulo: 'Fim do aviso prévio projetado', tipo: 'data',
            dica: 'Só se houve aviso indenizado: é do fim dele que corre o biênio (OJ 83 da SDI-1). '
              + 'Em branco, vale o término do contrato.' },
          { id: 'dataAjuizamento', rotulo: 'Data do ajuizamento', tipo: 'data',
            dica: 'Apura a prescrição bienal (art. 7º, XXIX, da CF). As duas multas nascem com a '
              + 'rescisão, então o quinquênio nunca as alcança antes do biênio.' },
        ],
      },
      {
        titulo: 'Multa do art. 477',
        campos: [
          { id: 'multa477', rotulo: 'Pedir a multa do art. 477, §8º', tipo: 'checkbox', valor: true, largo: true },
          { id: 'salarioBase', rotulo: 'Salário base do empregado', tipo: 'moeda', obrigatorio: true,
            aparece: (d) => d.multa477,
            dica: 'A multa equivale a um mês de remuneração.' },
          { id: 'outrasParcelas', rotulo: 'Parcelas salariais habituais', tipo: 'moeda',
            aparece: (d) => d.multa477,
            dica: 'Adicionais, horas extras, comissões e demais parcelas dos arts. 457, §1º, e 458 da CLT. '
              + 'O TST fixou no Tema 142 que a base da multa é a remuneração, não o salário base.' },
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

  pedidoAcidente,
];

export const pedidoPorId = (id) => PEDIDOS.find((p) => p.id === id) ?? null;
