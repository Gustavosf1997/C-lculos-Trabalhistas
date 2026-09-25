/**
 * Indenização por acidente do trabalho ou doença ocupacional.
 *
 * Três passos, cada um com a sua fonte:
 *
 * 1. **Quanto da capacidade se perdeu.** Pela tabela DPVAT (anexo da Lei
 *    6.194/74), escolhendo a lesão e a repercussão; pelo qualificador da CIF
 *    que o perito fixou; ou pelo percentual do laudo. Lesões distintas somam
 *    os seus percentuais, até 100%.
 *
 * 2. **Danos materiais — pensão (art. 950 do CC).** Corresponde à
 *    depreciação sofrida: a última remuneração vezes o percentual da perda —
 *    ou a remuneração inteira, se a vítima ficou inabilitada para o ofício que
 *    exercia, ainda que possa fazer outro. O TST inclui 13º e terço de férias
 *    (restituição integral, art. 944 do CC) e exclui o FGTS. Paga de uma vez
 *    (parágrafo único do art. 950), as parcelas futuras sofrem desconto pela
 *    antecipação: a 1ª Turma do TST usa a fórmula do valor presente a 0,5% ao
 *    mês; outras aplicam deságio fixo de 20% a 30%. O termo final é a
 *    expectativa de vida da tábua do IBGE.
 *
 * 3. **Danos extrapatrimoniais (art. 223-G da CLT).** Múltiplos do último
 *    salário contratual, conforme a natureza da ofensa. O STF tomou as faixas
 *    como orientativas (ADIs 6050, 6069 e 6082), não como teto. O dano
 *    estético se cumula com o moral (Súmula 387 do STJ).
 *
 * A prescrição é a trabalhista (art. 7º, XXIX, da CF), contada da ciência
 * inequívoca da incapacidade (Súmula 278 do STJ) — a pretensão nasce inteira
 * nesse dia, então prescreve inteira: não há parcelas a recortar. Para
 * ciência anterior à EC 45/2004, o TST aplica o Código Civil, e o cálculo só
 * avisa.
 */

import { parseData, formatarData, anosCompletos } from '../calculo.js';
import { moeda } from '../formato.js';
import { arredondar, num, contarPeriodo, resultadoComErros, resultadoImpedido } from './comum.js';
import { apurarBienal, dataDaPrescricao } from '../prescricao.js';
import {
  TETO_DPVAT, lesaoPorId, eLesaoTotal, REPERCUSSOES, repercussaoPorValor,
  qualificadorPorCodigo, classificarCIF, descreverCIF, naturezaPorValor, naturezaSugerida, QUALIFICADORES_CIF,
  TETOS_POR_MEMBRO,
} from './tabelas-acidente.js';
import { TABUA_IBGE, expectativaAoNascer, sobrevidaNaIdade, sexoPorValor } from './tabua-ibge.js';

/** Ciência a partir desta data: prescrição trabalhista (EC 45/2004, de 31/12/2004). */
export const MARCO_EC_45 = '2005-01-01';

/** Juros mensais da fórmula do valor presente (1ª Turma do TST). */
export const TAXA_VALOR_PRESENTE = 0.5;

/** Deságio fixo: o meio da faixa de 20% a 30% que o TST admite. */
export const DESAGIO_PADRAO = 25;


const UM_DIA = 86400000;
const menosUmDia = (data) => new Date(data.getTime() - UM_DIA);
const maior = (a, b) => (a > b ? a : b);
const menor = (a, b) => (a < b ? a : b);
/** Número sem zeros à direita: 12,5 e não 12,50; 468 e não 468,00. */
const curto = (valor) => Number(valor).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const pct = (valor) => `${curto(valor)}%`;

const somarAnos = (data, anos) =>
  new Date(Date.UTC(data.getUTCFullYear() + anos, data.getUTCMonth(), data.getUTCDate()));

/** Soma anos com fração ("76,6 anos"): os inteiros pelo calendário, a fração em dias. */
function somarAnosFracionados(data, anos) {
  const inteiros = Math.floor(anos);
  const base = somarAnos(data, inteiros);
  return new Date(base.getTime() + Math.round((anos - inteiros) * 365.25) * UM_DIA);
}

/* --------------------------------------------------------- prescrição --- */

