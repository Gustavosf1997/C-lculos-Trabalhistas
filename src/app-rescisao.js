/**
 * Camada de interface: monta os cartões de tipo de rescisão, mostra os campos
 * pertinentes a cada um e apresenta a memória de cálculo.
 */

import { TIPOS, GRUPOS, ORDEM_GRUPOS, tiposDoGrupo } from './tipos.js';
import { calcularRescisao, formatarData, valorHorasExtras } from './calculo.js';
import { VIGENCIA } from './tabelas.js';
import { moeda } from './formato.js';
import { lerCampos, inicializarCampos, marcarErro } from './campos.js';
import { ADICIONAIS, SEM_ADICIONAIS, calcularAdicionais, aplicarExclusoes, adicionalPorId } from './adicionais.js';
import { DESCONTOS, SEM_DESCONTOS, aplicarExclusoesDesconto } from './descontos.js';
import { montarMemoria, imprimir } from './memoria.js';

const $ = (seletor) => document.querySelector(seletor);

/** Todos os campos digitáveis da tela; o tipo de cada um está no HTML. */
const CAMPOS = [
  'dataAdmissao', 'dataAviso', 'dataTermoFinal',
  'salarioBase', 'divisor', 'horasExtras', 'adicionalHoraExtra', 'mediaComissoes', 'horasNoturnas',
  'periodosFeriasVencidas', 'faltasInjustificadas', 'saldoFgts', 'dependentes',
  'horasNegativas', 'pensaoPercentual', 'adiantamentoSalario', 'adiantamento13', 'outrosDescontos',
];

let tipoSelecionado = null;

/* ------------------------------------------------------------ utilitários */

function coletarDados() {
  const { valores, erros } = lerCampos(CAMPOS);
  return {
    ...valores,
    tipo: tipoSelecionado,
    clausulaAssecuratoria: $('#clausulaAssecuratoria').checked,
    feriasDobro: $('#feriasDobro').checked,
    tipoAviso: document.querySelector('input[name="tipoAviso"]:checked')?.value ?? null,
    adicionais: adicionaisMarcados(),
    descontos: descontosMarcados(),
    errosDeCampo: erros,
  };
}

/* ------------------------------------------------- marcações em grupo ----- */

let adicionaisMarcados = () => [];
let descontosMarcados = () => [];

/**
 * Liga um grupo de marcações que tem uma opção "nenhum" e regras de exclusão
 * entre as demais. Devolve a função que lê o que está marcado.
 */
function ligarGrupo(nome, nenhumId, resolverExclusoes) {
  const inputs = () => [...document.querySelectorAll(`input[name="${nome}"]`)];
  const opcaoNenhum = () => inputs().find((i) => i.value === nenhumId);
  const marcados = () =>
    inputs().filter((i) => i.checked).map((i) => i.value).filter((v) => v !== nenhumId);

  for (const input of inputs()) {
    input.addEventListener('change', () => {
      if (input.checked) {
        const permitidos = resolverExclusoes(marcados(), input.value);
        for (const outro of inputs()) {
          if (outro !== input) outro.checked = permitidos.includes(outro.value);
        }
        if (input.value !== nenhumId) opcaoNenhum().checked = false;
      } else if (marcados().length === 0) {
        // Desmarcar o último equivale a dizer que não havia nenhum.
        opcaoNenhum().checked = true;
      }
      atualizar();
    });
  }
  return marcados;
}

function montarMarcacoes(container, nome, nenhumRotulo, itens) {
  const opcoes = [{ id: nenhumRotulo.id, label: nenhumRotulo.label }, ...itens];
  $(container).innerHTML = opcoes
    .map(
      (o, i) => `
      <label class="opcao">
        <input type="checkbox" name="${nome}" value="${o.id}" ${i === 0 ? 'checked' : ''} />
        ${o.label}
      </label>`,
    )
    .join('');
}

const montarAdicionais = () =>
  montarMarcacoes(
    '#opcoes-adicionais',
    'adicionais',
    { id: SEM_ADICIONAIS, label: 'Não recebia adicionais' },
    ADICIONAIS.map((a) => ({ id: a.id, label: a.label })),
  );

function montarDescontos() {
  montarMarcacoes(
    '#opcoes-descontos',
    'descontos',
    { id: SEM_DESCONTOS, label: 'Não há descontos' },
    DESCONTOS.map((d) => ({ id: d.id, label: d.label })),
  );

  // Cada desconto marcado revela o seu próprio campo.
  $('#campos-descontos').innerHTML = DESCONTOS.map((d) => {
    const entrada =
      d.tipo === 'valor'
        ? `<span class="campo__moeda"><i>R$</i><input type="text" inputmode="decimal" data-campo="moeda" data-min="0" id="${d.campo}" placeholder="0,00" /></span>`
        : d.tipo === 'percentual'
          ? `<span class="campo__moeda campo__moeda--sufixo"><input type="text" inputmode="decimal" data-campo="decimal" data-min="0" data-max="100" id="${d.campo}" placeholder="0" /><i>%</i></span>`
          : `<input type="text" inputmode="decimal" data-campo="decimal" data-min="0" data-max="744" id="${d.campo}" placeholder="0" />`;
    return `
      <label class="campo" id="campo-${d.id}" hidden>
        <span class="campo__rotulo">${d.rotulo}</span>
        ${entrada}
        ${d.dica ? `<span class="campo__dica">${d.dica}</span>` : ''}
      </label>`;
  }).join('');
}

