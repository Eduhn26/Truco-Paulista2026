import type { MatchState } from '../../../domain/value-objects/match-state';
import type { Rank } from '../../../domain/value-objects/rank';
import type { RoundResult } from '../../../domain/value-objects/round-result';

export type ViewMatchStateResponseDto = {
  matchId: string;
  state: MatchState;
  score: {
    playerOne: number;
    playerTwo: number;
  };
  currentHand: null | {
    viraRank: Rank;
    finished: boolean;
    playerOneHand: string[];
    playerTwoHand: string[];
    rounds: Array<{
      playerOneCard: string | null;
      playerTwoCard: string | null;
      result: RoundResult | null;
      finished: boolean;
    }>;
  };
};