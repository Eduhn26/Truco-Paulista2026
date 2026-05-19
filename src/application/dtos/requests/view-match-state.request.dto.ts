import type { PlayerId } from '@game/domain/value-objects/player-id';
import type { SeatId } from '@game/domain/entities/round';

export type ViewMatchStateRequestDto = {
  matchId: string;
  viewerPlayerId?: PlayerId;
  viewerSeatId?: SeatId;
};
