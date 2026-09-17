/**
 * Camada de interface: monta os cartões de tipo de rescisão, mostra os campos
 * pertinentes a cada um e apresenta a memória de cálculo.
 */

import { TIPOS, ORDEM_TIPOS } from './tipos.js';
import { calcularRescisao, formatarData, parseData, periodosAquisitivos } from './calculo.js';
import { VIGENCIA } from './tabelas.js';

const $ = (seletor) => document.querySelector(seletor);
const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

const CAMPOS_MOEDA = [
  'salarioBase', 'mediaHorasExtras', 'mediaAdicionais', 'mediaComissoes',
  'saldoFgts', 'adiantamentoSalario', 'adiantamento13', 'outrosDescontos',
];
const CAMPOS_SIMPLES = ['periodosFeriasVencidas', 'faltasInjustificadas', 'dependentes', 'pensaoPercentual'];

let tipoSelecionado = null;

/* ------------------------------------------------------------ utilitários */

function parseMoeda(texto) {
  if (texto == null) return 0;
  let limpo = String(texto).replace(/[^\d.,-]/g, '');
  if (limpo.includes(',')) limpo = limpo.replace(/\./g, '').replace(',', '.');
  const valor = Number(limpo);
  return Number.isFinite(valor) ? valor : 0;
}

function coletarDados() {
  const dados = { tipo: tipoSelecionado, dataAdmissao: $('#dataAdmissao').value, dataAviso: $('#dataAviso').value };
  for (const id of CAMPOS_MOEDA) dados[id] = parseMoeda($(`#${id}`).value);
  for (const id of CAMPOS_SIMPLES) dados[id] = $(`#${id}`).value;
  dados.tipoAviso = document.querySelector('input[name="tipoAviso"]:checked')?.value ?? null;
  dados.feriasDobro = $('#feriasDobro').checked;
  return dados;
}

/* ------------------------------------------------------- tipos e formulário */

function montarTipos() {
  const container = $('#tipos');
  container.innerHTML = '';
  for (const id of ORDEM_TIPOS) {
    const tipo = TIPOS[id];
    const botao = document.createElement('button');
    botao.type = 'button';
    botao.className = 'tipo';
    botao.role = 'radio';
    botao.setAttribute('aria-checked', 'false');
    botao.dataset.tipo = id;
    botao.innerHTML = `
      <span class="tipo__icone">${tipo.icone}</span>
      <strong class="tipo__nome">${tipo.nome}</strong>
      <span class="tipo__tag">${tipo.tag}</span>`;
    botao.addEventListener('click', () => selecionarTipo(id));
    container.append(botao);
  }
}

function selecionarTipo(id) {
  tipoSelecionado = id;
  for (const botao of document.querySelectorAll('.tipo')) {
    botao.setAttribute('aria-checked', String(botao.dataset.tipo === id));
  }

  const tipo = TIPOS[id];
  $('#resumo-tipo').hidden = false;
  $('#resumo-tipo').innerHTML = `
    <p>${tipo.descricao}</p>
    <div class="verbas">${tipo.verbas
      .map((v) => `<span class="verba ${v.devida ? '' : 'verba--nao'}">${v.devida ? '✓' : '✕'} ${v.label}${
        v.nota ? ` <small>(${v.nota})</small>` : ''
      }</span>`)
      .join('')}</div>`;

  montarOpcoesAviso(tipo);
  $('#grupo-fgts').hidden = !tipo.campos.fgts;
  $('#etapa-dados').hidden = false;
  $('#painel').hidden = false;
  atualizar();
}

function montarOpcoesAviso(tipo) {
  const grupo = $('#grupo-aviso');
  if (!tipo.aviso) {
    grupo.hidden = true;
    $('#opcoes-aviso').innerHTML = '';
    return;
  }
  grupo.hidden = false;
  $('#rotulo-aviso').textContent = tipo.aviso.rotulo;
  $('#dica-aviso').textContent = tipo.aviso.ajuda;
  $('#opcoes-aviso').innerHTML = tipo.aviso.opcoes
    .map(
      (opcao, i) => `
      <label class="opcao">
        <input type="radio" name="tipoAviso" value="${opcao.valor}" ${i === 0 ? 'checked' : ''} />
        ${opcao.label}
      </label>`,
    )
    .join('');
  for (const input of $('#opcoes-aviso').querySelectorAll('input')) {
    input.addEventListener('change', atualizar);
  }
}

/* -------------------------------------------------------------- resultado */

function linha(item, negativo = false) {
  return `<tr class="${negativo ? 'neg' : ''}">
    <td>${item.label}${item.detalhe ? `<small>${item.detalhe}</small>` : ''}</td>
    <td>${negativo ? '- ' : ''}${moeda.format(item.valor)}</td>
  </tr>`;
}

