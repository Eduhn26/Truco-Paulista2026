import type { MatchState } from '@game/domain/value-objects/match-state';

export type RequestTrucoResponseDto = {
  matchId: string;
  state: MatchState;
  score: {
    playerOne: number;
    playerTwo: number;
  };
};