/* ------------------------------------------------------- tipos e formulário */

function montarTipos() {
  const container = $('#tipos');
  container.innerHTML = '';
  for (const idGrupo of ORDEM_GRUPOS) {
    const grupo = GRUPOS[idGrupo];
    const bloco = document.createElement('div');
    bloco.className = 'grupo-tipos';
    bloco.innerHTML = `<p class="grupo-tipos__titulo">${grupo.titulo}${
      grupo.ajuda ? ` <span class="grupo-tipos__ajuda">— ${grupo.ajuda}</span>` : ''
    }</p><div class="tipos"></div>`;
    const cartoes = bloco.querySelector('.tipos');

    for (const id of tiposDoGrupo(idGrupo)) {
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
      cartoes.append(botao);
    }
    container.append(bloco);
  }
}

function selecionarTipo(id) {
  tipoSelecionado = id;
  for (const botao of document.querySelectorAll('.tipo')) {
    botao.setAttribute('aria-checked', String(botao.dataset.tipo === id));
  }

  const tipo = TIPOS[id];
  renderResumoTipo(tipo);
  montarOpcoesAviso(tipo);
  aplicarVisibilidade(tipo);
  $('#etapa-dados').hidden = false;
  $('#painel').hidden = false;
  atualizar();
}

/** Resumo das verbas devidas — muda quando há cláusula assecuratória. */
function renderResumoTipo(tipo) {
  const clausula = tipo.campos.clausulaAssecuratoria && $('#clausulaAssecuratoria').checked;
  const verbas = (clausula && tipo.verbasComClausula) || tipo.verbas;
  $('#resumo-tipo').hidden = false;
  $('#resumo-tipo').innerHTML = `
    <p>${tipo.descricao}</p>
    <div class="verbas">${verbas
      .map((v) => `<span class="verba ${v.devida ? '' : 'verba--nao'}">${v.devida ? '✓' : '✕'} ${v.label}${
        v.nota ? ` <small>(${v.nota})</small>` : ''
      }</span>`)
      .join('')}</div>`;
}

/** Mostra apenas os campos que o tipo de rescisão selecionado exige. */
function aplicarVisibilidade(tipo) {
  const campos = tipo.campos;
  $('#grupo-fgts').hidden = !campos.fgts;
  $('#campo-termo-final').hidden = !campos.termoFinal;
  $('#campo-clausula').hidden = !campos.clausulaAssecuratoria;
  // No término no prazo é o próprio termo final que encerra o contrato.
  $('#campo-data-aviso').hidden = Boolean(campos.termoEncerraContrato);
  $('#rotulo-data-aviso').innerHTML = `${tipo.rotuloDataAviso ?? 'Data do aviso prévio / desligamento'} <b>*</b>`;
  $('#dica-data-aviso').textContent = tipo.dicaDataAviso ?? 'Data da comunicação da rescisão.';

  // O aviso prévio do contrato a termo só existe com a cláusula do art. 481.
  const clausula = $('#clausulaAssecuratoria').checked && campos.clausulaAssecuratoria;
  $('#grupo-aviso').hidden = !tipo.aviso || (tipo.aviso.somenteComClausula && !clausula);
}

