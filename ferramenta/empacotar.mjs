/**
 * Gera a versão portátil: um único arquivo .html que roda sem servidor, sem
 * instalação e sem internet.
 *
 * O problema a resolver é que o navegador recusa módulos ES abertos por
 * `file://`. Então este empacotador junta os módulos em um script clássico,
 * mantendo cada um no seu próprio escopo — `arredondar` e `num` existem em
 * três arquivos diferentes e não podem se atropelar.
 *
 * As duas abas viram `<template>`. Só uma está no documento por vez, o que
 * resolve de graça a colisão de ids entre as páginas (`#formulario`,
 * `#resultado`, `#gerar-pdf` e outros cinco existem nas duas).
 *
 * Uso: `node ferramenta/empacotar.mjs` grava o arquivo. Importado, exporta
 * `gerar()` e `DESTINO`, de modo que o teste possa reconstruir o pacote e
 * conferir se o arquivo versionado ainda corresponde ao código-fonte.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const ler = (caminho) => readFileSync(join(RAIZ, caminho), 'utf8');

const PAGINAS = [
  { id: 'rescisao', arquivo: 'index.html', entrada: 'src/app-rescisao.js', titulo: 'Verbas Rescisórias' },
  { id: 'pedidos', arquivo: 'pedidos.html', entrada: 'src/app-pedidos.js', titulo: 'Cálculo de Pedidos' },
];

/* ----------------------------------------------------------- módulos ---- */

const IMPORTE = /^import\s*\{([\s\S]*?)\}\s*from\s*['"]([^'"]+)['"];?[ \t]*$/gm;

/** Resolve './x.js' e '../x.js' a partir do módulo que importou. */
function resolver(de, alvo) {
  return posix.normalize(posix.join(posix.dirname(de), alvo));
}

/** Nomes que o módulo exporta. Só há `export const` e `export function`. */
function exportados(fonte) {
  const nomes = [...fonte.matchAll(/^export\s+(?:const|let|function)\s+([A-Za-z_$][\w$]*)/gm)]
    .map((m) => m[1]);
  const inesperado = /^export\s+(?!const|let|function)/m.exec(fonte);
  if (inesperado) throw new Error(`forma de export não suportada: ${inesperado[0]}`);
  return [...new Set(nomes)];
}

/**
 * Lê o módulo e os seus dependentes, deixando o mapa em ordem de dependência:
 * cada módulo só é registrado depois de quem ele importa, porque no script
 * final um IIFE lê o outro no momento em que roda.
 */
function carregar(caminho, vistos = new Map(), emCurso = new Set()) {
  if (vistos.has(caminho)) return vistos;
  if (emCurso.has(caminho)) throw new Error(`ciclo de import passando por ${caminho}`);
  emCurso.add(caminho);

  const fonte = ler(caminho);
  const dependencias = [];
  const corpo = fonte.replace(IMPORTE, (_, nomes, alvo) => {
    if (/\bas\b/.test(nomes)) throw new Error(`import com "as" não suportado em ${caminho}`);
    const dependencia = resolver(caminho, alvo);
    dependencias.push(dependencia);
    const lista = nomes.split(',').map((n) => n.trim()).filter(Boolean).join(', ');
    return `  const { ${lista} } = __modulos['${dependencia}'];`;
  });

  for (const dependencia of dependencias) carregar(dependencia, vistos, emCurso);
  emCurso.delete(caminho);
  vistos.set(caminho, {
    corpo: corpo.replace(/^export\s+/gm, ''),
    nomes: exportados(fonte),
  });
  return vistos;
}

/** Junta os módulos em um script clássico, cada um no seu escopo. */
function empacotarModulos() {
  const modulos = new Map();
  for (const pagina of PAGINAS) carregar(pagina.entrada, modulos);

  const partes = [];
  for (const [caminho, modulo] of modulos) {
    if (PAGINAS.some((p) => p.entrada === caminho)) continue; // entradas vão à parte
    partes.push(
      `  /* ${caminho} */\n`
      + `  __modulos['${caminho}'] = (function () {\n${modulo.corpo}\n`
      + `    return { ${modulo.nomes.join(', ')} };\n  })();`,
    );
  }

  // As entradas viram funções: cada troca de aba monta a tela do zero.
  for (const pagina of PAGINAS) {
    partes.push(
      `  /* ${pagina.entrada} */\n`
      + `  __paginas['${pagina.id}'] = function () {\n${modulos.get(pagina.entrada).corpo}\n  };`,
    );
  }
  return partes.join('\n\n');
}

