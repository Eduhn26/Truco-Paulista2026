import type { Rank } from '@game/domain/value-objects/rank';

export const BOT_DECISION_PORT = 'BOT_DECISION_PORT';

export type BotProfile = 'balanced' | 'aggressive' | 'cautious';

export type BotMode = '1v1' | '2v2';
export type BotTeamId = 'T1' | 'T2';
export type BotSeatId = 'T1A' | 'T2A' | 'T1B' | 'T2B';

export const DEFAULT_BOT_PROFILE_BY_SEAT: Record<BotSeatId, BotProfile> = {
  T1A: 'balanced',
  T2A: 'aggressive',
  T1B: 'cautious',
  T2B: 'balanced',
};

export type BotPlayerView = {
  playerId: 'P1' | 'P2';
  hand: string[];
};

export type BotRoundPlayView = {
  ownerId: string;
  seatId: BotSeatId | null;
  playerId: 'P1' | 'P2';
  card: string;
};

export type BotRoundView = {
  playerOneCard: string | null;
  playerTwoCard: string | null;
  finished: boolean;
  result: 'P1' | 'P2' | 'TIE' | null;
  seatPlays?: Partial<Record<BotSeatId, string | null>>;
  orderedPlays?: BotRoundPlayView[];
  winningSeatId?: BotSeatId | null;
};

