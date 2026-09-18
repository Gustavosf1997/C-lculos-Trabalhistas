/**
 * Interface do módulo de pedidos. Hoje cobre horas extras; os demais pedidos
 * entram como novas entradas em `PEDIDOS` com o seu próprio formulário.
 */

import { calcularHorasExtras, calcularAdicionalRisco, JORNADAS, GRAUS_INSALUBRIDADE } from './pedidos.js';
import { formatarData } from './calculo.js';
import { VIGENCIA, VIGENCIA_DETALHE } from './tabelas.js';
import { CARIMBO } from './versao.js';
import { moeda, formatarQuantidade } from './formato.js';
import { lerCampos, inicializarCampos } from './campos.js';
import { montarMemoria, imprimir } from './memoria.js';

const $ = (seletor) => document.querySelector(seletor);

const PEDIDOS = [
  {
    id: 'horas_extras',
    nome: 'Horas extras',
    tag: 'Art. 7º, XVI, da CF',
    icone: '⏱️',
    disponivel: true,
    descricao:
      'Horas além da jornada, calculadas sobre a hora normal do divisor contratado e acrescidas do adicional.',
    itens: [
      { label: 'Base com insalubridade ou periculosidade', devida: true },
      { label: 'DSR sobre as horas extras', devida: true },
      { label: 'Reflexos em 13º, férias + 1/3 e FGTS', devida: true },
      { label: 'Multa de 40% e aviso prévio (opcionais)', devida: true },
      { label: 'Juros e correção monetária', devida: false },
    ],
  },
  { id: 'adicional_noturno', nome: 'Adicional noturno', tag: 'Art. 73 da CLT', icone: '🌙', disponivel: false },
  { id: 'intervalo', nome: 'Intervalo intrajornada', tag: 'Art. 71, §4º, da CLT', icone: '🍽️', disponivel: false },
  { id: 'adicionais', nome: 'Insalubridade / periculosidade', tag: 'Arts. 192 e 193 da CLT', icone: '☣️', disponivel: false },
  { id: 'multas', nome: 'Multas dos arts. 467 e 477', tag: 'Atraso e diferenças', icone: '📌', disponivel: false },
];

/** Campos digitáveis; o tipo de cada um está declarado no HTML. */
const CAMPOS = [
  'dataInicio', 'dataFim', 'dataAjuizamento',
  'salarioBase', 'divisor', 'outrasParcelas', 'baseInsalubridadeValor',
  'quantidadeHoras', 'adicionalHoraExtra', 'diasUteis', 'diasRepouso', 'diasAviso',
];
/** Campos de seleção, lidos como texto. */
const SELECTS = ['grauInsalubridade', 'baseInsalubridade'];
const CHECKBOXES = ['reflexoDSR', 'dsrNosReflexos', 'reflexo13', 'reflexoFerias', 'reflexoFGTS', 'multaFGTS', 'reflexoAviso'];

let pedidoSelecionado = null;

/* ------------------------------------------------------------- formulário */

function coletarDados() {
  const { valores, erros } = lerCampos(CAMPOS);
  const dados = { ...valores, errosDeCampo: erros };
  for (const id of SELECTS) dados[id] = $(`#${id}`).value;
  for (const id of CHECKBOXES) dados[id] = $(`#${id}`).checked;
  dados.risco = document.querySelector('input[name="risco"]:checked')?.value ?? 'nenhum';
  dados.modoQuantidade = document.querySelector('input[name="modoQuantidade"]:checked')?.value ?? 'mes';
  return dados;
}

function montarPedidos() {
  const container = $('#pedidos');
  container.innerHTML = '';
  for (const pedido of PEDIDOS) {
    const botao = document.createElement('button');
    botao.type = 'button';
    botao.className = `tipo${pedido.disponivel ? '' : ' tipo--breve'}`;
    botao.disabled = !pedido.disponivel;
    botao.dataset.pedido = pedido.id;
    botao.innerHTML = `
      <span class="tipo__icone">${pedido.icone}</span>
      <strong class="tipo__nome">${pedido.nome}</strong>
      <span class="tipo__tag">${pedido.disponivel ? pedido.tag : 'em breve'}</span>`;
    if (pedido.disponivel) botao.addEventListener('click', () => selecionarPedido(pedido.id));
    container.append(botao);
  }
}

