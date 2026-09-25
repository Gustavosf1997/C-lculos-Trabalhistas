/**
 * Tábua Completa de Mortalidade do IBGE — Brasil, ambos os sexos, 2024.
 *
 * Fonte: IBGE, Diretoria de Pesquisas (DPE), Coordenação de População e
 * Indicadores Sociais (COPIS), divulgada em novembro de 2025. Coluna E(X):
 * expectativa de vida à idade exata X, em anos. A posição no vetor é a idade;
 * a última (90) é o grupo aberto "90 ou mais".
 *
 * É a tábua que a jurisprudência usa para fixar o termo final da pensão paga
 * de uma vez (art. 950, parágrafo único, do CC): a vítima receberia até
 * completar a sua expectativa de sobrevida. Consulta-se pela idade em anos
 * completos, como a própria tábua é publicada.
 *
 * Ao trocar de tábua (o IBGE publica uma por ano, sempre em novembro), troque
 * o vetor inteiro e o `ano` — os testes conferem valores de referência.
 */

export const TABUA_IBGE = {
  ano: 2024,
  populacao: 'ambos os sexos',
  fonte: 'IBGE, Tábua Completa de Mortalidade para o Brasil — 2024',
  expectativa: [
    76.6079, 76.5568, 75.6135, 74.6580, 73.6932, 72.7212, 71.7438, 70.7625, 69.7785, 68.7927, // 0–9
    67.8060, 66.8192, 65.8333, 64.8494, 63.8689, 62.8938, 61.9263, 60.9687, 60.0220, 59.0858, // 10–19
    58.1578, 57.2351, 56.3148, 55.3954, 54.4762, 53.5571, 52.6383, 51.7198, 50.8012, 49.8822, // 20–29
    48.9624, 48.0417, 47.1202, 46.1982, 45.2762, 44.3548, 43.4346, 42.5163, 41.6005, 40.6875, // 30–39
    39.7777, 38.8713, 37.9686, 37.0695, 36.1740, 35.2821, 34.3941, 33.5101, 32.6305, 31.7560, // 40–49
    30.8872, 30.0246, 29.1689, 28.3204, 27.4794, 26.6460, 25.8203, 25.0021, 24.1912, 23.3876, // 50–59
    22.5916, 21.8038, 21.0255, 20.2582, 19.5036, 18.7629, 18.0363, 17.3228, 16.6200, 15.9251, // 60–69
    15.2356, 14.5506, 13.8714, 13.2009, 12.5433, 11.9028, 11.2826, 10.6843, 10.1070, 9.5490, // 70–79
    9.0083, 8.4847, 7.9807, 7.5014, 7.0530, 6.6417, 6.2698, 5.9346, 5.6282, 5.3384, // 80–89
    5.0538, // 90 ou mais
  ],
};

/** Idade do grupo aberto da tábua ("90 ou mais"). */
export const IDADE_ABERTA = TABUA_IBGE.expectativa.length - 1;

/** Expectativa de vida ao nascer: E(0). */
export const EXPECTATIVA_AO_NASCER = TABUA_IBGE.expectativa[0];

/**
 * Expectativa de sobrevida numa idade em anos completos.
 * @returns {{idade: number, anos: number, grupoAberto: boolean}}
 */
export function sobrevidaNaIdade(idade) {
  const inteira = Math.max(0, Math.floor(idade));
  const linha = Math.min(inteira, IDADE_ABERTA);
  return { idade: inteira, anos: TABUA_IBGE.expectativa[linha], grupoAberto: inteira >= IDADE_ABERTA };
}
