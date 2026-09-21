/**
 * Interface do módulo de pedidos.
 *
 * O formulário é montado a partir do catálogo: cada pedido declara os seus
 * grupos de campos e a função que faz a conta, e esta camada só desenha,
 * lê e apresenta.
 */

import { PEDIDOS, pedidoPorId, JORNADAS } from './pedidos/catalogo.js';
import { VIGENCIA, VIGENCIA_DETALHE } from './tabelas.js';
import { CARIMBO } from './versao.js';
import { moeda } from './formato.js';
import { lerCampos, inicializarCampos } from './campos.js';
import { montarMemoria, imprimir } from './memoria.js';

const $ = (seletor) => document.querySelector(seletor);

const TIPOS_DE_TEXTO = ['data', 'moeda', 'decimal', 'percentual', 'inteiro'];
const MASCARA_POR_TIPO = { data: 'data', moeda: 'moeda', decimal: 'decimal', percentual: 'decimal', inteiro: 'inteiro' };

let pedidoSelecionado = null;

const pedidoAtual = () => pedidoPorId(pedidoSelecionado);
const camposDoPedido = () => pedidoAtual()?.grupos.flatMap((g) => g.campos) ?? [];

/* ------------------------------------------------------ cartões de pedido */

function montarPedidos() {
  const container = $('#pedidos');
  container.innerHTML = '';
  for (const pedido of PEDIDOS) {
    const botao = document.createElement('button');
    botao.type = 'button';
    botao.className = 'tipo';
    botao.role = 'radio';
    botao.setAttribute('aria-checked', 'false');
    botao.dataset.pedido = pedido.id;
    botao.innerHTML = `
      <span class="tipo__icone">${pedido.icone}</span>
      <strong class="tipo__nome">${pedido.nome}</strong>
      <span class="tipo__tag">${pedido.tag}</span>`;
    botao.addEventListener('click', () => selecionarPedido(pedido.id));
    container.append(botao);
  }
}

/* --------------------------------------------------- montagem dos campos */

function campoHtml(campo) {
  const rotulo = `<span class="campo__rotulo">${campo.rotulo}${campo.obrigatorio ? ' <b>*</b>' : ''}</span>`;
  const dica = campo.dica ? `<span class="campo__dica">${campo.dica}</span>` : '';
  const classe = `campo${campo.largo ? ' campo--largo' : ''}`;

  if (campo.tipo === 'checkbox') {
    return `<label class="campo campo--largo checkbox" id="campo-${campo.id}">
      <input type="checkbox" id="${campo.id}" ${campo.valor ? 'checked' : ''} />
      <span>${campo.rotulo}</span>
    </label>`;
  }

  if (campo.tipo === 'radios') {
    return `<fieldset class="campo campo--largo opcoes" id="campo-${campo.id}">
      <legend class="campo__rotulo">${campo.rotulo}</legend>
      <div class="opcoes__lista">${campo.opcoes
        .map((o) => `<label class="opcao">
          <input type="radio" name="${campo.id}" value="${o.valor}" ${o.valor === campo.valor ? 'checked' : ''} />
          ${o.label}
        </label>`)
        .join('')}</div>
      ${dica}
    </fieldset>`;
  }

  if (campo.tipo === 'select') {
    return `<label class="${classe}" id="campo-${campo.id}">${rotulo}
      <select id="${campo.id}">${campo.opcoes
        .map((o) => `<option value="${o.valor}" ${o.valor === campo.valor ? 'selected' : ''}>${o.label}</option>`)
        .join('')}</select>
      ${dica}
    </label>`;
  }

  const modo = campo.tipo === 'data' || campo.tipo === 'inteiro' ? 'numeric' : 'decimal';
  const limites = (campo.min === undefined ? '' : ` data-min="${campo.min}"`)
    + (campo.max === undefined ? '' : ` data-max="${campo.max}"`);
  const valor = campo.valor === undefined ? '' : ` value="${campo.valor}"`;
  const extras = campo.tipo === 'data'
    ? ' maxlength="10" placeholder="dd/mm/aaaa"'
    : ` placeholder="${campo.tipo === 'moeda' ? '0,00' : '0'}"`;

  const entrada = `<input type="text" inputmode="${modo}" data-campo="${MASCARA_POR_TIPO[campo.tipo]}"`
    + `${limites} id="${campo.id}"${valor}${extras} />`;

  const embrulho = campo.tipo === 'moeda'
    ? `<span class="campo__moeda"><i>R$</i>${entrada}</span>`
    : campo.tipo === 'percentual'
      ? `<span class="campo__moeda campo__moeda--sufixo">${entrada}<i>%</i></span>`
      : entrada;

  return `<label class="${classe}" id="campo-${campo.id}">${rotulo}${embrulho}${dica}</label>`;
}

