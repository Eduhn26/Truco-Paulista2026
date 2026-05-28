export type SeatId = 'T1A' | 'T1B' | 'T2A' | 'T2B' | string;
export type Suit = 'C' | 'O' | 'P' | 'E' | string;
export type Rank = '4' | '5' | '6' | '7' | 'Q' | 'J' | 'K' | 'A' | '2' | '3' | string;
export type MatchState = 'waiting' | 'in_progress' | 'finished' | string;
export type RoundResult = 'P1' | 'P2' | 'TIE' | string;
export type PlayerId = 'P1' | 'P2' | string;
export type HandValue = 1 | 3 | 6 | 9 | 12 | number;
export type HandBetState = 'idle' | 'awaiting_response' | string;
export type HandSpecialState = 'normal' | 'mao_de_onze' | 'mao_de_ferro' | string;
export type NextDecisionType =
  | 'idle'
  | 'play-card'
  | 'respond-bet'
  | 'resolve-mao-de-onze'
  | 'start-next-hand'
  | 'match-finished'
  | string;

export type CardPayload = {
  rank: Rank;
  suit: Suit;
};

export type ServerErrorPayload = {
  message: string;
};

export type PlayerAssignedPayload = {
  matchId: string;
  seatId: SeatId;
  teamId?: string;
  playerId?: PlayerId;
  playerToken?: string;
  profileId?: string;
  displayName?: string;
  publicName?: string;
  publicSlug?: string;
};

export type BotProfilePayload = 'balanced' | 'aggressive' | 'cautious' | string;

export type BotIdentityPayload = {
  id: string;
  displayName: string;
  avatarKey: string;
  profile: BotProfilePayload;
};

export type BotDecisionSourcePayload =
  | 'heuristic'
  | 'python-remote'
  | 'heuristic-fallback'
  | 'unknown'
  | string;

export type BotDecisionOrderedPlayPayload = {
  ownerId: string;
  seatId: SeatId | null;
  playerId: PlayerId;
  card: string;
};

export type BotDecisionTelemetryPayload = {
  seatId: SeatId;
  teamId: 'T1' | 'T2' | string;
  playerId: PlayerId;
  profile: BotProfilePayload;
  action: string;
  source: BotDecisionSourcePayload;
  strategy?: string;
  handStrength?: number;
  reason?: string;
  mode?: string;
  actorSeatId?: SeatId;
  actorTeamId?: 'T1' | 'T2' | string;
  partnerSeatId?: SeatId | null;
  winningSeatIdBeforeDecision?: SeatId | null;
  winningTeamIdBeforeDecision?: 'T1' | 'T2' | string | null;
  winningCardBeforeDecision?: string | null;
  partnerWasWinning?: boolean;
  actorHandBefore?: string[];
  selectedCard?: string;
  executionStatus?: 'pending' | 'succeeded' | 'blocked' | 'rejected' | 'fallback-card' | string;
  executedAction?: string;
  executionReason?: string;
  executionError?: string;
  betCurrentValue?: number;
  betPendingValue?: number | null;
  betState?: string;
  betRequestedBy?: PlayerId | null;
  betSpecialState?: string;
  betSelectedAction?: string;
  betProgressBoost?: number;
  betScoreBoost?: number;
  betEffectiveStrength?: number;
  betAcceptThreshold?: number;
  betRaiseThreshold?: number;
  betInitiativeThreshold?: number;
  betBluffProbability?: number;
  betDeclineFloor?: number;
  betMyPointsToWin?: number;
  betOpponentPointsToWin?: number;
  betDeclineLosesMatch?: boolean;
  betAcceptRisksMatch?: boolean;
  betRoundsWonByMe?: number;
  betRoundsWonByOpponent?: number;
  betRoundsTied?: number;
  betCurrentRoundIndex?: number;
  seatPlays?: Partial<Record<SeatId, string | null>>;
  orderedPlays?: BotDecisionOrderedPlayPayload[];
  occurredAt?: string;
};

export type RoomLeftPayload = {
  matchId: string;
};

export type QueueModePayload = '1v1' | '2v2' | string;

export type QueuePlayerPayload = {
  userId: string;
  rating: number;
  joinedAt: number;
  socketId: string;
  playerToken: string;
};

export type QueueSnapshotPayload = {
  mode: QueueModePayload;
  size: number;
  playersWaiting: QueuePlayerPayload[];
};

export type MatchFoundPayload = {
  matchId: string;
  mode: QueueModePayload;
  players: Array<{
    userId: string;
    playerToken: string;
    rating: number;
  }>;
};

export type QueueLeftPayload = {
  left: boolean;
  mode?: QueueModePayload;
  snapshot?: QueueSnapshotPayload;
};

export type QueueTimeoutPayload = {
  mode: QueueModePayload;
  reason: string;
  availableActions: string[];
};

export type PartnerSignalKind =
  | 'manilha-zap'
  | 'manilha-copas'
  | 'manilha-espadilha'
  | 'manilha-ouros'
  | 'has-manilha'
  | 'strong-manilha'
  | 'weak-manilha'
  | 'no-manilha'
  | 'strong-hand'
  | 'weak-hand'
  | 'hold'
  | 'kill-round'
  | 'low-card'
  | 'pressure'
  | 'avoid-bet';

