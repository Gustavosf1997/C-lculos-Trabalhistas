/**
 * Motor de cálculo das verbas rescisórias.
 *
 * É um módulo puro (sem DOM): recebe os dados do formulário e devolve a
 * memória de cálculo. Todos os valores são estimativas — convenção coletiva,
 * acordo individual e jurisprudência local podem alterar o resultado.
 */

import { INSS, IRRF, FGTS } from './tabelas.js';
import { TIPOS } from './tipos.js';

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

function addDias(data, dias) {
  return new Date(data.getTime() + dias * DIA_MS);
}

function addAnos(data, anos) {
  return new Date(Date.UTC(data.getUTCFullYear() + anos, data.getUTCMonth(), data.getUTCDate()));
}

function diffDias(inicio, fim) {
  return Math.round((fim - inicio) / DIA_MS);
}

export function anosCompletos(admissao, fim) {
  let anos = fim.getUTCFullYear() - admissao.getUTCFullYear();
  const aniversario = new Date(
    Date.UTC(fim.getUTCFullYear(), admissao.getUTCMonth(), admissao.getUTCDate()),
  );
  if (fim < aniversario) anos -= 1;
  return Math.max(0, anos);
}

/** Conta os avos (frações de 1/12) considerando mês com 15 dias ou mais. */
export function contarAvos(inicio, fim) {
  if (!inicio || !fim || fim < inicio) return 0;
  let avos = 0;
  let cursor = new Date(Date.UTC(inicio.getUTCFullYear(), inicio.getUTCMonth(), 1));
  while (cursor <= fim) {
    const primeiro = cursor;
    const ultimo = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0));
    const de = inicio > primeiro ? inicio : primeiro;
    const ate = fim < ultimo ? fim : ultimo;
    if (diffDias(de, ate) + 1 >= 15) avos += 1;
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
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
 * IRRF pelo modelo mais favorável: deduções legais x desconto simplificado.
 */
