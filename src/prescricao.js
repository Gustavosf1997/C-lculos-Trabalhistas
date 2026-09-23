/**
 * Prescrição trabalhista, comum às duas telas.
 *
 * O art. 7º, XXIX, da CF reúne dois prazos, e a Súmula 308 do TST os
 * harmoniza:
 *
 *  - **bienal**: extinto o contrato, a ação tem de ser ajuizada em dois anos.
 *    O prazo corre do fim do aviso prévio, inclusive do projetado quando ele
 *    é indenizado (OJ 83 da SDI-1). Perdido o biênio, nada resta a calcular;
 *  - **quinquenal**: respeitado o biênio, são exigíveis as parcelas dos cinco
 *    anos imediatamente anteriores ao ajuizamento — contados dele, e não da
 *    extinção (Súmula 308, I).
 *
 * As férias têm marco próprio: prescrevem em cinco anos contados do fim do
 * período concessivo (art. 149 da CLT).
 *
 * Os prazos em anos vencem no dia de igual número; faltando esse dia (29 de
 * fevereiro), no imediato — art. 132, §3º, do Código Civil, que é o que o
 * `Date.UTC` já faz ao rolar a data.
 *
 * Módulo puro: não depende de nenhum outro, para poder ser usado tanto pelo
 * motor da rescisão quanto pelos pedidos sem criar ciclo de importação.
 */

const somarAnos = (data, anos) =>
  new Date(Date.UTC(data.getUTCFullYear() + anos, data.getUTCMonth(), data.getUTCDate()));

export const dataDaPrescricao = (iso) => {
  if (!iso) return null;
  if (iso instanceof Date) return iso;
  const [ano, mes, dia] = String(iso).split('-').map(Number);
  return ano && mes && dia ? new Date(Date.UTC(ano, mes - 1, dia)) : null;
};

export const formatarDataPrescricao = (data) =>
  (data ? data.toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—');
const fmt = formatarDataPrescricao;

/** Último dia para ajuizar: dois anos da extinção. */
export const limiteBienal = (extincao) => somarAnos(extincao, 2);

/** Primeiro dia exigível: cinco anos antes do ajuizamento. */
export const marcoQuinquenal = (ajuizamento) => somarAnos(ajuizamento, -5);

/** Fim do período concessivo de um período aquisitivo que começou em `inicio`. */
export const fimDoConcessivo = (inicioAquisitivo) =>
  new Date(somarAnos(inicioAquisitivo, 2).getTime() - 86400000);

/**
 * Apura o biênio.
 *
 * @param {Date|string} extincao fim do contrato, já com a projeção do aviso
 * @param {Date|string} ajuizamento data da propositura (opcional)
 * @param {Date|string} referencia "hoje", para avisar de biênio vencido quando
 *   a ação ainda não tem data (opcional — sem ela o motor não depende do relógio)
 * @returns {{limite: Date|null, prescrita: boolean, impedimento: object|null, alerta: string|null}}
 */
export function apurarBienal(extincao, ajuizamento, referencia) {
  const fim = dataDaPrescricao(extincao);
  const acao = dataDaPrescricao(ajuizamento);
  const hoje = dataDaPrescricao(referencia);
  if (!fim) return { limite: null, prescrita: false, impedimento: null, alerta: null };

  const limite = limiteBienal(fim);

  if (acao && acao > limite) {
    return {
      limite,
      prescrita: true,
      alerta: null,
      impedimento: {
        integral: true,
        bienal: true,
        marco: limite,
        titulo: 'Pretensão atingida pela prescrição bienal',
        mensagem: `O contrato terminou em ${fmt(fim)} e a ação só foi ajuizada em ${fmt(acao)}, `
          + `depois do biênio que se encerrou em ${fmt(limite)} (art. 7º, XXIX, da CF). `
          + 'Prescrita a pretensão como um todo, não há parcela exigível a calcular.',
      },
    };
  }

  // Sem data de ajuizamento não há como afirmar a prescrição — a ação pode já
  // ter sido proposta. Mas, se o biênio já passou, isso precisa estar na tela.
  const alerta = !acao && hoje && hoje > limite
    ? `O prazo de dois anos para ajuizar terminou em ${fmt(limite)}. Se a ação ainda não foi proposta, `
      + 'a pretensão está prescrita (art. 7º, XXIX, da CF). Informe a data do ajuizamento para apurar.'
    : null;

  return { limite, prescrita: false, impedimento: null, alerta };
}

/** Texto curto para a linha "Prescrição" do resumo. */
export function descreverPrescricao({ ajuizamento, limite, marco }) {
  const partes = [];
  if (marco) partes.push(`exigível desde ${fmt(marco)}`);
  if (limite) partes.push(ajuizamento ? `biênio até ${fmt(limite)}` : `ajuizar até ${fmt(limite)}`);
  if (!ajuizamento) partes.push('informe o ajuizamento para apurar');
  return partes.join(' · ');
}