export type PartnerSignalPayload = {
  signalId: string;
  matchId: string;
  fromSeatId: SeatId;
  toTeamId: 'T1' | 'T2' | string;
  kind: PartnerSignalKind;
  label: string;
  createdAt: string;
  expiresAt: string;
};

export type RoomStatePayload = {
  matchId: string;
  mode?: '1v1' | '2v2' | string;
  players: Array<{
    seatId: SeatId;
    teamId: string;
    ready: boolean;
    userId?: string | null;
    playerToken?: string | null;
    displayName?: string | null;
    publicName?: string | null;
    publicSlug?: string | null;
    isBot?: boolean;
    botIdentity?: BotIdentityPayload;
  }>;
  canStart: boolean;
  currentTurnSeatId: SeatId | null;
  fillBotsOnStart?: boolean;
  lastBotDecision?: BotDecisionTelemetryPayload | null;
};

export type TeamBetDecisionActionPayload = 'accept' | 'decline' | 'raise';

export type PartnerBetAdvicePayload = {
  seatId: SeatId;
  action: TeamBetDecisionActionPayload;
  confidence: number;
  label: string;
  reason: string;
};

export type PendingTeamBetDecisionPayload = {
  decisionId: string;
  respondingTeamId: 'T1' | 'T2';
  requestedBySeatId: SeatId | null;
  requestedValue: HandValue;
  currentValue: HandValue;
  phase: 'collecting_votes';
  expiresAt: string;
  votesBySeat: Partial<Record<SeatId, TeamBetDecisionActionPayload>>;
  botAdviceBySeat: Partial<Record<SeatId, PartnerBetAdvicePayload>>;
};

export type MatchAvailableActionsPayload = {
  canRequestTruco: boolean;
  canRaiseToSix: boolean;
  canRaiseToNine: boolean;
  canRaiseToTwelve: boolean;
  canAcceptBet: boolean;
  canDeclineBet: boolean;
  canAcceptMaoDeOnze: boolean;
  canDeclineMaoDeOnze: boolean;
  canAttemptPlayCard: boolean;
};

export type MatchStateRoundPlayPayload = {
  ownerId: string;
  seatId: SeatId | null;
  playerId: PlayerId;
  card: string;
};

export type MatchStateRoundPayload = {
  playerOneCard: string | null;
  playerTwoCard: string | null;
  result: RoundResult | null;
  finished: boolean;
  seatPlays?: Partial<Record<SeatId, string | null>>;
  orderedPlays?: MatchStateRoundPlayPayload[];
  winningSeatId?: SeatId | null;
};

export type MatchStateHandPayload = {
  viraRank: Rank;
  viraCard?: string;
  mode?: QueueModePayload;
  finished: boolean;
  viewerPlayerId: 'P1' | 'P2' | null;
  viewerSeatId?: SeatId | null;
  currentValue: HandValue;
  betState: HandBetState;
  pendingValue: HandValue | null;
  requestedBy: PlayerId | null;
  specialState: HandSpecialState;
  specialDecisionPending: boolean;
  specialDecisionBy: PlayerId | null;
  winner: PlayerId | null;
  awardedPoints: HandValue | null;
  currentRoundIndex: number;
  lastRoundResult: RoundResult | null;
  nextDecisionType: NextDecisionType;
  viewerCanActNow: boolean;
  pendingBotAction: boolean;
  teamBetDecision?: PendingTeamBetDecisionPayload | null;
  partnerAdvice?: PartnerBetAdvicePayload | null;
  availableActions: MatchAvailableActionsPayload;
  playerOneHand: string[];
  playerTwoHand: string[];
  seatHands?: Partial<Record<SeatId, string[]>>;
  rounds: MatchStateRoundPayload[];
};

export type MatchStatePayload = {
  matchId: string;
  state: MatchState;
  score: {
    playerOne: number;
    playerTwo: number;
  };
  currentHand: MatchStateHandPayload | null;
};

export type RankingPayload = {
  ranking: Array<{
    profileId?: string;
    userId?: string;
    displayName?: string;
    publicName?: string;
    publicSlug?: string;
    rating?: number;
  }>;
};

export type HandStartedPayload = {
  matchId: string;
  viraRank?: Rank;
  viraCard?: string;
  currentTurnSeatId?: SeatId | null;
};

export type CardPlayedPayload = {
  matchId: string;
  playerId?: PlayerId;
  seatId?: SeatId;
  teamId?: string;
  card?: string;
  currentTurnSeatId?: SeatId | null;
  isBot?: boolean;
};

export type RoundTransitionPhase = 'round-resolved' | 'next-round-opened';

export type RoundTransitionPayload = {
  matchId: string;
  phase: RoundTransitionPhase;
  roundWinner: RoundResult | null;
  finishedRoundsCount: number;
  totalRoundsCount: number;
  handContinues: boolean;
  openingSeatId: SeatId | null;
  currentTurnSeatId: SeatId | null;
  triggeredBy?: {
    seatId: string;
    teamId: 'T1' | 'T2';
    playerId: 'P1' | 'P2';
    isBot: boolean;
  };
};