export function calcularIRRF(rendimento, { inss = 0, dependentes = 0, pensao = 0 } = {}) {
  if (rendimento <= 0) return 0;
  const baseLegal = rendimento - inss - dependentes * IRRF.deducaoPorDependente - pensao;
  const baseSimplificada = rendimento - Math.min(IRRF.descontoSimplificado, rendimento * 0.25) - pensao;
  const imposto = Math.min(impostoPelaTabela(baseLegal), impostoPelaTabela(baseSimplificada));
  return arredondar(Math.max(0, imposto));
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

  const admissao = parseData(dados.dataAdmissao);
  const dataAviso = parseData(dados.dataAviso);
  if (!admissao) erros.push('Informe a data de admissão.');
  if (!dataAviso) erros.push('Informe a data do aviso prévio / desligamento.');
  if (admissao && dataAviso && dataAviso < admissao) {
    erros.push('A data do desligamento não pode ser anterior à admissão.');
  }

  const salarioBase = num(dados.salarioBase);
  if (salarioBase <= 0) erros.push('Informe o último salário base.');

  if (erros.length) return { erros, proventos: [], descontos: [], totais: null, contexto: null, fgts: null };

  const medias =
    num(dados.mediaHorasExtras) + num(dados.mediaAdicionais) + num(dados.mediaComissoes);
  const remuneracao = arredondar(salarioBase + medias);

  /* --- aviso prévio --- */
  const anos = anosCompletos(admissao, dataAviso);
  const tipoAviso = tipo.aviso ? dados.tipoAviso || tipo.aviso.opcoes[0].valor : 'nenhum';

  let diasAvisoLegais = 0;
  if (tipo.id === 'pedido_demissao') diasAvisoLegais = 30;
  else if (tipo.aviso) diasAvisoLegais = Math.min(30 + 3 * anos, 90);

  let diasAvisoDevidos = diasAvisoLegais;
  if (tipoAviso === 'indenizado_metade') diasAvisoDevidos = Math.round(diasAvisoLegais / 2);
  if (tipoAviso === 'nenhum' || tipoAviso === 'dispensado') diasAvisoDevidos = 0;

  const avisoIndenizado = tipoAviso === 'indenizado' || tipoAviso === 'indenizado_metade';
  const avisoTrabalhado = tipoAviso === 'trabalhado';

  // Último dia do contrato e data projetada (o aviso indenizado integra o
  // tempo de serviço — OJ 82 da SDI-1 e Súmula 305 do TST).
  const ultimoDiaTrabalhado = avisoTrabalhado ? addDias(dataAviso, diasAvisoLegais) : dataAviso;
  const dataProjetada = avisoIndenizado ? addDias(ultimoDiaTrabalhado, diasAvisoDevidos) : ultimoDiaTrabalhado;

  /* --- proventos --- */
  const proventos = [];
  const diasSaldo = ultimoDiaTrabalhado.getUTCDate();
  const saldoSalario = arredondar((remuneracao / 30) * diasSaldo);
  proventos.push({
    chave: 'saldo_salario',
    label: 'Saldo de salário',
    detalhe: `${diasSaldo} dia(s) de ${formatarData(ultimoDiaTrabalhado).slice(3)}`,
    valor: saldoSalario,
  });

  let valorAviso = 0;
  if (avisoIndenizado && diasAvisoDevidos > 0) {
    valorAviso = arredondar((remuneracao / 30) * diasAvisoDevidos);
    proventos.push({
      chave: 'aviso_previo',
      label: tipoAviso === 'indenizado_metade' ? 'Aviso prévio indenizado (50%)' : 'Aviso prévio indenizado',
      detalhe: `${diasAvisoDevidos} dias${tipoAviso === 'indenizado_metade' ? ` (metade de ${diasAvisoLegais})` : ''}`,
      valor: valorAviso,
    });
  }

  /* --- 13º proporcional --- */
  let decimoTerceiro = 0;
  let avos13 = 0;
  if (tipo.campos.decimoTerceiro) {
    const inicioAno = new Date(Date.UTC(ultimoDiaTrabalhado.getUTCFullYear(), 0, 1));
    const inicio13 = admissao > inicioAno ? admissao : inicioAno;
    avos13 = contarAvos(inicio13, dataProjetada);
    decimoTerceiro = arredondar((remuneracao / 12) * avos13);
    proventos.push({
      chave: 'decimo_terceiro',
      label: '13º salário proporcional',
      detalhe: `${avos13}/12 avos`,
      valor: decimoTerceiro,
    });
  }

  /* --- férias --- */
  const diasFerias = diasDeFeriasPorFaltas(num(dados.faltasInjustificadas));
  const fatorFaltas = diasFerias / 30;
  const { completos, inicioPeriodoAtual } = periodosAquisitivos(admissao, dataProjetada);
  const periodosVencidos = Math.min(num(dados.periodosFeriasVencidas), completos);
  const emDobro = Boolean(dados.feriasDobro);

  let feriasVencidas = 0;
  if (periodosVencidos > 0) {
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
    avosFerias = contarAvos(inicioPeriodoAtual, dataProjetada);
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
  const descontos = [];
  const inssSalario = calcularINSS(saldoSalario);
  if (inssSalario > 0) {
    descontos.push({ chave: 'inss_salario', label: 'INSS sobre saldo de salário', detalhe: 'tabela progressiva', valor: inssSalario });
  }
  const inss13 = decimoTerceiro > 0 ? calcularINSS(decimoTerceiro) : 0;
  if (inss13 > 0) {
    descontos.push({ chave: 'inss_13', label: 'INSS sobre 13º salário', detalhe: 'cálculo em separado', valor: inss13 });
  }

  const dependentes = num(dados.dependentes);
  const pensaoPercentual = num(dados.pensaoPercentual);
  const irrfSalario = calcularIRRF(saldoSalario, { inss: inssSalario, dependentes });
  if (irrfSalario > 0) {
    descontos.push({ chave: 'irrf_salario', label: 'IRRF sobre saldo de salário', detalhe: 'tabela progressiva', valor: irrfSalario });
  }
  const irrf13 = decimoTerceiro > 0 ? calcularIRRF(decimoTerceiro, { inss: inss13, dependentes }) : 0;
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
      detalhe: `${pensaoPercentual}% sobre as verbas rescisórias`,
      valor: arredondar(totalProventosBrutos * (pensaoPercentual / 100)),
    });
  }

  for (const [chave, label] of [
    ['adiantamentoSalario', 'Adiantamento de salário'],
    ['adiantamento13', 'Adiantamento do 13º salário'],
    ['outrosDescontos', 'Outros descontos'],
  ]) {
    const valor = num(dados[chave]);
    if (valor > 0) descontos.push({ chave, label, detalhe: 'informado', valor: arredondar(valor) });
  }

  /* --- FGTS --- */
  const saldoFgtsInformado = num(dados.saldoFgts);
  const baseFgtsRescisao = saldoSalario + decimoTerceiro + valorAviso;
  const fgtsRescisao = arredondar(baseFgtsRescisao * FGTS.aliquotaDeposito);
  const baseMulta = arredondar(saldoFgtsInformado + fgtsRescisao);
  const percentualMulta = tipo.fgts.multa;
  const multa = arredondar(baseMulta * percentualMulta);

  const totalDescontos = arredondar(descontos.reduce((s, d) => s + d.valor, 0));
  const totalProventos = arredondar(totalProventosBrutos);

  return {
    erros: [],
    contexto: {
      remuneracao,
      medias: arredondar(medias),
      anos,
      tipoAviso,
      diasAvisoLegais,
      diasAvisoDevidos,
      ultimoDiaTrabalhado,
      dataProjetada,
      avos13,
      avosFerias,
      periodosVencidos,
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
      seguroDesemprego: tipo.fgts.seguroDesemprego,
    },
    totais: {
      proventos: totalProventos,
      descontos: totalDescontos,
      liquido: arredondar(totalProventos - totalDescontos),
    },
  };
}
