import { Injectable } from '@nestjs/common';

import type {
  BotDecision,
  BotDecisionPort,
  BotDecisionRequest,
} from '@game/application/ports/bot-decision.port';

@Injectable()
export class HeuristicBotAdapter implements BotDecisionPort {
  decideNextMove(request: BotDecisionRequest): BotDecision | null {
    const currentTurnSeatId = request.roomState.currentTurnSeatId;

    if (!currentTurnSeatId || !request.state.currentHand) {
      return null;
    }

    const currentSeat = request.roomState.players.find(
      (player) => player.seatId === currentTurnSeatId,
    );

    if (!currentSeat || !currentSeat.isBot) {
      return null;
    }

    const playerId: 'P1' | 'P2' = currentSeat.teamId === 'T1' ? 'P1' : 'P2';
    const hand =
      playerId === 'P1'
        ? request.state.currentHand.playerOneHand
        : request.state.currentHand.playerTwoHand;

    const card = hand[0];
    if (!card) {
      return null;
    }

    return {
      seatId: currentSeat.seatId,
      teamId: currentSeat.teamId,
      playerId,
      card,
    };
  }
}