export type GameSocketEvents = {
  onConnect?: (socketId: string) => void;
  onDisconnect?: (reason: string) => void;
  onError?: (payload: ServerErrorPayload) => void;
  onPlayerAssigned?: (payload: PlayerAssignedPayload) => void;
  onRoomLeft?: (payload: RoomLeftPayload) => void;
  onQueueJoined?: (payload: QueueSnapshotPayload) => void;
  onQueueState?: (payload: QueueSnapshotPayload) => void;
  onQueueLeft?: (payload: QueueLeftPayload) => void;
  onQueueTimeout?: (payload: QueueTimeoutPayload) => void;
  onMatchFound?: (payload: MatchFoundPayload) => void;
  onRoomState?: (payload: RoomStatePayload) => void;
  onMatchState?: (payload: MatchStatePayload) => void;
  onPrivateMatchState?: (payload: MatchStatePayload) => void;
  onRanking?: (payload: RankingPayload) => void;
  onHandStarted?: (payload: HandStartedPayload) => void;
  onCardPlayed?: (payload: CardPlayedPayload) => void;
  onRoundTransition?: (payload: RoundTransitionPayload) => void;
  onPartnerSignal?: (payload: PartnerSignalPayload) => void;
};

export type SuitDisplay = { symbol: string; colorClass: string };

const SUIT_DISPLAY_MAP: Record<string, SuitDisplay> = {
  P: { symbol: '♣', colorClass: 'text-slate-900' },
  C: { symbol: '♥', colorClass: 'text-red-700' },
  O: { symbol: '♦', colorClass: 'text-red-700' },
  D: { symbol: '♦', colorClass: 'text-red-700' },
  H: { symbol: '♥', colorClass: 'text-red-700' },
  E: { symbol: '♠', colorClass: 'text-slate-900' },
  S: { symbol: '♠', colorClass: 'text-slate-900' },
};

const FALLBACK_SUIT_DISPLAY: SuitDisplay = { symbol: '?', colorClass: 'text-slate-500' };

export function getSuitDisplay(suit: string): SuitDisplay {
  return SUIT_DISPLAY_MAP[suit] ?? FALLBACK_SUIT_DISPLAY;
}

export function suitSymbol(suit: string): string {
  return getSuitDisplay(suit).symbol;
}

export function suitColorClass(suit: string): string {
  return getSuitDisplay(suit).colorClass;
}

export function isSuitRed(suit: string): boolean {
  return suit === 'C' || suit === 'H' || suit === 'O' || suit === 'D';
}

function asObject(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asNullableHandValue(value: unknown): HandValue | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asCardStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => asString(item)).filter(Boolean) : [];
}

function asOptionalCardStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) ? value.map((item) => asString(item)).filter(Boolean) : undefined;
}

function normalizeNullableStringField(value: unknown): string | null | undefined {
  if (value === null) {
    return null;
  }

  return asOptionalString(value);
}

function normalizeBotDecisionSeatPlaysPayload(
  value: unknown,
): Partial<Record<SeatId, string | null>> | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const entries = Object.entries(asObject(value)).reduce<Partial<Record<SeatId, string | null>>>(
    (accumulator, [seatId, card]) => {
      accumulator[seatId] = card === null ? null : (asOptionalString(card) ?? null);
      return accumulator;
    },
    {},
  );

  return Object.keys(entries).length > 0 ? entries : undefined;
}

function normalizeBotDecisionOrderedPlaysPayload(
  value: unknown,
): BotDecisionOrderedPlayPayload[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const plays = value.flatMap((item) => {
    const input = asObject(item);
    const ownerId = asOptionalString(input.ownerId);
    const playerId = asOptionalString(input.playerId);
    const card = asOptionalString(input.card);

    if (!ownerId || !playerId || !card) {
      return [];
    }

    return [
      {
        ownerId,
        seatId: normalizeNullableStringField(input.seatId) ?? null,
        playerId,
        card,
      },
    ];
  });

  return plays.length > 0 ? plays : undefined;
}

function normalizeMatchAvailableActionsPayload(value: unknown): MatchAvailableActionsPayload {
  const input = asObject(value);

  return {
    canRequestTruco: asBoolean(input.canRequestTruco),
    canRaiseToSix: asBoolean(input.canRaiseToSix),
    canRaiseToNine: asBoolean(input.canRaiseToNine),
    canRaiseToTwelve: asBoolean(input.canRaiseToTwelve),
    canAcceptBet: asBoolean(input.canAcceptBet),
    canDeclineBet: asBoolean(input.canDeclineBet),
    canAcceptMaoDeOnze: asBoolean(input.canAcceptMaoDeOnze),
    canDeclineMaoDeOnze: asBoolean(input.canDeclineMaoDeOnze),
    canAttemptPlayCard: asBoolean(input.canAttemptPlayCard),
  };
}

function normalizeTeamBetDecisionAction(value: unknown): TeamBetDecisionActionPayload | null {
  return value === 'accept' || value === 'decline' || value === 'raise' ? value : null;
}

