/**
 * Tabelas usadas para medir a lesão num pedido de indenização acidentária.
 *
 * **Tabela DPVAT** — anexo da Lei 6.194/74, na redação da Lei 11.945/2009.
 * Foi feita para o seguro obrigatório, mas é a régua mais usada nos laudos
 * trabalhistas para dizer quanto da capacidade se perdeu. Cada lesão tem um
 * percentual; se a perda do segmento não é completa, o art. 3º, §1º, II, manda
 * reduzi-lo pela repercussão: 75% (intensa), 50% (média), 25% (leve) ou 10%
 * (sequela residual). Os danos totais valem 100% e não se graduam — a lei só
 * subdivide a invalidez parcial.
 *
 * **CIF** — Classificação Internacional de Funcionalidade, Incapacidade e
 * Saúde (OMS, 2001). O qualificador genérico dá a extensão da deficiência em
 * faixas de percentual; é a linguagem que muitos peritos usam no laudo.
 *
 * **Art. 223-G, §1º, da CLT** — faixas do dano extrapatrimonial, em múltiplos
 * do último salário contratual. O STF (ADIs 6050, 6069 e 6082) as declarou
 * constitucionais como critério orientativo: o juiz pode ir além delas.
 */

/** Valor máximo da cobertura por invalidez permanente (art. 3º, II, da Lei 6.194/74). */
export const TETO_DPVAT = 13500;

/** Grupos da tabela, na ordem do anexo. */
export const GRUPOS_DPVAT = [
  { id: 'total', titulo: 'Danos corporais totais — 100%' },
  { id: 'membros', titulo: 'Membros superiores e inferiores' },
  { id: 'outros', titulo: 'Outros órgãos e estruturas' },
];

/**
 * Lesões do anexo. As linhas que a lei agrupa ("ombros, cotovelos, punhos ou
 * dedo polegar") vêm desdobradas, para que a escolha na tela seja direta; o
 * percentual é o da linha original.
 */
export const LESOES_DPVAT = [
  { id: 'ambos_membros', grupo: 'total', percentual: 100,
    nome: 'Perda completa de ambos os membros superiores ou de ambos os inferiores' },
  { id: 'ambas_maos_pes', grupo: 'total', percentual: 100,
    nome: 'Perda completa de ambas as mãos ou de ambos os pés' },
  { id: 'membro_sup_e_inf', grupo: 'total', percentual: 100,
    nome: 'Perda completa de um membro superior e de um membro inferior' },
  { id: 'cegueira', grupo: 'total', percentual: 100,
    nome: 'Perda completa da visão dos dois olhos (cegueira bilateral ou cegueira legal bilateral)' },
  { id: 'neurologica', grupo: 'total', percentual: 100,
    nome: 'Lesão neurológica com dano cognitivo-comportamental alienante, perda de orientação ou de '
      + 'locomoção, perda do controle esfincteriano ou comprometimento de função vital' },
  { id: 'organica_vital', grupo: 'total', percentual: 100,
    nome: 'Lesão de órgão crânio-facial, cervical, torácico, abdominal ou pélvico com prejuízo '
      + 'funcional não compensável e comprometimento de função vital' },

  { id: 'membro_superior', grupo: 'membros', percentual: 70,
    nome: 'Perda completa de um membro superior ou de uma mão' },
  { id: 'membro_inferior', grupo: 'membros', percentual: 70,
    nome: 'Perda completa de um membro inferior' },
  { id: 'pe', grupo: 'membros', percentual: 50, nome: 'Perda completa de um pé' },
  { id: 'ombro', grupo: 'membros', percentual: 25, nome: 'Perda completa da mobilidade de um ombro' },
  { id: 'cotovelo', grupo: 'membros', percentual: 25, nome: 'Perda completa da mobilidade de um cotovelo' },
  { id: 'punho', grupo: 'membros', percentual: 25, nome: 'Perda completa da mobilidade de um punho' },
  { id: 'polegar', grupo: 'membros', percentual: 25, nome: 'Perda completa da mobilidade de um polegar' },
  { id: 'quadril', grupo: 'membros', percentual: 25, nome: 'Perda completa da mobilidade de um quadril' },
  { id: 'joelho', grupo: 'membros', percentual: 25, nome: 'Perda completa da mobilidade de um joelho' },
  { id: 'tornozelo', grupo: 'membros', percentual: 25, nome: 'Perda completa da mobilidade de um tornozelo' },
  { id: 'dedo_mao', grupo: 'membros', percentual: 10,
    nome: 'Perda completa de um dos outros dedos da mão (exceto o polegar)' },
  { id: 'dedo_pe', grupo: 'membros', percentual: 10, nome: 'Perda completa de um dos dedos do pé' },

  { id: 'surdez', grupo: 'outros', percentual: 50, nome: 'Perda auditiva total bilateral (surdez completa)' },
  { id: 'mudez', grupo: 'outros', percentual: 50, nome: 'Perda completa da fonação (mudez)' },
  { id: 'visao_olho', grupo: 'outros', percentual: 50, nome: 'Perda completa da visão de um olho' },
  { id: 'coluna', grupo: 'outros', percentual: 25,
    nome: 'Perda completa da mobilidade de um segmento da coluna vertebral (exceto o sacral)' },
  { id: 'baco', grupo: 'outros', percentual: 10, nome: 'Perda integral do baço (retirada cirúrgica)' },
];

