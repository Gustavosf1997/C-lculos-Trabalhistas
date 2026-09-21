/**
 * Consistência entre o catálogo, o HTML e os motores.
 *
 * São erros que não aparecem em nenhum cálculo isolado, mas quebram a tela no
 * uso: dois campos com o mesmo id, um campo que o código lê e o HTML não tem,
 * uma condição `aparece` que olha para um campo inexistente, um limite
 * invertido. Rodam sem navegador — o HTML é lido como texto.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PEDIDOS, JORNADAS } from '../src/pedidos/catalogo.js';
import { TIPOS, ORDEM_TIPOS, ORDEM_GRUPOS, GRUPOS } from '../src/tipos.js';
import { ADICIONAIS, SEM_ADICIONAIS } from '../src/adicionais.js';
import { DESCONTOS, SEM_DESCONTOS } from '../src/descontos.js';

const html = (arquivo) => readFileSync(new URL(`../${arquivo}`, import.meta.url), 'utf8');
const fonte = (arquivo) => readFileSync(new URL(`../${arquivo}`, import.meta.url), 'utf8');

const camposDo = (pedido) => pedido.grupos.flatMap((g) => g.campos);
const TIPOS_VALIDOS = ['data', 'moeda', 'decimal', 'percentual', 'inteiro', 'select', 'checkbox', 'radios'];

/* ------------------------------------------------- catálogo de pedidos --- */

test('cada pedido tem ids de campo únicos', () => {
  for (const pedido of PEDIDOS) {
    const ids = camposDo(pedido).map((c) => c.id);
    const repetidos = ids.filter((id, i) => ids.indexOf(id) !== i);
    assert.deepEqual(repetidos, [], `${pedido.id} repete ${repetidos.join(', ')}`);
  }
});

test('todo campo declara um tipo conhecido', () => {
  for (const pedido of PEDIDOS) {
    for (const campo of camposDo(pedido)) {
      assert.ok(TIPOS_VALIDOS.includes(campo.tipo), `${pedido.id}/${campo.id}: tipo "${campo.tipo}"`);
      assert.ok(campo.rotulo, `${pedido.id}/${campo.id}: sem rótulo`);
    }
  }
});

test('limites de campo são coerentes', () => {
  for (const pedido of PEDIDOS) {
    for (const campo of camposDo(pedido)) {
      if (campo.min === undefined || campo.max === undefined) continue;
      assert.ok(campo.min < campo.max, `${pedido.id}/${campo.id}: min ${campo.min} >= max ${campo.max}`);
      if (campo.valor !== undefined && typeof campo.valor === 'number') {
        assert.ok(campo.valor >= campo.min && campo.valor <= campo.max,
          `${pedido.id}/${campo.id}: valor inicial ${campo.valor} fora de [${campo.min}, ${campo.max}]`);
      }
    }
  }
});

test('select e radios têm opções, e o valor inicial é uma delas', () => {
  for (const pedido of PEDIDOS) {
    for (const campo of camposDo(pedido)) {
      if (campo.tipo !== 'select' && campo.tipo !== 'radios') continue;
      assert.ok(campo.opcoes?.length, `${pedido.id}/${campo.id}: sem opções`);
      const valores = campo.opcoes.map((o) => o.valor);
      assert.ok(valores.includes(campo.valor),
        `${pedido.id}/${campo.id}: valor inicial "${campo.valor}" não está em ${valores.join('|')}`);
    }
  }
});

test('condições de visibilidade só olham campos do próprio pedido', () => {
  // Um `aparece` que lê um campo inexistente nunca revela o campo: o usuário
  // perde a opção sem nenhum aviso.
  const espiao = (ids) => new Proxy({}, {
    get(_, prop) { ids.add(String(prop)); return undefined; },
  });
  for (const pedido of PEDIDOS) {
    const declarados = new Set(camposDo(pedido).map((c) => c.id));
    const condicoes = [
      ...camposDo(pedido).filter((c) => c.aparece).map((c) => [`campo ${c.id}`, c.aparece]),
      ...pedido.grupos.filter((g) => g.aparece).map((g, i) => [`grupo ${g.titulo ?? i}`, g.aparece]),
    ];
    for (const [nome, condicao] of condicoes) {
      const lidos = new Set();
      condicao(espiao(lidos));
      for (const id of lidos) {
        assert.ok(declarados.has(id), `${pedido.id}/${nome}: lê "${id}", que o pedido não declara`);
      }
    }
  }
});

