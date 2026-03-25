export type SeatId = 'T1A' | 'T1B' | 'T2A' | 'T2B' | string;
export type Suit = 'C' | 'O' | 'P' | 'E' | string;
export type Rank = '4' | '5' | '6' | '7' | 'Q' | 'J' | 'K' | 'A' | '2' | '3' | string;

export type CardPayload = {
  rank: Rank;
  suit: Suit;
};

export type RoomPlayerView = {
  seatId: SeatId;
  ready: boolean;
};

export type RoomStatePayload = {
  matchId: string;
  currentTurnSeatId: SeatId | null;
  canStart: boolean;
  players: RoomPlayerView[];
};

export type MatchScorePayload = {
  playerOne: number;
  playerTwo: number;
};

export type MatchStatePayload = {
  matchId: string;
  state: string;
  score: MatchScorePayload;
};

export type PlayerAssignedPayload = {
  matchId?: string;
  seatId?: SeatId;
  playerId?: string;
  teamId?: string;
  profileId?: string;
};

export type ServerErrorPayload = {
  category?: string;
  message?: string;
};

export type RankingEntryPayload = {
  playerToken?: string;
  rating?: number;
  wins?: number;
  losses?: number;
  matchesPlayed?: number;
};

export type RankingPayload = {
  ranking: RankingEntryPayload[];
};

export type HandStartedPayload = {
  matchId?: string;
  viraRank?: Rank;
};

export type CardPlayedPayload = {
  matchId?: string;
  card?: CardPayload;
  seatId?: SeatId;
  playerId?: string;
};

export type GameSocketEvents = {
  onConnect?: (socketId: string) => void;
  onDisconnect?: (reason: string) => void;
  onError?: (payload: ServerErrorPayload) => void;
  onRoomState?: (payload: RoomStatePayload) => void;
  onMatchState?: (payload: MatchStatePayload) => void;
  onRanking?: (payload: RankingPayload) => void;
  onPlayerAssigned?: (payload: PlayerAssignedPayload) => void;
  onHandStarted?: (payload: HandStartedPayload) => void;
  onCardPlayed?: (payload: CardPlayedPayload) => void;
};

export function normalizeRoomStatePayload(payload: unknown): RoomStatePayload {
  const candidate = isObject(payload) ? payload : {};

  const players = Array.isArray(candidate.players)
    ? candidate.players
        .filter(isObject)
        .map((player) => ({
          seatId: typeof player.seatId === 'string' ? player.seatId : 'unknown',
          ready: Boolean(player.ready),
        }))
    : [];

  return {
    matchId: typeof candidate.matchId === 'string' ? candidate.matchId : '',
    currentTurnSeatId:
      typeof candidate.currentTurnSeatId === 'string' ? candidate.currentTurnSeatId : null,
    canStart: Boolean(candidate.canStart),
    players,
  };
}

export function normalizeMatchStatePayload(payload: unknown): MatchStatePayload {
  const candidate = isObject(payload) ? payload : {};
  const score = isObject(candidate.score) ? candidate.score : {};

  return {
    matchId: typeof candidate.matchId === 'string' ? candidate.matchId : '',
    state: typeof candidate.state === 'string' ? candidate.state : 'unknown',
    score: {
      playerOne: typeof score.playerOne === 'number' ? score.playerOne : 0,
      playerTwo: typeof score.playerTwo === 'number' ? score.playerTwo : 0,
    },
  };
}

export function normalizePlayerAssignedPayload(payload: unknown): PlayerAssignedPayload {
  const candidate = isObject(payload) ? payload : {};

  return {
    matchId: typeof candidate.matchId === 'string' ? candidate.matchId : undefined,
    seatId: typeof candidate.seatId === 'string' ? candidate.seatId : undefined,
    playerId: typeof candidate.playerId === 'string' ? candidate.playerId : undefined,
    teamId: typeof candidate.teamId === 'string' ? candidate.teamId : undefined,
    profileId: typeof candidate.profileId === 'string' ? candidate.profileId : undefined,
  };
}

export function normalizeServerErrorPayload(payload: unknown): ServerErrorPayload {
  const candidate = isObject(payload) ? payload : {};

  return {
    category: typeof candidate.category === 'string' ? candidate.category : undefined,
    message: typeof candidate.message === 'string' ? candidate.message : undefined,
  };
}

export function normalizeRankingPayload(payload: unknown): RankingPayload {
  const candidate = isObject(payload) ? payload : {};

  const ranking = Array.isArray(candidate.ranking)
    ? candidate.ranking
        .filter(isObject)
        .map((entry) => ({
          playerToken: typeof entry.playerToken === 'string' ? entry.playerToken : undefined,
          rating: typeof entry.rating === 'number' ? entry.rating : undefined,
          wins: typeof entry.wins === 'number' ? entry.wins : undefined,
          losses: typeof entry.losses === 'number' ? entry.losses : undefined,
          matchesPlayed:
            typeof entry.matchesPlayed === 'number' ? entry.matchesPlayed : undefined,
        }))
    : [];

  return { ranking };
}

export function normalizeHandStartedPayload(payload: unknown): HandStartedPayload {
  const candidate = isObject(payload) ? payload : {};

  return {
    matchId: typeof candidate.matchId === 'string' ? candidate.matchId : undefined,
    viraRank: typeof candidate.viraRank === 'string' ? candidate.viraRank : undefined,
  };
}

export function normalizeCardPlayedPayload(payload: unknown): CardPlayedPayload {
  const candidate = isObject(payload) ? payload : {};
  const card = isObject(candidate.card) ? candidate.card : {};

  return {
    matchId: typeof candidate.matchId === 'string' ? candidate.matchId : undefined,
    seatId: typeof candidate.seatId === 'string' ? candidate.seatId : undefined,
    playerId: typeof candidate.playerId === 'string' ? candidate.playerId : undefined,
    card:
      typeof card.rank === 'string' && typeof card.suit === 'string'
        ? {
            rank: card.rank,
            suit: card.suit,
          }
        : undefined,
  };
}

function isObject(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null;
}