import type { PlayerId } from '../../../domain/value-objects/player-id';

export type ViewMatchStateRequestDto = {
  matchId: string;
  viewerPlayerId?: PlayerId;
};
