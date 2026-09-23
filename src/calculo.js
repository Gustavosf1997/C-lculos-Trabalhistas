/**
 * Motor de cálculo das verbas rescisórias.
 *
 * É um módulo puro (sem DOM): recebe os dados do formulário e devolve a
 * memória de cálculo. Todos os valores são estimativas — convenção coletiva,
 * acordo individual e jurisprudência local podem alterar o resultado.
 */

import { INSS, IRRF, FGTS } from './tabelas.js';
import { TIPOS } from './tipos.js';
import { calcularAdicionais, DIVISOR_PADRAO } from './adicionais.js';
import { salarioHora } from './descontos.js';
import { moeda, formatarQuantidade } from './formato.js';
import {
  apurarBienal, marcoQuinquenal, fimDoConcessivo, descreverPrescricao, formatarDataPrescricao,
} from './prescricao.js';

/* ------------------------------------------------------------------ datas */

export function parseData(iso) {
  if (!iso) return null;
  const [ano, mes, dia] = String(iso).split('-').map(Number);
  if (!ano || !mes || !dia) return null;
  return new Date(Date.UTC(ano, mes - 1, dia));
}

export function formatarData(data) {
  if (!data) return '—';
  return data.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

const DIA_MS = 86400000;

/**
 * Teto de dias de aviso prévio que o empregado pode ser obrigado a cumprir em
 * serviço. A proporcionalidade da Lei 12.506/2011 é benefício do trabalhador,
 * de modo que o excedente é indenizado (Nota Técnica 184/2012 da SRT/MTE).
 */
export const DIAS_AVISO_TRABALHAVEIS = 30;

function addDias(data, dias) {
  return new Date(data.getTime() + dias * DIA_MS);
}

/** Soma meses mantendo o dia; dia inexistente no mês de destino encosta no último. */
function addMeses(data, meses) {
  const ano = data.getUTCFullYear();
  const mes = data.getUTCMonth() + meses;
  const ultimoDia = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
  return new Date(Date.UTC(ano, mes, Math.min(data.getUTCDate(), ultimoDia)));
}

function addAnos(data, anos) {
  return new Date(Date.UTC(data.getUTCFullYear() + anos, data.getUTCMonth(), data.getUTCDate()));
}

function diffDias(inicio, fim) {
  return Math.round((fim - inicio) / DIA_MS);
}

/** Dias entre duas datas, contando as duas pontas. */
export function diasEntre(inicio, fim) {
  return diffDias(inicio, fim) + 1;
}

export function anosCompletos(admissao, fim) {
  let anos = fim.getUTCFullYear() - admissao.getUTCFullYear();
  const aniversario = new Date(
    Date.UTC(fim.getUTCFullYear(), admissao.getUTCMonth(), admissao.getUTCDate()),
  );
  if (fim < aniversario) anos -= 1;
  return Math.max(0, anos);
}

/** Meses completos entre duas datas (para contratos com menos de um ano). */
export function mesesCompletos(inicio, fim) {
  let meses =
    (fim.getUTCFullYear() - inicio.getUTCFullYear()) * 12 + (fim.getUTCMonth() - inicio.getUTCMonth());
  if (fim.getUTCDate() < inicio.getUTCDate()) meses -= 1;
  return Math.max(0, meses);
}

/** Conta os meses de competência com 15 dias ou mais trabalhados. */
export function contarMeses(inicio, fim) {
  if (!inicio || !fim || fim < inicio) return 0;
  let meses = 0;
  let cursor = new Date(Date.UTC(inicio.getUTCFullYear(), inicio.getUTCMonth(), 1));
  while (cursor <= fim) {
    const primeiro = cursor;
    const ultimo = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0));
    const de = inicio > primeiro ? inicio : primeiro;
    const ate = fim < ultimo ? fim : ultimo;
    if (diffDias(de, ate) + 1 >= 15) meses += 1;
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
  }
  return meses;
}

/** Avos do 13º: meses de competência do ano, limitados a 12. */
export function contarAvos(inicio, fim) {
  return Math.min(contarMeses(inicio, fim), 12);
}

