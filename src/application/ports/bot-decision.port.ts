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

export type BotDecisionContext = {
  matchId: string;
  profile: BotProfile;
  viraRank: Rank;
  currentRound: BotRoundView | null;
  player: BotPlayerView;
};

export type BotDecision =
  | {
      action: 'play-card';
      card: string;
    }
  | {
      action: 'pass';
      reason: 'empty-hand' | 'missing-round' | 'unsupported-state';
    };

export interface BotDecisionPort {
  decide(context: BotDecisionContext): BotDecision;
}