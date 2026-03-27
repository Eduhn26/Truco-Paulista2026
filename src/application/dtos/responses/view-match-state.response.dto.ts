import type { MatchState } from '../../../domain/value-objects/match-state';
import type { Rank } from '../../../domain/value-objects/rank';
import type { RoundResult } from '../../../domain/value-objects/round-result';
import type { PlayerId } from '../../../domain/value-objects/player-id';

export type ViewMatchStateRequestDto = {
  matchId: string;
  viewerPlayerId?: PlayerId;
};

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
    viewerPlayerId: PlayerId | null;
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