function renderResultado(resultado) {
  const alvo = $('#resultado');

  if (resultado.erros.length) {
    alvo.innerHTML = `<div class="aviso-erro"><b>Faltam informações para calcular:</b>
      <ul>${resultado.erros.map((e) => `<li>${e}</li>`).join('')}</ul></div>`;
    return;
  }

  const { contexto: c, proventos, descontos, totais, fgts } = resultado;
  const tipo = TIPOS[tipoSelecionado];

  const contexto = [
    ['Tempo de serviço', `${c.anos} ano(s)`],
    ['Último dia do contrato', formatarData(c.ultimoDiaTrabalhado)],
    ['Aviso prévio', c.diasAvisoDevidos ? `${c.diasAvisoDevidos} dias` : 'não indenizado'],
    ['Data projetada', formatarData(c.dataProjetada)],
    ['Avos de 13º', tipo.campos.decimoTerceiro ? `${c.avos13}/12` : 'não devido'],
    ['Avos de férias', tipo.campos.feriasProporcionais ? `${c.avosFerias}/12` : 'não devido'],
  ];

  alvo.innerHTML = `
    <dl class="contexto">
      ${contexto.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}
    </dl>

    <p class="bloco-titulo">Verbas a receber</p>
    <table class="linhas">
      ${proventos.map((p) => linha(p)).join('')}
      <tr class="total"><td>Total bruto</td><td>${moeda.format(totais.proventos)}</td></tr>
    </table>

    <p class="bloco-titulo">Descontos</p>
    <table class="linhas">
      ${descontos.length ? descontos.map((d) => linha(d, true)).join('') : '<tr><td colspan="2"><small>Sem descontos.</small></td></tr>'}
      <tr class="total"><td>Total de descontos</td><td>${moeda.format(totais.descontos)}</td></tr>
    </table>

    <div class="liquido"><span>Líquido a receber</span><b>${moeda.format(totais.liquido)}</b></div>

    <div class="fgts-card">
      <h3>FGTS</h3>
      ${
        fgts.percentualMulta > 0
          ? `<table class="linhas">
        <tr><td>Saldo informado</td><td>${moeda.format(fgts.informado)}</td></tr>
        <tr><td>FGTS sobre as verbas rescisórias<small>8% sobre saldo, 13º e aviso indenizado</small></td><td>${moeda.format(fgts.rescisao)}</td></tr>
        <tr><td>${fgts.rotuloMulta}<small>base ${moeda.format(fgts.baseMulta)}</small></td><td>${moeda.format(fgts.multa)}</td></tr>
      </table>
      <p>Saque: ${fgts.saque} · Seguro-desemprego: ${fgts.seguroDesemprego}</p>
      <p>Valores do FGTS não entram no líquido acima — são liberados pela conta vinculada.</p>`
          : `<p class="fgts-card__nota">${fgts.rotuloMulta}. ${fgts.saque}. Seguro-desemprego: ${fgts.seguroDesemprego}.</p>
      <p>O empregador continua recolhendo o FGTS sobre as verbas salariais, mas o saldo fica retido na conta vinculada.</p>`
      }
    </div>`;
}

/* ------------------------------------------------------------- atualização */

function atualizarDicas(dados) {
  const remuneracao =
    dados.salarioBase + dados.mediaHorasExtras + dados.mediaAdicionais + dados.mediaComissoes;
  $('#nota-remuneracao').innerHTML = `Remuneração para cálculo: <b>${moeda.format(remuneracao)}</b>`;

  const admissao = parseData(dados.dataAdmissao);
  const desligamento = parseData(dados.dataAviso);
  const dica = $('#dica-periodos');
  if (admissao && desligamento && desligamento >= admissao) {
    const { completos } = periodosAquisitivos(admissao, desligamento);
    dica.textContent = `Períodos aquisitivos completos no contrato: ${completos}. Informe quantos não foram gozados.`;
  } else {
    dica.textContent = 'Preencha as datas para ver os períodos aquisitivos completos.';
  }
}

function atualizar() {
  const dados = coletarDados();
  atualizarDicas(dados);
  if (!tipoSelecionado) return;
  renderResultado(calcularRescisao(dados));
}

/* -------------------------------------------------------------- inicializa */

montarTipos();
$('#badge-vigencia').textContent = VIGENCIA;
$('#rodape-vigencia').textContent = VIGENCIA + ' · INSS e IRRF conforme tabelas progressivas vigentes.';
$('#formulario').addEventListener('input', atualizar);
$('#formulario').addEventListener('submit', (evento) => {
  evento.preventDefault();
  atualizar();
});
$('#formulario').addEventListener('reset', () => setTimeout(atualizar, 0));

for (const id of CAMPOS_MOEDA) {
  const campo = $(`#${id}`);
  campo.addEventListener('blur', () => {
    const valor = parseMoeda(campo.value);
    campo.value = valor ? valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
  });
}
