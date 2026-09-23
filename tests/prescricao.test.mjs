/**
 * Prescrição nas três telas: rescisão, pedidos com período e multas.
 *
 * Cada teste fixa uma regra: o biênio do art. 7º, XXIX, da CF contado do fim
 * do aviso projetado (OJ 83 da SDI-1), o quinquênio contado do ajuizamento
 * (Súmula 308, I), e o marco próprio das férias (art. 149 da CLT).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  apurarBienal, limiteBienal, marcoQuinquenal, fimDoConcessivo, dataDaPrescricao,
} from '../src/prescricao.js';
import { calcularRescisao } from '../src/calculo.js';
import { calcularHorasExtras } from '../src/pedidos/horas-extras.js';
import { calcularAdicionalNoturno } from '../src/pedidos/noturno.js';
import { calcularIntervalo } from '../src/pedidos/intervalo.js';
import { calcularAdicionalRiscoPedido } from '../src/pedidos/insalubridade.js';
import { calcularMultas } from '../src/pedidos/multas.js';
import { hojeISO } from '../src/formato.js';

const iso = (data) => data.toISOString().slice(0, 10);
const d = dataDaPrescricao;

/* ------------------------------------------------------ as regras soltas */

test('o biênio vence no dia de igual número, dois anos depois', () => {
  assert.equal(iso(limiteBienal(d('2024-03-10'))), '2026-03-10');
});

test('sem o dia correspondente, o prazo vence no imediato (art. 132, §3º, do CC)', () => {
  assert.equal(iso(limiteBienal(d('2024-02-29'))), '2026-03-01');
});

test('o quinquênio conta cinco anos para trás do ajuizamento', () => {
  assert.equal(iso(marcoQuinquenal(d('2026-09-23'))), '2021-09-23');
});

test('o concessivo termina um dia antes de o aquisitivo completar dois anos', () => {
  // aquisitivo de 10/04/2022 a 09/04/2023; concessivo até 09/04/2024
  assert.equal(iso(fimDoConcessivo(d('2022-04-10'))), '2024-04-09');
});

test('ajuizar no último dia do biênio é tempestivo; no dia seguinte, não', () => {
  assert.equal(apurarBienal('2024-03-10', '2026-03-10').prescrita, false);
  assert.equal(apurarBienal('2024-03-10', '2026-03-11').prescrita, true);
});

test('sem ajuizamento, o biênio vencido vira aviso — nunca impedimento', () => {
  const r = apurarBienal('2020-03-10', null, '2026-09-23');
  assert.equal(r.impedimento, null);
  assert.ok(r.alerta.includes('10/03/2022'));
});

test('sem ajuizamento e com o biênio em curso, não há aviso', () => {
  assert.equal(apurarBienal('2026-01-10', null, '2026-09-23').alerta, null);
});

test('a data de hoje sai no fuso de quem usa, e não em UTC', () => {
  // 23h de 22/09 em São Paulo já é 23/09 em UTC
  assert.equal(hojeISO(new Date(2026, 8, 22, 23, 30)), '2026-09-22');
});

/* ------------------------------------------------- verbas rescisórias --- */

const contrato = {
  tipo: 'sem_justa_causa', tipoAviso: 'indenizado', salarioBase: 3000,
  dataAdmissao: '2014-01-10', dataAviso: '2024-01-10',
};

test('rescisão: o biênio corre do fim do aviso projetado (OJ 83)', () => {
  // 10 anos de casa: 60 dias de aviso, projetado de 10/01 para 10/03/2024
  const r = calcularRescisao({ ...contrato, dataAjuizamento: '2026-03-01' });
  assert.equal(iso(r.contexto.dataProjetada), '2024-03-10');
  assert.equal(iso(r.contexto.limiteBienal), '2026-03-10');
  // contado da data do aviso estaria prescrita; contado da projeção, não
  assert.equal(r.impedimento, null);
  assert.ok(r.totais.liquido > 0);
});

test('rescisão: ajuizamento depois do biênio barra o cálculo inteiro', () => {
  const r = calcularRescisao({ ...contrato, dataAjuizamento: '2026-03-11' });
  assert.ok(r.impedimento?.bienal);
  assert.equal(r.totais, null);
  assert.deepEqual(r.proventos, []);
});

test('rescisão: o aviso trabalhado não projeta, e o biênio encurta', () => {
  const r = calcularRescisao({ ...contrato, tipoAviso: 'trabalhado', dataAjuizamento: '2026-03-01' });
  // 30 dias cumpridos (até 09/02) + 30 indenizados do excedente (até 10/03)
  assert.equal(r.impedimento, null);
  assert.equal(iso(r.contexto.limiteBienal), '2026-03-10');
});

test('rescisão: justa causa não tem aviso, e o biênio corre do desligamento', () => {
  const r = calcularRescisao({ ...contrato, tipo: 'justa_causa', dataAjuizamento: '2026-03-01' });
  assert.ok(r.impedimento?.bienal); // limite em 10/01/2026
});