/**
 * Biênio e quinquênio da pretensão acidentária.
 *
 * O biênio corre do fim do contrato — ou da ciência, se ela só veio depois
 * (a doença que se revela após a dispensa): antes dela não havia pretensão a
 * exercer. O quinquênio corre da ciência. Vale o que vencer primeiro.
 */
function apurarPrescricaoAcidentaria(dados) {
  const ciencia = parseData(dados.dataCiencia);
  const extincao = parseData(dados.dataExtincao);
  const ajuizamento = parseData(dados.dataAjuizamento);
  const hoje = dataDaPrescricao(dados.dataReferencia);
  const vazio = { impedimento: null, alertas: [], descricao: null };

  if (ciencia && ciencia < parseData(MARCO_EC_45)) {
    return {
      ...vazio,
      descricao: 'regras do Código Civil (ciência anterior à EC 45/2004)',
      alertas: [
        `A ciência da incapacidade (${formatarData(ciencia)}) é anterior à EC 45/2004. Nesse caso o TST `
          + 'aplica a prescrição do Código Civil, com a regra de transição do art. 2.028, e não a do '
          + 'art. 7º, XXIX, da CF. Confira o prazo à parte: o cálculo não o apura.',
      ],
    };
  }

  const cienciaDepois = Boolean(ciencia && extincao && ciencia > extincao);
  const bienal = apurarBienal(cienciaDepois ? ciencia : extincao, ajuizamento, hoje);
  const limiteQuinquenal = ciencia ? somarAnos(ciencia, 5) : null;

  if (bienal.impedimento) {
    return {
      ...vazio,
      impedimento: cienciaDepois
        ? {
          ...bienal.impedimento,
          mensagem: `A ciência da incapacidade veio em ${formatarData(ciencia)}, depois do fim do contrato, `
            + `e é dela que corre o biênio (Súmula 278 do STJ), encerrado em ${formatarData(bienal.limite)}. `
            + `A ação só foi ajuizada em ${formatarData(ajuizamento)}: a pretensão está prescrita `
            + '(art. 7º, XXIX, da CF).',
        }
        : bienal.impedimento,
    };
  }

  if (ajuizamento && limiteQuinquenal && ajuizamento > limiteQuinquenal) {
    return {
      ...vazio,
      impedimento: {
        integral: true,
        marco: limiteQuinquenal,
        titulo: 'Pretensão atingida pela prescrição quinquenal',
        mensagem: `A ciência inequívoca da incapacidade se deu em ${formatarData(ciencia)} (Súmula 278 do `
          + `STJ) e a ação só foi ajuizada em ${formatarData(ajuizamento)}, depois dos cinco anos que se `
          + `encerraram em ${formatarData(limiteQuinquenal)} (art. 7º, XXIX, da CF). A pretensão `
          + 'indenizatória nasce inteira com a ciência, e por isso prescreve inteira.',
      },
    };
  }

  const limites = [bienal.limite, limiteQuinquenal].filter(Boolean);
  const prazo = limites.length ? limites.reduce(menor) : null;
  const alertas = [];
  if (!ajuizamento && prazo && hoje && hoje > prazo) {
    // O biênio vencido já vem avisado pelo `apurarBienal`; o quinquênio, não.
    if (bienal.alerta) alertas.push(bienal.alerta);
    else {
      alertas.push(`O prazo de cinco anos contado da ciência da incapacidade terminou em `
        + `${formatarData(limiteQuinquenal)}. Se a ação ainda não foi proposta, a pretensão está prescrita `
        + '(art. 7º, XXIX, da CF). Informe a data do ajuizamento para apurar.');
    }
  }
  if (cienciaDepois) {
    alertas.push(`A ciência da incapacidade (${formatarData(ciencia)}) é posterior ao fim do contrato: `
      + 'o biênio corre dela, e não da extinção (Súmula 278 do STJ).');
  }

  let descricao = null;
  if (prazo) {
    descricao = ajuizamento
      ? `ação ajuizada em ${formatarData(ajuizamento)}, dentro do prazo que ia até ${formatarData(prazo)}`
      : `ajuizar até ${formatarData(prazo)} · informe o ajuizamento para apurar`;
    // Só com o biênio, o quinquênio fica por apurar: ele corre da ciência.
    if (!ciencia) descricao += ' · informe a ciência da incapacidade para apurar o quinquênio';
  } else if (ajuizamento) {
    descricao = 'informe a data da ciência da incapacidade para apurar';
  }

  return { impedimento: null, alertas, descricao };
}