/**
 * Avos de férias: contados em ciclos mensais a partir do dia da admissão, e
 * não por mês de calendário (art. 130 c/c art. 146, parágrafo único, da CLT).
 *
 * O ciclo em curso na saída só vira avo se tiver 15 dias ou mais trabalhados
 * dentro dele — a fração superior a 14 dias —, pouco importando quantos dias
 * do mês de calendário foram cumpridos.
 *
 * @param {Date} inicioPeriodo início do período aquisitivo em curso
 * @param {Date} fim último dia do contrato, já projetado quando há aviso
 */
export function contarAvosFerias(inicioPeriodo, fim) {
  if (!inicioPeriodo || !fim || fim < inicioPeriodo) return 0;

  let avos = 0;
  for (let ciclo = 0; ciclo < 12; ciclo += 1) {
    const inicioCiclo = addMeses(inicioPeriodo, ciclo);
    const fimCiclo = addDias(addMeses(inicioPeriodo, ciclo + 1), -1);

    if (fim >= fimCiclo) {
      avos += 1; // ciclo mensal completo
      continue;
    }
    if (diffDias(inicioCiclo, fim) + 1 >= 15) avos += 1; // fração superior a 14 dias
    break;
  }
  return Math.min(avos, 12);
}

/** Períodos aquisitivos de férias já completados e início do período em curso. */
export function periodosAquisitivos(admissao, fim) {
  let completos = 0;
  let inicio = admissao;
  while (true) {
    const fimPeriodo = addDias(addAnos(inicio, 1), -1);
    if (fimPeriodo <= fim) {
      completos += 1;
      inicio = addAnos(inicio, 1);
    } else {
      break;
    }
  }
  return { completos, inicioPeriodoAtual: inicio };
}

/**
 * Valor das horas extras do mês: hora normal — salário e adicionais divididos
 * pelo divisor da jornada (Súmula 264 do TST) — acrescida do adicional.
 */
export function valorHorasExtras(remuneracaoFixa, divisor, horas, percentual = 50) {
  if (!divisor || divisor <= 0 || !horas || horas <= 0) return 0;
  return arredondar((remuneracaoFixa / divisor) * (1 + percentual / 100) * horas);
}

/** Dias de férias a que o empregado faz jus conforme faltas (art. 130 da CLT). */
export function diasDeFeriasPorFaltas(faltas = 0) {
  if (faltas <= 5) return 30;
  if (faltas <= 14) return 24;
  if (faltas <= 23) return 18;
  if (faltas <= 32) return 12;
  return 0;
}

/* ------------------------------------------------------------- tributação */

export function calcularINSS(base) {
  if (base <= 0) return 0;
  let contribuicao = 0;
  let anterior = 0;
  for (const faixa of INSS.faixas) {
    if (base > anterior) {
      const parcela = Math.min(base, faixa.limite) - anterior;
      contribuicao += parcela * faixa.aliquota;
      anterior = faixa.limite;
    }
  }
  return arredondar(contribuicao);
}

function impostoPelaTabela(base) {
  const faixa = IRRF.faixas.find((f) => base <= f.limite) ?? IRRF.faixas.at(-1);
  return Math.max(0, base * faixa.aliquota - faixa.deducao);
}

/**
 * Redutor da Lei 15.270/2025: zera o imposto até R$ 5.000,00 de rendimento
 * mensal e decresce linearmente até se anular em R$ 7.350,00.
 *
 * @param {number} rendimento rendimento tributável bruto do mês
 * @param {number} imposto imposto apurado pela tabela
 */
export function calcularRedutorIRRF(rendimento, imposto) {
  const { isencaoAte, limite, constante, fator } = IRRF.redutor;
  if (rendimento <= isencaoAte) return imposto; // isenção integral
  if (rendimento > limite) return 0;
  return Math.max(0, constante - fator * rendimento);
}

/**
 * IRRF pelo modelo mais favorável — deduções legais x desconto simplificado —,
 * já descontado o redutor da Lei 15.270/2025.
 */
export function calcularIRRF(rendimento, { inss = 0, dependentes = 0, pensao = 0 } = {}) {
  if (rendimento <= 0) return 0;
  const baseLegal = rendimento - inss - dependentes * IRRF.deducaoPorDependente - pensao;
  // O desconto simplificado é valor fixo e substitui todas as deduções legais.
  const baseSimplificada = rendimento - IRRF.descontoSimplificado;
  const imposto = Math.min(impostoPelaTabela(baseLegal), impostoPelaTabela(baseSimplificada));
  return arredondar(Math.max(0, imposto - calcularRedutorIRRF(rendimento, imposto)));
}