function normalizePartnerBetAdvicePayload(value: unknown): PartnerBetAdvicePayload | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const input = asObject(value);
  const action = normalizeTeamBetDecisionAction(input.action);

  if (!action) {
    return null;
  }

  return {
    seatId: asString(input.seatId),
    action,
    confidence: asNumber(input.confidence, 0),
    label: asString(input.label),
    reason: asString(input.reason, 'bot-advice'),
  };
}

function normalizePartnerBetAdviceMap(
  value: unknown,
): Partial<Record<SeatId, PartnerBetAdvicePayload>> {
  if (!value || typeof value !== 'object') {
    return {};
  }

  const input = asObject(value);

  return Object.entries(input).reduce<Partial<Record<SeatId, PartnerBetAdvicePayload>>>(
    (accumulator, [seatId, advice]) => {
      const normalizedAdvice = normalizePartnerBetAdvicePayload(advice);

      if (normalizedAdvice) {
        accumulator[seatId] = normalizedAdvice;
      }

      return accumulator;
    },
    {},
  );
}

function normalizeTeamBetVoteMap(
  value: unknown,
): Partial<Record<SeatId, TeamBetDecisionActionPayload>> {
  if (!value || typeof value !== 'object') {
    return {};
  }

  const input = asObject(value);

  return Object.entries(input).reduce<Partial<Record<SeatId, TeamBetDecisionActionPayload>>>(
    (accumulator, [seatId, action]) => {
      const normalizedAction = normalizeTeamBetDecisionAction(action);

      if (normalizedAction) {
        accumulator[seatId] = normalizedAction;
      }

      return accumulator;
    },
    {},
  );
}

function normalizePendingTeamBetDecisionPayload(
  value: unknown,
): PendingTeamBetDecisionPayload | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const input = asObject(value);
  const respondingTeamId =
    input.respondingTeamId === 'T1' || input.respondingTeamId === 'T2'
      ? input.respondingTeamId
      : null;
  const phase = input.phase === 'collecting_votes' ? input.phase : 'collecting_votes';

  if (!respondingTeamId) {
    return null;
  }

  return {
    decisionId: asString(input.decisionId),
    respondingTeamId,
    requestedBySeatId: asNullableString(input.requestedBySeatId),
    requestedValue: asNumber(input.requestedValue, 3),
    currentValue: asNumber(input.currentValue, 1),
    phase,
    expiresAt: asString(input.expiresAt),
    votesBySeat: normalizeTeamBetVoteMap(input.votesBySeat),
    botAdviceBySeat: normalizePartnerBetAdviceMap(input.botAdviceBySeat),
  };
}

function normalizeSeatCardMap(value: unknown): Partial<Record<SeatId, string | null>> | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const input = asObject(value);
  const entries = Object.entries(input).reduce<Partial<Record<SeatId, string | null>>>(
    (acc, [seatId, card]) => {
      acc[seatId] = asNullableString(card);
      return acc;
    },
    {},
  );

  return Object.keys(entries).length > 0 ? entries : undefined;
}

function normalizeSeatHandsMap(value: unknown): Partial<Record<SeatId, string[]>> | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const input = asObject(value);
  const entries = Object.entries(input).reduce<Partial<Record<SeatId, string[]>>>(
    (acc, [seatId, cards]) => {
      acc[seatId] = asCardStringArray(cards);
      return acc;
    },
    {},
  );

  return Object.keys(entries).length > 0 ? entries : undefined;
}

function normalizeMatchStateRoundPlayPayload(value: unknown): MatchStateRoundPlayPayload {
  const input = asObject(value);

  return {
    ownerId: asString(input.ownerId),
    seatId: asNullableString(input.seatId),
    playerId: asString(input.playerId),
    card: asString(input.card),
  };
}

function normalizeMatchStateRoundPayload(value: unknown): MatchStateRoundPayload {
  const input = asObject(value);

  const seatPlays = normalizeSeatCardMap(input.seatPlays);
  const orderedPlays = Array.isArray(input.orderedPlays)
    ? input.orderedPlays.map(normalizeMatchStateRoundPlayPayload)
    : undefined;

  return {
    playerOneCard: asNullableString(input.playerOneCard),
    playerTwoCard: asNullableString(input.playerTwoCard),
    result: typeof input.result === 'string' ? input.result : null,
    finished: asBoolean(input.finished),
    ...(seatPlays ? { seatPlays } : {}),
    ...(orderedPlays ? { orderedPlays } : {}),
    winningSeatId: asNullableString(input.winningSeatId),
  };
}

