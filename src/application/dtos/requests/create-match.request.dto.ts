export type MatchMode = '1v1' | '2v2';

export type CreateMatchRequestDto = {
  pointsToWin?: number;
  mode?: MatchMode;
};
