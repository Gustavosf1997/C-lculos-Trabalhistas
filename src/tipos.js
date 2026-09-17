/**
 * Catálogo dos tipos de rescisão.
 *
 * Cada tipo declara:
 *  - `verbas`  : o que é (ou não) devido — usado para montar o resumo da tela;
 *  - `aviso`   : as opções de aviso prévio aplicáveis;
 *  - `campos`  : quais grupos de campos o formulário deve exibir;
 *  - `fgts`    : regras de multa/saque/seguro-desemprego.
 *
 * As regras de cálculo em `calculo.js` leem deste mesmo objeto, de modo que
 * incluir um novo tipo de rescisão significa acrescentar uma entrada aqui.
 */

export const TIPOS = {
  sem_justa_causa: {
    id: 'sem_justa_causa',
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
    nome: 'Justa causa',
    tag: 'Falta grave do empregado (art. 482)',
    icone: '⚖️',
    descricao: 'Dispensa motivada por falta grave. O empregado perde as verbas indenizatórias.',
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
};

export const ORDEM_TIPOS = ['sem_justa_causa', 'pedido_demissao', 'comum_acordo', 'justa_causa'];