function normalizeMatchStateHandPayload(value: unknown): MatchStateHandPayload | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const input = asObject(value);
  const seatHands = normalizeSeatHandsMap(input.seatHands);
  const viraCard = asOptionalString(input.viraCard);

  return {
    viraRank: asString(input.viraRank),
    ...(viraCard !== undefined ? { viraCard } : {}),
    mode: asString(input.mode, '1v1'),
    finished: asBoolean(input.finished),
    viewerPlayerId:
      input.viewerPlayerId === 'P1' || input.viewerPlayerId === 'P2' ? input.viewerPlayerId : null,
    viewerSeatId: asNullableString(input.viewerSeatId),
    currentValue: asNumber(input.currentValue, 1),
    betState: asString(input.betState, 'idle'),
    pendingValue: asNullableHandValue(input.pendingValue),
    requestedBy:
      input.requestedBy === 'P1' || input.requestedBy === 'P2'
        ? input.requestedBy
        : typeof input.requestedBy === 'string'
          ? input.requestedBy
          : null,
    specialState: asString(input.specialState, 'normal'),
    specialDecisionPending: asBoolean(input.specialDecisionPending),
    specialDecisionBy:
      input.specialDecisionBy === 'P1' || input.specialDecisionBy === 'P2'
        ? input.specialDecisionBy
        : typeof input.specialDecisionBy === 'string'
          ? input.specialDecisionBy
          : null,
    winner:
      input.winner === 'P1' || input.winner === 'P2'
        ? input.winner
        : typeof input.winner === 'string'
          ? input.winner
          : null,
    awardedPoints: asNullableHandValue(input.awardedPoints),
    currentRoundIndex: asNumber(input.currentRoundIndex, 0),
    lastRoundResult: typeof input.lastRoundResult === 'string' ? input.lastRoundResult : null,
    nextDecisionType: asString(input.nextDecisionType, 'idle'),
    viewerCanActNow: asBoolean(input.viewerCanActNow),
    pendingBotAction: asBoolean(input.pendingBotAction),
    teamBetDecision: normalizePendingTeamBetDecisionPayload(input.teamBetDecision),
    partnerAdvice: normalizePartnerBetAdvicePayload(input.partnerAdvice),
    availableActions: normalizeMatchAvailableActionsPayload(input.availableActions),
    playerOneHand: asCardStringArray(input.playerOneHand),
    playerTwoHand: asCardStringArray(input.playerTwoHand),
    ...(seatHands ? { seatHands } : {}),
    rounds: Array.isArray(input.rounds) ? input.rounds.map(normalizeMatchStateRoundPayload) : [],
  };
}

export function normalizeServerErrorPayload(payload: unknown): ServerErrorPayload {
  const input = asObject(payload);

  return {
    message: asString(input.message, 'Unknown server error'),
  };
}

export function normalizeQueueSnapshotPayload(payload: unknown): QueueSnapshotPayload {
  const input = asObject(payload);
  const mode = asString(input.mode, '1v1');
  const playersWaiting = Array.isArray(input.playersWaiting)
    ? input.playersWaiting.map((player) => {
        const item = asObject(player);

        return {
          userId: asString(item.userId),
          rating: asNumber(item.rating),
          joinedAt: asNumber(item.joinedAt),
          socketId: asString(item.socketId),
          playerToken: asString(item.playerToken),
        };
      })
    : [];

  return {
    mode,
    size: asNumber(input.size, playersWaiting.length),
    playersWaiting,
  };
}

export function normalizeMatchFoundPayload(payload: unknown): MatchFoundPayload {
  const input = asObject(payload);

  return {
    matchId: asString(input.matchId),
    mode: asString(input.mode, '1v1'),
    players: Array.isArray(input.players)
      ? input.players.map((player) => {
          const item = asObject(player);

          return {
            userId: asString(item.userId),
            playerToken: asString(item.playerToken),
            rating: asNumber(item.rating),
          };
        })
      : [],
  };
}

export function normalizeQueueLeftPayload(payload: unknown): QueueLeftPayload {
  const input = asObject(payload);
  const snapshot = input.snapshot ? normalizeQueueSnapshotPayload(input.snapshot) : undefined;
  const mode = asOptionalString(input.mode);

  return {
    left: asBoolean(input.left),
    ...(mode !== undefined ? { mode } : {}),
    ...(snapshot !== undefined ? { snapshot } : {}),
  };
}

export function normalizeQueueTimeoutPayload(payload: unknown): QueueTimeoutPayload {
  const input = asObject(payload);

  return {
    mode: asString(input.mode, '1v1'),
    reason: asString(input.reason, 'timeout'),
    availableActions: Array.isArray(input.availableActions)
      ? input.availableActions.map((action) => asString(action)).filter(Boolean)
      : [],
  };
}

export function normalizePlayerAssignedPayload(payload: unknown): PlayerAssignedPayload {
  const input = asObject(payload);
  const teamId = asOptionalString(input.teamId);
  const playerId = asOptionalString(input.playerId);
  const playerToken = asOptionalString(input.playerToken);
  const profileId = asOptionalString(input.profileId);
  const displayName = asOptionalString(input.displayName);
  const publicName = asOptionalString(input.publicName);
  const publicSlug = asOptionalString(input.publicSlug);

  return {
    matchId: asString(input.matchId),
    seatId: asString(input.seatId),
    ...(teamId !== undefined ? { teamId } : {}),
    ...(playerId !== undefined ? { playerId } : {}),
    ...(playerToken !== undefined ? { playerToken } : {}),
    ...(profileId !== undefined ? { profileId } : {}),
    ...(displayName !== undefined ? { displayName } : {}),
    ...(publicName !== undefined ? { publicName } : {}),
    ...(publicSlug !== undefined ? { publicSlug } : {}),
  };
}

