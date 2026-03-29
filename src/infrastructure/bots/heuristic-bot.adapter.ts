import { Injectable } from '@nestjs/common';

import type {
  BotDecision,
  BotDecisionPort,
  BotDecisionRequest,
  BotProfile,
} from '@game/application/ports/bot-decision.port';
import { compareCards } from '@game/domain/services/truco-rules';
import type { Rank } from '@game/domain/value-objects/rank';
import { Card } from '@game/domain/value-objects/card';

type CurrentRoundView = {
  playerOneCard: string | null;
  playerTwoCard: string | null;
  result: 'P1' | 'P2' | 'TIE' | null;
  finished: boolean;
};

@Injectable()
export class HeuristicBotAdapter implements BotDecisionPort {
  decideNextMove(request: BotDecisionRequest): BotDecision | null {
    const currentTurnSeatId = request.roomState.currentTurnSeatId;
    const currentHand = request.state.currentHand;

    if (!currentTurnSeatId || !currentHand) {
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
      playerId === 'P1' ? currentHand.playerOneHand : currentHand.playerTwoHand;

    if (hand.length === 0) {
      return null;
    }

    const currentRound = this.getCurrentRound(currentHand.rounds);
    const opponentCard =
      playerId === 'P1' ? currentRound?.playerTwoCard : currentRound?.playerOneCard;

    const profile = request.profile ?? 'balanced';
    const orderedHand = [...hand].sort((left, right) =>
      this.compareCardStrength(left, right, currentHand.viraRank),
    );

    const selectedCard = opponentCard
      ? this.pickResponseCard(orderedHand, opponentCard, currentHand.viraRank, profile)
      : this.pickOpeningCard(orderedHand, profile);

    if (!selectedCard) {
      return null;
    }

    return {
      seatId: currentSeat.seatId,
      teamId: currentSeat.teamId,
      playerId,
      card: selectedCard,
    };
  }

  private getCurrentRound(rounds: CurrentRoundView[]): CurrentRoundView | null {
    if (rounds.length === 0) {
      return null;
    }

    return rounds[rounds.length - 1] ?? null;
  }

  private pickOpeningCard(hand: string[], profile: BotProfile): string {
    if (profile === 'aggressive') {
      return hand[hand.length - 1]!;
    }

    return hand[0]!;
  }

  private pickResponseCard(
    hand: string[],
    opponentCard: string,
    viraRank: Rank,
    profile: BotProfile,
  ): string {
    const winningCards = hand.filter((candidate) =>
      this.beats(candidate, opponentCard, viraRank),
    );

    if (winningCards.length === 0) {
      return this.pickLosingCard(hand, profile);
    }

    if (profile === 'aggressive') {
      return winningCards[winningCards.length - 1]!;
    }

    return winningCards[0]!;
  }

  private pickLosingCard(hand: string[], profile: BotProfile): string {
    if (profile === 'aggressive') {
      return hand[hand.length - 1]!;
    }

    return hand[0]!;
  }

  private beats(candidate: string, opponentCard: string, viraRank: Rank): boolean {
    const candidateCard = Card.from(candidate);
    const opponent = Card.from(opponentCard);

    return compareCards(candidateCard, opponent, viraRank) === 'A';
  }

  private compareCardStrength(left: string, right: string, viraRank: Rank): number {
    const leftCard = Card.from(left);
    const rightCard = Card.from(right);

    const result = compareCards(leftCard, rightCard, viraRank);

    if (result === 'A') return 1;
    if (result === 'B') return -1;
    return 0;
  }
}