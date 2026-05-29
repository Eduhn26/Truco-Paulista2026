import { Injectable } from '@nestjs/common';

import type {
  BotDecision,
  BotDecisionContext,
  BotDecisionMetadata,
  BotDecisionPort,
  BotDecisionStrategy,
  BotDecisionTacticalTelemetry,
  BotDecisionBetTelemetry,
  BotHandProgressView,
  BotPartnerSignalKind,
  BotPartnerSignalView,
  BotProfile,
  BotSeatId,
  BotTeamId,
  BotRoundView,
} from '@game/application/ports/bot-decision.port';
import { compareCards, manilhaRankFromVira } from '@game/domain/services/truco-rules';
import { Card } from '@game/domain/value-objects/card';
import type { Rank } from '@game/domain/value-objects/rank';

type CardSelectionStrategy = 'weakest' | 'middle' | 'strongest';
type BotCardSelection = {
  card: string;
  strategy: BotDecisionStrategy;
  tactical?: BotDecisionTacticalTelemetry;
};
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
  // Minimum hand strength required before positional and score boosts.
  initiative: number;
  // Profile-specific bluff rate used only when positional context is favourable.
  bluffProbability: number;
};

type ScorePressure = {
  myPointsToWin: number;
  opponentPointsToWin: number;
  declineLosesMatch: boolean;
  acceptRisksMatch: boolean;
};

type MaoDeOnzeDecisionAction = 'accept-mao-de-onze' | 'decline-mao-de-onze';

type TwoVersusTwoRoundPlay = {
  seatId: BotSeatId;
  playerId: 'P1' | 'P2';
  card: string;
};

type TwoVersusTwoRoundState = {
  plays: TwoVersusTwoRoundPlay[];
  winningSeatId: BotSeatId | null;
  winningTeamId: BotTeamId | null;
  winningCard: string | null;
};

type PartnerSignalBetAdjustment = {
  boost: number;
  kind?: BotPartnerSignalKind;
  scope?: BotPartnerSignalView['scope'];
  strengthHint?: BotPartnerSignalView['strengthHint'];
  intent?: BotPartnerSignalView['intent'];
  handMemoryKind?: BotPartnerSignalKind;
  betIntentKind?: BotPartnerSignalKind;
};

type PublicThreatLevel = 'moderate' | 'high' | 'severe' | 'lethal';

type PublicBetThreat = {
  level: PublicThreatLevel;
  card: string;
  suit: 'P' | 'C' | 'E' | 'O';
  winningTeamId: BotTeamId;
  isDecisiveRound: boolean;
  canBeatThreat: boolean;
};

type PublicThreatBetAdjustment = {
  penalty: number;
  bluffProbabilityMultiplier: number;
  threat?: PublicBetThreat;
};

const FULL_DECK_SUITS = ['C', 'O', 'P', 'E'] as const;
const FULL_DECK_RANKS = ['4', '5', '6', '7', 'Q', 'J', 'K', 'A', '2', '3'] as const;
const FULL_DECK = FULL_DECK_RANKS.flatMap((rank) =>
  FULL_DECK_SUITS.map((suit) => `${rank}${suit}`),
);

const TWO_VERSUS_TWO_SEATS: BotSeatId[] = ['T1A', 'T2A', 'T1B', 'T2B'];

const TEAM_BY_SEAT: Record<BotSeatId, BotTeamId> = {
  T1A: 'T1',
  T2A: 'T2',
  T1B: 'T1',
  T2B: 'T2',
};

const PLAYER_BY_TEAM: Record<BotTeamId, 'P1' | 'P2'> = {
  T1: 'P1',
  T2: 'P2',
};

const PARTNER_BY_SEAT: Record<BotSeatId, BotSeatId> = {
  T1A: 'T1B',
  T1B: 'T1A',
  T2A: 'T2B',
  T2B: 'T2A',
};

const PARTNER_SIGNAL_BET_BOOST_BY_KIND: Record<BotPartnerSignalKind, number> = {
  'manilha-zap': 0.34,
  'manilha-copas': 0.26,
  'manilha-espadilha': 0.16,
  'manilha-ouros': 0.08,
  'strong-manilha': 0.28,
  'has-manilha': 0.14,
  'weak-manilha': 0.06,
  'no-manilha': -0.1,
  'strong-hand': 0.18,
  'weak-hand': -0.16,
  hold: -0.08,
  'kill-round': 0.04,
  'low-card': -0.1,
  pressure: 0.1,
  'avoid-bet': -0.22,
};

const PARTNER_SIGNAL_INITIATIVE_EXTRA_BOOST_BY_KIND: Partial<Record<BotPartnerSignalKind, number>> =
  {
    pressure: 0.05,
    'manilha-zap': 0.06,
    'manilha-copas': 0.04,
    'manilha-espadilha': 0.02,
    'strong-manilha': 0.04,
    'has-manilha': 0.02,
    'strong-hand': 0.03,
    'no-manilha': -0.05,
    hold: -0.04,
    'low-card': -0.04,
    'avoid-bet': -0.08,
  };

