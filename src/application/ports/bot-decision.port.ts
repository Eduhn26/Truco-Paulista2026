export type BotProfile = 'balanced' | 'aggressive' | 'cautious';

export type BotPlayerView = {
  seatId: string;
  teamId: 'T1' | 'T2';
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
  viraRank: string;
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
      reason:
        | 'not-bot-turn'
        | 'no-current-hand'
        | 'empty-hand'
        | 'missing-round'
        | 'unsupported-state';
    };

export interface BotDecisionPort {
  decide(context: BotDecisionContext): BotDecision;
}