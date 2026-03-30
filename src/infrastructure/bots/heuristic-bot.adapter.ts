import { Injectable } from '@nestjs/common';

import type {
  BotDecision,
  BotDecisionContext,
  BotDecisionPort,
  BotProfile,
  BotRoundView,
} from '@game/application/ports/bot-decision.port';
import { compareCards } from '@game/domain/services/truco-rules';
import { Card } from '@game/domain/value-objects/card';
import type { Rank } from '@game/domain/value-objects/rank';

@Injectable()
export class HeuristicBotAdapter implements BotDecisionPort {
  decide(context: BotDecisionContext): BotDecision {
    const hand = context.player.hand;

    if (hand.length === 0) {
      return {
        action: 'pass',
        reason: 'empty-hand',
      };
    }

    if (!context.currentRound) {
      return {
        action: 'pass',
        reason: 'missing-round',
      };
    }

    const orderedHand = [...hand].sort((left, right) =>
      this.compareCardStrength(left, right, context.viraRank),
    );

    const opponentCard = this.getOpponentCard(
      context.currentRound,
      context.player.playerId,
    );

    const selectedCard = opponentCard
      ? this.pickResponseCard(
          orderedHand,
          opponentCard,
          context.viraRank,
          context.profile,
        )
      : this.pickOpeningCard(orderedHand, context.profile);

    if (!selectedCard) {
      return {
        action: 'pass',
        reason: 'unsupported-state',
      };
    }

    return {
      action: 'play-card',
      card: selectedCard,
    };
  }

  private getOpponentCard(
    currentRound: BotRoundView,
    playerId: 'P1' | 'P2',
  ): string | null {
    return playerId === 'P1'
      ? currentRound.playerTwoCard
      : currentRound.playerOneCard;
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