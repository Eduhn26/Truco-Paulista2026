export type SeatId = 'T1A' | 'T1B' | 'T2A' | 'T2B' | string;
export type Suit = 'C' | 'O' | 'P' | 'E' | string;
export type Rank = '4' | '5' | '6' | '7' | 'Q' | 'J' | 'K' | 'A' | '2' | '3' | string;
export type MatchState = 'waiting' | 'in_progress' | 'finished' | string;
export type RoundResult = 'P1' | 'P2' | 'TIE' | string;

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
  playerId?: 'P1' | 'P2' | string;
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
  playerId?: 'P1' | 'P2' | string;
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

function asObject(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function asCardStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => asString(item)).filter(Boolean) : [];
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
      playerOne: typeof score.playerOne === 'number' ? score.playerOne : 0,
      playerTwo: typeof score.playerTwo === 'number' ? score.playerTwo : 0,
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

  const suit = normalized.slice(-1);
  const rank = normalized.slice(0, -1);

  return {
    rank,
    suit,
  };
}