function montarFormulario(pedido) {
  $('#grupos-do-pedido').innerHTML = pedido.grupos
    .map((grupo, indice) => `
      <fieldset class="grupo" id="grupo-${indice}">
        <legend>${grupo.titulo}</legend>
        <div class="campos">${grupo.campos.map(campoHtml).join('')}</div>
      </fieldset>`)
    .join('');

  inicializarCampos($('#formulario'));

  // A jornada escolhida preenche o divisor, que segue editável.
  const jornada = $('#jornada');
  if (jornada) {
    jornada.addEventListener('change', () => {
      const escolhida = JORNADAS.find((j) => j.valor === jornada.value);
      if (escolhida?.divisor) $('#divisor').value = escolhida.divisor;
      atualizar();
    });
  }
}

/* --------------------------------------------------------- leitura da tela */

/** Estado das escolhas, suficiente para decidir que campos aparecem. */
function estadoDasEscolhas() {
  const estado = {};
  for (const campo of camposDoPedido()) {
    if (campo.tipo === 'checkbox') estado[campo.id] = $(`#${campo.id}`)?.checked ?? false;
    else if (campo.tipo === 'select') estado[campo.id] = $(`#${campo.id}`)?.value ?? '';
    else if (campo.tipo === 'radios') {
      estado[campo.id] = document.querySelector(`input[name="${campo.id}"]:checked`)?.value ?? campo.valor;
    }
  }
  return estado;
}

function aplicarVisibilidade() {
  const escolhas = estadoDasEscolhas();
  const pedido = pedidoAtual();
  if (!pedido) return;

  pedido.grupos.forEach((grupo, indice) => {
    const elemento = $(`#grupo-${indice}`);
    if (elemento) elemento.hidden = grupo.aparece ? !grupo.aparece(escolhas) : false;
  });

  for (const campo of camposDoPedido()) {
    const elemento = $(`#campo-${campo.id}`);
    if (elemento) elemento.hidden = campo.aparece ? !campo.aparece(escolhas) : false;
  }
}

function coletarDados() {
  const campos = camposDoPedido();
  const textuais = campos.filter((c) => TIPOS_DE_TEXTO.includes(c.tipo)).map((c) => c.id);
  const { valores, erros } = lerCampos(textuais);

  const dados = { ...valores, ...estadoDasEscolhas(), errosDeCampo: erros };
  return dados;
}

/* ---------------------------------------------------------- apresentação */

function linhas(itens) {
  return itens
    .map((i) => `<tr>
      <td>${i.label}${i.detalhe ? `<small>${i.detalhe}</small>` : ''}</td>
      <td>${moeda.format(i.valor)}</td>
    </tr>`)
    .join('');
}

function renderResultado(r) {
  const alvo = $('#resultado');
  const pedido = pedidoAtual();

  if (r.impedimento) {
    alvo.innerHTML = `<div class="impedimento" role="alert">
      <b>${r.impedimento.titulo}</b>
      <p>${r.impedimento.mensagem}</p>
      <p class="impedimento__saida">Os demais campos ficam bloqueados. ${r.impedimento.bienal
        ? 'Corrija a data de extinção do contrato ou a do ajuizamento'
        : 'Corrija o período pedido ou a data do ajuizamento'} para liberar o cálculo.</p>
    </div>`;
    return;
  }

  if (r.erros.length) {
    alvo.innerHTML = `<div class="aviso-erro"><b>Faltam informações para calcular:</b>
      <ul>${r.erros.map((e) => `<li>${e}</li>`).join('')}</ul></div>`;
    return;
  }

  const c = r.contexto;
  const resumo = pedido.resumo(c).filter(([, valor]) => valor !== undefined && valor !== null);
  const temMensais = r.mensais.length > 0;

  alvo.innerHTML = `
    ${r.recorte ? `<div class="recorte" role="alert">
      <b>${r.recorte.titulo}</b>
      <p>${r.recorte.mensagem}</p>
    </div>` : ''}
    ${r.alertas.map((a) => `<p class="alerta">${a}</p>`).join('')}

    <dl class="contexto">
      ${resumo.map(([rotulo, valor]) => `<div><dt>${rotulo}</dt><dd>${valor}</dd></div>`).join('')}
    </dl>

    ${temMensais ? `<p class="bloco-titulo">Por mês</p>
    <table class="linhas">
      ${linhas(r.mensais)}
      <tr class="total"><td>Total mensal</td><td>${moeda.format(r.totais.mensal)}</td></tr>
    </table>` : ''}

    <p class="bloco-titulo">${temMensais ? `No período (${c.meses} meses)` : 'Valores devidos'}</p>
    <table class="linhas">
      ${linhas(r.periodo)}
      <tr class="total"><td>Total das verbas</td><td>${moeda.format(r.totais.periodo)}</td></tr>
    </table>

    ${r.fgts && r.fgts.valor > 0 ? `<div class="fgts-card">
      <h3>FGTS</h3>
      <table class="linhas">
        <tr><td>FGTS sobre o período<small>${r.fgts.detalhe}</small></td><td>${moeda.format(r.fgts.valor)}</td></tr>
        ${r.fgts.multa ? `<tr><td>Multa de 40%</td><td>${moeda.format(r.fgts.multa)}</td></tr>` : ''}
      </table>
    </div>` : ''}

    <div class="liquido"><span>Total do pedido</span><b>${moeda.format(r.totais.geral)}</b></div>
    <p class="observacao">Valores brutos: sem juros, sem correção monetária e sem os
      descontos de INSS e IRRF, que são apurados na execução.</p>`;
}

