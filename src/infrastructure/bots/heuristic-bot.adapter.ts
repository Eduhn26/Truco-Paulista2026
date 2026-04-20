import { Injectable } from '@nestjs/common';

import type {
  BotDecision,
  BotDecisionContext,
  BotDecisionMetadata,
  BotDecisionPort,
  BotDecisionStrategy,
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
        metadata: this.buildMetadata('empty-hand'),
      };
    }

    if (!context.currentRound) {
      return {
        action: 'pass',
        reason: 'missing-round',
        metadata: this.buildMetadata('missing-round'),
      };
    }

    const orderedHand = [...hand].sort((left, right) =>
      this.compareCardStrength(left, right, context.viraRank),
    );

    const opponentCard = this.getOpponentCard(context.currentRound, context.player.playerId);

    const selection = opponentCard
      ? this.pickResponseCard(orderedHand, opponentCard, context.viraRank, context.profile)
      : this.pickOpeningCard(orderedHand, context.profile);

    if (!selection) {
      return {
        action: 'pass',
        reason: 'unsupported-state',
        metadata: this.buildMetadata('unsupported-state'),
      };
    }

    return {
      action: 'play-card',
      card: selection.card,
      // NOTE (22.A): handStrength is intentionally omitted on play-card paths to avoid running
      // calculateHandStrength on every bot turn. It is only populated on bet-response decisions.
      metadata: this.buildMetadata(selection.strategy),
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
        metadata: this.buildMetadata('bet-raise', handStrength),
      };
    }

    if (availableActions.canAcceptBet && handStrength >= thresholds.accept) {
      return {
        action: 'accept-bet',
        metadata: this.buildMetadata('bet-accept', handStrength),
      };
    }

    if (availableActions.canDeclineBet) {
      return {
        action: 'decline-bet',
        metadata: this.buildMetadata('bet-decline', handStrength),
      };
    }

    if (availableActions.canAcceptBet) {
      return {
        action: 'accept-bet',
        metadata: this.buildMetadata('bet-no-response', handStrength),
      };
    }

    return null;
  }

  // 22.B: thresholds widened between profiles to make bet behaviour perceptibly distinct.
  // - aggressive: accepts earlier (0.28) and raises on solid — not just excellent — hands (0.65).
  // - balanced:   unchanged anchor (0.50 / 0.84) — preserves regression baseline for the default profile.
  // - cautious:   only raises on near-unbeatable hands (0.97) and demands a strong hand to accept (0.70).
  private resolveBetThresholds(profile: BotProfile): BotBetThresholds {
    if (profile === 'aggressive') {
      return {
        accept: 0.28,
        raise: 0.65,
      };
    }

    if (profile === 'cautious') {
      return {
        accept: 0.7,
        raise: 0.97,
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

  private pickOpeningCard(
    hand: string[],
    profile: BotProfile,
  ): { card: string; strategy: BotDecisionStrategy } {
    const card = this.pickCardByProfile(hand, profile, {
      aggressive: 'strongest',
      balanced: 'middle',
      cautious: 'weakest',
    });

    const strategy: BotDecisionStrategy =
      profile === 'aggressive'
        ? 'opening-strongest'
        : profile === 'cautious'
          ? 'opening-weakest'
          : 'opening-middle';

    return { card, strategy };
  }

  private pickResponseCard(
    hand: string[],
    opponentCard: string,
    viraRank: Rank,
    profile: BotProfile,
  ): { card: string; strategy: BotDecisionStrategy } {
    const winningCards = hand.filter((candidate) => this.beats(candidate, opponentCard, viraRank));

    if (winningCards.length === 0) {
      const card = this.pickLosingCard(hand, profile);
      // 22.B: aggressive on a losing round no longer burns its strongest card.
      // Losing-round strategy labels after the adjustment:
      //  - aggressive: 'response-losing-middle' (was 'response-losing-strongest')
      //  - balanced:   'response-losing-middle' (unchanged)
      //  - cautious:   'response-losing-weakest' (unchanged)
      const strategy: BotDecisionStrategy =
        profile === 'cautious' ? 'response-losing-weakest' : 'response-losing-middle';

      return { card, strategy };
    }

    // 22.B: balanced no longer collides with cautious here. Now:
    //  - aggressive: plays the strongest winning card (crush the opponent).
    //  - balanced:   plays the middle winning card (economical but not stingy).
    //  - cautious:   plays the weakest winning card (save high cards for later rounds).
    // Strategy label for balanced reuses 'response-winning-weakest' — the closest existing label
    // in the shared whitelist (the port / python adapter do not define a 'response-winning-middle'
    // value and this step's scope forbids touching them). The behavioural difference is real; only
    // the telemetry label is approximated.
    const card = this.pickCardByProfile(winningCards, profile, {
      aggressive: 'strongest',
      balanced: 'middle',
      cautious: 'weakest',
    });

    const strategy: BotDecisionStrategy =
      profile === 'aggressive' ? 'response-winning-strongest' : 'response-winning-weakest';

    return { card, strategy };
  }

  private pickLosingCard(hand: string[], profile: BotProfile): string {
    // 22.B: aggressive switched from 'strongest' to 'middle' to stop wasting top cards on lost rounds.
    // cautious stays on 'weakest' (correct tactically: preserve strength for following rounds).
    return this.pickCardByProfile(hand, profile, {
      aggressive: 'middle',
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

  private buildMetadata(strategy: BotDecisionStrategy, handStrength?: number): BotDecisionMetadata {
    const rationale = handStrength !== undefined ? { strategy, handStrength } : { strategy };

    return {
      source: 'heuristic',
      rationale,
    };
  }
}
