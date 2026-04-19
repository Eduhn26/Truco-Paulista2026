import type { Rank } from '@game/domain/value-objects/rank';

export const BOT_DECISION_PORT = 'BOT_DECISION_PORT';

export type BotProfile = 'balanced' | 'aggressive' | 'cautious';

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

export type BotRoundView = {
  playerOneCard: string | null;
  playerTwoCard: string | null;
  finished: boolean;
  result: 'P1' | 'P2' | 'TIE' | null;
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

export type BotDecisionContext = {
  matchId: string;
  profile: BotProfile;
  viraRank: Rank;
  currentRound: BotRoundView | null;
  player: BotPlayerView;
  bet?: BotBetView;
};

// Provenance of the decision from the consumer's perspective.
// - 'heuristic'         : decision computed by the local heuristic adapter when it is the wired implementation.
// - 'python-remote'     : decision computed by the remote python bot service (successful round-trip).
// - 'heuristic-fallback': python bot adapter was invoked but served the decision via the local heuristic,
//                         either because the remote path was disabled/failed or because the sync entry-point
//                         delegates straight to the heuristic. This distinguishes a direct heuristic wiring
//                         from a degraded python wiring.
export type BotDecisionSource = 'heuristic' | 'python-remote' | 'heuristic-fallback';

// Closed set of strategy labels the adapters may emit. Kept as a union rather than a free-form string so
// TypeScript strict mode can catch drift and downstream telemetry does not accumulate arbitrary values.
// Labels mirror the branches already present in the heuristic adapter; python-remote payloads carrying an
// unknown strategy must be rejected at the adapter boundary (not normalized here).
export type BotDecisionStrategy =
  | 'opening-weakest'
  | 'opening-middle'
  | 'opening-strongest'
  | 'response-winning-weakest'
  | 'response-winning-strongest'
  | 'response-losing-weakest'
  | 'response-losing-middle'
  | 'response-losing-strongest'
  | 'bet-accept'
  | 'bet-decline'
  | 'bet-raise'
  | 'bet-no-response'
  | 'empty-hand'
  | 'missing-round'
  | 'unsupported-state';

export type BotDecisionRationale = {
  // Hand strength in [0, 1] as computed by the heuristic. Optional because:
  //  - we do not compute it on card-play paths (cost control),
  //  - python-remote payloads may omit it.
  handStrength?: number;
  strategy?: BotDecisionStrategy;
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
      action: 'pass';
      reason: 'empty-hand' | 'missing-round' | 'unsupported-state';
      metadata?: BotDecisionMetadata;
    };

export interface BotDecisionPort {
  decide(context: BotDecisionContext): BotDecision;
}
