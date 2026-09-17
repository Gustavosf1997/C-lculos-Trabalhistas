/**
 * Leitura e escrita de números e datas no padrão brasileiro.
 *
 * Números: vírgula decimal e ponto de milhar ("1.234,56").
 * Datas: dd/mm/aaaa na tela, ISO (aaaa-mm-dd) nos motores de cálculo.
 */

export const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * Normaliza um texto numérico para dígitos com, no máximo, uma vírgula.
 *
 * A vírgula manda: havendo vírgula, os pontos são separadores de milhar.
 * Sem vírgula, um ponto seguido de três dígitos também é milhar ("1.234");
 * nos demais casos o ponto é o separador decimal que a pessoa digitou
 * ("12.5" vira "12,5").
 */
function normalizarNumero(texto) {
  let limpo = String(texto ?? '').replace(/[^\d.,]/g, '');

  if (limpo.includes(',')) {
    limpo = limpo.replace(/\./g, '');
  } else {
    const ultimoPonto = limpo.lastIndexOf('.');
    if (ultimoPonto >= 0) {
      const casas = limpo.length - ultimoPonto - 1;
      limpo =
        casas === 3
          ? limpo.replace(/\./g, '')
          : `${limpo.slice(0, ultimoPonto).replace(/\./g, '')},${limpo.slice(ultimoPonto + 1)}`;
    }
  }

  const partes = limpo.split(',');
  return partes.length <= 2 ? limpo : `${partes[0]},${partes.slice(1).join('')}`;
}

/**
 * Lê "1.234,56", "1234,56", "12,5" ou "1234" como número.
 * Devolve NaN quando o texto tem qualquer coisa além de números e separadores
 * — quem chama decide se isso é erro de preenchimento ou campo vazio.
 */
export function parseNumeroBR(texto) {
  if (texto == null) return NaN;
  const bruto = String(texto).trim();
  if (bruto === '' || /[^\d.,\s]/.test(bruto)) return NaN;
  const normalizado = normalizarNumero(bruto).replace(',', '.');
  if (normalizado === '' || normalizado === '.') return NaN;
  const valor = Number(normalizado);
  return Number.isFinite(valor) ? valor : NaN;
}

export function formatarNumeroBR(valor, casas = 2) {
  return Number(valor).toLocaleString('pt-BR', {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  });
}

/** Formata sem casas decimais quando o número é inteiro. */
export function formatarQuantidade(valor) {
  return Number.isInteger(valor) ? formatarNumeroBR(valor, 0) : formatarNumeroBR(valor, 2);
}

/**
 * Converte "15/09/2026" em "2026-09-15". Devolve null quando a data não
 * existe no calendário (31/02, por exemplo) ou está incompleta.
 */
export function parseDataBR(texto) {
  const combinacao = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(texto ?? '').trim());
  if (!combinacao) return null;
  const [, dia, mes, ano] = combinacao.map(Number);
  if (mes < 1 || mes > 12 || dia < 1 || ano < 1900 || ano > 2199) return null;
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  if (data.getUTCDate() !== dia || data.getUTCMonth() !== mes - 1) return null; // 31/02 e afins
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

/** Converte "2026-09-15" em "15/09/2026". */
export function formatarDataBR(iso) {
  const combinacao = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? ''));
  return combinacao ? `${combinacao[3]}/${combinacao[2]}/${combinacao[1]}` : '';
}

/** Máscara progressiva dd/mm/aaaa: descarta tudo que não for dígito. */
export function mascararData(texto) {
  const digitos = String(texto ?? '').replace(/\D/g, '').slice(0, 8);
  if (digitos.length <= 2) return digitos;
  if (digitos.length <= 4) return `${digitos.slice(0, 2)}/${digitos.slice(2)}`;
  return `${digitos.slice(0, 2)}/${digitos.slice(2, 4)}/${digitos.slice(4)}`;
}

/** Mantém apenas dígitos. */
export function mascararInteiro(texto) {
  return String(texto ?? '').replace(/\D/g, '');
}

/** Mantém dígitos e uma única vírgula decimal, descartando letras. */
export function mascararDecimal(texto) {
  return normalizarNumero(texto);
}
