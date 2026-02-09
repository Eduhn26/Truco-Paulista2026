import type { MatchState } from '../../../domain/value-objects/match-state';

export type ViewMatchStateResponseDto = {
  matchId: string;
  state: MatchState;
  score: {
    playerOne: number;
    playerTwo: number;
  };
};
