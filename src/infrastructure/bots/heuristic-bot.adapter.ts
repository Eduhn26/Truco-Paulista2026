import { Injectable } from '@nestjs/common';

import type {
  BotDecision,
  BotDecisionContext,
  BotDecisionMetadata,
  BotDecisionPort,
  BotDecisionStrategy,
  BotHandProgressView,
  BotProfile,
  BotRoundView,
} from '@game/application/ports/bot-decision.port';
import { compareCards } from '@game/domain/services/truco-rules';
import { Card } from '@game/domain/value-objects/card';
import type { Rank } from '@game/domain/value-objects/rank';

type CardSelectionStrategy = 'weakest' | 'middle' | 'strongest';
type BotBetAction = Extract<
  BotDecision,
  {
    action:
      | 'accept-bet'
      | 'decline-bet'
      | 'request-truco'
      | 'raise-to-six'
      | 'raise-to-nine'
      | 'raise-to-twelve';
  }
>['action'];

type BotBetThresholds = {
  accept: number;
  raise: number;
  // Initiative threshold: minimum hand strength (0..1) to call truco / raise on own turn
  // without any positional advantage (no rounds won, balanced score).
  initiative: number;
  // Bluff probability when hand strength is clearly below `initiative` but positional
  // context is favourable (won R1, opponent under score pressure, etc.).
  bluffProbability: number;
};

type ScorePressure = {
  // My remaining points to reach victory (>= 1).
  myPointsToWin: number;
  // Opponent's remaining points to reach victory (>= 1).
  opponentPointsToWin: number;
  // True if declining the current pending bet ends the match for me.
  declineLosesMatch: boolean;
  // True if accepting the current pending bet could end the match for me if I lose.
  acceptRisksMatch: boolean;
};

const FULL_DECK_SUITS = ['C', 'O', 'P', 'E'] as const;
const FULL_DECK_RANKS = ['4', '5', '6', '7', 'Q', 'J', 'K', 'A', '2', '3'] as const;
const FULL_DECK = FULL_DECK_RANKS.flatMap((rank) =>
  FULL_DECK_SUITS.map((suit) => `${rank}${suit}`),
);

