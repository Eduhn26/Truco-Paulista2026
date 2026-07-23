export type AiLabMetric = {
  id: string;
  label: string;
  value: string;
  detail: string;
  tone: 'gold' | 'green' | 'neutral';
};

export type AiLabPipelineStep = {
  id: string;
  order: number;
  title: string;
  description: string;
};

export const AI_LAB_METRICS: readonly AiLabMetric[] = [
  {
    id: 'decision-rows',
    label: 'Decisões registradas',
    value: '495.546',
    detail: 'Linhas acumuladas de decisão no dataset experimental',
    tone: 'gold',
  },
  {
    id: 'simulated-hands',
    label: 'Mãos simuladas',
    value: '106.256',
    detail: 'Estados de jogo produzidos pelo ambiente de simulação',
    tone: 'neutral',
  },
  {
    id: 'balanced-accuracy',
    label: 'Balanced Accuracy',
    value: '74,29%',
    detail: 'Holdout final com partidas e seeds novos',
    tone: 'green',
  },
  {
    id: 'roc-auc',
    label: 'ROC AUC',
    value: '0,8305',
    detail: 'Capacidade discriminativa do candidato final',
    tone: 'green',
  },
];

export const AI_LAB_SECONDARY_FACTS = [
  { label: 'Partidas no dataset', value: '6.000' },
  { label: 'Estados usados no treino', value: '203.167' },
  { label: 'Acerto em alta confiança', value: '85,42%' },
] as const;

export const AI_LAB_MODEL = {
  name: 'Random Forest',
  artifactVersion: '1.0',
  evaluationRows: '101.648',
  highConfidenceCoverage: '57,29%',
} as const;

export const AI_LAB_PIPELINE: readonly AiLabPipelineStep[] = [
  {
    id: 'simulation',
    order: 1,
    title: 'Simulação',
    description: 'Partidas sintéticas entre perfis controlados.',
  },
  {
    id: 'telemetry',
    order: 2,
    title: 'Telemetria',
    description: 'Eventos, mãos e decisões viram dados observáveis.',
  },
  {
    id: 'dataset',
    order: 3,
    title: 'Dataset',
    description: 'Os registros são validados e preparados com Pandas.',
  },
  {
    id: 'features',
    order: 4,
    title: 'Features',
    description: 'As cartas e o contexto viram atributos do modelo.',
  },
  {
    id: 'random-forest',
    order: 5,
    title: 'Random Forest',
    description: 'O candidato final estima a chance de vencer a mão.',
  },
  {
    id: 'runtime',
    order: 6,
    title: 'Runtime',
    description: 'O artefato versionado passa a inferir estados reais.',
  },
  {
    id: 'shadow-mode',
    order: 7,
    title: 'Shadow Mode',
    description: 'O ML observa em paralelo sem controlar a partida.',
  },
  {
    id: 'ml-assisted',
    order: 8,
    title: 'ML-assisted',
    description: 'O sinal probabilístico entra em decisões elegíveis.',
  },
  {
    id: 'ab-test',
    order: 9,
    title: 'A/B Test',
    description: 'A estratégia assistida é comparada à heurística.',
  },
];

export type AiLabModelStage = {
  id: string;
  index: string;
  name: string;
  role: string;
  description: string;
  status: string;
  selected?: boolean;
};

export type AiLabFeatureSignal = {
  rank: number;
  label: string;
  technicalName: string;
};

export const AI_LAB_MODEL_STAGES: readonly AiLabModelStage[] = [
  {
    id: 'dummy',
    index: '01',
    name: 'Dummy Classifier',
    role: 'Baseline de referência',
    description: 'Estabeleceu o ponto mínimo que um modelo treinado precisava superar.',
    status: 'Baseline',
  },
  {
    id: 'logistic',
    index: '02',
    name: 'Logistic Regression',
    role: 'Sinal linear',
    description: 'Testou se as features disponíveis já separavam vitórias e derrotas de forma simples.',
    status: 'Benchmark',
  },
  {
    id: 'decision-tree',
    index: '03',
    name: 'Decision Tree',
    role: 'Relações não lineares',
    description: 'Capturou combinações e limiares de jogo que um modelo linear não representa tão bem.',
    status: 'Benchmark',
  },
  {
    id: 'random-forest',
    index: '04',
    name: 'Random Forest',
    role: 'Candidato final',
    description: 'Entregou o melhor resultado geral entre os candidatos avaliados no pipeline principal.',
    status: 'Selecionado · 74,29% balanced accuracy',
    selected: true,
  },
];

export const AI_LAB_CANDIDATE_DETAILS = [
  { label: 'Features do modelo', value: '21' },
  { label: 'Árvores', value: '250' },
  { label: 'Profundidade máxima', value: '12' },
  { label: 'Min. amostras por folha', value: '10' },
] as const;

export const AI_LAB_FEATURE_SIGNALS: readonly AiLabFeatureSignal[] = [
  {
    rank: 1,
    label: 'Potência média das cartas',
    technicalName: 'average_card_power',
  },
  {
    rank: 2,
    label: '2ª carta mais forte',
    technicalName: 'second_strongest_card_power',
  },
  {
    rank: 3,
    label: 'Carta mais fraca',
    technicalName: 'weakest_card_power',
  },
  {
    rank: 4,
    label: 'Quantidade de cartas altas',
    technicalName: 'high_card_count',
  },
  {
    rank: 5,
    label: 'Carta mais forte',
    technicalName: 'strongest_card_power',
  },
  {
    rank: 6,
    label: 'Quantidade de manilhas',
    technicalName: 'manilha_count',
  },
];