export const lesaoPorId = (id) => LESOES_DPVAT.find((l) => l.id === id) ?? null;

/** Lesões que a lei classifica como invalidez total: não se graduam. */
export const eLesaoTotal = (id) => lesaoPorId(id)?.grupo === 'total';

/**
 * Repercussão da perda (art. 3º, §1º, da Lei 6.194/74): a completa vale o
 * percentual da tabela (inciso I); a incompleta, uma fração dele (inciso II).
 */
export const REPERCUSSOES = [
  { valor: 'completa', nome: 'completa', fator: 100, label: 'Completa — 100% do percentual da tabela' },
  { valor: 'intensa', nome: 'intensa', fator: 75, label: 'Intensa — 75%' },
  { valor: 'media', nome: 'média', fator: 50, label: 'Média — 50%' },
  { valor: 'leve', nome: 'leve', fator: 25, label: 'Leve — 25%' },
  { valor: 'residual', nome: 'residual', fator: 10, label: 'Sequela residual — 10%' },
];

export const repercussaoPorValor = (valor) => REPERCUSSOES.find((r) => r.valor === valor) ?? null;

/**
 * Qualificador genérico da CIF. As faixas são as da OMS; o `ate` é o limite
 * superior inclusivo. Percentuais fracionados caem na faixa de cima só quando
 * alcançam o seu início (4,9% ainda é "nenhuma").
 */
export const QUALIFICADORES_CIF = [
  { codigo: 0, nome: 'nenhuma deficiência', de: 0, ate: 4 },
  { codigo: 1, nome: 'deficiência ligeira', de: 5, ate: 24 },
  { codigo: 2, nome: 'deficiência moderada', de: 25, ate: 49 },
  { codigo: 3, nome: 'deficiência grave', de: 50, ate: 95 },
  { codigo: 4, nome: 'deficiência completa', de: 96, ate: 100 },
];

export const qualificadorPorCodigo = (codigo) =>
  QUALIFICADORES_CIF.find((q) => q.codigo === Number(codigo)) ?? null;

/** Em que qualificador da CIF cai um percentual de perda. */
export function classificarCIF(percentual) {
  for (let i = QUALIFICADORES_CIF.length - 1; i >= 0; i -= 1) {
    if (percentual >= QUALIFICADORES_CIF[i].de) return QUALIFICADORES_CIF[i];
  }
  return QUALIFICADORES_CIF[0];
}

export const descreverCIF = (q) => `${q.codigo} — ${q.nome} (${q.de}% a ${q.ate}%)`;

/** Faixas do art. 223-G, §1º, da CLT, em múltiplos do último salário contratual. */
export const NATUREZAS_OFENSA = [
  { valor: 'leve', nome: 'leve', inciso: 'I', teto: 3, label: 'Leve — até 3 salários' },
  { valor: 'media', nome: 'média', inciso: 'II', teto: 5, label: 'Média — até 5 salários' },
  { valor: 'grave', nome: 'grave', inciso: 'III', teto: 20, label: 'Grave — até 20 salários' },
  { valor: 'gravissima', nome: 'gravíssima', inciso: 'IV', teto: 50, label: 'Gravíssima — até 50 salários' },
];

export const naturezaPorValor = (valor) => NATUREZAS_OFENSA.find((n) => n.valor === valor) ?? null;

/**
 * Natureza sugerida a partir do qualificador da CIF. Não é regra legal — a
 * lei manda o juiz sopesar os critérios do art. 223-G —, mas é a correlação
 * natural entre a extensão da deficiência e a gravidade da ofensa, e serve de
 * ponto de partida para a estimativa.
 */
export function naturezaSugerida(qualificador) {
  if (qualificador.codigo >= 4) return naturezaPorValor('gravissima');
  if (qualificador.codigo === 3) return naturezaPorValor('grave');
  if (qualificador.codigo === 2) return naturezaPorValor('media');
  return naturezaPorValor('leve');
}
