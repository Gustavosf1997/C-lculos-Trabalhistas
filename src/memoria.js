/**
 * Memória de cálculo para impressão e PDF.
 *
 * Em vez de mandar o formulário para a impressora, monta um documento próprio:
 * os dados informados, o resultado e o aviso legal. A geração do PDF fica a
 * cargo do próprio navegador ("Salvar como PDF" na janela de impressão), o que
 * dispensa qualquer biblioteca externa.
 */

const texto = (el) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

/** O asterisco de campo obrigatório não faz sentido fora do formulário. */
const rotuloLimpo = (el) => texto(el).replace(/\s*\*$/, '');

/** Devolve o valor com o R$ ou o % que, na tela, moram fora do campo. */
function valorComUnidade(entrada) {
  const valor = entrada.value.trim();
  const moldura = entrada.closest('.campo__moeda');
  const unidade = texto(moldura?.querySelector('i'));
  if (!unidade) return valor;
  return moldura.classList.contains('campo__moeda--sufixo') ? `${valor}${unidade}` : `${unidade} ${valor}`;
}

/** Campo escondido pela modalidade escolhida não entra na memória. */
const visivel = (el) => !el.closest('[hidden]') && el.offsetParent !== null;

/**
 * Varre o formulário e devolve o que foi de fato preenchido.
 * @returns {{rotulo: string, valor: string}[]}
 */
export function coletarDadosInformados(formulario) {
  const itens = [];

  for (const campo of formulario.querySelectorAll('.campo')) {
    if (!visivel(campo)) continue;

    // Grupo de marcações (tipo de aviso, adicionais, descontos).
    const marcadas = [...campo.querySelectorAll('.opcao input:checked')];
    if (marcadas.length) {
      itens.push({
        rotulo: rotuloLimpo(campo.querySelector('.campo__rotulo')),
        valor: marcadas.map((i) => texto(i.closest('.opcao'))).join(', '),
      });
      continue;
    }

    // Marcação solta (férias em dobro, cláusula assecuratória).
    const solta = campo.querySelector(':scope > input[type="checkbox"]');
    if (solta) {
      if (solta.checked) itens.push({ rotulo: texto(campo.querySelector('span')), valor: 'Sim' });
      continue;
    }

    const entrada = campo.querySelector('input[type="text"], select');
    if (!entrada || !entrada.value.trim()) continue;
    const valor = entrada.tagName === 'SELECT'
      ? texto(entrada.selectedOptions[0])
      : valorComUnidade(entrada);
    itens.push({ rotulo: rotuloLimpo(campo.querySelector('.campo__rotulo')), valor });
  }

  return itens;
}

/**
 * Preenche o bloco de impressão com o que está na tela.
 *
 * @param {object} secoes
 * @param {string} secoes.titulo módulo (verbas rescisórias, pedido)
 * @param {string} secoes.subtitulo modalidade escolhida
 * @param {HTMLElement} secoes.formulario
 * @param {HTMLElement} secoes.resultado painel já renderizado
 * @param {string} secoes.rodape aviso legal
 */
export function montarMemoria({ titulo, subtitulo, formulario, resultado, rodape }) {
  const alvo = document.getElementById('memoria');
  if (!alvo) return;

  const emitidoEm = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  const dados = coletarDadosInformados(formulario);

  alvo.innerHTML = `
    <header class="memoria__topo">
      <h1>Memória de cálculo</h1>
      <p>${titulo}${subtitulo ? ` — ${subtitulo}` : ''}</p>
      <p class="memoria__data">Emitida em ${emitidoEm}</p>
    </header>

    <section>
      <h2>Dados informados</h2>
      <table class="memoria__dados">
        ${dados.map((d) => `<tr><td>${d.rotulo}</td><td>${d.valor}</td></tr>`).join('')}
      </table>
    </section>

    <section>
      <h2>Resultado</h2>
      ${resultado.innerHTML}
    </section>

    <footer class="memoria__rodape">${rodape}</footer>`;
}

/**
 * Abre a janela de impressão. O nome sugerido para o arquivo vem do título da
 * página, então ele é trocado durante a impressão e devolvido em seguida.
 */
export function imprimir(nomeArquivo) {
  const tituloOriginal = document.title;
  document.title = nomeArquivo;
  const restaurar = () => { document.title = tituloOriginal; };
  addEventListener('afterprint', restaurar, { once: true });
  print();
  // Navegador que não dispara afterprint não deixa o título trocado.
  setTimeout(restaurar, 1000);
}