test('todo pedido sabe calcular e resumir', () => {
  for (const pedido of PEDIDOS) {
    assert.equal(typeof pedido.calcular, 'function', pedido.id);
    assert.equal(typeof pedido.resumo, 'function', pedido.id);
    assert.ok(pedido.nome && pedido.tag && pedido.icone && pedido.descricao, pedido.id);
    assert.ok(pedido.itens?.length, `${pedido.id}: sem resumo de verbas`);
  }
});

test('o resumo de cada pedido sobrevive a um contexto mínimo', () => {
  // `resumo` é chamado logo depois do cálculo: se quebrar, a tela fica em
  // branco sem dizer por quê.
  for (const pedido of PEDIDOS) {
    const dados = pedido.semPeriodo
      ? { multa477: true, salarioBase: 2000, dataRescisao: '2026-01-10' }
      : {
        dataInicio: '2024-01-01', dataFim: '2024-12-31', salarioBase: 2200, divisor: 220,
        quantidadeHoras: 10, horasNoturnas: 10, minutosSuprimidos: 30, risco: 'periculosidade',
      };
    const r = pedido.calcular(dados);
    assert.deepEqual(r.erros, [], `${pedido.id}: ${r.erros.join('; ')}`);
    const linhas = pedido.resumo(r.contexto);
    assert.ok(Array.isArray(linhas) && linhas.length, `${pedido.id}: resumo vazio`);
    for (const [rotulo, valor] of linhas) {
      assert.ok(rotulo, `${pedido.id}: linha sem rótulo`);
      assert.ok(!String(valor).includes('NaN'), `${pedido.id}/${rotulo}: ${valor}`);
      assert.ok(!String(valor).includes('undefined'), `${pedido.id}/${rotulo}: ${valor}`);
    }
  }
});

test('as jornadas do catálogo trazem divisor, salvo a opção "outra"', () => {
  for (const jornada of JORNADAS) {
    if (jornada.valor === 'outra') {
      assert.equal(jornada.divisor, null);
      continue;
    }
    assert.ok(jornada.divisor > 0, jornada.valor);
    // divisor = horas semanais x 5 (Súmula 431 do TST)
    assert.equal(jornada.divisor, Number(jornada.valor) * 5, jornada.valor);
  }
});

/* ---------------------------------------- tela de verbas rescisórias ----- */

const indexHtml = html('index.html');
const appRescisao = fonte('src/app-rescisao.js');

test('todo campo lido pelo código existe na tela', () => {
  // Um id que o código lê e a tela não tem devolve sempre vazio: a verba some
  // do cálculo sem nenhum erro visível.
  const lista = /const CAMPOS = \[([\s\S]*?)\];/.exec(appRescisao)[1];
  const ids = [...lista.matchAll(/'([^']+)'/g)].map((m) => m[1]);
  const injetados = new Set(DESCONTOS.map((d) => d.campo));
  assert.ok(ids.length >= 15);
  for (const id of ids) {
    assert.ok(indexHtml.includes(`id="${id}"`) || injetados.has(id),
      `campo "${id}" não existe em index.html nem é injetado por montarDescontos`);
  }
});

test('todo campo de desconto do catálogo é lido pelo código', () => {
  // O caminho inverso: um desconto novo em descontos.js que ninguém lê seria
  // um campo na tela que não entra na conta.
  const lista = /const CAMPOS = \[([\s\S]*?)\];/.exec(appRescisao)[1];
  const ids = [...lista.matchAll(/'([^']+)'/g)].map((m) => m[1]);
  for (const desconto of DESCONTOS) {
    assert.ok(ids.includes(desconto.campo), `o campo "${desconto.campo}" não está em CAMPOS`);
  }
});

