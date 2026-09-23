/**
 * Multas dos arts. 477 e 467 da CLT.
 *
 * Art. 477, §6º e §8º: as verbas rescisórias devem ser pagas em até dez dias
 * contados do término do contrato. Fora do prazo, é devida multa em favor do
 * empregado — salvo quando ele mesmo deu causa à mora.
 *
 * A multa equivale a **um mês de remuneração**, e não ao salário base: o TST
 * fixou a tese no Tema 142 de recursos repetitivos, mandando observar a
 * remuneração dos arts. 457, §1º, e 458 da CLT. Por isso a tela pede o salário
 * e as parcelas salariais habituais em separado, e soma as duas.
 *
 * Art. 467: as verbas rescisórias incontroversas não pagas até a primeira
 * audiência são acrescidas de 50%.
 *
 * As duas nascem com a rescisão, de modo que só o biênio as alcança: o
 * quinquênio contado do ajuizamento nunca chega antes dele. O biênio corre do
 * fim do aviso, projetado quando indenizado (OJ 83 da SDI-1).
 */

import { parseData, formatarData, diasEntre } from '../calculo.js';
import { moeda } from '../formato.js';
import { arredondar, num, resultadoComErros, resultadoImpedido } from './comum.js';
import { apurarBienal, descreverPrescricao } from '../prescricao.js';

/** Prazo do art. 477, §6º, da CLT. */
export const PRAZO_477_DIAS = 10;

export function calcularMultas(dados) {
  const erros = [];
  const pede477 = Boolean(dados.multa477);
  const pede467 = Boolean(dados.multa467);

  const salario = num(dados.salarioBase);
  const parcelasHabituais = num(dados.outrasParcelas);
  const remuneracao = arredondar(salario + parcelasHabituais);
  const rescisao = parseData(dados.dataRescisao);
  const pagamento = parseData(dados.dataPagamento);
  const incontroverso = num(dados.valorIncontroverso);

  // Biênio primeiro: é fato impeditivo, e as datas bastam para apurá-lo. Só
  // depois se pedem os valores — de uma multa prescrita, nenhum serve. Corre
  // do fim do aviso projetado, se houve; senão, do término (OJ 83 da SDI-1).
  const fimDoContrato = parseData(dados.dataFimAviso) ?? rescisao;
  const ajuizamento = parseData(dados.dataAjuizamento);
  const bienal = apurarBienal(fimDoContrato, ajuizamento, dados.dataReferencia);
  if (bienal.impedimento) return resultadoImpedido(bienal.impedimento);

  if (!pede477 && !pede467) erros.push('Escolha ao menos uma das multas.');
  if (pede477) {
    if (salario <= 0) erros.push('Informe o salário do empregado para a multa do art. 477.');
    if (!rescisao) erros.push('Informe a data do término do contrato.');
  }
  if (pede467 && incontroverso <= 0) {
    erros.push('Informe o valor das verbas rescisórias incontroversas.');
  }
  if (erros.length) return resultadoComErros(erros, bienal);

  const alertas = bienal.alerta ? [bienal.alerta] : [];
  if (ajuizamento && !fimDoContrato) {
    alertas.push('Informe o término do contrato para apurar a prescrição bienal.');
  }
  const itens = [];
  let prazo = null;
  let diasAtraso = 0;

  if (pede477) {
    prazo = new Date(rescisao.getTime() + PRAZO_477_DIAS * 86400000);
    const naoPago = !pagamento;
    diasAtraso = pagamento ? Math.max(0, diasEntre(prazo, pagamento) - 1) : 0;
    const foraDoPrazo = naoPago || diasAtraso > 0;
    // A parte final do §8º exclui a multa quando o próprio empregado deu causa
    // à mora: aí não há o que cobrar, e não apenas o que avisar.
    const culpaDoEmpregado = Boolean(dados.moraDoEmpregado);

    if (culpaDoEmpregado) {
      alertas.push(
        'Marcado que o empregado deu causa à mora: a parte final do art. 477, §8º, afasta a multa, '
          + 'que por isso não foi incluída no cálculo.',
      );
    } else if (foraDoPrazo) {
      itens.push({
        chave: 'multa_477',
        label: 'Multa do art. 477, §8º, da CLT',
        detalhe: `${naoPago
          ? `Sem pagamento comprovado; prazo venceu em ${formatarData(prazo)}`
          : `${diasAtraso} dia(s) de atraso — prazo venceu em ${formatarData(prazo)}`
        } · uma remuneração (Tema 142 do TST)`,
        valor: remuneracao,
      });
    } else {
      alertas.push(
        `As verbas foram pagas em ${formatarData(pagamento)}, dentro do prazo de `
          + `${PRAZO_477_DIAS} dias que venceu em ${formatarData(prazo)}. A multa do art. 477 não é devida.`,
      );
    }
  }

  if (pede467) {
    itens.push({
      chave: 'multa_467',
      label: 'Multa do art. 467 da CLT',
      detalhe: `50% sobre ${moeda.format(incontroverso)} de verbas incontroversas`,
      valor: arredondar(incontroverso * 0.5),
    });
  }

  const total = arredondar(itens.reduce((soma, i) => soma + i.valor, 0));

  return {
    erros: [],
    alertas,
    impedimento: null,
    recorte: null,
    contexto: {
      semPeriodo: true,
      rescisao,
      pagamento,
      prazo,
      diasAtraso,
      salario: arredondar(salario),
      parcelasHabituais: arredondar(parcelasHabituais),
      remuneracao,
      incontroverso: arredondar(incontroverso),
      prescricao: fimDoContrato
        ? descreverPrescricao({ ajuizamento, limite: bienal.limite, marco: null })
        : null,
    },
    mensais: [],
    periodo: itens,
    fgts: null,
    totais: { mensal: 0, periodo: total, fgts: 0, geral: total },
  };
}