function selecionarPedido(id) {
  pedidoSelecionado = id;
  const pedido = pedidoAtual();
  for (const botao of document.querySelectorAll('.tipo')) {
    botao.setAttribute('aria-checked', String(botao.dataset.pedido === id));
  }

  $('#resumo-pedido').hidden = false;
  $('#resumo-pedido').innerHTML = `
    <p>${pedido.descricao}</p>
    <div class="verbas">${pedido.itens
      .map((i) => `<span class="verba ${i.devida ? '' : 'verba--nao'}">${i.devida ? '✓' : '✕'} ${i.label}${
        i.nota ? ` <small>(${i.nota})</small>` : ''
      }</span>`)
      .join('')}</div>`;

  montarFormulario(pedido);
  atualizar();
}

/* --------------------------------------------------------------- bloqueio */

/** Campos que permanecem editáveis: são eles que afastam o impedimento. */
const CAMPOS_DO_PERIODO = ['dataInicio', 'dataFim', 'dataAjuizamento', 'dataExtincao'];

function bloquearEntrada(bloqueado) {
  for (const campo of $('#formulario').querySelectorAll('input, select')) {
    if (!CAMPOS_DO_PERIODO.includes(campo.id)) campo.disabled = bloqueado;
  }
  $('#formulario').classList.toggle('formulario--bloqueado', bloqueado);
}

/* ------------------------------------------------------------- atualização */

function atualizar() {
  if (!pedidoSelecionado) return;
  aplicarVisibilidade();
  const dados = coletarDados();

  if (dados.errosDeCampo.length) {
    $('#resultado').innerHTML = `<div class="aviso-erro"><b>Corrija os campos destacados:</b>
      <ul>${dados.errosDeCampo.map((e) => `<li>${e}</li>`).join('')}</ul></div>`;
    bloquearEntrada(false);
  } else {
    const resultado = pedidoAtual().calcular(dados);
    renderResultado(resultado);
    bloquearEntrada(Boolean(resultado.impedimento));
  }
  $('#gerar-pdf').disabled = Boolean($('#resultado .aviso-erro, #resultado .impedimento'));
}

function gerarPdf() {
  const pedido = pedidoAtual();
  montarMemoria({
    titulo: 'Cálculo de pedidos',
    subtitulo: `${pedido.nome} — ${pedido.tag}`,
    formulario: $('#formulario'),
    resultado: $('#resultado'),
    rodape: 'Uso orientativo. Os valores são estimativas e não substituem a memória de cálculo do processo. '
      + 'Não há aplicação de juros nem de correção monetária.',
  });
  imprimir(`Memoria de calculo - ${pedido.nome}`);
}

/* -------------------------------------------------------------- inicializa */

montarPedidos();
$('#badge-vigencia').textContent = VIGENCIA;
$('#versao').textContent = `Ferramenta de cálculos trabalhistas — ${CARIMBO}`;
$('#rodape-vigencia').textContent = VIGENCIA_DETALHE;
$('#formulario').addEventListener('input', atualizar);
$('#formulario').addEventListener('change', atualizar);
// Não há botão de calcular: o resultado acompanha a digitação. O submit por
// Enter é neutralizado para que a página nunca recarregue e perca os dados.
$('#formulario').addEventListener('submit', (evento) => {
  evento.preventDefault();
  atualizar();
});
$('#formulario').addEventListener('reset', () => setTimeout(() => selecionarPedido(pedidoSelecionado), 0));
$('#gerar-pdf').addEventListener('click', gerarPdf);
selecionarPedido('horas_extras');