/* ------------------------------------------------- percentual da perda --- */

/** Lesões escolhidas na tabela, respeitando o que a tela mostra. */
function lesoesEscolhidas(dados) {
  const ids = [dados.lesao1];
  // A segunda e a terceira só valem enquanto visíveis: uma escolha feita e
  // depois escondida (voltando a segunda para "nenhuma") não pode contar.
  if (dados.lesao2 && dados.lesao2 !== 'nenhuma') {
    ids.push(dados.lesao2);
    if (dados.lesao3 && dados.lesao3 !== 'nenhuma') ids.push(dados.lesao3);
  }
  return ids.map((id, i) => ({
    lesao: lesaoPorId(id),
    grau: dados[`grau${i + 1}`],
    lado: dados[`lado${i + 1}`] === 'esquerdo' ? 'esquerdo' : 'direito',
  })).filter((e) => e.lesao);
}

/**
 * Soma as lesões respeitando o teto de cada membro: o pé não passa de 50%, e
 * o braço ou a perna, de 70% — a perda total deles na tabela. Lesões de lados
 * diferentes não se somam para esse fim; as que não são de membro entram
 * inteiras. O total geral ainda se limita a 100%, fora daqui.
 *
 * @returns {{soma: number, ajustes: string[]}}
 */
function somarComTetos(lesoes) {
  const ajustes = [];
  const limitar = (valor, { teto, nome }, lado) => {
    if (valor <= teto + 1e-9) return valor;
    ajustes.push(`As lesões do ${nome} ${lado} somam ${pct(valor)}, mais que a perda total dele (${teto}%): `
      + `valem ${teto}%. Lesões no mesmo membro não passam da perda do membro inteiro (regra da tabela da `
      + 'Circular SUSEP 29/91, da qual a do DPVAT descende).');
    return teto;
  };

  let soma = 0;
  const porMembro = new Map();
  for (const l of lesoes) {
    if (!l.membro) {
      soma += l.percentual;
      continue;
    }
    const chave = `${l.membro}:${l.lado}`;
    const grupo = porMembro.get(chave) ?? { membro: l.membro, lado: l.lado, pe: 0, resto: 0 };
    if (l.segmento === 'pe') grupo.pe += l.percentual;
    else grupo.resto += l.percentual;
    porMembro.set(chave, grupo);
  }
  for (const g of porMembro.values()) {
    const pe = g.pe ? limitar(g.pe, TETOS_POR_MEMBRO.pe, g.lado) : 0;
    soma += limitar(pe + g.resto, TETOS_POR_MEMBRO[g.membro], g.lado);
  }
  return { soma, ajustes };
}

