export type BotDialogueEvent =
  | 'bot-thinking'
  | 'bot-played-card'
  | 'bot-won-round'
  | 'bot-lost-round'
  | 'partner-won-round'
  | 'partner-lost-round'
  | 'bot-requested-truco'
  | 'bot-accepted-truco'
  | 'bot-declined-truco'
  | 'bot-raised-bet'
  | 'mao-de-onze-pressure'
  | 'mao-de-ferro-pressure'
  | 'match-point-pressure';

export type BotDialogueRelationship = 'partner' | 'rival';

export type BotDialogueLine = {
  text: string;
  weight: number;
  minValue?: number;
  maxValue?: number;
  profile?: 'aggressive' | 'balanced' | 'cautious';
  relationship?: BotDialogueRelationship;
};

const BOT_DIALOGUE_LINES: Record<BotDialogueEvent, BotDialogueLine[]> = {
  'bot-thinking': [
    { text: 'Mesa lida.', weight: 3 },
    { text: 'Ainda tem jogo.', weight: 3 },
    { text: 'Vamos ver.', weight: 3 },
    { text: 'Essa pesa.', weight: 2, minValue: 3 },
    { text: 'Vou guardar jogo.', weight: 3, profile: 'cautious' },
    { text: 'Melhor esperar.', weight: 2, profile: 'cautious' },
    { text: 'Calma na queda.', weight: 2, profile: 'cautious' },
    { text: 'Agora eu quero ver.', weight: 3, profile: 'aggressive' },
    { text: 'Sem medo agora.', weight: 2, profile: 'aggressive' },
    { text: 'Vamos subir.', weight: 2, profile: 'aggressive', minValue: 3 },
    { text: 'Mesa quieta pesa.', weight: 2, relationship: 'rival' },
    { text: 'Estou de olho.', weight: 2, relationship: 'partner' },
  ],
  'bot-played-card': [
    { text: 'Boa carta.', weight: 3 },
    { text: 'Essa pesa.', weight: 3 },
    { text: 'Mesa posta.', weight: 2 },
    { text: 'Foi calculado.', weight: 2 },
    { text: 'Agora segura.', weight: 2 },
    { text: 'Era essa mesmo.', weight: 3, relationship: 'partner' },
    { text: 'Boa, parceiro.', weight: 2, relationship: 'partner' },
    { text: 'Segura agora.', weight: 2, relationship: 'partner' },
    { text: 'Essa ajudou.', weight: 2, relationship: 'partner' },
    { text: 'Segura essa.', weight: 3, relationship: 'rival', profile: 'aggressive' },
    { text: 'Agora apertou.', weight: 2, relationship: 'rival' },
    { text: 'Quero ver bater.', weight: 2, relationship: 'rival' },
    { text: 'Calma na queda.', weight: 2, profile: 'cautious' },
  ],
  'bot-won-round': [
    { text: 'Essa ficou comigo.', weight: 3, relationship: 'rival' },
    { text: 'Aqui não passa.', weight: 3, relationship: 'rival' },
    { text: 'Apertou, hein.', weight: 2, relationship: 'rival', minValue: 3 },
    { text: 'Mesa lida.', weight: 2, relationship: 'rival' },
    { text: 'Foi no detalhe.', weight: 2, relationship: 'rival' },
    { text: 'Carta bem guardada.', weight: 2, relationship: 'rival' },
    { text: 'Essa doeu.', weight: 2, relationship: 'rival', profile: 'aggressive' },
    { text: 'Sem gastar demais.', weight: 2, relationship: 'rival', profile: 'cautious' },
  ],
  'bot-lost-round': [
    { text: 'Ainda tem jogo.', weight: 3, relationship: 'rival' },
    { text: 'Boa. Segue o jogo.', weight: 2, relationship: 'rival' },
    { text: 'Essa eu deixo.', weight: 2, relationship: 'rival', profile: 'cautious' },
    { text: 'Não acabou.', weight: 2, relationship: 'rival' },
    { text: 'Foi só uma.', weight: 2, relationship: 'rival' },
    { text: 'Calma, calma.', weight: 2, relationship: 'rival', profile: 'cautious' },
    { text: 'Vem a próxima.', weight: 2, relationship: 'rival', profile: 'aggressive' },
  ],
  'partner-won-round': [
    { text: 'Boa, parceiro.', weight: 3, relationship: 'partner' },
    { text: 'Essa ajudou.', weight: 3, relationship: 'partner' },
    { text: 'Segura agora.', weight: 2, relationship: 'partner' },
    { text: 'Era essa mesmo.', weight: 3, relationship: 'partner' },
    { text: 'Aí sim.', weight: 2, relationship: 'partner' },
    { text: 'Mesa nossa.', weight: 2, relationship: 'partner' },
    { text: 'Bem jogado.', weight: 2, relationship: 'partner' },
    { text: 'Agora encaixou.', weight: 2, relationship: 'partner' },
  ],
  'partner-lost-round': [
    { text: 'Tranquilo, ainda dá.', weight: 3, relationship: 'partner' },
    { text: 'Sem pressa agora.', weight: 2, relationship: 'partner' },
    { text: 'Vamos buscar.', weight: 3, relationship: 'partner' },
    { text: 'Calma, parceiro.', weight: 2, relationship: 'partner' },
    { text: 'Tem jogo ainda.', weight: 2, relationship: 'partner' },
    { text: 'Não força agora.', weight: 2, relationship: 'partner', profile: 'cautious' },
    { text: 'Na próxima pega.', weight: 2, relationship: 'partner' },
  ],
  'bot-requested-truco': [
    { text: 'Truco. Quero ver.', weight: 3 },
    { text: 'Agora vale.', weight: 3 },
    { text: 'Subiu a pressão.', weight: 3 },
    { text: 'É truco.', weight: 2 },
    { text: 'Quero essa mão.', weight: 2 },
    { text: 'Vamos subir.', weight: 3, profile: 'aggressive' },
    { text: 'Paga pra ver.', weight: 2, profile: 'aggressive' },
    { text: 'Mesa ficou cara.', weight: 2, minValue: 3 },
  ],
  'bot-accepted-truco': [
    { text: 'Aceito essa.', weight: 3 },
    { text: 'Agora é jogo.', weight: 3 },
    { text: 'Pode vir.', weight: 2, profile: 'aggressive' },
    { text: 'Vamos nessa.', weight: 2 },
    { text: 'Pago pra ver.', weight: 2 },
    { text: 'Sem correr agora.', weight: 2, profile: 'aggressive' },
    { text: 'Compro essa.', weight: 2, profile: 'balanced' },
  ],
  'bot-declined-truco': [
    { text: 'Não compro essa.', weight: 3 },
    { text: 'Essa eu deixo passar.', weight: 2, profile: 'cautious' },
    { text: 'Melhor esperar.', weight: 2, profile: 'cautious' },
    { text: 'Hoje não.', weight: 2 },
    { text: 'Mão pequena.', weight: 2, profile: 'cautious' },
    { text: 'Fica pra próxima.', weight: 2 },
    { text: 'Não vou gastar.', weight: 2, profile: 'cautious' },
  ],
  'bot-raised-bet': [
    { text: 'Agora vale.', weight: 3 },
    { text: 'Subiu a pressão.', weight: 3 },
    { text: 'Quero ver segurar.', weight: 2, relationship: 'rival' },
    { text: 'Vamos decidir.', weight: 2, minValue: 6 },
    { text: 'A mesa subiu.', weight: 2 },
    { text: 'Sem voltar atrás.', weight: 2, profile: 'aggressive' },
    { text: 'Agora ficou sério.', weight: 2, minValue: 6 },
    { text: 'Vale alto agora.', weight: 2, minValue: 6 },
  ],
  'mao-de-onze-pressure': [
    { text: 'Agora é queda.', weight: 3 },
    { text: 'Mão pesada.', weight: 3 },
    { text: 'Sem erro agora.', weight: 2 },
    { text: 'Essa decide.', weight: 2 },
    { text: 'Olha a onze.', weight: 2 },
    { text: 'Respira e joga.', weight: 2, relationship: 'partner' },
    { text: 'Quero ver agora.', weight: 2, relationship: 'rival' },
  ],
  'mao-de-ferro-pressure': [
    { text: 'Mão de ferro.', weight: 3 },
    { text: 'Essa decide.', weight: 3 },
    { text: 'Sem erro agora.', weight: 2 },
    { text: 'Agora é queda.', weight: 2 },
    { text: 'Mesa pesada.', weight: 2 },
    { text: 'Tudo ou nada.', weight: 2 },
    { text: 'Ferro na mesa.', weight: 2 },
  ],
  'match-point-pressure': [
    { text: 'Essa pesa.', weight: 3 },
    { text: 'Sem erro agora.', weight: 3 },
    { text: 'Agora decide.', weight: 3 },
    { text: 'Última chamada.', weight: 2 },
    { text: 'Mesa valendo.', weight: 2 },
    { text: 'Não vacila.', weight: 2, relationship: 'partner' },
    { text: 'Quero ver fechar.', weight: 2, relationship: 'rival' },
  ],
};

