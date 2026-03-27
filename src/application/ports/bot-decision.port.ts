import type { ViewMatchStateResponseDto } from '@game/application/dtos/responses/view-match-state.response.dto';

export const BOT_DECISION_PORT = 'BOT_DECISION_PORT';

export type BotRoomPlayerView = {
  seatId: string;
  teamId: 'T1' | 'T2';
  ready: boolean;
  isBot: boolean;
};

export type BotRoomStateView = {
  currentTurnSeatId: string | null;
  players: BotRoomPlayerView[];
};

export type BotDecisionRequest = {
  matchId: string;
  state: ViewMatchStateResponseDto;
  roomState: BotRoomStateView;
};

export type BotDecision = {
  seatId: string;
  teamId: 'T1' | 'T2';
  playerId: 'P1' | 'P2';
  card: string;
};

export interface BotDecisionPort {
  decideNextMove(request: BotDecisionRequest): BotDecision | null;
}