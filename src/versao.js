/**
 * Carimbo de versão da ferramenta.
 *
 * O rótulo é escrito na tela pelo próprio módulo, e não pelo HTML: se a data
 * que aparece no cabeçalho não for esta, o navegador (ou o servidor) está
 * entregando um JavaScript antigo — é o jeito mais rápido de separar "código
 * desatualizado" de "cálculo errado".
 *
 * Atualize ATUALIZADO_EM a cada publicação.
 */

export const VERSAO = '0.1';
export const ATUALIZADO_EM = '21/09/2026';
export const CARIMBO = `esboço v${VERSAO} · atualizada em ${ATUALIZADO_EM}`;