function normalizeBotProfile(profile: string | null | undefined): BotDialogueLine['profile'] {
  if (profile === 'aggressive' || profile === 'balanced' || profile === 'cautious') {
    return profile;
  }

  return 'balanced';
}

function hashString(value: string): number {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash;
}

function matchesDialogueLine({
  line,
  relationship,
  profile,
  currentValue,
}: {
  line: BotDialogueLine;
  relationship: BotDialogueRelationship;
  profile: BotDialogueLine['profile'];
  currentValue: number;
}): boolean {
  if (line.relationship !== undefined && line.relationship !== relationship) {
    return false;
  }

  if (line.profile !== undefined && line.profile !== profile) {
    return false;
  }

  if (line.minValue !== undefined && currentValue < line.minValue) {
    return false;
  }

  if (line.maxValue !== undefined && currentValue > line.maxValue) {
    return false;
  }

  return true;
}

function pickWeightedLine(candidates: BotDialogueLine[], seed: string): string | null {
  if (candidates.length === 0) {
    return null;
  }

  const totalWeight = candidates.reduce((total, line) => total + line.weight, 0);
  let cursor = hashString(seed) % totalWeight;

  for (const line of candidates) {
    if (cursor < line.weight) {
      return line.text;
    }

    cursor -= line.weight;
  }

  return candidates[0]?.text ?? null;
}

export function pickBotDialogueLine({
  event,
  relationship,
  profile,
  currentValue,
  seed,
  avoidTexts = [],
}: {
  event: BotDialogueEvent;
  relationship: BotDialogueRelationship;
  profile: string | null | undefined;
  currentValue: number;
  seed: string;
  avoidTexts?: string[];
}): string | null {
  const normalizedProfile = normalizeBotProfile(profile);
  const candidates = BOT_DIALOGUE_LINES[event].filter((line) =>
    matchesDialogueLine({
      line,
      relationship,
      profile: normalizedProfile,
      currentValue,
    }),
  );

  if (candidates.length === 0) {
    return null;
  }

  const avoidSet = new Set(avoidTexts);
  const freshCandidates = candidates.filter((line) => !avoidSet.has(line.text));
  const eligibleCandidates = freshCandidates.length > 0 ? freshCandidates : candidates;
  const seedBase = `${event}:${relationship}:${normalizedProfile}:${currentValue}:${seed}`;

  return pickWeightedLine(eligibleCandidates, seedBase);
}