export function normalizeRoomStatePayload(payload: unknown): RoomStatePayload {
  const input = asObject(payload);

  const mode = asOptionalString(input.mode);

  const lastBotDecision = normalizeBotDecisionTelemetryPayload(input.lastBotDecision);

  return {
    matchId: asString(input.matchId),
    ...(mode !== undefined ? { mode } : {}),
    players: Array.isArray(input.players)
      ? input.players.map((player) => {
          const item = asObject(player);
          const isBot = typeof item.isBot === 'boolean' ? item.isBot : undefined;
          const userId = asNullableString(item.userId);
          const playerToken = asNullableString(item.playerToken);
          const displayName = asNullableString(item.displayName);
          const publicName = asNullableString(item.publicName);
          const publicSlug = asNullableString(item.publicSlug);
          const botIdentity = normalizeBotIdentityPayload(item.botIdentity);

          return {
            seatId: asString(item.seatId),
            teamId: asString(item.teamId),
            ready: asBoolean(item.ready),
            ...(userId !== undefined ? { userId } : {}),
            ...(playerToken !== undefined ? { playerToken } : {}),
            ...(displayName !== undefined ? { displayName } : {}),
            ...(publicName !== undefined ? { publicName } : {}),
            ...(publicSlug !== undefined ? { publicSlug } : {}),
            ...(isBot !== undefined ? { isBot } : {}),
            ...(botIdentity !== undefined ? { botIdentity } : {}),
          };
        })
      : [],
    canStart: asBoolean(input.canStart),
    currentTurnSeatId: asNullableString(input.currentTurnSeatId),
    ...(typeof input.fillBotsOnStart === 'boolean'
      ? { fillBotsOnStart: input.fillBotsOnStart }
      : {}),
    ...(lastBotDecision !== undefined ? { lastBotDecision } : {}),
  };
}