@Injectable()
export class HeuristicBotAdapter implements BotDecisionPort {
  decide(context: BotDecisionContext): BotDecision {
    const maoDeOnzeDecision = this.decideMaoDeOnze(context);
    if (maoDeOnzeDecision) {
      return maoDeOnzeDecision;
    }

    const betResponse = this.decideBetResponse(context);
    if (betResponse) {
      return betResponse;
    }

    // Bet initiative is evaluated before card selection so a legal raise can take priority.
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

    const twoVersusTwoSelection = this.pickTwoVersusTwoCard(context, orderedHand);
    const selection =
      twoVersusTwoSelection ??
      this.pickOneVersusOneCard(context, orderedHand, context.currentRound);

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
      // Hand strength is omitted here to avoid scoring every regular bot turn.
      metadata: this.buildMetadata(selection.strategy, undefined, selection.tactical),
    };
  }

  // Mao de Onze decisions run before normal play because the hand is locked until accepted.
  private decideMaoDeOnze(context: BotDecisionContext): BotDecision | null {
    const bet = context.bet;
    if (!bet) return null;
    if (bet.specialState !== 'mao_de_onze') return null;
    if (!bet.specialDecisionPending) return null;

    const canAccept = bet.availableActions.canAcceptMaoDeOnze;
    const canDecline = bet.availableActions.canDeclineMaoDeOnze;

    if (!canAccept && !canDecline) return null;

    const handStrength = this.calculateMaoDeOnzeHandStrength(context);
    const forcedAction = this.resolveForcedMaoDeOnzeAction(handStrength, canAccept, canDecline);

    if (forcedAction === 'accept-mao-de-onze') {
      return {
        action: 'accept-mao-de-onze',
        metadata: this.buildMetadata('mao-de-onze-accept-strong-hand', handStrength),
      };
    }

    if (forcedAction === 'decline-mao-de-onze') {
      return {
        action: 'decline-mao-de-onze',
        metadata: this.buildMetadata('mao-de-onze-decline-weak-hand', handStrength),
      };
    }

    const threshold = this.resolveMaoDeOnzeThreshold(context.profile);

    if (canAccept && handStrength >= threshold) {
      return {
        action: 'accept-mao-de-onze',
        metadata: this.buildMetadata(
          this.resolveMaoDeOnzeAcceptStrategy(context.profile),
          handStrength,
        ),
      };
    }

    if (canDecline) {
      return {
        action: 'decline-mao-de-onze',
        metadata: this.buildMetadata(this.resolveMaoDeOnzeDeclineStrategy(context), handStrength),
      };
    }

    return {
      action: 'accept-mao-de-onze',
      metadata: this.buildMetadata(
        this.resolveMaoDeOnzeAcceptStrategy(context.profile),
        handStrength,
      ),
    };
  }

  private resolveForcedMaoDeOnzeAction(
    handStrength: number,
    canAccept: boolean,
    canDecline: boolean,
  ): MaoDeOnzeDecisionAction | null {
    if (canAccept && handStrength >= 0.78) {
      return 'accept-mao-de-onze';
    }

    if (canDecline && handStrength <= 0.38) {
      return 'decline-mao-de-onze';
    }

    return null;
  }

  private resolveMaoDeOnzeThreshold(profile: BotProfile): number {
    if (profile === 'aggressive') return 0.5;
    if (profile === 'cautious') return 0.66;
    return 0.58;
  }

  private resolveMaoDeOnzeAcceptStrategy(profile: BotProfile): BotDecisionStrategy {
    if (profile === 'aggressive') {
      return 'mao-de-onze-accept-aggressive-risk';
    }

    return 'mao-de-onze-accept-balanced-hand';
  }

  private resolveMaoDeOnzeDeclineStrategy(context: BotDecisionContext): BotDecisionStrategy {
    if (this.isMaoDeOnzeAcceptingMatchRisk(context)) {
      return 'mao-de-onze-decline-match-risk';
    }

    if (context.profile === 'cautious') {
      return 'mao-de-onze-decline-cautious-risk';
    }

    return 'mao-de-onze-decline-weak-hand';
  }

  private calculateMaoDeOnzeHandStrength(context: BotDecisionContext): number {
    const hand = context.player.hand;

    if (hand.length === 0) {
      return 0;
    }

    const orderedHand = [...hand].sort((left, right) =>
      this.compareCardStrength(left, right, context.viraRank),
    );
    const strongestCards = orderedHand.reverse();

    const bestCardStrength = this.calculateCardStrengthScore(strongestCards[0], context.viraRank);
    const secondCardStrength = this.calculateCardStrengthScore(strongestCards[1], context.viraRank);
    const thirdCardStrength = this.calculateCardStrengthScore(strongestCards[2], context.viraRank);

    const cardCore = bestCardStrength * 0.3 + secondCardStrength * 0.3 + thirdCardStrength * 0.1;
    const manilhaBonus = this.calculateMaoDeOnzeManilhaBonus(hand, context.viraRank);
    const pressureAdjustment = this.computeMaoDeOnzePressureAdjustment(context);

    return this.roundStrength(this.clamp01(cardCore + manilhaBonus + pressureAdjustment));
  }

  private calculateCardStrengthScore(card: string | undefined, viraRank: Rank): number {
    if (!card) {
      return 0;
    }

    const totalPossibleWins = FULL_DECK.length - 1;

    if (totalPossibleWins <= 0) {
      return 0;
    }

    let wins = 0;

    for (const opponentCard of FULL_DECK) {
      if (opponentCard === card) {
        continue;
      }

      if (this.beats(card, opponentCard, viraRank)) {
        wins += 1;
      }
    }

    // Square root weighting keeps strong non-manilha hands playable in Mao de Onze decisions.
    return Math.sqrt(wins / totalPossibleWins);
  }

  private calculateMaoDeOnzeManilhaBonus(hand: string[], viraRank: Rank): number {
    const manilhaRank = manilhaRankFromVira(viraRank);
    const manilhaCount = hand.filter((card) => Card.from(card).getRank() === manilhaRank).length;

    if (manilhaCount === 0) {
      return 0;
    }

    if (manilhaCount === 1) {
      return 0.2;
    }

    return 0.24;
  }

  private computeMaoDeOnzePressureAdjustment(context: BotDecisionContext): number {
    const score = context.score;
    const profileAdjustment =
      context.profile === 'aggressive' ? 0.04 : context.profile === 'cautious' ? -0.04 : 0;

    if (!score) {
      return profileAdjustment;
    }

    const opponentScore = context.player.playerId === 'P1' ? score.playerTwo : score.playerOne;

    let adjustment = profileAdjustment;

    if (this.isMaoDeOnzeDecliningMatchRisk(context)) {
      adjustment += 0.1;
    }

    if (this.isMaoDeOnzeAcceptingMatchRisk(context)) {
      adjustment +=
        context.profile === 'cautious' ? -0.1 : context.profile === 'balanced' ? -0.06 : -0.02;
    }

    if (opponentScore <= score.pointsToWin - 4) {
      adjustment += context.profile === 'aggressive' ? 0.04 : 0.02;
    }

    return Math.max(-0.1, Math.min(0.1, adjustment));
  }

  private isMaoDeOnzeDecliningMatchRisk(context: BotDecisionContext): boolean {
    const score = context.score;

    if (!score) {
      return false;
    }

    const opponentScore = context.player.playerId === 'P1' ? score.playerTwo : score.playerOne;

    return opponentScore + 1 >= score.pointsToWin;
  }

  private isMaoDeOnzeAcceptingMatchRisk(context: BotDecisionContext): boolean {
    const score = context.score;

    if (!score) {
      return false;
    }

    const opponentScore = context.player.playerId === 'P1' ? score.playerTwo : score.playerOne;

    return opponentScore + 3 >= score.pointsToWin;
  }

  // Pending truco responses are resolved before card-play decisions.
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
    const partnerSignalAdjustment = this.computePartnerSignalBetAdjustment(context, 'response');
    const publicThreatAdjustment = this.computePublicThreatBetAdjustment(context);
    const effectiveStrength = this.clamp01(
      handStrength + progressBoost + partnerSignalAdjustment.boost + publicThreatAdjustment.penalty,
    );
    const effectiveBluffProbability = this.resolveEffectiveBluffProbability(
      context,
      publicThreatAdjustment,
    );

    const thresholds = this.resolveBetThresholds(context.profile);
    const pressure = this.computeScorePressure(context, bet);

    // Weak hands may decline when accepting could immediately lose the match.
    if (
      pressure.acceptRisksMatch &&
      availableActions.canDeclineBet &&
      effectiveStrength < this.declineFloor(context.profile)
    ) {
      return {
        action: 'decline-bet',
        metadata: this.buildMetadata(
          'bet-decline-by-score',
          handStrength,
          undefined,
          this.buildBetAuditTelemetry({
            context,
            handStrength,
            progressBoost,
            scoreBoost: 0,
            partnerSignalAdjustment,
            publicThreatAdjustment,
            effectiveBluffProbability,
            effectiveStrength,
            thresholds,
            pressure,
            selectedAction: 'decline-bet',
          }),
        ),
      };
    }

    // If running loses the match, accepting is the only viable response.
    if (pressure.declineLosesMatch && availableActions.canAcceptBet) {
      return {
        action: 'accept-bet',
        metadata: this.buildMetadata(
          'bet-accept-forced-by-score',
          handStrength,
          undefined,
          this.buildBetAuditTelemetry({
            context,
            handStrength,
            progressBoost,
            scoreBoost: 0,
            partnerSignalAdjustment,
            publicThreatAdjustment,
            effectiveBluffProbability,
            effectiveStrength,
            thresholds,
            pressure,
            selectedAction: 'accept-bet',
          }),
        ),
      };
    }

    const strongestRaise = this.getStrongestAvailableRaise(availableActions);
    if (strongestRaise && effectiveStrength >= thresholds.raise) {
      return {
        action: strongestRaise,
        metadata: this.buildMetadata(
          'bet-raise',
          handStrength,
          undefined,
          this.buildBetAuditTelemetry({
            context,
            handStrength,
            progressBoost,
            scoreBoost: 0,
            partnerSignalAdjustment,
            publicThreatAdjustment,
            effectiveBluffProbability,
            effectiveStrength,
            thresholds,
            pressure,
            selectedAction: strongestRaise,
          }),
        ),
      };
    }

    if (availableActions.canAcceptBet && effectiveStrength >= thresholds.accept) {
      return {
        action: 'accept-bet',
        metadata: this.buildMetadata(
          'bet-accept',
          handStrength,
          undefined,
          this.buildBetAuditTelemetry({
            context,
            handStrength,
            progressBoost,
            scoreBoost: 0,
            partnerSignalAdjustment,
            publicThreatAdjustment,
            effectiveBluffProbability,
            effectiveStrength,
            thresholds,
            pressure,
            selectedAction: 'accept-bet',
          }),
        ),
      };
    }

    if (availableActions.canDeclineBet) {
      return {
        action: 'decline-bet',
        metadata: this.buildMetadata(
          'bet-decline',
          handStrength,
          undefined,
          this.buildBetAuditTelemetry({
            context,
            handStrength,
            progressBoost,
            scoreBoost: 0,
            partnerSignalAdjustment,
            publicThreatAdjustment,
            effectiveBluffProbability,
            effectiveStrength,
            thresholds,
            pressure,
            selectedAction: 'decline-bet',
          }),
        ),
      };
    }

    // Fallback for rule variants where the available action set does not include decline.
    if (availableActions.canAcceptBet) {
      return {
        action: 'accept-bet',
        metadata: this.buildMetadata(
          'bet-no-response',
          handStrength,
          undefined,
          this.buildBetAuditTelemetry({
            context,
            handStrength,
            progressBoost,
            scoreBoost: 0,
            partnerSignalAdjustment,
            publicThreatAdjustment,
            effectiveBluffProbability,
            effectiveStrength,
            thresholds,
            pressure,
            selectedAction: 'accept-bet',
          }),
        ),
      };
    }

    return null;
  }

  // Bot initiative is limited to its own playable turn and normal betting state.
  private decideBetInitiative(context: BotDecisionContext): BotDecision | null {
    const bet = context.bet;
    if (!bet) return null;
    if (bet.betState !== 'idle') return null;
    if (bet.specialState !== 'normal') return null;
    if (bet.specialDecisionPending) return null;

    const actions = bet.availableActions;
    if (!actions.canAttemptPlayCard) return null;

    const initiativeAction = this.resolveInitiativeAction(actions);
    if (!initiativeAction) return null;

    // Avoid opening-hand raises before any table information exists.
    if (this.isBeforeAnyRound(context)) return null;

    const hand = context.player.hand;
    if (hand.length === 0) return null;

    const handStrength = this.calculateHandStrength(hand, context.viraRank);
    const thresholds = this.resolveBetThresholds(context.profile);
    const progressBoost = this.computeProgressBoost(context.handProgress);
    const scoreBoost = this.computeScoreInitiativeBoost(context);
    const partnerSignalAdjustment = this.computePartnerSignalBetAdjustment(context, 'initiative');
    const publicThreatAdjustment = this.computePublicThreatBetAdjustment(context);
    const effectiveStrength = this.clamp01(
      handStrength +
        progressBoost +
        scoreBoost +
        partnerSignalAdjustment.boost +
        publicThreatAdjustment.penalty,
    );
    const effectiveBluffProbability = this.resolveEffectiveBluffProbability(
      context,
      publicThreatAdjustment,
    );

    const pressure = this.computeScorePressure(context, bet);

    if (effectiveStrength >= thresholds.initiative) {
      return {
        action: initiativeAction,
        metadata: this.buildMetadata(
          'bet-initiative-value',
          handStrength,
          undefined,
          this.buildBetAuditTelemetry({
            context,
            handStrength,
            progressBoost,
            scoreBoost,
            partnerSignalAdjustment,
            publicThreatAdjustment,
            effectiveBluffProbability,
            effectiveStrength,
            thresholds,
            pressure,
            selectedAction: initiativeAction,
          }),
        ),
      };
    }

    // Positional pressure lowers the required raw hand strength.
    if (progressBoost + scoreBoost >= 0.2 && effectiveStrength >= thresholds.initiative - 0.18) {
      return {
        action: initiativeAction,
        metadata: this.buildMetadata(
          'bet-initiative-pressure',
          handStrength,
          undefined,
          this.buildBetAuditTelemetry({
            context,
            handStrength,
            progressBoost,
            scoreBoost,
            partnerSignalAdjustment,
            publicThreatAdjustment,
            effectiveBluffProbability,
            effectiveStrength,
            thresholds,
            pressure,
            selectedAction: initiativeAction,
          }),
        ),
      };
    }

    // Bluffing is deterministic per hand so tests stay stable and repeated calls do not spam.
    if (this.shouldBluff(context, thresholds, handStrength, publicThreatAdjustment)) {
      return {
        action: initiativeAction,
        metadata: this.buildMetadata(
          'bet-initiative-bluff',
          handStrength,
          undefined,
          this.buildBetAuditTelemetry({
            context,
            handStrength,
            progressBoost,
            scoreBoost,
            partnerSignalAdjustment,
            publicThreatAdjustment,
            effectiveBluffProbability,
            effectiveStrength,
            thresholds,
            pressure,
            selectedAction: initiativeAction,
          }),
        ),
      };
    }

    return null;
  }

  private resolveInitiativeAction(
    actions: NonNullable<BotDecisionContext['bet']>['availableActions'],
  ): BotBetAction | null {
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

    // Preserve compatibility with older gateway payloads that omit handProgress.
    const round = context.currentRound;
    return !round?.playerOneCard && !round?.playerTwoCard;
  }

  private shouldBluff(
    context: BotDecisionContext,
    thresholds: BotBetThresholds,
    handStrength: number,
    publicThreatAdjustment: PublicThreatBetAdjustment,
  ): boolean {
    const effectiveBluffProbability = this.resolveEffectiveBluffProbability(
      context,
      publicThreatAdjustment,
    );

    if (effectiveBluffProbability <= 0) return false;

    // Preserve the conservative old guard for ordinary visible losses, but let public-manilha
    // scenarios use their own profile-aware bluff multiplier.
    if (!publicThreatAdjustment.threat && this.isLosingCurrentRoundVisibly(context)) return false;

    // Require a minimum baseline so bluffing remains intentional instead of random noise.
    if (handStrength < 0.18) return false;

    const seed = this.deterministicSeed(context);
    const roll = this.mulberry32(seed);
    return roll < effectiveBluffProbability;
  }

  private isLosingCurrentRoundVisibly(context: BotDecisionContext): boolean {
    const round = context.currentRound;
    if (!round) return false;

    const myCard = context.player.playerId === 'P1' ? round.playerOneCard : round.playerTwoCard;
    const opCard = context.player.playerId === 'P1' ? round.playerTwoCard : round.playerOneCard;

    if (!opCard || myCard) return false;

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

  // Small deterministic PRNG used only for reproducible bluff decisions.
  private mulberry32(seed: number): number {
    let t = (seed + 0x6d2b79f5) >>> 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  private buildBetAuditTelemetry({
    context,
    handStrength,
    progressBoost,
    scoreBoost,
    partnerSignalAdjustment,
    publicThreatAdjustment,
    effectiveBluffProbability,
    effectiveStrength,
    thresholds,
    pressure,
    selectedAction,
  }: {
    context: BotDecisionContext;
    handStrength: number;
    progressBoost: number;
    scoreBoost: number;
    partnerSignalAdjustment?: PartnerSignalBetAdjustment;
    publicThreatAdjustment?: PublicThreatBetAdjustment;
    effectiveBluffProbability?: number;
    effectiveStrength: number;
    thresholds: BotBetThresholds;
    pressure: ScorePressure;
    selectedAction: BotBetAction;
  }): BotDecisionBetTelemetry {
    const bet = context.bet;
    const progress = context.handProgress;

    return {
      ...(bet ? { currentValue: bet.currentValue } : {}),
      ...(bet && 'pendingValue' in bet ? { pendingValue: bet.pendingValue ?? null } : {}),
      ...(bet ? { betState: bet.betState } : {}),
      ...(bet && 'requestedBy' in bet ? { requestedBy: bet.requestedBy ?? null } : {}),
      ...(bet ? { specialState: bet.specialState } : {}),
      selectedBetAction: selectedAction,
      handStrength: this.roundStrength(handStrength),
      progressBoost: this.roundStrength(progressBoost),
      scoreBoost: this.roundStrength(scoreBoost),
      partnerSignalBoost: this.roundStrength(partnerSignalAdjustment?.boost ?? 0),
      effectiveStrength: this.roundStrength(effectiveStrength),
      acceptThreshold: thresholds.accept,
      raiseThreshold: thresholds.raise,
      initiativeThreshold: thresholds.initiative,
      bluffProbability: thresholds.bluffProbability,
      ...(effectiveBluffProbability !== undefined
        ? {
            effectiveBluffProbability: this.roundStrength(effectiveBluffProbability),
          }
        : {}),
      ...(publicThreatAdjustment?.threat
        ? {
            publicThreatLevel: publicThreatAdjustment.threat.level,
            publicThreatCard: publicThreatAdjustment.threat.card,
            publicThreatSuit: publicThreatAdjustment.threat.suit,
            publicThreatIsDecisive: publicThreatAdjustment.threat.isDecisiveRound,
            publicThreatCanBeat: publicThreatAdjustment.threat.canBeatThreat,
            publicThreatPenalty: this.roundStrength(publicThreatAdjustment.penalty),
            publicThreatBluffMultiplier: this.roundStrength(
              publicThreatAdjustment.bluffProbabilityMultiplier,
            ),
          }
        : {}),
      declineFloor: this.declineFloor(context.profile),
      myPointsToWin: pressure.myPointsToWin,
      opponentPointsToWin: pressure.opponentPointsToWin,
      declineLosesMatch: pressure.declineLosesMatch,
      acceptRisksMatch: pressure.acceptRisksMatch,
      ...(partnerSignalAdjustment?.kind ? { partnerSignalKind: partnerSignalAdjustment.kind } : {}),
      ...(partnerSignalAdjustment?.scope
        ? { partnerSignalScope: partnerSignalAdjustment.scope }
        : {}),
      ...(partnerSignalAdjustment?.strengthHint
        ? { partnerSignalStrengthHint: partnerSignalAdjustment.strengthHint }
        : {}),
      ...(partnerSignalAdjustment?.intent
        ? { partnerSignalIntent: partnerSignalAdjustment.intent }
        : {}),
      ...(partnerSignalAdjustment?.handMemoryKind
        ? {
            partnerHandMemorySignalKind: partnerSignalAdjustment.handMemoryKind,
          }
        : {}),
      ...(partnerSignalAdjustment?.betIntentKind
        ? { partnerBetIntentSignalKind: partnerSignalAdjustment.betIntentKind }
        : {}),
      ...(progress
        ? {
            roundsWonByMe: progress.roundsWonByMe,
            roundsWonByOpponent: progress.roundsWonByOpponent,
            roundsTied: progress.roundsTied,
            currentRoundIndex: progress.currentRoundIndex,
          }
        : {}),
    };
  }

  private computePartnerSignalBetAdjustment(
    context: BotDecisionContext,
    phase: 'response' | 'initiative',
  ): PartnerSignalBetAdjustment {
    if (context.mode !== '2v2') {
      return { boost: 0 };
    }

    const handMemorySignal = this.getActiveScopedPartnerSignal(context, 'handMemory');
    const betIntentSignal = this.getActiveScopedPartnerSignal(context, 'betIntent');
    const contributingSignals = [handMemorySignal, betIntentSignal].filter(
      (signal): signal is BotPartnerSignalView => Boolean(signal),
    );

    if (contributingSignals.length === 0) {
      return { boost: 0 };
    }

    const boost = contributingSignals.reduce((total, signal) => {
      const baseBoost = PARTNER_SIGNAL_BET_BOOST_BY_KIND[signal.kind];
      const phaseBoost =
        phase === 'initiative'
          ? (PARTNER_SIGNAL_INITIATIVE_EXTRA_BOOST_BY_KIND[signal.kind] ?? 0)
          : 0;

      return total + baseBoost + phaseBoost;
    }, 0);
    const primarySignal = betIntentSignal ?? handMemorySignal;

    return {
      boost,
      ...(primarySignal
        ? {
            kind: primarySignal.kind,
            scope: primarySignal.scope,
            strengthHint: primarySignal.strengthHint,
            intent: primarySignal.intent,
          }
        : {}),
      ...(handMemorySignal ? { handMemoryKind: handMemorySignal.kind } : {}),
      ...(betIntentSignal ? { betIntentKind: betIntentSignal.kind } : {}),
    };
  }

  private isActivePartnerSignal(
    signal: BotPartnerSignalView | null | undefined,
  ): signal is BotPartnerSignalView {
    if (!signal) {
      return false;
    }

    const expiresAtMs = Date.parse(signal.expiresAt);

    return Number.isFinite(expiresAtMs) && expiresAtMs > Date.now();
  }

  private resolvePartnerSignalScopeByKind(
    kind: BotPartnerSignalKind,
  ): BotPartnerSignalView['scope'] {
    if (kind === 'hold' || kind === 'kill-round' || kind === 'low-card') {
      return 'round-tactic';
    }

    if (kind === 'pressure' || kind === 'avoid-bet') {
      return 'bet-intent';
    }

    return 'hand-memory';
  }

  private normalizeActivePartnerSignal(
    signal: BotPartnerSignalView | null | undefined,
  ): BotPartnerSignalView | null {
    if (!this.isActivePartnerSignal(signal)) {
      return null;
    }

    const scopedSignal = signal as BotPartnerSignalView & {
      scope?: BotPartnerSignalView['scope'];
    };

    return {
      ...signal,
      scope: scopedSignal.scope ?? this.resolvePartnerSignalScopeByKind(signal.kind),
    };
  }

  private resolvePartnerSignalScopeSlot(
    slot: keyof NonNullable<BotDecisionContext['partnerSignals']>,
  ): BotPartnerSignalView['scope'] {
    if (slot === 'roundTactic') {
      return 'round-tactic';
    }

    if (slot === 'betIntent') {
      return 'bet-intent';
    }

    return 'hand-memory';
  }

  private getActiveScopedPartnerSignal(
    context: BotDecisionContext,
    slot: keyof NonNullable<BotDecisionContext['partnerSignals']>,
  ): BotPartnerSignalView | null {
    const expectedScope = this.resolvePartnerSignalScopeSlot(slot);
    const signal = this.normalizeActivePartnerSignal(context.partnerSignals?.[slot]);

    if (signal?.scope === expectedScope) {
      return signal;
    }

    const legacySignal = this.normalizeActivePartnerSignal(context.partnerSignal);

    if (legacySignal?.scope === expectedScope) {
      return legacySignal;
    }

    return null;
  }

  private getActivePartnerSignal(context: BotDecisionContext): BotPartnerSignalView | null {
    const legacySignal = this.normalizeActivePartnerSignal(context.partnerSignal);

    if (legacySignal) {
      return legacySignal;
    }

    const roundTactic = this.getActiveScopedPartnerSignal(context, 'roundTactic');
    const betIntent = this.getActiveScopedPartnerSignal(context, 'betIntent');
    const handMemory = this.getActiveScopedPartnerSignal(context, 'handMemory');

    return roundTactic ?? betIntent ?? handMemory;
  }

  private getActiveCardTacticSignal(context: BotDecisionContext): BotPartnerSignalView | null {
    return this.getActiveScopedPartnerSignal(context, 'roundTactic');
  }

  private computePublicThreatBetAdjustment(context: BotDecisionContext): PublicThreatBetAdjustment {
    const threat = this.resolvePublicBetThreat(context);

    if (!threat) {
      return { penalty: 0, bluffProbabilityMultiplier: 1 };
    }

    return {
      penalty: this.resolvePublicThreatPenalty(threat),
      bluffProbabilityMultiplier: this.resolvePublicThreatBluffMultiplier(context, threat),
      threat,
    };
  }

  private resolvePublicBetThreat(context: BotDecisionContext): PublicBetThreat | null {
    const round = context.currentRound;

    if (!round) {
      return null;
    }

    const visibleThreat = this.resolveVisibleWinningOpponentCard(context, round);

    if (!visibleThreat) {
      return null;
    }

    const suit = this.resolveManilhaSuit(visibleThreat.card, context.viraRank);

    if (!suit) {
      return null;
    }

    return {
      level: this.resolvePublicThreatLevel(suit),
      card: visibleThreat.card,
      suit,
      winningTeamId: visibleThreat.winningTeamId,
      isDecisiveRound: this.isDecisiveRound(context),
      canBeatThreat: context.player.hand.some((candidate) =>
        this.beats(candidate, visibleThreat.card, context.viraRank),
      ),
    };
  }

  private resolveVisibleWinningOpponentCard(
    context: BotDecisionContext,
    round: BotRoundView,
  ): { card: string; winningTeamId: BotTeamId } | null {
    const actorTeamId = this.resolveActorTeamId(context);

    if (context.mode === '2v2') {
      const roundState = this.resolveTwoVersusTwoRoundState(round, context.viraRank);

      if (!roundState?.winningCard || !roundState.winningTeamId) {
        return null;
      }

      if (roundState.winningTeamId === actorTeamId) {
        return null;
      }

      return {
        card: roundState.winningCard,
        winningTeamId: roundState.winningTeamId,
      };
    }

    const myCard = context.player.playerId === 'P1' ? round.playerOneCard : round.playerTwoCard;
    const opponentCard = this.getOpponentCard(round, context.player.playerId);

    if (!opponentCard) {
      return null;
    }

    if (myCard && !this.beats(opponentCard, myCard, context.viraRank)) {
      return null;
    }

    return {
      card: opponentCard,
      winningTeamId: context.player.playerId === 'P1' ? 'T2' : 'T1',
    };
  }

  private resolveActorTeamId(context: BotDecisionContext): BotTeamId {
    if (context.actorTeamId) {
      return context.actorTeamId;
    }

    if (context.actorSeatId) {
      return TEAM_BY_SEAT[context.actorSeatId];
    }

    return context.player.playerId === 'P1' ? 'T1' : 'T2';
  }

  private isDecisiveRound(context: BotDecisionContext): boolean {
    const progress = context.handProgress;

    if (!progress) {
      return false;
    }

    if (progress.currentRoundIndex >= 2) {
      return true;
    }

    if (progress.roundsWonByMe > 0 && progress.roundsWonByOpponent > 0) {
      return true;
    }

    return progress.roundsTied > 0 && progress.currentRoundIndex >= 1;
  }

  private resolveManilhaSuit(card: string, viraRank: Rank): 'P' | 'C' | 'E' | 'O' | null {
    if (this.readCardRank(card) !== manilhaRankFromVira(viraRank)) {
      return null;
    }

    const suit = this.readCardSuit(card);

    if (suit === 'P' || suit === 'C' || suit === 'E' || suit === 'O') {
      return suit;
    }

    return null;
  }

  private resolvePublicThreatLevel(suit: 'P' | 'C' | 'E' | 'O'): PublicThreatLevel {
    if (suit === 'P') return 'lethal';
    if (suit === 'C') return 'severe';
    if (suit === 'E') return 'high';
    return 'moderate';
  }

  private resolvePublicThreatPenalty(threat: PublicBetThreat): number {
    const decisiveMultiplier = threat.isDecisiveRound ? 1 : 0.5;

    if (threat.canBeatThreat) {
      if (threat.level === 'lethal') return -1;
      if (threat.level === 'severe') return -0.05 * decisiveMultiplier;
      if (threat.level === 'high') return -0.03 * decisiveMultiplier;
      return -0.02 * decisiveMultiplier;
    }

    if (threat.level === 'lethal') return -1 * decisiveMultiplier;
    if (threat.level === 'severe') return -0.55 * decisiveMultiplier;
    if (threat.level === 'high') return -0.38 * decisiveMultiplier;
    return -0.22 * decisiveMultiplier;
  }

  private resolvePublicThreatBluffMultiplier(
    context: BotDecisionContext,
    threat: PublicBetThreat,
  ): number {
    if (threat.canBeatThreat) {
      return 1;
    }

    if (threat.level === 'lethal') {
      return threat.isDecisiveRound ? 0 : 0.05;
    }

    const profileMultipliers: Record<
      Exclude<PublicThreatLevel, 'lethal'>,
      Record<BotProfile, number>
    > = {
      severe: { aggressive: 0.14, balanced: 0.04, cautious: 0 },
      high: { aggressive: 0.34, balanced: 0.12, cautious: 0.02 },
      moderate: { aggressive: 0.58, balanced: 0.25, cautious: 0.06 },
    };

    const multiplier = profileMultipliers[threat.level][context.profile];

    return threat.isDecisiveRound ? multiplier : Math.min(1, multiplier * 1.8);
  }

  private resolveEffectiveBluffProbability(
    context: BotDecisionContext,
    publicThreatAdjustment: PublicThreatBetAdjustment,
  ): number {
    const thresholds = this.resolveBetThresholds(context.profile);

    return thresholds.bluffProbability * publicThreatAdjustment.bluffProbabilityMultiplier;
  }

  private readCardRank(card: string): string {
    return card.slice(0, -1);
  }

  private readCardSuit(card: string): string {
    return card.slice(-1);
  }

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

    // Declining awards the current value to the requester.
    const declineLosesMatch = opScore + currentValue >= score.pointsToWin;
    // Accepting risks the pending value if the bot loses the hand.
    const acceptRisksMatch = opScore + pendingValue >= score.pointsToWin;

    return {
      myPointsToWin: Math.max(1, score.pointsToWin - myScore),
      opponentPointsToWin: Math.max(1, score.pointsToWin - opScore),
      declineLosesMatch,
      acceptRisksMatch,
    };
  }

  // Round progress adjusts initiative without overpowering raw hand strength.
  private computeProgressBoost(progress?: BotHandProgressView): number {
    if (!progress) return 0;
    let boost = 0;

    if (progress.roundsWonByMe === 1 && progress.roundsWonByOpponent === 0) {
      // Winning the first round is the strongest positional trigger for pressure.
      boost += 0.18;
    } else if (
      progress.roundsWonByMe >= 1 &&
      progress.roundsWonByMe > progress.roundsWonByOpponent
    ) {
      boost += 0.1;
    } else if (progress.roundsWonByOpponent > progress.roundsWonByMe) {
      // Being behind lowers initiative and increases fold pressure.
      boost -= 0.12;
    }

    if (progress.roundsTied >= 1) {
      // A tied round is a small positional signal, not a decisive one.
      boost += 0.03;
    }

    return boost;
  }

  // Score pressure nudges initiative while keeping the hand-strength model dominant.
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
      boost += 0.08;
    }

    if (opRemaining <= 3 && diff < 0) {
      boost += 0.14;
    }

    if (diff >= 6) {
      boost -= 0.1;
    }

    return boost;
  }

  // Profile-specific floor for accepting when the bet can decide the match.
  private declineFloor(profile: BotProfile): number {
    if (profile === 'aggressive') return 0.38;
    if (profile === 'cautious') return 0.72;
    return 0.55;
  }

  // Thresholds make each bot profile visibly distinct without changing the rule model.
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

  private roundStrength(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private getOpponentCard(currentRound: BotRoundView, playerId: 'P1' | 'P2'): string | null {
    return playerId === 'P1' ? currentRound.playerTwoCard : currentRound.playerOneCard;
  }

  private pickOneVersusOneCard(
    context: BotDecisionContext,
    orderedHand: string[],
    currentRound: BotRoundView,
  ): BotCardSelection {
    const opponentCard = this.getOpponentCard(currentRound, context.player.playerId);

    return opponentCard
      ? this.pickResponseCard(orderedHand, opponentCard, context.viraRank, context.profile)
      : this.pickOpeningCard(orderedHand, context.profile);
  }

  private pickTwoVersusTwoCard(
    context: BotDecisionContext,
    orderedHand: string[],
  ): BotCardSelection | null {
    const currentRound = context.currentRound;
    const actorSeatId = context.actorSeatId;

    if (context.mode !== '2v2' || !currentRound || currentRound.finished || !actorSeatId) {
      return null;
    }

    const roundState = this.resolveTwoVersusTwoRoundState(currentRound, context.viraRank);

    if (!roundState || roundState.plays.length === 0) {
      return this.pickTwoVersusTwoOpeningCard(context, orderedHand, roundState);
    }

    const partnerSeatId = context.partnerSeatId ?? PARTNER_BY_SEAT[actorSeatId];

    if (roundState.winningSeatId === partnerSeatId) {
      const selectedCard = orderedHand[0]!;

      return {
        card: selectedCard,
        strategy:
          this.getActiveCardTacticSignal(context)?.kind === 'hold' ||
          this.getActiveCardTacticSignal(context)?.kind === 'low-card'
            ? 'two-versus-two-signal-hold-save-weakest'
            : 'two-versus-two-partner-winning-save-weakest',
        tactical: this.buildTwoVersusTwoTacticalTelemetry(context, roundState, selectedCard),
      };
    }

    const actorTeamId = context.actorTeamId ?? TEAM_BY_SEAT[actorSeatId];
    const activeSignal = this.getActiveCardTacticSignal(context);

    if (
      (activeSignal?.kind === 'hold' || activeSignal?.kind === 'low-card') &&
      roundState.winningTeamId === actorTeamId &&
      roundState.winningCard
    ) {
      const selectedCard = orderedHand[0]!;

      return {
        card: selectedCard,
        strategy: 'two-versus-two-signal-hold-save-weakest',
        tactical: this.buildTwoVersusTwoTacticalTelemetry(context, roundState, selectedCard),
      };
    }

    if (roundState.winningTeamId !== actorTeamId && roundState.winningCard) {
      const winningCards = orderedHand.filter((candidate) =>
        this.beats(candidate, roundState.winningCard!, context.viraRank),
      );

      if (winningCards.length === 0) {
        const selectedCard = orderedHand[0]!;

        return {
          card: selectedCard,
          strategy: 'two-versus-two-response-losing-save-weakest',
          tactical: this.buildTwoVersusTwoTacticalTelemetry(context, roundState, selectedCard),
        };
      }

      if (activeSignal?.kind === 'kill-round') {
        const selectedCard = winningCards[0]!;

        return {
          card: selectedCard,
          strategy: 'two-versus-two-signal-kill-round-weakest-winner',
          tactical: this.buildTwoVersusTwoTacticalTelemetry(context, roundState, selectedCard),
        };
      }

      const selection = this.pickResponseCard(
        orderedHand,
        roundState.winningCard,
        context.viraRank,
        context.profile,
      );

      return {
        ...selection,
        tactical: this.buildTwoVersusTwoTacticalTelemetry(context, roundState, selection.card),
      };
    }

    return null;
  }

  private pickTwoVersusTwoOpeningCard(
    context: BotDecisionContext,
    orderedHand: string[],
    roundState: TwoVersusTwoRoundState | null,
  ): BotCardSelection {
    const progress = context.handProgress;
    const hasFirstRoundLead = Boolean(
      progress &&
      progress.currentRoundIndex > 0 &&
      progress.roundsWonByMe > progress.roundsWonByOpponent,
    );

    if (!hasFirstRoundLead) {
      const selection = this.pickOpeningCard(orderedHand, context.profile);

      return {
        ...selection,
        tactical: this.buildTwoVersusTwoTacticalTelemetry(context, roundState, selection.card),
      };
    }

    const shouldPressure = this.shouldPressureTwoVersusTwoOpeningAfterLead(context, orderedHand);
    const selectedCard = shouldPressure ? orderedHand[orderedHand.length - 1]! : orderedHand[0]!;

    return {
      card: selectedCard,
      strategy: shouldPressure
        ? 'two-versus-two-opening-after-first-win-pressure'
        : 'two-versus-two-opening-after-first-win-save-weakest',
      tactical: this.buildTwoVersusTwoTacticalTelemetry(context, roundState, selectedCard),
    };
  }

  private shouldPressureTwoVersusTwoOpeningAfterLead(
    context: BotDecisionContext,
    orderedHand: string[],
  ): boolean {
    const currentValue = context.bet?.currentValue ?? 1;
    const remainingHandStrength = this.calculateHandStrength(orderedHand, context.viraRank);
    const hasScorePressure = this.hasTwoVersusTwoOpeningScorePressure(context, currentValue);
    const activeSignal =
      this.getActiveScopedPartnerSignal(context, 'roundTactic') ??
      this.getActiveScopedPartnerSignal(context, 'betIntent') ??
      this.getActivePartnerSignal(context);

    if (activeSignal?.kind === 'pressure' && remainingHandStrength >= 0.38) {
      return true;
    }

    if (
      activeSignal?.kind === 'hold' ||
      activeSignal?.kind === 'low-card' ||
      activeSignal?.kind === 'avoid-bet'
    ) {
      return false;
    }

    if (context.profile === 'aggressive') {
      return currentValue >= 3 || remainingHandStrength >= 0.48 || hasScorePressure;
    }

    if (context.profile === 'cautious') {
      return currentValue >= 9 || remainingHandStrength >= 0.74 || hasScorePressure;
    }

    return currentValue >= 6 || remainingHandStrength >= 0.62 || hasScorePressure;
  }

  private hasTwoVersusTwoOpeningScorePressure(
    context: BotDecisionContext,
    currentValue: number,
  ): boolean {
    const score = context.score;

    if (!score) {
      return false;
    }

    const myScore = context.player.playerId === 'P1' ? score.playerOne : score.playerTwo;
    const opponentScore = context.player.playerId === 'P1' ? score.playerTwo : score.playerOne;

    return (
      myScore + currentValue >= score.pointsToWin ||
      opponentScore + currentValue >= score.pointsToWin ||
      score.pointsToWin - opponentScore <= 3
    );
  }

  private buildTwoVersusTwoTacticalTelemetry(
    context: BotDecisionContext,
    roundState: TwoVersusTwoRoundState | null,
    selectedCard: string,
  ): BotDecisionTacticalTelemetry {
    const actorSeatId = context.actorSeatId;
    const actorTeamId = actorSeatId
      ? (context.actorTeamId ?? TEAM_BY_SEAT[actorSeatId])
      : context.actorTeamId;
    const partnerSeatId =
      context.partnerSeatId ?? (actorSeatId ? PARTNER_BY_SEAT[actorSeatId] : null);
    const partnerSignal = this.getActiveCardTacticSignal(context);

    const seatPlays = (roundState?.plays ?? []).reduce<Partial<Record<BotSeatId, string | null>>>(
      (accumulator, play) => ({
        ...accumulator,
        [play.seatId]: play.card,
      }),
      {},
    );

    return {
      mode: '2v2',
      ...(actorSeatId ? { actorSeatId } : {}),
      ...(actorTeamId ? { actorTeamId } : {}),
      partnerSeatId,
      winningSeatIdBeforeDecision: roundState?.winningSeatId ?? null,
      winningTeamIdBeforeDecision: roundState?.winningTeamId ?? null,
      winningCardBeforeDecision: roundState?.winningCard ?? null,
      partnerWasWinning: roundState?.winningSeatId === partnerSeatId,
      actorHandBefore: [...context.player.hand],
      selectedCard,
      ...(partnerSignal
        ? {
            partnerSignalKind: partnerSignal.kind,
            partnerSignalScope: partnerSignal.scope,
            partnerSignalIntent: partnerSignal.intent,
            ...(context.partnerSignals?.handMemory
              ? {
                  partnerHandMemorySignalKind: context.partnerSignals.handMemory.kind,
                }
              : {}),
            ...(context.partnerSignals?.roundTactic
              ? {
                  partnerRoundTacticSignalKind: context.partnerSignals.roundTactic.kind,
                }
              : {}),
            ...(context.partnerSignals?.betIntent
              ? {
                  partnerBetIntentSignalKind: context.partnerSignals.betIntent.kind,
                }
              : {}),
          }
        : {}),
      seatPlays,
      orderedPlays: (roundState?.plays ?? []).map((play) => ({
        ownerId: play.seatId,
        seatId: play.seatId,
        playerId: play.playerId,
        card: play.card,
      })),
    };
  }

  private resolveTwoVersusTwoRoundState(
    currentRound: BotRoundView,
    viraRank: Rank,
  ): TwoVersusTwoRoundState | null {
    const plays = this.resolveTwoVersusTwoRoundPlays(currentRound);

    if (plays.length === 0) {
      return null;
    }

    const leaders: TwoVersusTwoRoundPlay[] = [];

    for (const play of plays) {
      if (leaders.length === 0) {
        leaders.push(play);
        continue;
      }

      const comparison = this.compareCardStrength(play.card, leaders[0]!.card, viraRank);

      if (comparison > 0) {
        leaders.splice(0, leaders.length, play);
      } else if (comparison === 0) {
        leaders.push(play);
      }
    }

    if (leaders.length !== 1) {
      return {
        plays,
        winningSeatId: null,
        winningTeamId: null,
        winningCard: null,
      };
    }

    const leader = leaders[0]!;
    const winningTeamId = TEAM_BY_SEAT[leader.seatId];

    return {
      plays,
      winningSeatId: leader.seatId,
      winningTeamId,
      winningCard: leader.card,
    };
  }

  private resolveTwoVersusTwoRoundPlays(currentRound: BotRoundView): TwoVersusTwoRoundPlay[] {
    const orderedSeatPlays = (currentRound.orderedPlays ?? []).flatMap((play) => {
      if (!this.isBotSeatId(play.seatId) || play.card.length === 0) {
        return [];
      }

      return [
        {
          seatId: play.seatId,
          playerId: play.playerId,
          card: play.card,
        },
      ];
    });

    if (orderedSeatPlays.length > 0) {
      return orderedSeatPlays;
    }

    const seatPlays = currentRound.seatPlays;

    if (!seatPlays) {
      return [];
    }

    return TWO_VERSUS_TWO_SEATS.flatMap((seatId) => {
      const card = seatPlays[seatId];

      if (!card) {
        return [];
      }

      return [
        {
          seatId,
          playerId: PLAYER_BY_TEAM[TEAM_BY_SEAT[seatId]],
          card,
        },
      ];
    });
  }

  private isBotSeatId(value: unknown): value is BotSeatId {
    return typeof value === 'string' && TWO_VERSUS_TWO_SEATS.includes(value as BotSeatId);
  }

  private pickOpeningCard(hand: string[], profile: BotProfile): BotCardSelection {
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
  ): BotCardSelection {
    const winningCards = hand.filter((candidate) => this.beats(candidate, opponentCard, viraRank));

    if (winningCards.length === 0) {
      const card = this.pickLosingCard(hand, profile);
      const strategy: BotDecisionStrategy =
        profile === 'aggressive'
          ? 'response-losing-strongest'
          : profile === 'cautious'
            ? 'response-losing-weakest'
            : 'response-losing-middle';

      return { card, strategy };
    }

    const card = this.pickCardByProfile(winningCards, profile, {
      aggressive: 'strongest',
      balanced: 'weakest',
      cautious: 'weakest',
    });

    const strategy: BotDecisionStrategy =
      profile === 'aggressive' ? 'response-winning-strongest' : 'response-winning-weakest';

    return { card, strategy };
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

  private buildMetadata(
    strategy: BotDecisionStrategy,
    handStrength?: number,
    tactical?: BotDecisionTacticalTelemetry,
    betAudit?: BotDecisionBetTelemetry,
  ): BotDecisionMetadata {
    const rationale = {
      strategy,
      ...(handStrength !== undefined ? { handStrength } : {}),
      ...(tactical ? { tactical } : {}),
      ...(betAudit ? { betAudit } : {}),
    };

    return {
      source: 'heuristic',
      rationale,
    };
  }
}
