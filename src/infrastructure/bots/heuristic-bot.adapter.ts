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

type CardSelectionStrategy = 'weakest' | 'middle' | 'strongest';
type BotBetAction = Extract<
  BotDecision,
  { action: 'accept-bet' | 'decline-bet' | 'raise-to-six' | 'raise-to-nine' | 'raise-to-twelve' }
>['action'];

type BotBetThresholds = {
  accept: number;
  raise: number;
};

const FULL_DECK_SUITS = ['C', 'O', 'P', 'E'] as const;
const FULL_DECK_RANKS = ['4', '5', '6', '7', 'Q', 'J', 'K', 'A', '2', '3'] as const;
const FULL_DECK = FULL_DECK_RANKS.flatMap((rank) =>
  FULL_DECK_SUITS.map((suit) => `${rank}${suit}`),
);

@Injectable()
export class HeuristicBotAdapter implements BotDecisionPort {
  decide(context: BotDecisionContext): BotDecision {
    const betDecision = this.decideBetResponse(context);

    if (betDecision) {
      return betDecision;
    }

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

    const opponentCard = this.getOpponentCard(context.currentRound, context.player.playerId);

    const selectedCard = opponentCard
      ? this.pickResponseCard(orderedHand, opponentCard, context.viraRank, context.profile)
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

  private decideBetResponse(context: BotDecisionContext): BotDecision | null {
    const bet = context.bet;

    if (!bet) {
      return null;
    }

    const { availableActions } = bet;

    const hasPendingBetResponse =
      bet.betState === 'awaiting_response' &&
      (availableActions.canAcceptBet ||
        availableActions.canDeclineBet ||
        availableActions.canRaiseToSix ||
        availableActions.canRaiseToNine ||
        availableActions.canRaiseToTwelve);

    if (!hasPendingBetResponse) {
      return null;
    }

    const handStrength = this.calculateHandStrength(context.player.hand, context.viraRank);
    const thresholds = this.resolveBetThresholds(context.profile);
    const strongestRaise = this.getStrongestAvailableRaise(availableActions);

    if (strongestRaise && handStrength >= thresholds.raise) {
      return {
        action: strongestRaise,
      };
    }

    if (availableActions.canAcceptBet && handStrength >= thresholds.accept) {
      return {
        action: 'accept-bet',
      };
    }

    if (availableActions.canDeclineBet) {
      return {
        action: 'decline-bet',
      };
    }

    if (availableActions.canAcceptBet) {
      return {
        action: 'accept-bet',
      };
    }

    return null;
  }

  private resolveBetThresholds(profile: BotProfile): BotBetThresholds {
    if (profile === 'aggressive') {
      return {
        accept: 0.34,
        raise: 0.72,
      };
    }

    if (profile === 'cautious') {
      return {
        accept: 0.64,
        raise: 0.94,
      };
    }

    return {
      accept: 0.5,
      raise: 0.84,
    };
  }

  private getStrongestAvailableRaise(
    availableActions: NonNullable<BotDecisionContext['bet']>['availableActions'],
  ): BotBetAction | null {
    if (availableActions.canRaiseToTwelve) {
      return 'raise-to-twelve';
    }

    if (availableActions.canRaiseToNine) {
      return 'raise-to-nine';
    }

    if (availableActions.canRaiseToSix) {
      return 'raise-to-six';
    }

    return null;
  }

  private calculateHandStrength(hand: string[], viraRank: Rank): number {
    if (hand.length === 0) {
      return 0;
    }

    const totalPossibleWins = FULL_DECK.length - 1;

    if (totalPossibleWins <= 0) {
      return 0;
    }

    const scores = hand.map((candidate) => {
      let wins = 0;

      for (const opponentCard of FULL_DECK) {
        if (opponentCard === candidate) {
          continue;
        }

        if (this.beats(candidate, opponentCard, viraRank)) {
          wins += 1;
        }
      }

      return wins / totalPossibleWins;
    });

    const totalScore = scores.reduce((accumulator, score) => accumulator + score, 0);

    return totalScore / scores.length;
  }

  private getOpponentCard(currentRound: BotRoundView, playerId: 'P1' | 'P2'): string | null {
    return playerId === 'P1' ? currentRound.playerTwoCard : currentRound.playerOneCard;
  }

  private pickOpeningCard(hand: string[], profile: BotProfile): string {
    return this.pickCardByProfile(hand, profile, {
      aggressive: 'strongest',
      balanced: 'middle',
      cautious: 'weakest',
    });
  }

  private pickResponseCard(
    hand: string[],
    opponentCard: string,
    viraRank: Rank,
    profile: BotProfile,
  ): string {
    const winningCards = hand.filter((candidate) => this.beats(candidate, opponentCard, viraRank));

    if (winningCards.length === 0) {
      return this.pickLosingCard(hand, profile);
    }

    return this.pickCardByProfile(winningCards, profile, {
      aggressive: 'strongest',
      balanced: 'weakest',
      cautious: 'weakest',
    });
  }

  private pickLosingCard(hand: string[], profile: BotProfile): string {
    return this.pickCardByProfile(hand, profile, {
      aggressive: 'strongest',
      balanced: 'middle',
      cautious: 'weakest',
    });
  }

  private pickCardByProfile(
    cards: string[],
    profile: BotProfile,
    strategyByProfile: Record<BotProfile, CardSelectionStrategy>,
  ): string {
    const strategy = strategyByProfile[profile];

    if (strategy === 'strongest') {
      return cards[cards.length - 1]!;
    }

    if (strategy === 'middle') {
      return cards[Math.floor((cards.length - 1) / 2)]!;
    }

    return cards[0]!;
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