function normalizeBotDecisionTelemetryPayload(
  value: unknown,
): BotDecisionTelemetryPayload | undefined {
  if (value === null) {
    return null as unknown as BotDecisionTelemetryPayload | undefined;
  }

  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const input = asObject(value);
  const seatId = asOptionalString(input.seatId);
  const teamId = asOptionalString(input.teamId);
  const playerId = asOptionalString(input.playerId);
  const profile = asOptionalString(input.profile);
  const action = asOptionalString(input.action);
  const source = asOptionalString(input.source);
  const strategy = asOptionalString(input.strategy);
  const reason = asOptionalString(input.reason);
  const mode = asOptionalString(input.mode);
  const actorSeatId = asOptionalString(input.actorSeatId);
  const actorTeamId = asOptionalString(input.actorTeamId);
  const partnerSeatId = normalizeNullableStringField(input.partnerSeatId);
  const winningSeatIdBeforeDecision = normalizeNullableStringField(
    input.winningSeatIdBeforeDecision,
  );
  const winningTeamIdBeforeDecision = normalizeNullableStringField(
    input.winningTeamIdBeforeDecision,
  );
  const winningCardBeforeDecision = normalizeNullableStringField(input.winningCardBeforeDecision);
  const partnerWasWinning =
    typeof input.partnerWasWinning === 'boolean' ? input.partnerWasWinning : undefined;
  const actorHandBefore = asOptionalCardStringArray(input.actorHandBefore);
  const selectedCard = asOptionalString(input.selectedCard);
  const executionStatus = asOptionalString(input.executionStatus);
  const executedAction = asOptionalString(input.executedAction);
  const executionReason = asOptionalString(input.executionReason);
  const executionError = asOptionalString(input.executionError);
  const betCurrentValue = asOptionalNumber(input.betCurrentValue);
  const betPendingValue = normalizeNullableNumberField(input.betPendingValue);
  const betState = asOptionalString(input.betState);
  const betRequestedBy = normalizeNullableStringField(input.betRequestedBy);
  const betSpecialState = asOptionalString(input.betSpecialState);
  const betSelectedAction = asOptionalString(input.betSelectedAction);
  const betProgressBoost = asOptionalNumber(input.betProgressBoost);
  const betScoreBoost = asOptionalNumber(input.betScoreBoost);
  const betEffectiveStrength = asOptionalNumber(input.betEffectiveStrength);
  const betAcceptThreshold = asOptionalNumber(input.betAcceptThreshold);
  const betRaiseThreshold = asOptionalNumber(input.betRaiseThreshold);
  const betInitiativeThreshold = asOptionalNumber(input.betInitiativeThreshold);
  const betBluffProbability = asOptionalNumber(input.betBluffProbability);
  const betDeclineFloor = asOptionalNumber(input.betDeclineFloor);
  const betMyPointsToWin = asOptionalNumber(input.betMyPointsToWin);
  const betOpponentPointsToWin = asOptionalNumber(input.betOpponentPointsToWin);
  const betDeclineLosesMatch = asOptionalBoolean(input.betDeclineLosesMatch);
  const betAcceptRisksMatch = asOptionalBoolean(input.betAcceptRisksMatch);
  const betRoundsWonByMe = asOptionalNumber(input.betRoundsWonByMe);
  const betRoundsWonByOpponent = asOptionalNumber(input.betRoundsWonByOpponent);
  const betRoundsTied = asOptionalNumber(input.betRoundsTied);
  const betCurrentRoundIndex = asOptionalNumber(input.betCurrentRoundIndex);
  const seatPlays = normalizeBotDecisionSeatPlaysPayload(input.seatPlays);
  const orderedPlays = normalizeBotDecisionOrderedPlaysPayload(input.orderedPlays);
  const occurredAt = asOptionalString(input.occurredAt);
  const handStrength = typeof input.handStrength === 'number' ? input.handStrength : undefined;

  if (
    seatId === undefined ||
    teamId === undefined ||
    playerId === undefined ||
    profile === undefined ||
    action === undefined ||
    source === undefined
  ) {
    return undefined;
  }

  return {
    seatId,
    teamId,
    playerId,
    profile,
    action,
    source,
    ...(strategy !== undefined ? { strategy } : {}),
    ...(handStrength !== undefined ? { handStrength } : {}),
    ...(reason !== undefined ? { reason } : {}),
    ...(mode !== undefined ? { mode } : {}),
    ...(actorSeatId !== undefined ? { actorSeatId } : {}),
    ...(actorTeamId !== undefined ? { actorTeamId } : {}),
    ...(partnerSeatId !== undefined ? { partnerSeatId } : {}),
    ...(winningSeatIdBeforeDecision !== undefined ? { winningSeatIdBeforeDecision } : {}),
    ...(winningTeamIdBeforeDecision !== undefined ? { winningTeamIdBeforeDecision } : {}),
    ...(winningCardBeforeDecision !== undefined ? { winningCardBeforeDecision } : {}),
    ...(partnerWasWinning !== undefined ? { partnerWasWinning } : {}),
    ...(actorHandBefore !== undefined ? { actorHandBefore } : {}),
    ...(selectedCard !== undefined ? { selectedCard } : {}),
    ...(executionStatus !== undefined ? { executionStatus } : {}),
    ...(executedAction !== undefined ? { executedAction } : {}),
    ...(executionReason !== undefined ? { executionReason } : {}),
    ...(executionError !== undefined ? { executionError } : {}),
    ...(betCurrentValue !== undefined ? { betCurrentValue } : {}),
    ...(betPendingValue !== undefined ? { betPendingValue } : {}),
    ...(betState !== undefined ? { betState } : {}),
    ...(betRequestedBy !== undefined ? { betRequestedBy } : {}),
    ...(betSpecialState !== undefined ? { betSpecialState } : {}),
    ...(betSelectedAction !== undefined ? { betSelectedAction } : {}),
    ...(betProgressBoost !== undefined ? { betProgressBoost } : {}),
    ...(betScoreBoost !== undefined ? { betScoreBoost } : {}),
    ...(betEffectiveStrength !== undefined ? { betEffectiveStrength } : {}),
    ...(betAcceptThreshold !== undefined ? { betAcceptThreshold } : {}),
    ...(betRaiseThreshold !== undefined ? { betRaiseThreshold } : {}),
    ...(betInitiativeThreshold !== undefined ? { betInitiativeThreshold } : {}),
    ...(betBluffProbability !== undefined ? { betBluffProbability } : {}),
    ...(betDeclineFloor !== undefined ? { betDeclineFloor } : {}),
    ...(betMyPointsToWin !== undefined ? { betMyPointsToWin } : {}),
    ...(betOpponentPointsToWin !== undefined ? { betOpponentPointsToWin } : {}),
    ...(betDeclineLosesMatch !== undefined ? { betDeclineLosesMatch } : {}),
    ...(betAcceptRisksMatch !== undefined ? { betAcceptRisksMatch } : {}),
    ...(betRoundsWonByMe !== undefined ? { betRoundsWonByMe } : {}),
    ...(betRoundsWonByOpponent !== undefined ? { betRoundsWonByOpponent } : {}),
    ...(betRoundsTied !== undefined ? { betRoundsTied } : {}),
    ...(betCurrentRoundIndex !== undefined ? { betCurrentRoundIndex } : {}),
    ...(seatPlays !== undefined ? { seatPlays } : {}),
    ...(orderedPlays !== undefined ? { orderedPlays } : {}),
    ...(occurredAt !== undefined ? { occurredAt } : {}),
  };
}

function normalizeBotIdentityPayload(value: unknown): BotIdentityPayload | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const input = asObject(value);
  const id = asOptionalString(input.id);
  const displayName = asOptionalString(input.displayName);
  const avatarKey = asOptionalString(input.avatarKey);
  const profile = asOptionalString(input.profile);

  if (
    id === undefined ||
    displayName === undefined ||
    avatarKey === undefined ||
    profile === undefined
  ) {
    return undefined;
  }

  return {
    id,
    displayName,
    avatarKey,
    profile,
  };
}

export function normalizeMatchStatePayload(payload: unknown): MatchStatePayload {
  const input = asObject(payload);
  const score = asObject(input.score);

  return {
    matchId: asString(input.matchId),
    state: asString(input.state),
    score: {
      playerOne: asNumber(score.playerOne),
      playerTwo: asNumber(score.playerTwo),
    },
    currentHand: normalizeMatchStateHandPayload(input.currentHand),
  };
}

