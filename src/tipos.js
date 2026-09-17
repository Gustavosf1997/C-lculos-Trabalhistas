/**
 * Catálogo dos tipos de rescisão.
 *
 * Cada tipo declara:
 *  - `grupo`   : contrato por prazo indeterminado ou determinado;
 *  - `verbas`  : o que é (ou não) devido — usado para montar o resumo da tela;
 *  - `aviso`   : as opções de aviso prévio aplicáveis;
 *  - `campos`  : quais grupos de campos o formulário deve exibir;
 *  - `fgts`    : regras de multa/saque/seguro-desemprego.
 *
 * As regras de cálculo em `calculo.js` leem deste mesmo objeto, de modo que
 * incluir um novo tipo de rescisão significa acrescentar uma entrada aqui.
 */

export const GRUPOS = {
  indeterminado: {
    id: 'indeterminado',
    titulo: 'Contrato por prazo indeterminado',
  },
  determinado: {
    id: 'determinado',
    titulo: 'Contrato por prazo determinado (inclusive experiência)',
    ajuda: 'Tem data de término combinada. A experiência dura no máximo 90 dias (art. 445, parágrafo único).',
  },
};

export const TIPOS = {
  sem_justa_causa: {
    id: 'sem_justa_causa',
    grupo: 'indeterminado',
    nome: 'Iniciativa do empregador',
    tag: 'Dispensa sem justa causa',
    icone: '🏢',
    descricao: 'A empresa decide encerrar o contrato sem motivo disciplinar (arts. 477 e 487 da CLT).',
    verbas: [
      { label: 'Saldo de salário', devida: true },
      { label: 'Aviso prévio (indenizado ou trabalhado)', devida: true },
      { label: '13º salário proporcional', devida: true },
      { label: 'Férias vencidas + 1/3', devida: true },
      { label: 'Férias proporcionais + 1/3', devida: true },
      { label: 'Multa de 40% do FGTS', devida: true },
      { label: 'Saque do FGTS e seguro-desemprego', devida: true },
    ],
    aviso: {
      rotulo: 'Cumprimento do aviso prévio',
      ajuda: '30 dias + 3 dias por ano completo de serviço, limitado a 90 dias (Lei 12.506/2011). O aviso indenizado projeta o contrato.',
      opcoes: [
        { valor: 'indenizado', label: 'Indenizado' },
        { valor: 'trabalhado', label: 'Trabalhado' },
      ],
    },
    campos: { fgts: true, decimoTerceiro: true, feriasProporcionais: true, feriasVencidas: true },
    fgts: {
      multa: 0.4,
      rotuloMulta: 'Multa rescisória de 40%',
      saque: 'Saque integral do saldo (código 01)',
      seguroDesemprego: 'Sim, se preenchidos os requisitos legais',
    },
  },

  pedido_demissao: {
    id: 'pedido_demissao',
    grupo: 'indeterminado',
    nome: 'Pedido de demissão',
    tag: 'Iniciativa do empregado',
    icone: '🙋',
    descricao: 'O empregado pede para sair. Deve conceder aviso prévio de 30 dias ao empregador (art. 487, §2º).',
    verbas: [
      { label: 'Saldo de salário', devida: true },
      { label: '13º salário proporcional', devida: true },
      { label: 'Férias vencidas + 1/3', devida: true },
      { label: 'Férias proporcionais + 1/3', devida: true },
      { label: 'Aviso prévio a receber', devida: false, nota: 'o aviso é devido pelo empregado' },
      { label: 'Multa do FGTS / saque / seguro-desemprego', devida: false },
    ],
    aviso: {
      rotulo: 'Aviso prévio dado pelo empregado',
      diasFixos: 30,
      ajuda: 'São 30 dias. Se não cumprido, o empregador pode descontar o valor equivalente (art. 487, §2º).',
      opcoes: [
        { valor: 'trabalhado', label: 'Cumprido' },
        { valor: 'dispensado', label: 'Dispensado (sem desconto)' },
        { valor: 'nao_cumprido', label: 'Não cumprido (desconto de 30 dias)' },
      ],
    },
    campos: { fgts: false, decimoTerceiro: true, feriasProporcionais: true, feriasVencidas: true },
    fgts: {
      multa: 0,
      rotuloMulta: 'Sem multa rescisória',
      saque: 'Não há saque do FGTS',
      seguroDesemprego: 'Não',
    },
  },

  comum_acordo: {
    id: 'comum_acordo',
    grupo: 'indeterminado',
    nome: 'Comum acordo',
    tag: 'Art. 484-A da CLT',
    icone: '🤝',
    descricao: 'Rescisão por acordo entre as partes: aviso e multa pela metade, saque de 80% do FGTS.',
    verbas: [
      { label: 'Saldo de salário', devida: true },
      { label: 'Aviso prévio pela metade (se indenizado)', devida: true },
      { label: '13º salário proporcional (integral)', devida: true },
      { label: 'Férias vencidas + 1/3', devida: true },
      { label: 'Férias proporcionais + 1/3 (integrais)', devida: true },
      { label: 'Multa de 20% do FGTS', devida: true },
      { label: 'Saque de 80% do FGTS', devida: true },
      { label: 'Seguro-desemprego', devida: false },
    ],
    aviso: {
      rotulo: 'Aviso prévio',
      ajuda: 'Se indenizado, é devido pela metade. Se trabalhado, é integral (art. 484-A, I).',
      opcoes: [
        { valor: 'indenizado_metade', label: 'Indenizado (metade)' },
        { valor: 'trabalhado', label: 'Trabalhado (integral)' },
        { valor: 'dispensado', label: 'Dispensado' },
      ],
    },
    campos: { fgts: true, decimoTerceiro: true, feriasProporcionais: true, feriasVencidas: true },
    fgts: {
      multa: 0.2,
      rotuloMulta: 'Multa rescisória de 20%',
      saque: 'Saque de até 80% do saldo',
      seguroDesemprego: 'Não (art. 484-A, §2º)',
    },
  },

  justa_causa: {
    id: 'justa_causa',
    grupo: 'indeterminado',
    nome: 'Justa causa',
    tag: 'Falta grave do empregado (art. 482)',
    icone: '⚖️',
    descricao: 'Dispensa motivada por falta grave. O empregado perde as verbas indenizatórias. Vale também para o contrato por prazo determinado, sem indenização dos arts. 479/480.',
    verbas: [
      { label: 'Saldo de salário', devida: true },
      { label: 'Férias vencidas + 1/3', devida: true },
      { label: '13º salário proporcional', devida: false },
      { label: 'Férias proporcionais + 1/3', devida: false, nota: 'Súmula 171 do TST' },
      { label: 'Aviso prévio', devida: false },
      { label: 'Multa do FGTS / saque / seguro-desemprego', devida: false },
    ],
    aviso: null,
    campos: { fgts: false, decimoTerceiro: false, feriasProporcionais: false, feriasVencidas: true },
    fgts: {
      multa: 0,
      rotuloMulta: 'Sem multa rescisória',
      saque: 'Não há saque do FGTS',
      seguroDesemprego: 'Não',
    },
  },

  determinado_termo_final: {
    id: 'determinado_termo_final',
    grupo: 'determinado',
    nome: 'Término no prazo',
    tag: 'Chegada ao termo final',
    icone: '📅',
    descricao: 'O contrato chega à data combinada e se encerra naturalmente. Não há aviso prévio nem indenização.',
    verbas: [
      { label: 'Saldo de salário', devida: true },
      { label: '13º salário proporcional', devida: true },
      { label: 'Férias vencidas + 1/3', devida: true },
      { label: 'Férias proporcionais + 1/3', devida: true },
      { label: 'Saque do FGTS (código 04)', devida: true },
      { label: 'Aviso prévio', devida: false },
      { label: 'Multa de 40% do FGTS', devida: false },
      { label: 'Seguro-desemprego', devida: false },
    ],
    aviso: null,
    campos: {
      fgts: false, decimoTerceiro: true, feriasProporcionais: true, feriasVencidas: true,
      termoFinal: true, termoEncerraContrato: true,
    },
    fgts: {
      multa: 0,
      rotuloMulta: 'Sem multa rescisória',
      saque: 'Saque integral do saldo (código 04 — término do contrato)',
      seguroDesemprego: 'Não',
    },
  },

  determinado_antecipada_empregador: {
    id: 'determinado_antecipada_empregador',
    grupo: 'determinado',
    nome: 'Rescisão antecipada pelo empregador',
    tag: 'Art. 479 da CLT',
    icone: '⏹️',
    descricao: 'A empresa encerra o contrato antes do termo final e paga metade da remuneração que faltava até lá.',
    verbas: [
      { label: 'Saldo de salário', devida: true },
      { label: 'Indenização do art. 479 (metade dos salários restantes)', devida: true },
      { label: '13º salário proporcional', devida: true },
      { label: 'Férias vencidas + 1/3', devida: true },
      { label: 'Férias proporcionais + 1/3', devida: true },
      { label: 'Multa de 40% do FGTS e saque', devida: true },
      { label: 'Aviso prévio', devida: false, nota: 'salvo cláusula assecuratória' },
      { label: 'Seguro-desemprego', devida: false, nota: 'regra geral' },
    ],
    // Com a cláusula do art. 481 o contrato passa a seguir as regras do prazo
    // indeterminado: entra o aviso prévio e sai a indenização do art. 479.
    verbasComClausula: [
      { label: 'Saldo de salário', devida: true },
      { label: 'Aviso prévio (indenizado ou trabalhado)', devida: true },
      { label: '13º salário proporcional', devida: true },
      { label: 'Férias vencidas + 1/3', devida: true },
      { label: 'Férias proporcionais + 1/3', devida: true },
      { label: 'Multa de 40% do FGTS e saque', devida: true },
      { label: 'Seguro-desemprego', devida: true, nota: 'se preenchidos os requisitos' },
      { label: 'Indenização do art. 479', devida: false, nota: 'substituída pelo aviso prévio' },
    ],
    aviso: {
      rotulo: 'Aviso prévio (cláusula assecuratória)',
      somenteComClausula: true,
      ajuda: 'Com a cláusula do art. 481, aplicam-se as regras do contrato por prazo indeterminado: há aviso prévio e o art. 479 deixa de incidir.',
      opcoes: [
        { valor: 'indenizado', label: 'Indenizado' },
        { valor: 'trabalhado', label: 'Trabalhado' },
      ],
    },
    campos: {
      fgts: true, decimoTerceiro: true, feriasProporcionais: true, feriasVencidas: true,
      termoFinal: true, clausulaAssecuratoria: true,
    },
    indenizacaoAntecipada: { artigo: 479, natureza: 'provento', label: 'Indenização do art. 479' },
    rotuloDataAviso: 'Data da rescisão antecipada',
    dicaDataAviso: 'Último dia efetivamente trabalhado.',
    fgts: {
      multa: 0.4,
      rotuloMulta: 'Multa rescisória de 40%',
      saque: 'Saque integral do saldo',
      seguroDesemprego: 'Não, em regra',
      seguroDesempregoComClausula: 'Sim, se preenchidos os requisitos legais',
    },
  },

  determinado_antecipada_empregado: {
    id: 'determinado_antecipada_empregado',
    grupo: 'determinado',
    nome: 'Rescisão antecipada pelo empregado',
    tag: 'Art. 480 da CLT',
    icone: '↩️',
    descricao: 'O empregado sai antes do termo final e indeniza a empresa pelos prejuízos, limitado ao valor do art. 479.',
    verbas: [
      { label: 'Saldo de salário', devida: true },
      { label: '13º salário proporcional', devida: true },
      { label: 'Férias vencidas + 1/3', devida: true },
      { label: 'Férias proporcionais + 1/3', devida: true },
      { label: 'Indenização ao empregador (art. 480)', devida: false, nota: 'descontada do acerto' },
      { label: 'Multa do FGTS / saque / seguro-desemprego', devida: false },
    ],
    verbasComClausula: [
      { label: 'Saldo de salário', devida: true },
      { label: '13º salário proporcional', devida: true },
      { label: 'Férias vencidas + 1/3', devida: true },
      { label: 'Férias proporcionais + 1/3', devida: true },
      { label: 'Indenização do art. 480', devida: false, nota: 'substituída pelo aviso prévio de 30 dias' },
      { label: 'Multa do FGTS / saque / seguro-desemprego', devida: false },
    ],
    aviso: {
      rotulo: 'Aviso prévio (cláusula assecuratória)',
      somenteComClausula: true,
      diasFixos: 30,
      ajuda: 'Com a cláusula do art. 481, o empregado deve aviso prévio de 30 dias e o art. 480 deixa de incidir.',
      opcoes: [
        { valor: 'trabalhado', label: 'Cumprido' },
        { valor: 'dispensado', label: 'Dispensado (sem desconto)' },
        { valor: 'nao_cumprido', label: 'Não cumprido (desconto de 30 dias)' },
      ],
    },
    campos: {
      fgts: false, decimoTerceiro: true, feriasProporcionais: true, feriasVencidas: true,
      termoFinal: true, clausulaAssecuratoria: true,
    },
    indenizacaoAntecipada: {
      artigo: 480,
      natureza: 'desconto',
      label: 'Indenização ao empregador (art. 480)',
      detalhe: 'limitada ao valor do art. 479',
    },
    rotuloDataAviso: 'Data da saída antecipada',
    dicaDataAviso: 'Último dia efetivamente trabalhado.',
    fgts: {
      multa: 0,
      rotuloMulta: 'Sem multa rescisória',
      saque: 'Não há saque do FGTS',
      seguroDesemprego: 'Não',
    },
  },
};

export const ORDEM_TIPOS = [
  'sem_justa_causa', 'pedido_demissao', 'comum_acordo', 'justa_causa',
  'determinado_termo_final', 'determinado_antecipada_empregador', 'determinado_antecipada_empregado',
];

export const ORDEM_GRUPOS = ['indeterminado', 'determinado'];

export const tiposDoGrupo = (grupo) => ORDEM_TIPOS.filter((id) => TIPOS[id].grupo === grupo);