test('rescisão: sem ajuizamento, avisa quando o biênio já passou', () => {
  const r = calcularRescisao({ ...contrato, dataReferencia: '2026-09-23' });
  assert.equal(r.impedimento, null);
  assert.ok(r.alertas.some((a) => a.includes('10/03/2026')));
  assert.ok(r.contexto.prescricao.includes('informe o ajuizamento'));
});

test('rescisão: ajuizamento anterior à admissão é erro de preenchimento', () => {
  const r = calcularRescisao({ ...contrato, dataAjuizamento: '2010-01-01' });
  assert.ok(r.erros.some((e) => e.includes('ajuizamento')));
});

/* --- férias vencidas: cinco anos do fim do concessivo (art. 149) --- */

const semFerias = {
  tipo: 'sem_justa_causa', tipoAviso: 'indenizado', salarioBase: 3000,
  dataAdmissao: '2015-02-01', dataAviso: '2023-08-01', periodosFeriasVencidas: 6,
};
const ferias = (r) => r.proventos.find((p) => p.chave === 'ferias_vencidas')?.valor ?? 0;

test('férias com o concessivo encerrado antes do marco quinquenal prescrevem', () => {
  // 8 períodos completos, 6 não gozados (3º ao 8º). Ação em 01/02/2025:
  // marco em 01/02/2020. O 3º teve o concessivo até 31/01/2019 e o 4º até
  // 31/01/2020 — os dois antes do marco. Sobram 4.
  const r = calcularRescisao({ ...semFerias, dataAjuizamento: '2025-02-01' });
  assert.equal(r.contexto.periodosPrescritos, 2);
  assert.equal(r.contexto.periodosVencidos, 4);
  assert.equal(ferias(r), 12000);
  assert.ok(r.recorte.mensagem.includes('art. 149'));
});

test('sem ajuizamento, as férias informadas entram todas', () => {
  const r = calcularRescisao(semFerias);
  assert.equal(r.contexto.periodosVencidos, 6);
  assert.equal(ferias(r), 18000);
  assert.equal(r.recorte, null);
});

test('férias recentes não prescrevem', () => {
  const r = calcularRescisao({ ...semFerias, periodosFeriasVencidas: 2, dataAjuizamento: '2025-02-01' });
  assert.equal(r.contexto.periodosPrescritos, 0);
  assert.equal(r.recorte, null);
});

/* ------------------------------------------------ pedidos com período --- */

const pedido = {
  salarioBase: 2200, divisor: 220, quantidadeHoras: 30,
  dataInicio: '2022-01-01', dataFim: '2023-12-31',
};

test('pedidos: sem ajuizamento, o resumo diz que a prescrição não foi apurada', () => {
  const r = calcularHorasExtras(pedido);
  assert.ok(r.contexto.prescricao.includes('informe o ajuizamento'));
});

test('pedidos: com ajuizamento, o resumo traz o marco quinquenal', () => {
  const r = calcularHorasExtras({ ...pedido, dataAjuizamento: '2026-09-23' });
  assert.ok(r.contexto.prescricao.includes('exigível desde 23/09/2021'));
});

test('pedidos: extinção informada sem ajuizamento avisa do biênio vencido', () => {
  const r = calcularHorasExtras({ ...pedido, dataExtincao: '2023-12-31', dataReferencia: '2026-09-23' });
  assert.ok(r.alertas.some((a) => a.includes('31/12/2025')));
  assert.ok(r.totais.geral > 0); // avisa, mas não barra
});

/* ------------------------------------------------------------ multas ---- */

const multa = {
  multa477: true, salarioBase: 2500, dataRescisao: '2023-03-01', dataPagamento: '2023-03-30',
};

test('multas: ajuizamento depois do biênio barra as duas', () => {
  const r = calcularMultas({ ...multa, multa467: true, valorIncontroverso: 5000, dataAjuizamento: '2025-03-02' });
  assert.ok(r.impedimento?.bienal);
});

test('multas: o fim do aviso projetado empurra o biênio (OJ 83)', () => {
  const r = calcularMultas({ ...multa, dataFimAviso: '2023-05-15', dataAjuizamento: '2025-03-02' });
  assert.equal(r.impedimento, null);
  assert.equal(r.totais.geral, 2500);
});

test('multas: sem ajuizamento, o biênio vencido vira aviso', () => {
  const r = calcularMultas({ ...multa, dataReferencia: '2026-09-23' });
  assert.ok(r.alertas.some((a) => a.includes('01/03/2025')));
  assert.equal(r.totais.geral, 2500);
});

test('multas: só a do art. 467, sem datas, segue calculando', () => {
  const r = calcularMultas({ multa467: true, valorIncontroverso: 5000 });
  assert.equal(r.totais.geral, 2500);
  assert.equal(r.contexto.prescricao, null);
});