function selecionarPedido(id) {
  pedidoSelecionado = id;
  const pedido = PEDIDOS.find((p) => p.id === id);
  for (const botao of document.querySelectorAll('.tipo')) {
    botao.setAttribute('aria-checked', String(botao.dataset.pedido === id));
  }
  $('#resumo-pedido').hidden = false;
  $('#resumo-pedido').innerHTML = `
    <p>${pedido.descricao}</p>
    <div class="verbas">${pedido.itens
      .map((i) => `<span class="verba ${i.devida ? '' : 'verba--nao'}">${i.devida ? '✓' : '✕'} ${i.label}</span>`)
      .join('')}</div>`;
  atualizar();
}

function montarSelects() {
  $('#jornada').innerHTML = JORNADAS.map(
    (j) => `<option value="${j.valor}">${j.label}</option>`,
  ).join('');
  $('#grauInsalubridade').innerHTML = GRAUS_INSALUBRIDADE.map(
    (g) => `<option value="${g.valor}">${g.label}</option>`,
  ).join('');
  $('#grauInsalubridade').value = '20';

  $('#jornada').addEventListener('change', () => {
    const jornada = JORNADAS.find((j) => j.valor === $('#jornada').value);
    if (jornada?.divisor) $('#divisor').value = jornada.divisor;
    atualizar();
  });
}

/** Mostra apenas os campos pertinentes às escolhas feitas. */
function aplicarVisibilidade(dados) {
  $('#campos-insalubridade').hidden = dados.risco !== 'insalubridade';
  $('#campo-base-informada').hidden =
    dados.risco !== 'insalubridade' || dados.baseInsalubridade !== 'valor_informado';
  $('#campo-dias-aviso').hidden = !dados.reflexoAviso;
  $('#dsrNosReflexos').closest('.campo').hidden = !dados.reflexoDSR;
  $('#dica-quantidade').textContent =
    dados.modoQuantidade === 'semana'
      ? 'Média semanal — convertida para o mês por 52/12 semanas.'
      : 'Média mensal do período.';

  const risco = calcularAdicionalRisco({ ...dados, salarioBase: dados.salarioBase });
  const nota = $('#nota-risco');
  nota.hidden = !risco.nome;
  if (risco.nome) {
    nota.innerHTML = `${risco.nome}: <b>${moeda.format(risco.valor)}</b> — ${risco.detalhe}, integra a base das horas extras.`;
  }
}

/* -------------------------------------------------------------- resultado */

function linhas(itens) {
  return itens
    .map(
      (i) => `<tr>
        <td>${i.label}${i.detalhe ? `<small>${i.detalhe}</small>` : ''}</td>
        <td>${moeda.format(i.valor)}</td>
      </tr>`,
    )
    .join('');
}

function renderResultado(r) {
  const alvo = $('#resultado');

  // Prescrição barra o cálculo: caixa vermelha no lugar do resultado.
  if (r.impedimento) {
    alvo.innerHTML = `<div class="impedimento" role="alert">
      <b>${r.impedimento.titulo}</b>
      <p>${r.impedimento.mensagem}</p>
      <p class="impedimento__saida">Os demais campos ficam bloqueados. Corrija o período pedido ou a data do ajuizamento para liberar o cálculo.</p>
    </div>`;
    return;
  }

  if (r.erros.length) {
    alvo.innerHTML = `<div class="aviso-erro"><b>Faltam informações para calcular:</b>
      <ul>${r.erros.map((e) => `<li>${e}</li>`).join('')}</ul></div>`;
    return;
  }

  const c = r.contexto;
  const contexto = [
    ['Período calculado', `${formatarData(c.inicio)} a ${formatarData(c.fim)}`],
    ['Base de cálculo', moeda.format(c.baseCalculo)],
    ['Divisor', String(c.divisor)],
    ['Valor da hora', moeda.format(c.valorHora)],
    [`Hora extra (+${formatarQuantidade(c.percentualAdicional)}%)`, moeda.format(c.valorHoraExtra)],
    ['Horas por mês', formatarQuantidade(c.horasMes)],
    ['Meses no período', c.mesesFracionados ? `${formatarQuantidade(c.meses)} (${c.diasPeriodo} dias)` : String(c.meses)],
  ];

  alvo.innerHTML = `
    ${r.recorte ? `<div class="recorte" role="alert">
      <b>${r.recorte.titulo}</b>
      <p>${r.recorte.mensagem}</p>
    </div>` : ''}
    ${r.alertas.map((a) => `<p class="alerta">${a}</p>`).join('')}
    <dl class="contexto">
      ${contexto.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}
    </dl>

    <p class="bloco-titulo">Por mês</p>
    <table class="linhas">
      ${linhas(r.mensais)}
      <tr class="total"><td>Total mensal</td><td>${moeda.format(r.totais.mensal)}</td></tr>
    </table>

    <p class="bloco-titulo">No período (${formatarQuantidade(c.meses)} meses)</p>
    <table class="linhas">
      ${linhas(r.periodo)}
      <tr class="total"><td>Total das verbas</td><td>${moeda.format(r.totais.periodo)}</td></tr>
    </table>

    <div class="fgts-card">
      <h3>FGTS</h3>
      <table class="linhas">
        <tr><td>FGTS sobre o período<small>8% sobre horas extras, DSR e 13º</small></td><td>${moeda.format(r.fgts.valor)}</td></tr>
        ${r.fgts.multa ? `<tr><td>Multa de 40%</td><td>${moeda.format(r.fgts.multa)}</td></tr>` : ''}
      </table>
    </div>

    <div class="liquido"><span>Total do pedido</span><b>${moeda.format(r.totais.geral)}</b></div>
    <p class="observacao">Sem juros e sem correção monetária.</p>`;
}