function apurarPercentual(dados, erros, alertas) {
  const criterio = dados.criterio ?? 'dpvat';

  if (criterio === 'laudo') {
    const percentual = num(dados.percentualLaudo);
    if (percentual <= 0) erros.push('Informe o percentual de perda fixado no laudo.');
    return { criterio, percentual: Math.min(100, percentual), lesoes: [], origem: 'Percentual fixado no laudo' };
  }

  if (criterio === 'cif') {
    // O percentual do laudo, quando há, manda: é ele que diz em que faixa a
    // perda está, e o qualificador o acompanha (a tela troca a escolha
    // sozinha). Abaixo de 5%, a CIF não vê deficiência — qualificador 0.
    const informado = num(dados.percentualCif);
    if (informado > 0 && informado < QUALIFICADORES_CIF[1].de) {
      erros.push(`Abaixo de ${QUALIFICADORES_CIF[1].de}%, a CIF classifica a perda como nenhuma deficiência `
        + '(qualificador 0). Para estimar uma perda menor, use o critério "Percentual do laudo".');
      return { criterio, percentual: 0, lesoes: [], origem: 'Qualificador da CIF' };
    }
    const escolhido = qualificadorPorCodigo(dados.qualificadorCif);
    const q = informado > 0 ? classificarCIF(informado) : escolhido;
    if (!q || q.codigo === 0) {
      erros.push('Escolha o qualificador da CIF fixado na perícia.');
      return { criterio, percentual: 0, lesoes: [], origem: 'Qualificador da CIF' };
    }
    if (informado > 0 && escolhido && escolhido.codigo !== q.codigo) {
      alertas.push(`${pct(informado)} está na faixa do qualificador ${q.codigo} da CIF (${q.nome}, `
        + `${q.de}% a ${q.ate}%), e não na do ${escolhido.codigo}: o enquadramento segue o percentual.`);
    }
    const percentual = informado > 0 ? informado : (q.de + q.ate) / 2;
    if (!(informado > 0)) {
      alertas.push(`Sem percentual no laudo, a estimativa usa o meio da faixa do qualificador ${q.codigo} `
        + `da CIF (${q.de}% a ${q.ate}%): ${pct(percentual)}. Se o perito fixou um número, informe-o.`);
    }
    return { criterio, percentual, lesoes: [], origem: `Qualificador ${q.codigo} da CIF (${q.nome})` };
  }

  const escolhidas = lesoesEscolhidas(dados);
  if (!escolhidas.length) {
    erros.push('Escolha a lesão na tabela DPVAT.');
    return { criterio: 'dpvat', percentual: 0, lesoes: [], origem: 'Tabela DPVAT' };
  }

  const lesoes = escolhidas.map(({ lesao, grau, lado }) => {
    const total = eLesaoTotal(lesao.id);
    // A invalidez total não se gradua: a lei só subdivide a parcial.
    const repercussao = total ? REPERCUSSOES[0] : repercussaoPorValor(grau) ?? REPERCUSSOES[0];
    const percentual = (lesao.percentual * repercussao.fator) / 100;
    const conta = repercussao.fator === 100
      ? `${lesao.percentual}%`
      : `${lesao.percentual}% x ${repercussao.fator}% (repercussão ${repercussao.nome}) = ${pct(percentual)}`;
    return {
      ...lesao,
      lado: lesao.membro ? lado : null,
      nome: lesao.membro ? `${lesao.nome}, lado ${lado}` : lesao.nome,
      repercussao,
      percentual,
      conta,
    };
  });

  const { soma, ajustes } = somarComTetos(lesoes);
  alertas.push(...ajustes);
  if (soma > 100 + 1e-9) {
    alertas.push(`As lesões somam ${pct(soma)}; a perda fica limitada a 100% (tabela da Circular SUSEP 29/91).`);
  }
  return {
    criterio: 'dpvat',
    percentual: Math.min(100, arredondar(soma)),
    lesoes,
    tetoPorMembro: ajustes.length > 0,
    origem: 'Tabela DPVAT (anexo da Lei 6.194/74)',
  };
}

/* --------------------------------------------------------------- pensão --- */

/**
 * Valor presente de `n` prestações mensais iguais, descontadas a `taxa` ao
 * mês — a fórmula da quitação antecipada de um financiamento, que a 1ª Turma
 * do TST adotou para a pensão paga de uma vez: VP = P x [1 - (1 + i)^-n] / i.
 */
export function valorPresente(prestacao, meses, taxaMensal) {
  if (meses <= 0) return 0;
  if (taxaMensal <= 0) return prestacao * meses;
  return (prestacao * (1 - (1 + taxaMensal) ** -meses)) / taxaMensal;
}

