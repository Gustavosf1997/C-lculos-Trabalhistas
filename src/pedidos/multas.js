/**
 * Multas dos arts. 477 e 467 da CLT.
 *
 * Art. 477, §6º e §8º: as verbas rescisórias devem ser pagas em até dez dias
 * contados do término do contrato. Fora do prazo, é devida multa em favor do
 * empregado equivalente ao seu salário — salvo quando ele mesmo deu causa à
 * mora.
 *
 * Art. 467: as verbas rescisórias incontroversas não pagas até a primeira
 * audiência são acrescidas de 50%.
 */

import { parseData, formatarData, diasEntre } from '../calculo.js';
import { moeda } from '../formato.js';
import { arredondar, num, resultadoComErros } from './comum.js';

/** Prazo do art. 477, §6º, da CLT. */
export const PRAZO_477_DIAS = 10;

export function calcularMultas(dados) {
  const erros = [];
  const pede477 = Boolean(dados.multa477);
  const pede467 = Boolean(dados.multa467);

  const salario = num(dados.salarioBase);
  const rescisao = parseData(dados.dataRescisao);
  const pagamento = parseData(dados.dataPagamento);
  const incontroverso = num(dados.valorIncontroverso);

  if (!pede477 && !pede467) erros.push('Escolha ao menos uma das multas.');
  if (pede477) {
    if (salario <= 0) erros.push('Informe o salário do empregado para a multa do art. 477.');
    if (!rescisao) erros.push('Informe a data do término do contrato.');
  }
  if (pede467 && incontroverso <= 0) {
    erros.push('Informe o valor das verbas rescisórias incontroversas.');
  }
  if (erros.length) return resultadoComErros(erros);

  const alertas = [];
  const itens = [];
  let prazo = null;
  let diasAtraso = 0;

  if (pede477) {
    prazo = new Date(rescisao.getTime() + PRAZO_477_DIAS * 86400000);
    const naoPago = !pagamento;
    diasAtraso = pagamento ? Math.max(0, diasEntre(prazo, pagamento) - 1) : 0;
    const foraDoPrazo = naoPago || diasAtraso > 0;

    if (foraDoPrazo) {
      itens.push({
        chave: 'multa_477',
        label: 'Multa do art. 477, §8º, da CLT',
        detalhe: naoPago
          ? `Sem pagamento comprovado; prazo venceu em ${formatarData(prazo)}`
          : `${diasAtraso} dia(s) de atraso — prazo venceu em ${formatarData(prazo)}`,
        valor: arredondar(salario),
      });
    } else {
      alertas.push(
        `As verbas foram pagas em ${formatarData(pagamento)}, dentro do prazo de `
          + `${PRAZO_477_DIAS} dias que venceu em ${formatarData(prazo)}. A multa do art. 477 não é devida.`,
      );
    }

    if (dados.moraDoEmpregado) {
      alertas.push(
        'Marcado que o empregado deu causa à mora: o art. 477, §8º, afasta a multa nessa hipótese.',
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
      incontroverso: arredondar(incontroverso),
    },
    mensais: [],
    periodo: itens,
    fgts: null,
    totais: { mensal: 0, periodo: total, fgts: 0, geral: total },
  };
}
