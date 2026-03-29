// Request DTO for creating a new match (transport-facing contract).
export type MatchMode = '1v1' | '2v2';

export type CreateMatchRequestDto = {
  pointsToWin?: number;
  mode?: MatchMode;
};