function apurarPensao(dados, { remuneracao, percentual, ajuizamento }, erros, alertas) {
  const inicio = parseData(dados.dataCiencia);
  if (!inicio) erros.push('Informe a data da ciência da incapacidade: é dela que a pensão é devida.');

  const unica = (dados.formaPensao ?? 'unica') === 'unica';
  const porIdade = unica && dados.termoFinal === 'idade';
  const porSobrevida = unica && !porIdade;

  // O sexo escolhe a tábua do IBGE: homens e mulheres têm expectativas bem
  // diferentes (aos 34 anos, 42,66 e 47,75), e a de ambos os sexos fica entre
  // elas. Sem ele, nada se consulta na tábua.
  const sexo = sexoPorValor(dados.sexo) ? dados.sexo : null;
  const nomeDaTabua = sexo ? sexoPorValor(sexo).tabua : null;

  const nascimento = parseData(dados.dataNascimento);
  if (nascimento && inicio && nascimento >= inicio) {
    erros.push('A data de nascimento deve ser anterior à da ciência da incapacidade.');
  }
  const idadeNaCiencia = nascimento && inicio && nascimento < inicio ? anosCompletos(nascimento, inicio) : null;

  // A sobrevida sai da tábua do IBGE, na idade da vítima quando a pensão
  // começa. O número digitado prevalece — outra tábua, de outro ano —, mas só
  // enquanto o campo está à vista: escondido, é resto de uma escolha anterior.
  // O mesmo vale para a idade final, que em branco é a expectativa ao nascer.
  const tabua = idadeNaCiencia !== null && sexo ? sobrevidaNaIdade(idadeNaCiencia, sexo) : null;
  const informada = porSobrevida ? num(dados.sobrevida) : 0;
  const sobrevida = informada > 0 ? informada : tabua?.anos ?? 0;
  const idadeFinalInformada = porIdade ? num(dados.idadeFinal) : 0;
  const idadeFinal = idadeFinalInformada > 0 ? idadeFinalInformada : sexo ? arredondar(expectativaAoNascer(sexo)) : 0;

  const pedeSexo = 'Escolha o sexo da vítima: a tábua do IBGE traz uma expectativa para homens, outra para '
    + 'mulheres e a geral, de ambos os sexos.';
  let termo = null;
  if (porIdade) {
    if (!nascimento) erros.push('Informe a data de nascimento para contar a idade final da pensão.');
    if (!idadeFinal) erros.push(`${pedeSexo} Ou informe a idade final.`);
    if (nascimento && idadeFinal) termo = somarAnosFracionados(nascimento, idadeFinal);
  } else if (porSobrevida && !(informada > 0)) {
    if (!nascimento) {
      erros.push('Informe a data de nascimento: a expectativa de sobrevida sai da tábua do IBGE, na idade '
        + 'da vítima na data da ciência. Ou digite a sobrevida de outra tábua.');
    }
    if (!sexo) erros.push(`${pedeSexo} Ou digite a sobrevida de outra tábua.`);
    if (tabua && inicio) termo = somarAnosFracionados(inicio, tabua.anos);
  } else if (porSobrevida && inicio) {
    termo = somarAnosFracionados(inicio, informada);
  }
  if (inicio && termo && termo <= inicio) {
    erros.push(`A idade final (${curto(idadeFinal)} anos) já tinha sido alcançada na data da `
      + 'ciência. Use a expectativa de sobrevida da tábua do IBGE para a idade da vítima.');
  }
  if (erros.length) return null;

  if (tabua?.grupoAberto && ((porSobrevida && !(informada > 0)) || !unica)) {
    alertas.push(`Aos ${tabua.idade} anos, a tábua do IBGE (${nomeDaTabua}) só traz o grupo aberto `
      + `"90 ou mais", com sobrevida de ${curto(tabua.anos)} anos.`);
  }
  // Tema 155 do TST (tese vinculante): na parcela única, o termo final é a
  // expectativa de sobrevida da tábua do IBGE do início do pensionamento,
  // conforme o sexo do trabalhador. O que se afastar disso é avisado.
  if (porIdade) {
    alertas.push('Termo final por idade fixa: o Tema 155 do TST manda fixá-lo pela expectativa de sobrevida '
      + 'da tábua do IBGE do início do pensionamento, conforme o sexo — use "Expectativa de sobrevida" '
      + 'para seguir a tese.');
  }
  if (porSobrevida && !(informada > 0) && tabua) {
    if (sexo === 'ambos') {
      alertas.push('Tábua de ambos os sexos: o Tema 155 do TST manda usar a tábua do sexo do trabalhador.');
    }
    if (inicio.getUTCFullYear() !== TABUA_IBGE.ano) {
      alertas.push(`A pensão começa em ${inicio.getUTCFullYear()}, e o Tema 155 do TST manda usar a tábua do `
        + `IBGE do início do pensionamento. A embutida é a de ${TABUA_IBGE.ano}: para seguir a tese à risca, `
        + `digite no campo "Sobrevida de outra tábua" a da tábua de ${inicio.getUTCFullYear()}, `
        + `na idade de ${idadeNaCiencia} anos.`);
    }
  }

  // Idade final abaixo do que a tábua projeta para a vítima: a expectativa ao
  // nascer subestima a de quem já passou da infância, e o erro é comum.
  const idadeProjetada = tabua ? idadeNaCiencia + tabua.anos : null;
  if (porIdade && idadeProjetada && idadeFinal < idadeProjetada - 0.5) {
    alertas.push(`Pela tábua do IBGE de ${TABUA_IBGE.ano} (${nomeDaTabua}), aos ${idadeNaCiencia} anos a `
      + `sobrevida é de ${curto(tabua.anos)} anos: a vítima viveria até os ${curto(idadeProjetada)}, mais que `
      + `a idade final (${curto(idadeFinal)}). A expectativa ao nascer subestima a de quem já passou da `
      + 'infância; o termo pela sobrevida é o que a tábua indica para a idade da vítima.');
  }

  const integral = Boolean(dados.incapacidadeTotalOficio);
  const percentualPensao = integral ? 100 : percentual;
  const com13 = dados.incluir13 !== false;
  const comTerco = dados.incluirTerco !== false;

  // Concausa (Tema 76 do TST, tese vinculante): fixado o percentual da
  // incapacidade, a pensão é reduzida em até 50% — salvo se o laudo indicar o
  // grau de contribuição do trabalho, que então a mede.
  const concausa = Boolean(dados.concausa);
  const contribuicao = concausa ? Math.min(100, num(dados.contribuicaoTrabalho)) : 0;
  const reducao = concausa && !(contribuicao > 0)
    ? Math.min(50, dados.reducaoConcausa === undefined || dados.reducaoConcausa === ''
      ? 50 : num(dados.reducaoConcausa))
    : 0;
  const fatorConcausa = !concausa ? 1 : contribuicao > 0 ? contribuicao / 100 : 1 - reducao / 100;

  const base = (remuneracao * percentualPensao * fatorConcausa) / 100;
  const acrescimos = [com13 && '1/12 de 13º', comTerco && '1/12 do terço de férias'].filter(Boolean);
  const mensal = arredondar(base * (1 + (com13 ? 1 / 12 : 0) + (comTerco ? 1 / 36 : 0)));

  // Vencidas: da ciência até a véspera do cálculo — na inicial, o
  // ajuizamento; depois dele, a data escolhida; sem nada, hoje.
  const corte = parseData(dados.dataCalculo) ?? ajuizamento ?? parseData(dados.dataReferencia);
  const limiteVencidas = termo && corte ? menor(corte, termo) : corte;
  // Os meses entram na conta pela fração exata dos dias; o número de duas
  // casas é só para mostrar. Numa pensão alta, arredondar os meses antes de
  // multiplicar custaria dezenas de reais.
  const periodoVencido = limiteVencidas && limiteVencidas > inicio
    ? contarPeriodo(inicio, menosUmDia(limiteVencidas))
    : { meses: 0, proporcao: 0 };
  const mesesVencidos = periodoVencido.meses;
  const vencidas = arredondar(mensal * periodoVencido.proporcao);

  const contexto = {
    remuneracao, percentualPensao, integral, mensal, acrescimos, inicio, corte, unica, termo,
    concausa: concausa ? { contribuicao, reducao, fator: fatorConcausa } : null,
    mesesVencidos, vencidas, nascimento, idadeNaCiencia,
    idadeFinal: porIdade ? idadeFinal : null,
    idadeFinalDaTabua: porIdade && !(idadeFinalInformada > 0),
    sobrevida: porSobrevida ? sobrevida : null,
    sobrevidaInformada: porSobrevida && informada > 0,
    sexo,
    nomeDaTabua,
    tabua: tabua ? { ...tabua, ano: TABUA_IBGE.ano } : null,
    idadeNoTermo: porIdade ? idadeFinal : porSobrevida && idadeNaCiencia !== null ? idadeNaCiencia + sobrevida : null,
    // Na pensão mensal não há termo, porque ela é vitalícia; a tábua dá só a
    // duração provável, para informação.
    duracaoProvavel: !unica && tabua ? somarAnosFracionados(inicio, tabua.anos) : null,
  };

  if (!unica) {
    // Pensão mensal vitalícia: no valor do pedido entram as vencidas e doze
    // vincendas, por ser obrigação de prazo indeterminado (art. 292, §§1º e
    // 2º, do CPC, c/c art. 840, §1º, da CLT).
    return { ...contexto, mesesVincendos: 12, nominalVincendas: arredondar(mensal * 12), vincendas: arredondar(mensal * 12) };
  }

  const inicioVincendas = corte ? maior(corte, inicio) : inicio;
  const periodoVincendo = termo > inicioVincendas
    ? contarPeriodo(inicioVincendas, menosUmDia(termo))
    : { meses: 0, proporcao: 0 };
  const mesesVincendos = periodoVincendo.meses;
  const n = periodoVincendo.proporcao;
  if (corte && termo <= corte) {
    alertas.push(`O termo final estimado (${formatarData(termo)}) já passou na data do cálculo: todas as `
      + 'parcelas estão vencidas. Como a pensão da vítima é vitalícia, as seguintes continuam devidas mês a mês.');
  }
  if (corte && inicio > corte) {
    alertas.push('A ciência da incapacidade é posterior à data do cálculo: todas as parcelas são vincendas.');
  }

  const nominalVincendas = arredondar(mensal * n);
  const porDesagio = dados.metodoDesconto === 'desagio';
  const taxa = dados.taxaJuros === undefined || dados.taxaJuros === '' ? TAXA_VALOR_PRESENTE : num(dados.taxaJuros);
  const desagio = dados.desagio === undefined || dados.desagio === '' ? DESAGIO_PADRAO : num(dados.desagio);
  const vincendas = porDesagio
    ? arredondar(nominalVincendas * (1 - desagio / 100))
    : arredondar(valorPresente(mensal, n, taxa / 100));
  const desagioEfetivo = nominalVincendas > 0 ? (1 - vincendas / nominalVincendas) * 100 : 0;

  return {
    ...contexto, mesesVincendos, nominalVincendas, vincendas, porDesagio, taxa, desagio, desagioEfetivo,
  };
}

