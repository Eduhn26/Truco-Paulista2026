export type SeatId = 'T1A' | 'T1B' | 'T2A' | 'T2B' | string;
export type Suit = 'C' | 'O' | 'P' | 'E' | string;
export type Rank = '4' | '5' | '6' | '7' | 'Q' | 'J' | 'K' | 'A' | '2' | '3' | string;
export type MatchState = 'waiting' | 'in_progress' | 'finished' | string;
export type RoundResult = 'P1' | 'P2' | 'TIE' | string;
export type PlayerId = 'P1' | 'P2' | string;
export type HandValue = 1 | 3 | 6 | 9 | 12 | number;
export type HandBetState = 'idle' | 'awaiting_response' | string;
export type HandSpecialState = 'normal' | 'mao_de_onze' | 'mao_de_ferro' | string;

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
};

export type RoomStatePayload = {
  matchId: string;
  mode?: '1v1' | '2v2' | string;
  players: Array<{
    seatId: SeatId;
    teamId: string;
    ready: boolean;
    isBot?: boolean;
  }>;
  canStart: boolean;
  currentTurnSeatId: SeatId | null;
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

export type MatchStateRoundPayload = {
  playerOneCard: string | null;
  playerTwoCard: string | null;
  result: RoundResult | null;
  finished: boolean;
};

export type MatchStateHandPayload = {
  viraRank: Rank;
  finished: boolean;
  viewerPlayerId: 'P1' | 'P2' | null;
  currentValue: HandValue;
  betState: HandBetState;
  pendingValue: HandValue | null;
  requestedBy: PlayerId | null;
  specialState: HandSpecialState;
  specialDecisionPending: boolean;
  specialDecisionBy: PlayerId | null;
  winner: PlayerId | null;
  awardedPoints: HandValue | null;
  availableActions: MatchAvailableActionsPayload;
  playerOneHand: string[];
  playerTwoHand: string[];
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
    rating?: number;
  }>;
};

export type HandStartedPayload = {
  matchId: string;
  viraRank?: Rank;
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

export type GameSocketEvents = {
  onConnect?: (socketId: string) => void;
  onDisconnect?: (reason: string) => void;
  onError?: (payload: ServerErrorPayload) => void;
  onPlayerAssigned?: (payload: PlayerAssignedPayload) => void;
  onRoomState?: (payload: RoomStatePayload) => void;
  onMatchState?: (payload: MatchStatePayload) => void;
  onPrivateMatchState?: (payload: MatchStatePayload) => void;
  onRanking?: (payload: RankingPayload) => void;
  onHandStarted?: (payload: HandStartedPayload) => void;
  onCardPlayed?: (payload: CardPlayedPayload) => void;
};

// ── Suit display helpers ──
// The canonical backend suits are C (Clubs/Paus), O (Ouros/Diamonds),
// P (Copas/Hearts), E (Espadas/Spades). Some legacy paths may emit
// H/D/S aliases — these helpers normalise both directions.

export type SuitDisplay = { symbol: string; colorClass: string };

const SUIT_DISPLAY_MAP: Record<string, SuitDisplay> = {
  C: { symbol: '♣', colorClass: 'text-slate-900' },
  O: { symbol: '♦', colorClass: 'text-red-700' },
  D: { symbol: '♦', colorClass: 'text-red-700' },
  P: { symbol: '♥', colorClass: 'text-red-700' },
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
  return suit === 'P' || suit === 'H' || suit === 'O' || suit === 'D';
}

// ── Normalisation helpers ──

function asObject(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
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

function normalizeMatchStateRoundPayload(value: unknown): MatchStateRoundPayload {
  const input = asObject(value);

  return {
    playerOneCard: typeof input.playerOneCard === 'string' ? input.playerOneCard : null,
    playerTwoCard: typeof input.playerTwoCard === 'string' ? input.playerTwoCard : null,
    result: typeof input.result === 'string' ? input.result : null,
    finished: asBoolean(input.finished),
  };
}

function normalizeMatchStateHandPayload(value: unknown): MatchStateHandPayload | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const input = asObject(value);

  return {
    viraRank: asString(input.viraRank),
    finished: asBoolean(input.finished),
    viewerPlayerId:
      input.viewerPlayerId === 'P1' || input.viewerPlayerId === 'P2'
        ? input.viewerPlayerId
        : null,
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
    availableActions: normalizeMatchAvailableActionsPayload(input.availableActions),
    playerOneHand: asCardStringArray(input.playerOneHand),
    playerTwoHand: asCardStringArray(input.playerTwoHand),
    rounds: Array.isArray(input.rounds)
      ? input.rounds.map(normalizeMatchStateRoundPayload)
      : [],
  };
}

export function normalizeServerErrorPayload(payload: unknown): ServerErrorPayload {
  const input = asObject(payload);

  return {
    message: asString(input.message, 'Unknown server error'),
  };
}

export function normalizePlayerAssignedPayload(payload: unknown): PlayerAssignedPayload {
  const input = asObject(payload);

  return {
    matchId: asString(input.matchId),
    seatId: asString(input.seatId),
    teamId: asString(input.teamId),
    playerId: asString(input.playerId),
    playerToken: asString(input.playerToken),
    profileId: asString(input.profileId),
  };
}

export function normalizeRoomStatePayload(payload: unknown): RoomStatePayload {
  const input = asObject(payload);

  return {
    matchId: asString(input.matchId),
    mode: asString(input.mode),
    players: Array.isArray(input.players)
      ? input.players.map((player) => {
          const item = asObject(player);

          return {
            seatId: asString(item.seatId),
            teamId: asString(item.teamId),
            ready: asBoolean(item.ready),
            isBot: asBoolean(item.isBot),
          };
        })
      : [],
    canStart: asBoolean(input.canStart),
    currentTurnSeatId:
      typeof input.currentTurnSeatId === 'string' ? input.currentTurnSeatId : null,
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

export function normalizeRankingPayload(payload: unknown): RankingPayload {
  const input = asObject(payload);

  return {
    ranking: Array.isArray(input.ranking)
      ? input.ranking.map((entry) => {
          const item = asObject(entry);

          return {
            profileId: asString(item.profileId),
            userId: asString(item.userId),
            displayName: asString(item.displayName),
            rating: typeof item.rating === 'number' ? item.rating : 0,
          };
        })
      : [],
  };
}

export function normalizeHandStartedPayload(payload: unknown): HandStartedPayload {
  const input = asObject(payload);

  return {
    matchId: asString(input.matchId),
    viraRank: asString(input.viraRank),
    currentTurnSeatId:
      typeof input.currentTurnSeatId === 'string' ? input.currentTurnSeatId : null,
  };
}

export function normalizeCardPlayedPayload(payload: unknown): CardPlayedPayload {
  const input = asObject(payload);

  return {
    matchId: asString(input.matchId),
    playerId: asString(input.playerId),
    seatId: asString(input.seatId),
    teamId: asString(input.teamId),
    card: asString(input.card),
    currentTurnSeatId:
      typeof input.currentTurnSeatId === 'string' ? input.currentTurnSeatId : null,
    isBot: asBoolean(input.isBot),
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
