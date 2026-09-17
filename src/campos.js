/**
 * Comportamento dos campos do formulário: máscara de digitação, formatação
 * ao sair do campo, leitura tipada e marcação de erro.
 *
 * Um campo declara o seu tipo no HTML com `data-campo`:
 *   data-campo="data"     dd/mm/aaaa
 *   data-campo="moeda"    valor em reais
 *   data-campo="decimal"  número com vírgula decimal
 *   data-campo="inteiro"  número inteiro
 *
 * Limites opcionais: `data-min` e `data-max`.
 * Letras e qualquer outro caractere são descartados na digitação, de modo que
 * o campo nunca chega ao cálculo com conteúdo inválido.
 */

import {
  parseNumeroBR,
  parseDataBR,
  formatarNumeroBR,
  formatarQuantidade,
  mascararData,
  mascararDecimal,
  mascararInteiro,
} from './formato.js';

const MASCARAS = {
  data: mascararData,
  inteiro: mascararInteiro,
  decimal: mascararDecimal,
  moeda: mascararDecimal,
};

/** Reaplica a máscara preservando, na medida do possível, a posição do cursor. */
function aplicarMascara(input, mascara) {
  const antes = input.value;
  const depois = mascara(antes);
  if (antes === depois) return;
  const cursor = input.selectionStart ?? antes.length;
  const descartados = cursor - mascara(antes.slice(0, cursor)).length;
  input.value = depois;
  const posicao = Math.max(0, Math.min(depois.length, cursor - descartados));
  input.setSelectionRange(posicao, posicao);
}

function formatarAoSair(input) {
  const tipo = input.dataset.campo;
  const texto = input.value.trim();
  if (!texto || tipo === 'data') return;

  const valor = parseNumeroBR(texto);
  if (!Number.isFinite(valor)) return;
  if (tipo === 'moeda') input.value = formatarNumeroBR(valor, 2);
  else if (tipo === 'decimal') input.value = formatarQuantidade(valor);
  // Inteiros aqui são contadores (dias, dependentes, divisor): sem separador
  // de milhar, que só traria ambiguidade na releitura do campo.
  else input.value = String(Math.trunc(valor));
}

/**
 * Lê um campo já validado.
 * @returns {{valor: number|string, vazio: boolean, erro: string|null}}
 */
export function lerCampo(input) {
  const tipo = input.dataset.campo;
  const texto = input.value.trim();
  const vazio = texto === '';

  if (tipo === 'data') {
    if (vazio) return { valor: '', vazio, erro: null };
    const iso = parseDataBR(texto);
    return iso
      ? { valor: iso, vazio, erro: null }
      : { valor: '', vazio, erro: 'Data inválida. Use dd/mm/aaaa.' };
  }

  if (vazio) return { valor: 0, vazio, erro: null };

  const valor = parseNumeroBR(texto);
  if (!Number.isFinite(valor)) return { valor: 0, vazio, erro: 'Informe apenas números.' };

  const min = input.dataset.min === undefined ? null : Number(input.dataset.min);
  const max = input.dataset.max === undefined ? null : Number(input.dataset.max);
  if (min !== null && valor < min) {
    return { valor, vazio, erro: `O mínimo é ${formatarQuantidade(min)}.` };
  }
  if (max !== null && valor > max) {
    return { valor, vazio, erro: `O máximo é ${formatarQuantidade(max)}.` };
  }
  return { valor, vazio, erro: null };
}

/** Mostra (ou apaga) a mensagem de erro logo abaixo do campo. */
export function marcarErro(input, mensagem) {
  const campo = input.closest('.campo');
  if (!campo) return;
  campo.classList.toggle('campo--erro', Boolean(mensagem));
  input.setAttribute('aria-invalid', mensagem ? 'true' : 'false');

  let aviso = campo.querySelector('.campo__erro');
  if (!mensagem) {
    aviso?.remove();
    return;
  }
  if (!aviso) {
    aviso = document.createElement('span');
    aviso.className = 'campo__erro';
    campo.append(aviso);
  }
  aviso.textContent = mensagem;
}

/**
 * Lê vários campos por id, marcando os que estiverem inválidos.
 * @returns {{valores: object, erros: string[]}}
 */
export function lerCampos(ids) {
  const valores = {};
  const erros = [];
  for (const id of ids) {
    const input = document.getElementById(id);
    if (!input) continue;

    // Campo que não está na tela não entra no cálculo nem bloqueia por erro:
    // seria um valor que a pessoa não tem como corrigir.
    if (input.closest('[hidden]')) {
      valores[id] = input.dataset.campo === 'data' ? '' : 0;
      marcarErro(input, null);
      continue;
    }

    const { valor, erro } = lerCampo(input);
    valores[id] = valor;
    marcarErro(input, erro);
    if (erro) {
      const rotulo = input.closest('.campo')?.querySelector('.campo__rotulo')?.textContent.replace('*', '').trim();
      erros.push(`${rotulo ?? id}: ${erro.charAt(0).toLowerCase()}${erro.slice(1)}`);
    }
  }
  return { valores, erros };
}

/** Liga máscara e formatação em todos os campos marcados com `data-campo`. */
export function inicializarCampos(raiz = document) {
  for (const input of raiz.querySelectorAll('[data-campo]')) {
    const mascara = MASCARAS[input.dataset.campo];
    if (!mascara) continue;
    input.addEventListener('input', () => aplicarMascara(input, mascara));
    input.addEventListener('blur', () => formatarAoSair(input));
  }
}
