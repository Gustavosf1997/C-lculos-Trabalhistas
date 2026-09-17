/** Formatação e leitura de valores em reais, usadas pelas duas páginas. */

export const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** Lê "3.500,00", "3500.00" ou "R$ 3.500" como número. */
export function parseMoeda(texto) {
  if (texto == null) return 0;
  let limpo = String(texto).replace(/[^\d.,-]/g, '');
  if (limpo.includes(',')) limpo = limpo.replace(/\./g, '').replace(',', '.');
  const valor = Number(limpo);
  return Number.isFinite(valor) ? valor : 0;
}

/** Formata o campo ao sair dele, mantendo vazio quando não há valor. */
export function formatarCampoMoeda(campo) {
  const valor = parseMoeda(campo.value);
  campo.value = valor
    ? valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '';
}
