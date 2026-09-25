/**
 * Tábuas Completas de Mortalidade do IBGE — Brasil, 2024.
 *
 * Fonte: IBGE, Diretoria de Pesquisas (DPE), Coordenação de População e
 * Indicadores Sociais (COPIS), divulgadas em novembro de 2025. Coluna E(X):
 * expectativa de vida à idade exata X, em anos, nas três tábuas publicadas —
 * homens, mulheres e ambos os sexos. A posição no vetor é a idade; a última
 * (90) é o grupo aberto "90 ou mais".
 *
 * É a tábua que a jurisprudência usa para fixar o termo final da pensão paga
 * de uma vez (art. 950, parágrafo único, do CC): a vítima receberia até
 * completar a sua expectativa de sobrevida. A tábua do sexo da vítima é a
 * mais precisa — aos 34 anos, a sobrevida de um homem é de 42,66 anos, a de
 * uma mulher, 47,75; a geral fica entre as duas. Consulta-se pela idade em
 * anos completos, como a própria tábua é publicada.
 *
 * Ao trocar de ano (o IBGE publica as tábuas em novembro), troque os três
 * vetores e o `ano` — os testes conferem valores de referência.
 */

export const TABUA_IBGE = {
  ano: 2024,
  fonte: 'IBGE, Tábuas Completas de Mortalidade para o Brasil — 2024',
  tabuas: {
    homem: [
      73.3081, 73.2907, 72.3478, 71.3929, 70.4286, 69.4572, 68.4802, 67.4993, 66.5156, 65.5300, // 0–9
      64.5435, 63.5570, 62.5717, 61.5890, 60.6110, 59.6407, 58.6822, 57.7398, 56.8163, 55.9115, // 10–19
      55.0210, 54.1390, 53.2602, 52.3815, 51.5022, 50.6225, 49.7428, 48.8633, 47.9833, 47.1019, // 20–29
      46.2181, 45.3315, 44.4423, 43.5508, 42.6580, 41.7649, 40.8725, 39.9816, 39.0930, 38.2071, // 30–39
      37.3244, 36.4451, 35.5692, 34.6969, 33.8284, 32.9636, 32.1030, 31.2470, 30.3961, 29.5511, // 40–49
      28.7129, 27.8821, 27.0596, 26.2459, 25.4413, 24.6461, 23.8601, 23.0832, 22.3149, 21.5551, // 50–59
      20.8037, 20.0614, 19.3295, 18.6098, 17.9042, 17.2144, 16.5406, 15.8817, 15.2353, 14.5982, // 60–69
      13.9675, 13.3419, 12.7221, 12.1107, 11.5116, 10.9283, 10.3636, 9.8183, 9.2911, 8.7799, // 70–79
      8.2829, 7.7998, 7.3335, 6.8893, 6.4731, 6.0907, 5.7437, 5.4288, 5.1373, 4.8566, // 80–89
      4.5746, // 90 ou mais
    ],
    mulher: [
      79.8691, 79.7734, 78.8299, 77.8736, 76.9075, 75.9343, 74.9558, 73.9738, 72.9893, 72.0034, // 0–9
      71.0168, 70.0301, 69.0438, 68.0585, 67.0748, 66.0930, 65.1135, 64.1366, 63.1621, 62.1899, // 10–19
      61.2195, 60.2504, 59.2823, 58.3152, 57.3489, 56.3836, 55.4193, 54.4562, 53.4943, 52.5335, // 20–29
      51.5739, 50.6154, 49.6580, 48.7020, 47.7474, 46.7944, 45.8434, 44.8946, 43.9486, 43.0055, // 30–39
      42.0658, 41.1297, 40.1973, 39.2685, 38.3434, 37.4217, 36.5034, 35.5885, 34.6774, 33.7704, // 40–49
      32.8679, 31.9703, 31.0781, 30.1915, 29.3107, 28.4359, 27.5671, 26.7044, 25.8478, 24.9976, // 50–59
      24.1542, 23.3182, 22.4909, 21.6736, 20.8675, 20.0737, 19.2922, 18.5220, 17.7612, 17.0075, // 60–69
      16.2590, 15.5152, 14.7778, 14.0498, 13.3356, 12.6398, 11.9662, 11.3170, 10.6923, 10.0904, // 70–79
      9.5097, 8.9493, 8.4115, 7.9007, 7.4229, 6.9842, 6.5872, 6.2304, 5.9071, 5.6065, // 80–89
      5.3184, // 90 ou mais
    ],
    ambos: [
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
  },
};

/** Sexos com tábua própria, na ordem da tela. */
export const SEXOS = [
  { valor: 'mulher', label: 'Mulher', tabua: 'mulheres' },
  { valor: 'homem', label: 'Homem', tabua: 'homens' },
  { valor: 'ambos', label: 'Não informar — tábua de ambos os sexos', tabua: 'ambos os sexos' },
];

export const sexoPorValor = (valor) => SEXOS.find((s) => s.valor === valor) ?? null;

/** Idade do grupo aberto das tábuas ("90 ou mais"). */
export const IDADE_ABERTA = TABUA_IBGE.tabuas.ambos.length - 1;

/** Expectativa de vida ao nascer, E(0), da tábua do sexo. */
export const expectativaAoNascer = (sexo) => TABUA_IBGE.tabuas[sexo]?.[0] ?? null;

/**
 * Expectativa de sobrevida numa idade em anos completos, na tábua do sexo.
 * @returns {{idade: number, anos: number, grupoAberto: boolean, sexo: string, tabua: string}|null}
 */
export function sobrevidaNaIdade(idade, sexo) {
  const tabua = TABUA_IBGE.tabuas[sexo];
  if (!tabua) return null;
  const inteira = Math.max(0, Math.floor(idade));
  return {
    idade: inteira,
    anos: tabua[Math.min(inteira, IDADE_ABERTA)],
    grupoAberto: inteira >= IDADE_ABERTA,
    sexo,
    tabua: sexoPorValor(sexo).tabua,
  };
}