/* ---------------------------------------------------------------- cálculo */

function arredondar(valor) {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}

function num(valor) {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
}

/**
 * @param {object} dados campos do formulário (ver `campos.js` / `app.js`)
 * @returns {{erros:string[], contexto:object, proventos:object[], descontos:object[], fgts:object, totais:object}}
 */
export function calcularRescisao(dados) {
  const tipo = TIPOS[dados.tipo];
  const erros = [];
  if (!tipo) erros.push('Selecione o tipo de rescisão.');

  const campos = tipo?.campos ?? {};
  const admissao = parseData(dados.dataAdmissao);
  const termoFinal = parseData(dados.dataTermoFinal);
  // No término no prazo, o próprio termo final encerra o contrato.
  const dataAviso = campos.termoEncerraContrato ? termoFinal : parseData(dados.dataAviso);

  if (!admissao) erros.push('Informe a data de admissão.');
  if (campos.termoFinal && !termoFinal) erros.push('Informe a data do termo final previsto.');
  if (!dataAviso && !campos.termoEncerraContrato) erros.push('Informe a data do aviso prévio / desligamento.');
  if (admissao && dataAviso && dataAviso < admissao) {
    erros.push('A data do desligamento não pode ser anterior à admissão.');
  }
  if (admissao && termoFinal && termoFinal <= admissao) {
    erros.push('O termo final deve ser posterior à data de admissão.');
  }
  if (campos.termoFinal && !campos.termoEncerraContrato && dataAviso && termoFinal && dataAviso >= termoFinal) {
    erros.push('A rescisão antecipada deve ocorrer antes do termo final previsto.');
  }

  const salarioBase = num(dados.salarioBase);
  if (salarioBase <= 0) erros.push('Informe o último salário base.');

  const ajuizamento = parseData(dados.dataAjuizamento);
  if (admissao && ajuizamento && ajuizamento < admissao) {
    erros.push('A data do ajuizamento não pode ser anterior à admissão.');
  }

  if (erros.length) {
    return {
      erros, alertas: [], impedimento: null, recorte: null,
      proventos: [], descontos: [], totais: null, contexto: null, fgts: null,
    };
  }
  const alertas = [];

  const divisor = num(dados.divisor) || DIVISOR_PADRAO;

  // Os adicionais legais vêm marcados na tela, cada um com o seu percentual.
  const adicionais = calcularAdicionais({
    selecionados: dados.adicionais ?? [],
    salarioBase,
    horasNoturnas: num(dados.horasNoturnas),
    divisor,
  });
  // Duas bases: a fixa é o que o mês paga (salário e adicionais), e é sobre ela
  // que o saldo de salário é rateado. As médias de variáveis servem para
  // integrar as indenizações — aviso, 13º e férias —, não para inflar o mês.
  const remuneracaoFixa = arredondar(salarioBase + adicionais.total);
  const medias = num(dados.mediaComissoes);
  const remuneracao = arredondar(remuneracaoFixa + medias);

  /* --- aviso prévio --- */
  const anos = anosCompletos(admissao, dataAviso);

  // A cláusula assecuratória (art. 481) faz o contrato a termo seguir as regras
  // do contrato por prazo indeterminado: há aviso prévio e não incidem os
  // arts. 479/480.
  const clausulaAtiva = Boolean(campos.clausulaAssecuratoria && dados.clausulaAssecuratoria);
  const avisoAplicavel = Boolean(tipo.aviso && (!tipo.aviso.somenteComClausula || clausulaAtiva));
  const opcoesAviso = avisoAplicavel ? tipo.aviso.opcoes.map((o) => o.valor) : [];
  const tipoAviso = avisoAplicavel
    ? (opcoesAviso.includes(dados.tipoAviso) ? dados.tipoAviso : opcoesAviso[0])
    : 'nenhum';

  const diasAvisoLegais = avisoAplicavel
    ? (tipo.aviso.diasFixos ?? Math.min(30 + 3 * anos, 90))
    : 0;

  let diasAvisoDevidos = diasAvisoLegais;
  if (tipoAviso === 'indenizado_metade') diasAvisoDevidos = Math.round(diasAvisoLegais / 2);
  if (tipoAviso === 'nenhum' || tipoAviso === 'dispensado') diasAvisoDevidos = 0;

  const avisoIndenizado = tipoAviso === 'indenizado' || tipoAviso === 'indenizado_metade';
  const avisoTrabalhado = tipoAviso === 'trabalhado';

  // A proporcionalidade da Lei 12.506/2011 existe em favor do empregado: ele
  // não pode ser obrigado a trabalhar mais de 30 dias de aviso, e o que passar
  // disso é indenizado (Nota Técnica 184/2012 da SRT/MTE).
  const diasAvisoTrabalhados = avisoTrabalhado
    ? Math.min(diasAvisoLegais, DIAS_AVISO_TRABALHAVEIS)
    : 0;
  const excedenteTrabalhado = avisoTrabalhado ? diasAvisoLegais - diasAvisoTrabalhados : 0;
  // Dias pagos em dinheiro: o aviso indenizado por inteiro, ou só o excedente
  // quando o aviso é cumprido em serviço.
  const diasAvisoPagos = avisoIndenizado ? diasAvisoDevidos : excedenteTrabalhado;

  // Último dia do contrato e data projetada (o aviso indenizado integra o
  // tempo de serviço — OJ 82 da SDI-1 e Súmula 305 do TST).
  const ultimoDiaTrabalhado = avisoTrabalhado ? addDias(dataAviso, diasAvisoTrabalhados) : dataAviso;
  const dataProjetada = diasAvisoPagos > 0
    ? addDias(ultimoDiaTrabalhado, diasAvisoPagos)
    : ultimoDiaTrabalhado;

  /* --- prescrição bienal (art. 7º, XXIX, da CF) --- */
  // O biênio corre do fim do aviso, e do projetado quando ele é indenizado
  // (OJ 83 da SDI-1): por isso é apurado aqui, e não sobre a data do aviso.
  const bienal = apurarBienal(dataProjetada, ajuizamento, dados.dataReferencia);
  if (bienal.impedimento) {
    return {
      erros: [],
      alertas: [],
      impedimento: bienal.impedimento,
      recorte: null,
      proventos: [],
      descontos: [],
      fgts: null,
      totais: null,
      contexto: { dataProjetada, ajuizamento, limiteBienal: bienal.limite },
    };
  }
  if (bienal.alerta) alertas.push(bienal.alerta);
  if (ajuizamento && ajuizamento < dataAviso) {
    alertas.push('A data do ajuizamento é anterior ao fim do contrato. Confira as datas.');
  }

  if (excedenteTrabalhado > 0) {
    alertas.push(
      `O aviso proporcional é de ${diasAvisoLegais} dias, mas o empregado só pode ser obrigado a `
        + `cumprir ${DIAS_AVISO_TRABALHAVEIS} em serviço: os ${excedenteTrabalhado} dias restantes foram `
        + 'lançados como indenizados e projetam o contrato (Nota Técnica 184/2012 da SRT/MTE).',
    );
  }

  /* --- proventos --- */
  const proventos = [];
  const descontosAntecipados = [];
  // Dias do último mês: conta a partir da admissão quando ela cai nesse mesmo
  // mês, e paga o mês cheio (30/30) quando ele foi trabalhado por inteiro —
  // inclusive em fevereiro, que tem menos de 30 dias.
  const anoSaldo = ultimoDiaTrabalhado.getUTCFullYear();
  const mesSaldo = ultimoDiaTrabalhado.getUTCMonth();
  const primeiroDoMes = new Date(Date.UTC(anoSaldo, mesSaldo, 1));
  const ultimoDoMes = new Date(Date.UTC(anoSaldo, mesSaldo + 1, 0));
  const inicioNoMes = admissao > primeiroDoMes ? admissao : primeiroDoMes;
  const mesInteiro = admissao <= primeiroDoMes && ultimoDiaTrabalhado >= ultimoDoMes;
  const diasSaldo = mesInteiro ? 30 : Math.min(diffDias(inicioNoMes, ultimoDiaTrabalhado) + 1, 30);

  const saldoSalario = arredondar((remuneracaoFixa / 30) * diasSaldo);
  proventos.push({
    chave: 'saldo_salario',
    label: 'Saldo de salário',
    detalhe: `${diasSaldo} dia(s) de ${formatarData(ultimoDiaTrabalhado).slice(3)} · salário e adicionais`,
    valor: saldoSalario,
  });

  // Horas extras efetivamente prestadas no mês da rescisão: verba do mês, e
  // não média de integração.
  const horasExtras = num(dados.horasExtras);
  const percentualHoraExtra = num(dados.adicionalHoraExtra) || 50;
  const valorHoras = valorHorasExtras(remuneracaoFixa, divisor, horasExtras, percentualHoraExtra);
  if (valorHoras > 0) {
    proventos.push({
      chave: 'horas_extras',
      label: 'Horas extras',
      detalhe: `${formatarQuantidade(horasExtras)} h x ${moeda.format(
        arredondar((remuneracaoFixa / divisor) * (1 + percentualHoraExtra / 100)),
      )} (hora + ${formatarQuantidade(percentualHoraExtra)}%)`,
      valor: valorHoras,
    });
  }

  let valorAviso = 0;
  if (diasAvisoPagos > 0) {
    valorAviso = arredondar((remuneracao / 30) * diasAvisoPagos);
    const rotuloAviso = excedenteTrabalhado > 0
      ? 'Aviso prévio indenizado (excedente dos 30 dias trabalhados)'
      : (tipoAviso === 'indenizado_metade' ? 'Aviso prévio indenizado (50%)' : 'Aviso prévio indenizado');
    const detalheAviso = excedenteTrabalhado > 0
      ? `${diasAvisoPagos} dias além dos ${diasAvisoTrabalhados} cumpridos (de ${diasAvisoLegais} proporcionais)`
      : `${diasAvisoPagos} dias${tipoAviso === 'indenizado_metade' ? ` (metade de ${diasAvisoLegais})` : ''}`;
    proventos.push({
      chave: 'aviso_previo',
      label: rotuloAviso,
      detalhe: detalheAviso,
      valor: valorAviso,
    });
  }

  /* --- rescisão antecipada do contrato a termo (arts. 479 e 480) --- */
  const diasRestantes = termoFinal ? Math.max(0, diffDias(ultimoDiaTrabalhado, termoFinal)) : 0;
  const regraIndenizacao = tipo.indenizacaoAntecipada;
  let indenizacaoAntecipada = 0;
  if (regraIndenizacao && !clausulaAtiva && diasRestantes > 0) {
    indenizacaoAntecipada = arredondar(((remuneracao / 30) * diasRestantes) / 2);
    const lancamento = {
      chave: `indenizacao_art_${regraIndenizacao.artigo}`,
      label: regraIndenizacao.label,
      detalhe: `metade de ${diasRestantes} dia(s) até ${formatarData(termoFinal)}${
        regraIndenizacao.detalhe ? ` — ${regraIndenizacao.detalhe}` : ''
      }`,
      valor: indenizacaoAntecipada,
    };
    if (regraIndenizacao.natureza === 'provento') proventos.push(lancamento);
    else descontosAntecipados.push(lancamento);
  }

  /* --- 13º proporcional --- */
  let decimoTerceiro = 0;
  let avos13 = 0;
  let avos13AnoSeguinte = 0;
  // Cada ano tem o seu 13º, tributado como fato próprio.
  const decimosPorAno = [];
  if (tipo.campos.decimoTerceiro) {
    const ano = ultimoDiaTrabalhado.getUTCFullYear();
    const inicioAno = new Date(Date.UTC(ano, 0, 1));
    const fimAno = new Date(Date.UTC(ano, 11, 31));
    const inicio13 = admissao > inicioAno ? admissao : inicioAno;
    const fim13 = dataProjetada < fimAno ? dataProjetada : fimAno;

    avos13 = contarAvos(inicio13, fim13);
    decimoTerceiro = arredondar((remuneracao / 12) * avos13);
    if (decimoTerceiro > 0) decimosPorAno.push(decimoTerceiro);
    proventos.push({
      chave: 'decimo_terceiro',
      label: `13º salário proporcional (${ano})`,
      detalhe: `${avos13}/12 avos`,
      valor: decimoTerceiro,
    });

    // Aviso indenizado no fim do ano projeta o contrato para o ano seguinte,
    // que rende avos próprios de 13º.
    if (dataProjetada > fimAno) {
      avos13AnoSeguinte = contarAvos(new Date(Date.UTC(ano + 1, 0, 1)), dataProjetada);
      if (avos13AnoSeguinte > 0) {
        const valor = arredondar((remuneracao / 12) * avos13AnoSeguinte);
        decimosPorAno.push(valor);
        decimoTerceiro = arredondar(decimoTerceiro + valor);
        proventos.push({
          chave: 'decimo_terceiro_ano_seguinte',
          label: `13º salário proporcional (${ano + 1})`,
          detalhe: `${avos13AnoSeguinte}/12 avos`,
          valor,
        });
      }
    }
  }

  /* --- férias --- */
  const diasFerias = diasDeFeriasPorFaltas(num(dados.faltasInjustificadas));
  const fatorFaltas = diasFerias / 30;
  const { completos, inicioPeriodoAtual } = periodosAquisitivos(admissao, dataProjetada);
  const periodosInformados = num(dados.periodosFeriasVencidas);
  const periodosNaoGozados = Math.min(periodosInformados, completos);
  if (periodosInformados > completos) {
    alertas.push(
      `Foram informados ${periodosInformados} períodos de férias vencidas, mas o contrato completou `
        + `${completos}. O cálculo usou ${completos}.`,
    );
  }

  // Férias prescrevem em cinco anos contados do fim do período concessivo
  // (art. 149 da CLT). Os não gozados são os últimos períodos completos; os
  // mais antigos deles podem ter o concessivo encerrado antes do marco
  // quinquenal, e aí saem da conta.
  const marco = ajuizamento ? marcoQuinquenal(ajuizamento) : null;
  const prescritos = [];
  if (marco) {
    for (let k = completos - periodosNaoGozados + 1; k <= completos; k += 1) {
      const inicioAquisitivo = addAnos(admissao, k - 1);
      const fimConcessivo = fimDoConcessivo(inicioAquisitivo);
      if (fimConcessivo < marco) prescritos.push({ inicioAquisitivo, fimConcessivo });
    }
  }
  const periodosVencidos = periodosNaoGozados - prescritos.length;
  const recorte = prescritos.length
    ? {
      marco,
      titulo: prescritos.length === periodosNaoGozados
        ? 'Férias vencidas prescritas'
        : 'Parte das férias vencidas está prescrita',
      mensagem: `${prescritos.length === 1 ? 'Um período' : `${prescritos.length} períodos`} de férias `
        + `não gozadas ${prescritos.length === 1 ? 'teve' : 'tiveram'} o concessivo encerrado antes de `
        + `${formatarDataPrescricao(marco)}, marco quinquenal contado do ajuizamento `
        + `(${prescritos.map((p) => `concessivo até ${formatarDataPrescricao(p.fimConcessivo)}`).join('; ')}). `
        + 'Pelo art. 149 da CLT, as férias prescrevem em cinco anos do fim do período concessivo, e '
        + `${prescritos.length === 1 ? 'ele saiu' : 'eles saíram'} do cálculo. `
        + (periodosVencidos
          ? `O cálculo abaixo considera ${periodosVencidos} período(s) exigível(is).`
          : 'Nenhum período vencido restou exigível.'),
    }
    : null;
  const emDobro = Boolean(dados.feriasDobro);

  let feriasVencidas = 0;
  if (periodosVencidos > 0 && fatorFaltas === 0) {
    alertas.push(
      `Com ${num(dados.faltasInjustificadas)} faltas injustificadas o empregado perde o direito às `
        + 'férias do período (art. 130 da CLT), e por isso os períodos vencidos não foram pagos.',
    );
  }
  if (periodosVencidos > 0 && fatorFaltas > 0) {
    feriasVencidas = arredondar(remuneracao * fatorFaltas * periodosVencidos * (emDobro ? 2 : 1));
    proventos.push({
      chave: 'ferias_vencidas',
      label: emDobro ? 'Férias vencidas em dobro' : 'Férias vencidas',
      detalhe: `${periodosVencidos} período(s) não gozado(s)${emDobro ? ' — art. 137 da CLT' : ''}`,
      valor: feriasVencidas,
    });
    proventos.push({
      chave: 'terco_vencidas',
      label: '1/3 sobre férias vencidas',
      detalhe: 'art. 7º, XVII, da CF',
      valor: arredondar(feriasVencidas / 3),
    });
  }

  let feriasProporcionais = 0;
  let avosFerias = 0;
  if (tipo.campos.feriasProporcionais) {
    avosFerias = contarAvosFerias(inicioPeriodoAtual, dataProjetada);
    feriasProporcionais = arredondar((remuneracao / 12) * avosFerias * fatorFaltas);
    if (feriasProporcionais > 0) {
      proventos.push({
        chave: 'ferias_proporcionais',
        label: 'Férias proporcionais',
        detalhe: `${avosFerias}/12 avos`,
        valor: feriasProporcionais,
      });
      proventos.push({
        chave: 'terco_proporcionais',
        label: '1/3 sobre férias proporcionais',
        detalhe: 'art. 7º, XVII, da CF',
        valor: arredondar(feriasProporcionais / 3),
      });
    }
  }

  /* --- descontos --- */
  const descontos = [...descontosAntecipados];

  // O mês é tributado por inteiro: saldo somado às horas extras nele pagas.
  const baseMensal = arredondar(saldoSalario + valorHoras);
  const rotuloMensal = valorHoras > 0 ? 'saldo de salário e horas extras' : 'saldo de salário';

  const inssSalario = calcularINSS(baseMensal);
  if (inssSalario > 0) {
    descontos.push({ chave: 'inss_salario', label: `INSS sobre ${rotuloMensal}`, detalhe: 'tabela progressiva', valor: inssSalario });
  }
  const inss13 = arredondar(decimosPorAno.reduce((soma, valor) => soma + calcularINSS(valor), 0));
  if (inss13 > 0) {
    descontos.push({
      chave: 'inss_13',
      label: 'INSS sobre 13º salário',
      detalhe: decimosPorAno.length > 1 ? 'cálculo em separado, ano a ano' : 'cálculo em separado',
      valor: inss13,
    });
  }

  // Só desconta o que foi marcado na tela; o resto decorre da lei.
  const marcados = dados.descontos ?? [];
  const aplica = (id) => marcados.includes(id);

  // Mesma hora normal que remunera a extra: salário e adicionais ÷ divisor.
  const valorHora = salarioHora(remuneracaoFixa, divisor);
  const horasNegativas = aplica('horas_negativas') ? num(dados.horasNegativas) : 0;
  if (horasNegativas > 0) {
    descontos.push({
      chave: 'horas_negativas',
      label: 'Horas negativas',
      detalhe: `${formatarQuantidade(horasNegativas)} h x ${moeda.format(arredondar(valorHora))} (salário-hora)`,
      valor: arredondar(valorHora * horasNegativas),
    });
  }

  const dependentes = num(dados.dependentes);
  const pensaoPercentual = aplica('pensao') ? num(dados.pensaoPercentual) : 0;
  const fatorPensao = pensaoPercentual / 100;
  const irrfSalario = calcularIRRF(baseMensal, {
    inss: inssSalario,
    dependentes,
    pensao: baseMensal * fatorPensao,
  });
  if (irrfSalario > 0) {
    descontos.push({ chave: 'irrf_salario', label: `IRRF sobre ${rotuloMensal}`, detalhe: 'tabela progressiva', valor: irrfSalario });
  }
  const irrf13 = arredondar(
    decimosPorAno.reduce(
      (soma, valor) => soma + calcularIRRF(valor, {
        inss: calcularINSS(valor),
        dependentes,
        pensao: valor * fatorPensao,
      }),
      0,
    ),
  );
  if (irrf13 > 0) {
    descontos.push({ chave: 'irrf_13', label: 'IRRF sobre 13º salário', detalhe: 'tributação exclusiva', valor: irrf13 });
  }

  if (tipoAviso === 'nao_cumprido') {
    descontos.push({
      chave: 'aviso_nao_cumprido',
      label: 'Aviso prévio não cumprido',
      detalhe: '30 dias (art. 487, §2º)',
      valor: arredondar(remuneracao),
    });
  }

  const totalProventosBrutos = proventos.reduce((s, p) => s + p.valor, 0);
  if (pensaoPercentual > 0) {
    descontos.push({
      chave: 'pensao',
      label: 'Pensão alimentícia',
      detalhe: `${formatarQuantidade(pensaoPercentual)}% sobre as verbas rescisórias`,
      valor: arredondar(totalProventosBrutos * (pensaoPercentual / 100)),
    });
  }

  for (const [id, chave, label] of [
    ['adiantamento_salario', 'adiantamentoSalario', 'Adiantamento de salário'],
    ['adiantamento_13', 'adiantamento13', 'Adiantamento do 13º salário'],
    ['outros', 'outrosDescontos', 'Outros descontos'],
  ]) {
    const valor = aplica(id) ? num(dados[chave]) : 0;
    if (valor > 0) descontos.push({ chave, label, detalhe: 'informado', valor: arredondar(valor) });
  }

  /* --- alertas (não bloqueiam o cálculo) --- */
  if (clausulaAtiva) {
    alertas.push(
      'Com a cláusula assecuratória (art. 481), valem as regras do contrato por prazo indeterminado: '
        + 'há aviso prévio e não incide a indenização dos arts. 479/480.',
    );
  }
  if (campos.termoFinal && termoFinal && diffDias(admissao, termoFinal) + 1 > 90) {
    alertas.push(
      'O contrato dura mais de 90 dias: não pode ser de experiência (art. 445, parágrafo único). '
        + 'Confirme se é contrato por prazo determinado comum.',
    );
  }

  /* --- FGTS --- */
  const saldoFgtsInformado = num(dados.saldoFgts);
  const baseFgtsRescisao = saldoSalario + valorHoras + decimoTerceiro + valorAviso;
  const fgtsRescisao = arredondar(baseFgtsRescisao * FGTS.aliquotaDeposito);
  const baseMulta = arredondar(saldoFgtsInformado + fgtsRescisao);
  const percentualMulta = tipo.fgts.multa;
  const multa = arredondar(baseMulta * percentualMulta);

  const totalDescontos = arredondar(descontos.reduce((s, d) => s + d.valor, 0));
  const totalProventos = arredondar(totalProventosBrutos);

  return {
    erros: [],
    alertas,
    impedimento: null,
    recorte,
    contexto: {
      ajuizamento,
      limiteBienal: bienal.limite,
      marcoQuinquenal: marco,
      periodosPrescritos: prescritos.length,
      prescricao: descreverPrescricao({ ajuizamento, limite: bienal.limite, marco }),
      remuneracao,
      remuneracaoFixa,
      horasExtras,
      valorHorasExtras: valorHoras,
      medias: arredondar(medias),
      adicionais: adicionais.itens,
      totalAdicionais: adicionais.total,
      divisor,
      valorHora: arredondar(valorHora),
      anos,
      meses: mesesCompletos(admissao, ultimoDiaTrabalhado),
      diasContrato: diffDias(admissao, ultimoDiaTrabalhado) + 1,
      tipoAviso,
      avisoAplicavel,
      clausulaAtiva,
      termoFinal,
      diasRestantes,
      diasAvisoLegais,
      diasAvisoDevidos,
      diasAvisoTrabalhados,
      diasAvisoPagos,
      excedenteTrabalhado,
      ultimoDiaTrabalhado,
      dataProjetada,
      avos13,
      avos13AnoSeguinte,
      avosFerias,
      periodosVencidos,
      periodosInformados,
      emDobro,
      periodosCompletosCalculados: completos,
      diasFerias,
      diasSaldo,
    },
    proventos,
    descontos,
    fgts: {
      informado: arredondar(saldoFgtsInformado),
      rescisao: fgtsRescisao,
      baseMulta,
      percentualMulta,
      multa,
      rotuloMulta: tipo.fgts.rotuloMulta,
      saque: tipo.fgts.saque,
      seguroDesemprego:
        clausulaAtiva && tipo.fgts.seguroDesempregoComClausula
          ? tipo.fgts.seguroDesempregoComClausula
          : tipo.fgts.seguroDesemprego,
    },
    totais: {
      proventos: totalProventos,
      descontos: totalDescontos,
      liquido: arredondar(totalProventos - totalDescontos),
    },
  };
}