function montarOpcoesAviso(tipo) {
  if (!tipo.aviso) {
    $('#opcoes-aviso').innerHTML = '';
    return;
  }
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
    atualizarDicaPeriodos(null);
    alvo.innerHTML = `<div class="aviso-erro"><b>Faltam informações para calcular:</b>
      <ul>${resultado.erros.map((e) => `<li>${e}</li>`).join('')}</ul></div>`;
    return;
  }

  const { contexto: c, proventos, descontos, totais, fgts } = resultado;
  const tipo = TIPOS[tipoSelecionado];
  atualizarDicaPeriodos(c);

  // Período vencido a mais do que o contrato comporta é erro do campo, não
  // nota de rodapé: fica marcado onde foi digitado.
  marcarErro(
    $('#periodosFeriasVencidas'),
    c.periodosInformados > c.periodosCompletosCalculados
      ? `O contrato completou ${c.periodosCompletosCalculados} período(s) aquisitivo(s).`
      : null,
  );

  const tempoDeServico =
    c.anos >= 1 ? `${c.anos} ano(s)` : c.meses >= 1 ? `${c.meses} mês(es)` : `${c.diasContrato} dia(s)`;

  const contexto = [
    ['Tempo de serviço', tempoDeServico],
    ['Último dia do contrato', formatarData(c.ultimoDiaTrabalhado)],
  ];
  if (tipo.campos.termoFinal) {
    contexto.push(['Termo final previsto', formatarData(c.termoFinal)]);
    // Só faz sentido no encerramento antecipado.
    if (tipo.indenizacaoAntecipada) {
      contexto.push(['Dias até o termo final', `${c.diasRestantes} dia(s)`]);
    }
  }
  contexto.push(
    ['Aviso prévio', c.avisoAplicavel && c.diasAvisoDevidos ? `${c.diasAvisoDevidos} dias` : 'não indenizado'],
    ['Data projetada', formatarData(c.dataProjetada)],
    ['Avos de 13º', tipo.campos.decimoTerceiro ? `${c.avos13}/12` : 'não devido'],
    ['Avos de férias', tipo.campos.feriasProporcionais ? `${c.avosFerias}/12` : 'não devido'],
    ['Férias vencidas', c.periodosVencidos ? `${c.periodosVencidos} período(s)` : 'nenhum computado'],
  );

  alvo.innerHTML = `
    ${resultado.alertas.map((a) => `<p class="alerta">${a}</p>`).join('')}
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
        <tr><td>FGTS sobre as verbas rescisórias<small>8% sobre saldo, horas extras, 13º e aviso indenizado</small></td><td>${moeda.format(fgts.rescisao)}</td></tr>
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
  const adicionais = calcularAdicionais({
    selecionados: dados.adicionais,
    salarioBase: dados.salarioBase,
    horasNoturnas: dados.horasNoturnas,
  });
  // Base das indenizações: salário, adicionais e médias de variáveis. As horas
  // extras do mês são verba própria e aparecem à parte.
  const remuneracaoFixa = dados.salarioBase + adicionais.total;
  const remuneracao = remuneracaoFixa + dados.mediaComissoes;
  const horasExtras = valorHorasExtras(
    remuneracaoFixa,
    dados.divisor || 220,
    dados.horasExtras,
    dados.adicionalHoraExtra || 50,
  );

  const detalhe = adicionais.itens.length
    ? ` — inclui ${adicionais.itens.map((i) => `${i.label} (${moeda.format(i.valor)})`).join(' e ')}`
    : '';
  $('#nota-remuneracao').innerHTML =
    `Remuneração para cálculo: <b>${moeda.format(remuneracao)}</b>${detalhe}`
    + (horasExtras ? ` · Horas extras do mês: <b>${moeda.format(horasExtras)}</b>` : '');

}

/** Campos que só existem quando a marcação correspondente está ligada. */
function aplicarVisibilidadeMarcacoes() {
  $('#campo-horas-noturnas').hidden = !adicionaisMarcados().some((id) => adicionalPorId(id)?.pedeHoras);

  const marcados = descontosMarcados();
  for (const desconto of DESCONTOS) {
    $(`#campo-${desconto.id}`).hidden = !marcados.includes(desconto.id);
  }
}

/** A contagem de períodos vem do cálculo, para não divergir dele. */
function atualizarDicaPeriodos(contexto) {
  $('#dica-periodos').textContent = contexto
    ? `Períodos aquisitivos completos no contrato: ${contexto.periodosCompletosCalculados}. Informe quantos não foram gozados.`
    : 'Preencha as datas para ver os períodos aquisitivos completos.';
}

function atualizar() {
  aplicarVisibilidadeMarcacoes();
  const dados = coletarDados();
  atualizarDicas(dados);
  if (!tipoSelecionado) return;
  aplicarVisibilidade(TIPOS[tipoSelecionado]);
  renderResumoTipo(TIPOS[tipoSelecionado]);

  // Campo com conteúdo inválido interrompe o cálculo: o valor seria chute.
  if (dados.errosDeCampo.length) {
    $('#resultado').innerHTML = `<div class="aviso-erro"><b>Corrija os campos destacados:</b>
      <ul>${dados.errosDeCampo.map((e) => `<li>${e}</li>`).join('')}</ul></div>`;
  } else {
    renderResultado(calcularRescisao(dados));
  }
  // Só se gera PDF de um cálculo fechado.
  $('#gerar-pdf').disabled = Boolean($('#resultado .aviso-erro'));
}

function gerarPdf() {
  const tipo = TIPOS[tipoSelecionado];
  montarMemoria({
    titulo: 'Verbas rescisórias',
    subtitulo: `${tipo.nome} — ${tipo.tag}`,
    formulario: $('#formulario'),
    resultado: $('#resultado'),
    rodape: 'Uso orientativo. Os valores são estimativas e não substituem o TRCT homologado nem a análise de convenção coletiva, acordo individual ou decisão judicial.',
  });
  imprimir(`Memoria de calculo - ${tipo.nome}`);
}

/* -------------------------------------------------------------- inicializa */

montarTipos();
montarAdicionais();
montarDescontos();
adicionaisMarcados = ligarGrupo('adicionais', SEM_ADICIONAIS, aplicarExclusoes);
descontosMarcados = ligarGrupo('descontos', SEM_DESCONTOS, aplicarExclusoesDesconto);
$('#badge-vigencia').textContent = VIGENCIA;
$('#rodape-vigencia').textContent = VIGENCIA + ' · INSS e IRRF conforme tabelas progressivas vigentes.';
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
$('#gerar-pdf').disabled = true;