@Injectable()
export class HeuristicBotAdapter implements BotDecisionPort {
  decide(context: BotDecisionContext): BotDecision {
    const betResponse = this.decideBetResponse(context);
    if (betResponse) {
      return betResponse;
    }

    // New: take truco initiative BEFORE choosing a card, when legal.
    const initiative = this.decideBetInitiative(context);
    if (initiative) {
      return initiative;
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

  // ---------------------------------------------------------------------------
  // Bet response (opponent has pending truco/raise request)
  // ---------------------------------------------------------------------------
  private decideBetResponse(context: BotDecisionContext): BotDecision | null {
    const bet = context.bet;
    if (!bet) return null;

    const { availableActions } = bet;
    const hasPendingBetResponse =
      bet.betState === 'awaiting_response' &&
      (availableActions.canAcceptBet ||
        availableActions.canDeclineBet ||
        availableActions.canRaiseToSix ||
        availableActions.canRaiseToNine ||
        availableActions.canRaiseToTwelve);

    if (!hasPendingBetResponse) return null;

    const handStrength = this.calculateHandStrength(context.player.hand, context.viraRank);
    const progressBoost = this.computeProgressBoost(context.handProgress);
    const effectiveStrength = this.clamp01(handStrength + progressBoost);

    const thresholds = this.resolveBetThresholds(context.profile);
    const pressure = this.computeScorePressure(context, bet);

    // 1. Score forces a decline: if accepting risks losing the match AND hand is weak,
    //    cautious/balanced prefer to run. Aggressive still accepts more liberally.
    if (
      pressure.acceptRisksMatch &&
      availableActions.canDeclineBet &&
      effectiveStrength < this.declineFloor(context.profile)
    ) {
      return {
        action: 'decline-bet',
        metadata: this.buildMetadata('bet-decline-by-score', handStrength),
      };
    }

    // 2. Declining loses the match: we have nothing to lose by accepting, regardless of strength.
    if (pressure.declineLosesMatch && availableActions.canAcceptBet) {
      return {
        action: 'accept-bet',
        metadata: this.buildMetadata('bet-accept-forced-by-score', handStrength),
      };
    }

    // 3. Strong hand + not yet at max → raise.
    const strongestRaise = this.getStrongestAvailableRaise(availableActions);
    if (strongestRaise && effectiveStrength >= thresholds.raise) {
      return {
        action: strongestRaise,
        metadata: this.buildMetadata('bet-raise', handStrength),
      };
    }

    // 4. Good-enough hand → accept.
    if (availableActions.canAcceptBet && effectiveStrength >= thresholds.accept) {
      return {
        action: 'accept-bet',
        metadata: this.buildMetadata('bet-accept', handStrength),
      };
    }

    // 5. Can decline → decline.
    if (availableActions.canDeclineBet) {
      return {
        action: 'decline-bet',
        metadata: this.buildMetadata('bet-decline', handStrength),
      };
    }

    // 6. No decline available (e.g. first truco cannot be declined in some rules) → accept.
    if (availableActions.canAcceptBet) {
      return {
        action: 'accept-bet',
        metadata: this.buildMetadata('bet-no-response', handStrength),
      };
    }

    return null;
  }

  // ---------------------------------------------------------------------------
  // Bet initiative (bot's own turn, no pending bet) — NEW
  // ---------------------------------------------------------------------------
  private decideBetInitiative(context: BotDecisionContext): BotDecision | null {
    const bet = context.bet;
    if (!bet) return null;
    if (bet.betState !== 'idle') return null;
    if (bet.specialState !== 'normal') return null;
    if (bet.specialDecisionPending) return null;

    const actions = bet.availableActions;
    // Must be able to both play a card (i.e. bot's card-play turn) AND escalate.
    if (!actions.canAttemptPlayCard) return null;

    const initiativeAction = this.resolveInitiativeAction(actions);
    if (!initiativeAction) return null;

    // Skip the initiative branch entirely on the opening move of the hand: pushing
    // truco with zero rounds played and no table information is robotic, not human.
    // Players typically feel out the first round first. Exception: mão de 11/ferro
    // is already filtered above; here we're only blocking the very first card of a
    // normal hand.
    if (this.isBeforeAnyRound(context)) return null;

    const hand = context.player.hand;
    if (hand.length === 0) return null;

    const handStrength = this.calculateHandStrength(hand, context.viraRank);
    const thresholds = this.resolveBetThresholds(context.profile);
    const progressBoost = this.computeProgressBoost(context.handProgress);
    const scoreBoost = this.computeScoreInitiativeBoost(context);
    const effectiveStrength = this.clamp01(handStrength + progressBoost + scoreBoost);

    // Value-driven initiative: genuinely strong hand.
    if (effectiveStrength >= thresholds.initiative) {
      return {
        action: initiativeAction,
        metadata: this.buildMetadata('bet-initiative-value', handStrength),
      };
    }

    // Pressure-driven initiative: won R1, opponent under score pressure, etc.
    // Lower bar than pure value because positional context already de-risks the call.
    if (progressBoost + scoreBoost >= 0.2 && effectiveStrength >= thresholds.initiative - 0.18) {
      return {
        action: initiativeAction,
        metadata: this.buildMetadata('bet-initiative-pressure', handStrength),
      };
    }

    // Controlled bluff: small, profile-weighted probability of calling truco on a weak
    // hand when the situation is not obviously suicidal (we are not actively losing R1
    // with a terrible hand). Deterministic per (matchId, round, hand) so tests are
    // reproducible and we do not spam repeated bluffs.
    if (this.shouldBluff(context, thresholds, handStrength)) {
      return {
        action: initiativeAction,
        metadata: this.buildMetadata('bet-initiative-bluff', handStrength),
      };
    }

    return null;
  }

  private resolveInitiativeAction(
    actions: NonNullable<BotDecisionContext['bet']>['availableActions'],
  ): BotBetAction | null {
    // Follow the natural escalation ladder. Only one of these should be legal at a time
    // (depending on currentValue), but we check defensively.
    if (actions.canRequestTruco) return 'request-truco';
    if (actions.canRaiseToSix) return 'raise-to-six';
    if (actions.canRaiseToNine) return 'raise-to-nine';
    if (actions.canRaiseToTwelve) return 'raise-to-twelve';
    return null;
  }

  private isBeforeAnyRound(context: BotDecisionContext): boolean {
    const progress = context.handProgress;
    if (progress) {
      return (
        progress.currentRoundIndex === 0 &&
        progress.roundsWonByMe === 0 &&
        progress.roundsWonByOpponent === 0 &&
        progress.roundsTied === 0 &&
        !context.currentRound?.playerOneCard &&
        !context.currentRound?.playerTwoCard
      );
    }

    // Fallback when gateway does not populate handProgress.
    const round = context.currentRound;
    return !round?.playerOneCard && !round?.playerTwoCard;
  }

  // ---------------------------------------------------------------------------
  // Bluff (deterministic PRNG)
  // ---------------------------------------------------------------------------
  private shouldBluff(
    context: BotDecisionContext,
    thresholds: BotBetThresholds,
    handStrength: number,
  ): boolean {
    if (thresholds.bluffProbability <= 0) return false;

    // Do not bluff when already losing the current round badly: opponent has played a
    // visibly strong card on the board. We don't know opponent's hand, but if they
    // played and we cannot beat it, bluffing on top is suicide.
    if (this.isLosingCurrentRoundVisibly(context)) return false;

    // Do not bluff if the hand is outright terrible — bluffing with a 0.05 hand is not
    // "brave", it's just noise. Require some baseline.
    if (handStrength < 0.18) return false;

    const seed = this.deterministicSeed(context);
    const roll = this.mulberry32(seed);
    return roll < thresholds.bluffProbability;
  }

  private isLosingCurrentRoundVisibly(context: BotDecisionContext): boolean {
    const round = context.currentRound;
    if (!round) return false;

    const myCard = context.player.playerId === 'P1' ? round.playerOneCard : round.playerTwoCard;
    const opCard = context.player.playerId === 'P1' ? round.playerTwoCard : round.playerOneCard;

    if (!opCard || myCard) return false;

    // Opponent played; check whether any card in my hand beats it.
    return !context.player.hand.some((candidate) =>
      this.beats(candidate, opCard, context.viraRank),
    );
  }

  private deterministicSeed(context: BotDecisionContext): number {
    const progress = context.handProgress;
    const roundIndex = progress?.currentRoundIndex ?? 0;
    const handKey = context.player.hand.join('|');
    const raw = `${context.matchId}::${roundIndex}::${handKey}`;
    let hash = 2166136261;
    for (let i = 0; i < raw.length; i += 1) {
      hash ^= raw.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  // Mulberry32 — tiny, fast, deterministic.
  private mulberry32(seed: number): number {
    let t = (seed + 0x6d2b79f5) >>> 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // ---------------------------------------------------------------------------
  // Score / progress boosts
  // ---------------------------------------------------------------------------
  private computeScorePressure(
    context: BotDecisionContext,
    bet: NonNullable<BotDecisionContext['bet']>,
  ): ScorePressure {
    const score = context.score;
    if (!score) {
      return {
        myPointsToWin: Number.POSITIVE_INFINITY,
        opponentPointsToWin: Number.POSITIVE_INFINITY,
        declineLosesMatch: false,
        acceptRisksMatch: false,
      };
    }

    const myScore = context.player.playerId === 'P1' ? score.playerOne : score.playerTwo;
    const opScore = context.player.playerId === 'P1' ? score.playerTwo : score.playerOne;

    const currentValue = bet.currentValue ?? 1;
    const pendingValue = bet.pendingValue ?? currentValue;

    // Declining awards `currentValue` to the requester (the opponent, since we're responding).
    const declineLosesMatch = opScore + currentValue >= score.pointsToWin;
    // Accepting risks `pendingValue` going to the opponent if we lose the hand.
    const acceptRisksMatch = opScore + pendingValue >= score.pointsToWin;

    return {
      myPointsToWin: Math.max(1, score.pointsToWin - myScore),
      opponentPointsToWin: Math.max(1, score.pointsToWin - opScore),
      declineLosesMatch,
      acceptRisksMatch,
    };
  }

  // Additive boost to hand strength when deciding initiative, based on rounds won so far.
  // Max boost is around 0.22 (won R1 AND tied R2) — meaningful but not overwhelming.
  private computeProgressBoost(progress?: BotHandProgressView): number {
    if (!progress) return 0;
    let boost = 0;

    if (progress.roundsWonByMe === 1 && progress.roundsWonByOpponent === 0) {
      // Classic "won R1" — very strong position for pressuring truco.
      boost += 0.18;
    } else if (
      progress.roundsWonByMe >= 1 &&
      progress.roundsWonByMe > progress.roundsWonByOpponent
    ) {
      boost += 0.1;
    } else if (progress.roundsWonByOpponent > progress.roundsWonByMe) {
      // Behind — lowers effective strength (less appetite for initiative; more appetite for folding).
      boost -= 0.12;
    }

    if (progress.roundsTied >= 1) {
      // A tied round typically favours whoever won the opposite round; neutral on its own.
      boost += 0.03;
    }

    return boost;
  }

  // When ahead on the match score, bot is slightly more willing to escalate (close it out).
  // When behind and running low on remaining points, bot is MUCH more willing to escalate
  // (only path to comeback). Keeps boost bounded.
  private computeScoreInitiativeBoost(context: BotDecisionContext): number {
    const score = context.score;
    if (!score) return 0;

    const myScore = context.player.playerId === 'P1' ? score.playerOne : score.playerTwo;
    const opScore = context.player.playerId === 'P1' ? score.playerTwo : score.playerOne;
    const diff = myScore - opScore;
    const myRemaining = score.pointsToWin - myScore;
    const opRemaining = score.pointsToWin - opScore;

    let boost = 0;

    if (myRemaining <= 3 && diff >= 0) {
      // Close to winning and tied/ahead — finish the job.
      boost += 0.08;
    }

    if (opRemaining <= 3 && diff < 0) {
      // Opponent is about to win and we're behind — gamble for comeback.
      boost += 0.14;
    }

    if (diff >= 6) {
      // Large lead — no need to escalate, lock in.
      boost -= 0.1;
    }

    return boost;
  }

  // Minimum strength required to accept when accept would risk losing the match.
  // Profile-aware: aggressive accepts on less; cautious demands more.
  private declineFloor(profile: BotProfile): number {
    if (profile === 'aggressive') return 0.38;
    if (profile === 'cautious') return 0.72;
    return 0.55;
  }

  // ---------------------------------------------------------------------------
  // Profile thresholds
  // ---------------------------------------------------------------------------
  // 22.B: thresholds widened between profiles to make bet behaviour perceptibly distinct.
  // - aggressive: accepts earlier, raises on solid hands, takes more initiative, bluffs more.
  // - balanced:   anchor values — preserves regression baseline for the default profile.
  // - cautious:   only raises on near-unbeatable hands, rarely bluffs, needs strong hand to accept.
  private resolveBetThresholds(profile: BotProfile): BotBetThresholds {
    if (profile === 'aggressive') {
      return {
        accept: 0.28,
        raise: 0.65,
        initiative: 0.6,
        bluffProbability: 0.12,
      };
    }

    if (profile === 'cautious') {
      return {
        accept: 0.7,
        raise: 0.97,
        initiative: 0.85,
        bluffProbability: 0.02,
      };
    }

    return {
      accept: 0.5,
      raise: 0.84,
      initiative: 0.72,
      bluffProbability: 0.05,
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

  // ---------------------------------------------------------------------------
  // Hand strength (unchanged)
  // ---------------------------------------------------------------------------
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

  private clamp01(value: number): number {
    if (value < 0) return 0;
    if (value > 1) return 1;
    return value;
  }

  // ---------------------------------------------------------------------------
  // Card selection (unchanged behaviour vs. previous version)
  // ---------------------------------------------------------------------------
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
      const strategy: BotDecisionStrategy =
        profile === 'cautious' ? 'response-losing-weakest' : 'response-losing-middle';

      return { card, strategy };
    }

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