export type BotAvailableActionsView = {
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

export type BotBetView = {
  currentValue: number;
  betState: 'idle' | 'awaiting_response';
  pendingValue: number | null;
  requestedBy: 'P1' | 'P2' | null;
  specialState: 'normal' | 'mao_de_onze' | 'mao_de_ferro';
  specialDecisionPending: boolean;
  availableActions: BotAvailableActionsView;
};

// Optional score context lets adapters evaluate match pressure without breaking
// callers that still provide only card-play context.
export type BotMatchScoreView = {
  playerOne: number;
  playerTwo: number;
  pointsToWin: number;
};

// Round progress lets adapters weigh Truco initiative without reading Domain entities.
export type BotHandProgressView = {
  roundsWonByMe: number;
  roundsWonByOpponent: number;
  roundsTied: number;
  currentRoundIndex: number;
};

export type BotPartnerSignalKind =
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

export type BotPartnerSignalStrengthHint = 'none' | 'weak' | 'medium' | 'strong';

export type BotPartnerSignalIntent = 'save' | 'attack' | 'pressure' | 'neutral';

export type BotPartnerSignalView = {
  fromSeatId: BotSeatId;
  kind: BotPartnerSignalKind;
  strengthHint: BotPartnerSignalStrengthHint;
  intent: BotPartnerSignalIntent;
  expiresAt: string;
};

export type BotDecisionContext = {
  matchId: string;
  profile: BotProfile;
  mode?: BotMode;
  actorSeatId?: BotSeatId;
  actorTeamId?: BotTeamId;
  partnerSeatId?: BotSeatId | null;
  partnerSignal?: BotPartnerSignalView | null;
  viraRank: Rank;
  currentRound: BotRoundView | null;
  player: BotPlayerView;
  bet?: BotBetView;
  score?: BotMatchScoreView;
  handProgress?: BotHandProgressView;
};

// Decision source separates normal heuristic wiring from remote decisions and
// degraded Python-adapter fallbacks.
export type BotDecisionSource = 'heuristic' | 'python-remote' | 'heuristic-fallback';

// Strategy labels are a closed set so telemetry and remote adapter payloads
// cannot drift into arbitrary strings.
export type BotDecisionStrategy =
  | 'opening-weakest'
  | 'opening-middle'
  | 'opening-strongest'
  | 'response-winning-weakest'
  | 'response-winning-strongest'
  | 'response-losing-weakest'
  | 'response-losing-middle'
  | 'response-losing-strongest'
  | 'two-versus-two-partner-winning-save-weakest'
  | 'two-versus-two-response-losing-save-weakest'
  | 'two-versus-two-signal-hold-save-weakest'
  | 'two-versus-two-signal-kill-round-weakest-winner'
  | 'two-versus-two-opening-after-first-win-pressure'
  | 'two-versus-two-opening-after-first-win-save-weakest'
  | 'bet-accept'
  | 'bet-decline'
  | 'bet-raise'
  | 'bet-no-response'
  | 'bet-accept-forced-by-score'
  | 'bet-decline-by-score'
  | 'bet-initiative-value'
  | 'bet-initiative-pressure'
  | 'bet-initiative-bluff'
  | 'mao-de-onze-accept-strong-hand'
  | 'mao-de-onze-accept-aggressive-risk'
  | 'mao-de-onze-accept-balanced-hand'
  | 'mao-de-onze-decline-weak-hand'
  | 'mao-de-onze-decline-cautious-risk'
  | 'mao-de-onze-decline-match-risk'
  | 'empty-hand'
  | 'missing-round'
  | 'unsupported-state';

export type BotDecisionBetTelemetry = {
  currentValue?: number;
  pendingValue?: number | null;
  betState?: BotBetView['betState'];
  requestedBy?: 'P1' | 'P2' | null;
  specialState?: BotBetView['specialState'];
  selectedBetAction?:
    | 'accept-bet'
    | 'decline-bet'
    | 'request-truco'
    | 'raise-to-six'
    | 'raise-to-nine'
    | 'raise-to-twelve';
  handStrength?: number;
  progressBoost?: number;
  scoreBoost?: number;
  partnerSignalBoost?: number;
  effectiveStrength?: number;
  acceptThreshold?: number;
  raiseThreshold?: number;
  initiativeThreshold?: number;
  bluffProbability?: number;
  declineFloor?: number;
  myPointsToWin?: number;
  opponentPointsToWin?: number;
  declineLosesMatch?: boolean;
  acceptRisksMatch?: boolean;
  roundsWonByMe?: number;
  roundsWonByOpponent?: number;
  roundsTied?: number;
  currentRoundIndex?: number;
  partnerSignalKind?: BotPartnerSignalKind;
  partnerSignalStrengthHint?: BotPartnerSignalStrengthHint;
  partnerSignalIntent?: BotPartnerSignalIntent;
};

export type BotDecisionTacticalTelemetry = {
  mode?: BotMode;
  actorSeatId?: BotSeatId;
  actorTeamId?: BotTeamId;
  partnerSeatId?: BotSeatId | null;
  winningSeatIdBeforeDecision?: BotSeatId | null;
  winningTeamIdBeforeDecision?: BotTeamId | null;
  winningCardBeforeDecision?: string | null;
  partnerWasWinning?: boolean;
  actorHandBefore?: string[];
  selectedCard?: string;
  partnerSignalKind?: BotPartnerSignalKind;
  partnerSignalIntent?: BotPartnerSignalIntent;
  seatPlays?: Partial<Record<BotSeatId, string | null>>;
  orderedPlays?: BotRoundPlayView[];
};

export type BotDecisionRationale = {
  // Optional normalized strength score. Card-play paths and remote payloads may
  // omit it when the decision did not require hand evaluation.
  handStrength?: number;
  strategy?: BotDecisionStrategy;
  tactical?: BotDecisionTacticalTelemetry;
  betAudit?: BotDecisionBetTelemetry;
};

export type BotDecisionMetadata = {
  source: BotDecisionSource;
  rationale?: BotDecisionRationale;
};

export type BotDecision =
  | {
      action: 'play-card';
      card: string;
      metadata?: BotDecisionMetadata;
    }
  | {
      action: 'accept-bet';
      metadata?: BotDecisionMetadata;
    }
  | {
      action: 'decline-bet';
      metadata?: BotDecisionMetadata;
    }
  | {
      action: 'request-truco';
      metadata?: BotDecisionMetadata;
    }
  | {
      action: 'raise-to-six';
      metadata?: BotDecisionMetadata;
    }
  | {
      action: 'raise-to-nine';
      metadata?: BotDecisionMetadata;
    }
  | {
      action: 'raise-to-twelve';
      metadata?: BotDecisionMetadata;
    }
  | {
      action: 'accept-mao-de-onze';
      metadata?: BotDecisionMetadata;
    }
  | {
      action: 'decline-mao-de-onze';
      metadata?: BotDecisionMetadata;
    }
  | {
      action: 'pass';
      reason: 'empty-hand' | 'missing-round' | 'unsupported-state';
      metadata?: BotDecisionMetadata;
    };

export interface BotDecisionPort {
  decide(context: BotDecisionContext): BotDecision;
}