/* ------------------------------------------------------------ páginas --- */

const entre = (fonte, marca) => {
  const abre = fonte.indexOf(`<${marca}`);
  const inicio = fonte.indexOf('>', abre) + 1;
  return fonte.slice(inicio, fonte.indexOf(`</${marca}>`));
};

/** Corpo da página, sem o `<script>` e com as abas ligadas ao roteador. */
function corpoDaPagina(pagina) {
  let corpo = entre(ler(pagina.arquivo), 'body');

  // Os scripts da página não valem aqui: um é o módulo, que já foi empacotado;
  // o outro avisa sobre cache de servidor, que num arquivo local não existe.
  corpo = corpo.replace(/<script[\s\S]*?<\/script>/g, '');

  // As abas deixam de navegar para outro arquivo e passam a trocar o template.
  for (const alvo of PAGINAS) {
    corpo = corpo.replaceAll(`href="${alvo.arquivo}"`, `href="#${alvo.id}" data-pagina="${alvo.id}"`);
  }
  return corpo.trim();
}

/* -------------------------------------------------------------- saída --- */

const roteador = `
  /* ------------------------------------------------------------ roteador */
  // Só uma aba existe no documento por vez: é isso que impede que os ids
  // repetidos das duas telas se confundam (#formulario, #resultado e outros
  // cinco existem nas duas).
  const TITULOS = ${JSON.stringify(Object.fromEntries(PAGINAS.map((p) => [p.id, p.titulo])))};

  // Os moldes saem do documento e ficam guardados aqui: trocar de aba
  // substitui o corpo inteiro, e um <template> que morasse no corpo iria
  // junto — a primeira troca funcionaria, e nenhuma depois dela.
  const moldes = {};
  for (const molde of document.querySelectorAll('template[id^="pagina-"]')) {
    moldes[molde.id.slice('pagina-'.length)] = molde.content;
    molde.remove();
  }

  let paginaAtual = null;

  function abrir(id) {
    if (!moldes[id] || id === paginaAtual) return;
    paginaAtual = id;
    document.body.replaceChildren(moldes[id].cloneNode(true));
    document.title = TITULOS[id] + ' — Cálculos Trabalhistas';
    if (location.hash.slice(1) !== id) location.hash = id;
    __paginas[id]();
  }

  document.addEventListener('click', (evento) => {
    const aba = evento.target.closest('[data-pagina]');
    if (!aba) return;
    evento.preventDefault();
    abrir(aba.dataset.pagina);
  });

  // Voltar e avançar do navegador trocam de aba, como na versão web.
  addEventListener('hashchange', () => abrir(location.hash.slice(1)));

  abrir(moldes[location.hash.slice(1)] ? location.hash.slice(1) : '${PAGINAS[0].id}');`;

export const DESTINO = 'portatil/calculos-trabalhistas.html';

/** Monta o arquivo portátil e devolve o seu conteúdo. */
export async function gerar() {
  const { CARIMBO } = await import(new URL('../src/versao.js', import.meta.url));

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Cálculos Trabalhistas</title>
<!--
  Versão portátil — ${CARIMBO}

  Arquivo único: abra com dois cliques, em qualquer navegador. Não instala
  nada, não precisa de internet e não envia dado nenhum para servidor — todo
  o cálculo acontece nesta página.

  Gerado por ferramenta/empacotar.mjs a partir do código-fonte. Não edite à
  mão: a próxima geração desfaz a edição, e o teste acusa a diferença.
-->
<style>
${ler('assets/estilos.css').trim()}
</style>
</head>
<body></body>

${PAGINAS.map((p) => `<template id="pagina-${p.id}">\n${corpoDaPagina(p)}\n</template>`).join('\n\n')}

<script>
(function () {
  'use strict';
  const __modulos = {};
  const __paginas = {};

${empacotarModulos()}
${roteador}
})();
</script>
</html>
`;
}

// Só grava quando chamado direto na linha de comando.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const html = await gerar();
  mkdirSync(join(RAIZ, 'portatil'), { recursive: true });
  writeFileSync(join(RAIZ, DESTINO), html, 'utf8');
  console.log(`${DESTINO} — ${(html.length / 1024).toFixed(0)} KB`);
}