/* ---------------------- as datas bastam: prescrição antes dos valores --- */
// Os testes anteriores preenchiam salário e horas antes das datas, e por isso
// nunca viram o defeito: com só as datas na tela, cada cálculo pedia o
// salário em vez de acusar a prescrição. Estes preenchem só as datas.

const PEDIDOS_COM_PERIODO = [
  ['horas extras', calcularHorasExtras],
  ['adicional noturno', calcularAdicionalNoturno],
  ['intervalo', calcularIntervalo],
  ['insalubridade/periculosidade', calcularAdicionalRiscoPedido],
];

// O caso do print: período de 2000, extinção em 2000, ação em 2020.
const soDatas = {
  dataInicio: '2000-01-01', dataFim: '2000-01-01', dataAjuizamento: '2020-01-01', dataExtincao: '2000-01-01',
};

for (const [nome, calcular] of PEDIDOS_COM_PERIODO) {
  test(`${nome}: só com as datas, a prescrição bienal já é acusada`, () => {
    const r = calcular(soDatas);
    assert.ok(r.impedimento?.bienal, JSON.stringify(r.erros));
    assert.deepEqual(r.erros, []);
  });

  test(`${nome}: só com as datas, a prescrição quinquenal total já é acusada`, () => {
    const r = calcular({ dataInicio: '2000-01-01', dataFim: '2001-12-31', dataAjuizamento: '2020-01-01' });
    assert.equal(r.impedimento?.titulo, 'Pedido integralmente prescrito', JSON.stringify(r.erros));
  });

  test(`${nome}: prescrição parcial aparece junto da lista do que falta`, () => {
    const r = calcular({ dataInicio: '2019-01-01', dataFim: '2023-12-31', dataAjuizamento: '2026-09-23' });
    assert.equal(r.impedimento, null);
    assert.ok(r.erros.length > 0); // faltam os valores...
    assert.equal(r.recorte?.titulo, 'Parte do período está prescrita'); // ...mas o recorte já vale
  });
}

test('pedidos: extinção e ajuizamento bastam para o biênio, mesmo sem o período', () => {
  const r = calcularHorasExtras({ dataAjuizamento: '2020-01-01', dataExtincao: '2000-01-01' });
  assert.ok(r.impedimento?.bienal);
});

test('pedidos: período com o fim antes do início não vira "tudo prescrito"', () => {
  // erro de digitação: acusar prescrição total seria enganar
  const r = calcularHorasExtras({ dataInicio: '2025-01-01', dataFim: '2010-01-01', dataAjuizamento: '2026-09-23' });
  assert.equal(r.impedimento, null);
  assert.ok(r.erros.some((e) => e.includes('anterior ao início')));
});

test('pedidos: formulário vazio segue listando tudo o que falta de uma vez', () => {
  const r = calcularHorasExtras({});
  assert.ok(r.erros.length >= 4);
});

test('multas: só com as datas, o biênio já é acusado', () => {
  const r = calcularMultas({ multa477: true, dataRescisao: '2000-01-01', dataAjuizamento: '2020-01-01' });
  assert.ok(r.impedimento?.bienal, JSON.stringify(r.erros));
});

test('multas: biênio vencido em relação a hoje aparece junto do que falta', () => {
  const r = calcularMultas({ multa477: true, dataRescisao: '2020-01-01', dataReferencia: '2026-09-23' });
  assert.ok(r.erros.length > 0);
  assert.ok(r.alertas.some((a) => a.includes('01/01/2022')));
});

test('rescisão: só com as datas, o biênio já é acusado', () => {
  const r = calcularRescisao({
    tipo: 'sem_justa_causa', tipoAviso: 'indenizado',
    dataAdmissao: '1995-01-01', dataAviso: '2000-01-01', dataAjuizamento: '2020-01-01',
  });
  assert.ok(r.impedimento?.bienal, JSON.stringify(r.erros));
});

test('rescisão: com as datas no prazo, aí sim o salário é pedido', () => {
  const r = calcularRescisao({
    tipo: 'sem_justa_causa', tipoAviso: 'indenizado',
    dataAdmissao: '2020-01-01', dataAviso: '2026-06-01', dataAjuizamento: '2026-09-01',
  });
  assert.equal(r.impedimento, null);
  assert.deepEqual(r.erros, ['Informe o último salário base.']);
});

test('rescisão: biênio vencido em relação a hoje aparece junto do que falta', () => {
  const r = calcularRescisao({
    tipo: 'sem_justa_causa', tipoAviso: 'indenizado',
    dataAdmissao: '2010-01-01', dataAviso: '2020-01-01', dataReferencia: '2026-09-23',
  });
  assert.deepEqual(r.erros, ['Informe o último salário base.']);
  assert.ok(r.alertas.some((a) => a.includes('prazo de dois anos')));
});