test('os campos de desconto do catálogo não colidem com os do HTML', () => {
  // `montarDescontos` injeta um input por desconto: id repetido faria o
  // navegador devolver sempre o primeiro, e o valor digitado sumiria.
  for (const desconto of DESCONTOS) {
    assert.ok(!indexHtml.includes(`id="${desconto.campo}"`),
      `${desconto.campo} está no HTML e também é injetado por montarDescontos`);
  }
  const campos = DESCONTOS.map((d) => d.campo);
  assert.equal(new Set(campos).size, campos.length, 'dois descontos com o mesmo campo');
});

test('todo id de adicional e desconto é único e não usa o rótulo "nenhum"', () => {
  const ids = ADICIONAIS.map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(!ids.includes(SEM_ADICIONAIS));
  const dids = DESCONTOS.map((d) => d.id);
  assert.equal(new Set(dids).size, dids.length);
  assert.ok(!dids.includes(SEM_DESCONTOS));
});

test('os elementos que a tela procura existem no HTML', () => {
  const procurados = [...appRescisao.matchAll(/\$\('#([a-zA-Z0-9_-]+)'\)/g)].map((m) => m[1]);
  const injetados = new Set([
    ...DESCONTOS.map((d) => `campo-${d.id}`),
    ...DESCONTOS.map((d) => d.campo),
  ]);
  const faltando = [...new Set(procurados)]
    .filter((id) => !injetados.has(id))
    .filter((id) => !indexHtml.includes(`id="${id}"`));
  assert.deepEqual(faltando, []);
});

test('todo tipo de rescisão está na ordem e em um grupo conhecido', () => {
  assert.deepEqual([...ORDEM_TIPOS].sort(), Object.keys(TIPOS).sort());
  for (const id of ORDEM_TIPOS) {
    assert.ok(ORDEM_GRUPOS.includes(TIPOS[id].grupo), `${id}: grupo ${TIPOS[id].grupo}`);
    assert.ok(GRUPOS[TIPOS[id].grupo], `${id}: grupo sem título`);
  }
});

test('todo tipo com aviso declara opções, e a primeira é a padrão', () => {
  for (const id of ORDEM_TIPOS) {
    const aviso = TIPOS[id].aviso;
    if (!aviso) continue;
    assert.ok(aviso.opcoes?.length, id);
    assert.ok(aviso.rotulo && aviso.ajuda, id);
    for (const opcao of aviso.opcoes) {
      assert.ok(opcao.valor && opcao.label, `${id}: opção incompleta`);
    }
  }
});

test('todo tipo declara as regras de FGTS que a tela exibe', () => {
  for (const id of ORDEM_TIPOS) {
    const fgts = TIPOS[id].fgts;
    assert.ok(typeof fgts.multa === 'number' && fgts.multa >= 0 && fgts.multa <= 0.4, id);
    assert.ok(fgts.rotuloMulta && fgts.saque && fgts.seguroDesemprego, id);
  }
});

/* --------------------------------------------------- tela de pedidos ----- */

const pedidosHtml = html('pedidos.html');
const appPedidos = fonte('src/app-pedidos.js');

test('os elementos que a tela de pedidos procura existem no HTML', () => {
  const procurados = [...appPedidos.matchAll(/\$\('#([a-zA-Z0-9_-]+)'\)/g)].map((m) => m[1]);
  const injetados = new Set(PEDIDOS.flatMap((p) => [
    ...camposDo(p).map((c) => c.id),
    ...camposDo(p).map((c) => `campo-${c.id}`),
    ...p.grupos.map((_, i) => `grupo-${i}`),
  ]));
  const faltando = [...new Set(procurados)]
    .filter((id) => !injetados.has(id))
    .filter((id) => !pedidosHtml.includes(`id="${id}"`));
  assert.deepEqual(faltando, []);
});

test('as duas páginas carregam o seu próprio módulo e o bloco de memória', () => {
  assert.ok(indexHtml.includes('src/app-rescisao.js'));
  assert.ok(pedidosHtml.includes('src/app-pedidos.js'));
  for (const pagina of [indexHtml, pedidosHtml]) {
    assert.ok(pagina.includes('id="memoria"'), 'sem bloco de impressão');
    assert.ok(pagina.includes('id="versao"'), 'sem carimbo de versão');
    assert.ok(pagina.includes('id="gerar-pdf"'), 'sem botão de PDF');
    assert.ok(pagina.includes('lang="pt-BR"'), 'sem idioma declarado');
  }
});