export function normalizePartnerSignalPayload(payload: unknown): PartnerSignalPayload {
  const input = asObject(payload);
  const kind = asString(input.kind) as PartnerSignalKind;
  const toTeamId = asString(input.toTeamId);

  return {
    signalId: asString(input.signalId),
    matchId: asString(input.matchId),
    fromSeatId: asString(input.fromSeatId),
    toTeamId,
    kind,
    label: asString(input.label),
    createdAt: asString(input.createdAt),
    expiresAt: asString(input.expiresAt),
  };
}

export function normalizeRankingPayload(payload: unknown): RankingPayload {
  const input = asObject(payload);

  return {
    ranking: Array.isArray(input.ranking)
      ? input.ranking.map((entry) => {
          const item = asObject(entry);
          const profileId = asOptionalString(item.profileId);
          const userId = asOptionalString(item.userId);
          const displayName = asOptionalString(item.displayName);
          const publicName = asOptionalString(item.publicName);
          const publicSlug = asOptionalString(item.publicSlug);
          const rating = typeof item.rating === 'number' ? item.rating : 0;

          return {
            ...(profileId !== undefined ? { profileId } : {}),
            ...(userId !== undefined ? { userId } : {}),
            ...(displayName !== undefined ? { displayName } : {}),
            ...(publicName !== undefined ? { publicName } : {}),
            ...(publicSlug !== undefined ? { publicSlug } : {}),
            rating,
          };
        })
      : [],
  };
}

export function normalizeHandStartedPayload(payload: unknown): HandStartedPayload {
  const input = asObject(payload);
  const viraRank = asOptionalString(input.viraRank);
  const viraCard = asOptionalString(input.viraCard);
  const currentTurnSeatId = asNullableString(input.currentTurnSeatId);

  return {
    matchId: asString(input.matchId),
    ...(viraRank !== undefined ? { viraRank } : {}),
    ...(viraCard !== undefined ? { viraCard } : {}),
    ...(currentTurnSeatId !== null ? { currentTurnSeatId } : { currentTurnSeatId: null }),
  };
}

export function normalizeCardPlayedPayload(payload: unknown): CardPlayedPayload {
  const input = asObject(payload);
  const playerId = asOptionalString(input.playerId);
  const seatId = asOptionalString(input.seatId);
  const teamId = asOptionalString(input.teamId);
  const card = asOptionalString(input.card);
  const currentTurnSeatId = asNullableString(input.currentTurnSeatId);
  const isBot = typeof input.isBot === 'boolean' ? input.isBot : undefined;

  return {
    matchId: asString(input.matchId),
    ...(playerId !== undefined ? { playerId } : {}),
    ...(seatId !== undefined ? { seatId } : {}),
    ...(teamId !== undefined ? { teamId } : {}),
    ...(card !== undefined ? { card } : {}),
    ...(currentTurnSeatId !== null ? { currentTurnSeatId } : { currentTurnSeatId: null }),
    ...(isBot !== undefined ? { isBot } : {}),
  };
}

export function normalizeRoundTransitionPayload(payload: unknown): RoundTransitionPayload {
  const input = asObject(payload);
  const triggeredBy = asObject(input.triggeredBy);

  const seatId = asOptionalString(triggeredBy.seatId);
  const teamId =
    triggeredBy.teamId === 'T1' || triggeredBy.teamId === 'T2' ? triggeredBy.teamId : undefined;
  const playerId =
    triggeredBy.playerId === 'P1' || triggeredBy.playerId === 'P2'
      ? triggeredBy.playerId
      : undefined;
  const isBot = typeof triggeredBy.isBot === 'boolean' ? triggeredBy.isBot : undefined;

  const normalizedTriggeredBy:
    | {
        seatId: string;
        teamId: 'T1' | 'T2';
        playerId: 'P1' | 'P2';
        isBot: boolean;
      }
    | undefined =
    seatId !== undefined && teamId !== undefined && playerId !== undefined && isBot !== undefined
      ? {
          seatId,
          teamId,
          playerId,
          isBot,
        }
      : undefined;

  const phase =
    input.phase === 'round-resolved' || input.phase === 'next-round-opened'
      ? input.phase
      : 'round-resolved';

  return {
    matchId: asString(input.matchId),
    phase,
    roundWinner: typeof input.roundWinner === 'string' ? input.roundWinner : null,
    finishedRoundsCount: asNumber(input.finishedRoundsCount, 0),
    totalRoundsCount: asNumber(input.totalRoundsCount, 0),
    handContinues: asBoolean(input.handContinues),
    openingSeatId: asNullableString(input.openingSeatId),
    currentTurnSeatId: asNullableString(input.currentTurnSeatId),
    ...(normalizedTriggeredBy !== undefined ? { triggeredBy: normalizedTriggeredBy } : {}),
  };
}

export function cardStringToPayload(card: string): CardPayload | null {
  const normalized = card.trim();

  if (normalized.length < 2) {
    return null;
  }

  return {
    rank: normalized.slice(0, -1),
    suit: normalized.slice(-1),
  };
}

function asOptionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

function asOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function normalizeNullableNumberField(value: unknown): number | null | undefined {
  if (value === null) {
    return null;
  }

  return asOptionalNumber(value);
}
