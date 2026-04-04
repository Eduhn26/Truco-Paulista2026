import type { PlayerId } from '@game/domain/value-objects/player-id';

export type ViewMatchStateRequestDto = {
  matchId: string;
  viewerPlayerId?: PlayerId;
};