export const AI_LAB_FEATURE_REFACTOR = [
  {
    index: '01',
    title: 'Dependência identificada',
    description:
      'A análise mostrou que parte relevante do desempenho inicial dependia de hand_strength.',
  },
  {
    index: '02',
    title: 'Heurística removida',
    description:
      'A feature não era vazamento do alvo, mas carregava conhecimento manual já codificado no bot.',
  },
  {
    index: '03',
    title: 'Cartas viram features',
    description:
      'O pipeline passou a derivar sinais diretamente das cartas visíveis e do contexto da partida.',
  },
  {
    index: '04',
    title: 'Modelo independente',
    description:
      'O candidato final aprende com 21 features sem usar hand_strength como atalho.',
  },
] as const;

export type AiLabBotProfile = 'aggressive' | 'balanced' | 'cautious';
export type AiLabDecisionScenario = 'initiative' | 'bet-response';

export type AiLabAssistedThresholds = {
  initiative: number;
  accept: number;
  raiseValue: number;
  decline: number;
};

export const AI_LAB_ASSISTED_THRESHOLDS: Record<
  AiLabBotProfile,
  AiLabAssistedThresholds
> = {
  aggressive: {
    initiative: 0.74,
    accept: 0.62,
    raiseValue: 0.84,
    decline: 0.30,
  },
  balanced: {
    initiative: 0.79,
    accept: 0.68,
    raiseValue: 0.88,
    decline: 0.28,
  },
  cautious: {
    initiative: 0.84,
    accept: 0.74,
    raiseValue: 0.92,
    decline: 0.25,
  },
};

export const AI_LAB_PROFILE_LABELS: Record<AiLabBotProfile, string> = {
  aggressive: 'Agressivo',
  balanced: 'Equilibrado',
  cautious: 'Cauteloso',
};

export const AI_LAB_RUNTIME_STEPS = [
  {
    id: 'state',
    index: '01',
    title: 'Estado visível',
    description: 'Cartas do jogador, vira, placar e estado atual da aposta.',
  },
  {
    id: 'heuristic',
    index: '02',
    title: 'Heurística decide',
    description: 'O motor determinístico continua sendo a referência segura.',
  },
  {
    id: 'shadow',
    index: '03',
    title: 'ML observa',
    description: 'O modelo estima a probabilidade em paralelo, sem controlar o jogo.',
  },
  {
    id: 'telemetry',
    index: '04',
    title: 'Telemetria registra',
    description: 'Estado, decisão heurística e previsão podem ser persistidos para análise.',
  },
] as const;

export const AI_LAB_ASSISTED_ACTIONS = [
  'Pedir truco',
  'Aceitar aposta',
  'Recusar aposta',
  'Aumentar para 6',
  'Aumentar para 9',
  'Aumentar para 12',
] as const;

export const AI_LAB_HEURISTIC_RESPONSIBILITIES = [
  'Escolha das cartas',
  'Rodadas posteriores',
  'Estados não suportados',
  'Regras de mãos especiais',
  'Proteções sensíveis ao placar',
  'Fallback seguro',
] as const;

export const AI_LAB_AB_RESULT = {
  totalMatches: 600,
  assistedWins: 317,
  heuristicWins: 283,
  assistedWinRate: 52.83,
  heuristicWinRate: 47.17,
  mlOverrides: 641,
  confidenceInterval95: {
    lower: 48.84,
    upper: 56.83,
  },
  verdict: 'Promissor, porém estatisticamente inconclusivo.',
} as const;

export const AI_LAB_LIMITATIONS = [
  {
    id: 'simulator-domain',
    index: '01',
    title: 'Domínio do simulador',
    description:
      'O modelo foi treinado e validado no simulador do projeto e na família atual de perfis de bot.',
  },
  {
    id: 'human-generalization',
    index: '02',
    title: 'Jogadores humanos',
    description:
      'Os resultados não comprovam o mesmo desempenho contra comportamento humano real.',
  },
  {
    id: 'first-decision',
    index: '03',
    title: 'Primeira decisão',
    description:
      'O candidato foi desenhado para estados iniciais elegíveis e não é um avaliador universal da partida.',
  },
  {
    id: 'one-v-one',
    index: '04',
    title: 'Escopo 1v1',
    description:
      'O uso ML-assisted considerado seguro permanece restrito ao 1v1 nesta versão experimental.',
  },
  {
    id: 'ab-evidence',
    index: '05',
    title: 'Evidência A/B',
    description:
      'A vantagem observada é promissora, mas o intervalo de confiança ainda inclui 50%.',
  },
] as const;



export type AiLabIntelligenceMode = 'heuristic' | 'shadow' | 'ml-assisted';

export const AI_LAB_INTELLIGENCE_LABELS: Record<AiLabIntelligenceMode, string> = {
  heuristic: 'Heurística',
  shadow: 'Shadow Mode',
  'ml-assisted': 'ML-assisted',
};

export const AI_LAB_INTELLIGENCE_DESCRIPTIONS: Record<AiLabIntelligenceMode, string> = {
  heuristic: 'Motor determinístico original. Nenhuma inferência ML participa da decisão.',
  shadow: 'A heurística decide e o modelo observa em paralelo, sem alterar a partida.',
  'ml-assisted': 'O modelo pode influenciar somente apostas elegíveis e sempre preserva fallback.',
};

export const AI_LAB_STUDIO_GUARDRAILS = [
  'Configuração isolada do AI Lab',
  'Não altera o bot padrão do jogo',
  'Escopo ML atual restrito a 1v1',
  'Fallback heurístico preservado',
] as const;