/** Campos que permanecem editáveis: são eles que afastam o impedimento. */
const CAMPOS_DO_PERIODO = ['dataInicio', 'dataFim', 'dataAjuizamento'];

/** Prescrição reconhecida: a tela para de aceitar os demais dados. */
function bloquearEntrada(bloqueado) {
  for (const campo of $('#formulario').querySelectorAll('input, select')) {
    if (!CAMPOS_DO_PERIODO.includes(campo.id)) campo.disabled = bloqueado;
  }
  $('#formulario').classList.toggle('formulario--bloqueado', bloqueado);
}

/* ------------------------------------------------------------- atualização */

function atualizar() {
  const dados = coletarDados();
  aplicarVisibilidade(dados);
  if (!pedidoSelecionado) return;

  // Campo com conteúdo inválido interrompe o cálculo: o valor seria chute.
  if (dados.errosDeCampo.length) {
    $('#resultado').innerHTML = `<div class="aviso-erro"><b>Corrija os campos destacados:</b>
      <ul>${dados.errosDeCampo.map((e) => `<li>${e}</li>`).join('')}</ul></div>`;
    bloquearEntrada(false);
  } else {
    const resultado = calcularHorasExtras(dados);
    renderResultado(resultado);
    bloquearEntrada(Boolean(resultado.impedimento));
  }
  // Só se gera PDF de um cálculo fechado.
  $('#gerar-pdf').disabled = Boolean($('#resultado .aviso-erro, #resultado .impedimento'));
}

function gerarPdf() {
  const pedido = PEDIDOS.find((p) => p.id === pedidoSelecionado);
  montarMemoria({
    titulo: 'Cálculo de pedidos',
    subtitulo: `${pedido.nome} — ${pedido.tag}`,
    formulario: $('#formulario'),
    resultado: $('#resultado'),
    rodape: 'Uso orientativo. Os valores são estimativas e não substituem a memória de cálculo do processo. Não há aplicação de juros nem de correção monetária.',
  });
  imprimir(`Memoria de calculo - ${pedido.nome}`);
}

/* -------------------------------------------------------------- inicializa */

montarPedidos();
montarSelects();
$('#badge-vigencia').textContent = VIGENCIA;
$('#versao').textContent = `Ferramenta de cálculos trabalhistas — ${CARIMBO}`;
$('#rodape-vigencia').textContent = VIGENCIA_DETALHE;
$('#formulario').addEventListener('input', atualizar);
// Não há botão de calcular: o resultado acompanha a digitação. O submit por
// Enter é neutralizado para que a página nunca recarregue e perca os dados.
$('#formulario').addEventListener('submit', (evento) => {
  evento.preventDefault();
  atualizar();
});
$('#formulario').addEventListener('reset', () => setTimeout(atualizar, 0));
inicializarCampos();
$('#gerar-pdf').addEventListener('click', gerarPdf);
selecionarPedido('horas_extras');