/* ------------------------------------------------------------- cálculo --- */

export function calcularAcidente(dados) {
  const erros = [];
  const alertas = [];

  // Prescrição primeiro: as datas bastam, e de uma pretensão prescrita
  // nenhum valor serve.
  const prescricao = apurarPrescricaoAcidentaria(dados);
  if (prescricao.impedimento) return resultadoImpedido(prescricao.impedimento);
  const comPrescricao = (lista) => ({ ...resultadoComErros(lista), alertas: prescricao.alertas });

  const pedePensao = dados.pedirPensao !== false;
  const pedeMorais = dados.pedirMorais !== false;
  const pedeEsteticos = Boolean(dados.pedirEsteticos);
  const emergentes = num(dados.danosEmergentes);
  if (!pedePensao && !pedeMorais && !pedeEsteticos && emergentes <= 0) {
    return comPrescricao(['Escolha ao menos uma indenização: pensão, danos morais, estéticos ou despesas.']);
  }

  const salario = num(dados.salarioBase);
  const remuneracao = arredondar(salario + num(dados.outrasParcelas));
  if ((pedePensao || pedeMorais || pedeEsteticos) && salario <= 0) {
    erros.push('Informe o último salário contratual da vítima.');
  }

  // O percentual da perda mede a pensão e orienta o dano moral; o estético e
  // as despesas não dependem dele.
  const perda = pedePensao || pedeMorais ? apurarPercentual(dados, erros, alertas) : null;
  const qualificador = perda ? classificarCIF(perda.percentual) : null;

  const multiplicadorEsteticos = num(dados.multiplicadorEsteticos);
  if (pedeEsteticos && multiplicadorEsteticos <= 0) {
    erros.push('Informe em quantos salários estimar o dano estético.');
  }

  const ajuizamento = parseData(dados.dataAjuizamento);
  const pensao = pedePensao && !erros.length
    ? apurarPensao(dados, { remuneracao, percentual: perda.percentual, ajuizamento }, erros, alertas)
    : null;
  if (pedePensao && !pensao && !erros.length) erros.push('Não foi possível apurar a pensão.');
  if (erros.length) return comPrescricao(erros);

  const itens = [];
  if (pensao) {
    if (pensao.concausa) {
      alertas.push(pensao.concausa.contribuicao > 0
        ? `Concausa: a pensão segue o grau de contribuição do trabalho fixado no laudo, `
          + `${pct(pensao.concausa.contribuicao)} (Tema 76 do TST).`
        : `Concausa sem o grau de contribuição no laudo: a pensão foi reduzida em ${pct(pensao.concausa.reducao)} `
          + '(Tema 76 do TST: redução de até 50%). O dano moral não muda — a tese trata só da pensão.');
    }
    if (pensao.integral) {
      alertas.push('Marcada a incapacidade total para o ofício: a pensão corresponde à remuneração inteira '
        + '(art. 950 do CC — "importância do trabalho para que se inabilitou"), ainda que a vítima possa '
        + 'exercer outra atividade. O percentual da tabela segue orientando o dano moral.');
    }
    const periodoVencido = pensao.mesesVencidos > 0
      ? `${curto(pensao.mesesVencidos)} meses de ${moeda.format(pensao.mensal)}, `
        + `de ${formatarData(pensao.inicio)} até a véspera de ${formatarData(pensao.unica && pensao.termo < pensao.corte
          ? pensao.termo : pensao.corte)}`
      : null;
    if (periodoVencido) {
      itens.push({ chave: 'pensao_vencida', label: 'Pensão vencida (art. 950 do CC)', detalhe: periodoVencido,
        valor: pensao.vencidas });
    }
    if (pensao.unica && pensao.mesesVincendos > 0) {
      itens.push({
        chave: 'pensao_vincenda',
        label: 'Pensão vincenda em parcela única (art. 950, parágrafo único, do CC)',
        detalhe: `${curto(pensao.mesesVincendos)} meses de ${moeda.format(pensao.mensal)} = `
          + `${moeda.format(pensao.nominalVincendas)}, ${pensao.porDesagio
            ? `com deságio de ${pct(pensao.desagio)}`
            : `trazidos a valor presente a ${curto(pensao.taxa)}% ao mês`}`,
        valor: pensao.vincendas,
      });
    } else if (!pensao.unica) {
      itens.push({
        chave: 'pensao_vincenda',
        label: 'Pensão mensal vitalícia — 12 parcelas vincendas',
        detalhe: `${moeda.format(pensao.mensal)} por mês; no valor do pedido entram 12 prestações `
          + '(art. 292, §2º, do CPC)',
        valor: pensao.vincendas,
      });
    }
  }

  if (emergentes > 0) {
    itens.push({ chave: 'danos_emergentes', label: 'Despesas com tratamento (danos emergentes)',
      detalhe: 'Art. 949 do CC — valor informado', valor: arredondar(emergentes) });
  }

  let morais = null;
  if (pedeMorais) {
    const escolhida = dados.naturezaOfensa && dados.naturezaOfensa !== 'auto'
      ? naturezaPorValor(dados.naturezaOfensa) : null;
    const natureza = escolhida ?? naturezaSugerida(qualificador);
    const informado = num(dados.multiplicadorMorais);
    const multiplicador = informado > 0 ? informado : natureza.teto;
    if (multiplicador > natureza.teto) {
      alertas.push(`${curto(multiplicador)} salários superam o teto da ofensa de natureza `
        + `${natureza.nome} (${natureza.teto}). O STF admite ir além, fundamentadamente (ADIs 6050, 6069 e 6082).`);
    }
    morais = { natureza, multiplicador, sugerida: !escolhida, peloTeto: !(informado > 0) };
    itens.push({
      chave: 'danos_morais',
      label: 'Danos morais (art. 223-G da CLT)',
      detalhe: `${curto(multiplicador)} x ${moeda.format(salario)} (último salário contratual) — `
        + `ofensa de natureza ${natureza.nome}, art. 223-G, §1º, ${natureza.inciso}`,
      valor: arredondar(salario * multiplicador),
    });
  }

  if (pedeEsteticos) {
    itens.push({
      chave: 'danos_esteticos',
      label: 'Danos estéticos (Súmula 387 do STJ)',
      detalhe: `${curto(multiplicadorEsteticos)} x ${moeda.format(salario)} (último salário contratual)`,
      valor: arredondar(salario * multiplicadorEsteticos),
    });
  }

  const total = arredondar(itens.reduce((soma, i) => soma + i.valor, 0));

  return {
    erros: [],
    alertas: [...prescricao.alertas, ...alertas],
    impedimento: null,
    recorte: null,
    contexto: {
      semPeriodo: true,
      perda,
      qualificador,
      cif: qualificador ? descreverCIF(qualificador) : null,
      referenciaDpvat: perda ? arredondar((TETO_DPVAT * perda.percentual) / 100) : null,
      salario: arredondar(salario),
      pensao,
      morais,
      prescricao: prescricao.descricao,
    },
    mensais: [],
    periodo: itens,
    fgts: null,
    totais: { mensal: 0, periodo: total, fgts: 0, geral: total },
  };
}
