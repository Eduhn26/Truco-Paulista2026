import type { HandMode } from '@game/domain/entities/hand';

export type StartHandRequestDto = {
  matchId: string;
  viraRank?: string;
  mode?: HandMode;
};
