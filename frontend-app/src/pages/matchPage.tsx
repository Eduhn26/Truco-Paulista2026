import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../features/auth/authStore';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useMatchActionBridge } from '../features/match/useMatchActionBridge';
import type { MatchAction } from '../features/match/matchActionTypes';
import { MatchPageHeader } from '../features/match/matchPageHeader';
import {
  playBetAcceptedFeedbackSound,
  playBetDeclinedFeedbackSound,
  playBetRequestedFeedbackSound,
  playCardLaunchSound,
  playMatchActionSound,
} from '../features/match/matchSoundDirector';
import { buildMatchContractPresentation } from '../features/match/matchPresentationSelectors';
import { MatchSecondaryPanelSection } from '../features/match/matchSecondaryPanelSection';
import { getLastActiveMatchId } from '../features/match/matchSnapshotStorage';
import { MatchTableShell } from '../features/match/matchTableShell';
import { MatchTableShell2v2 } from '../features/match/matchTableShell2v2';
import { ViraRevealAnimation } from '../features/match/ViraRevealAnimation';
import { useMatchRealtimeSession } from '../features/match/useMatchRealtimeSession';
import { useMatchTableTransition } from '../features/match/useMatchTableTransition';
import {
  AUTO_NEXT_HAND_DELAY_MS,
  BET_FEEDBACK_HOLD_MS,
  BET_FEEDBACK_MIN_REQUESTED_MS,
  HAND_INTRO_HOLD_MS,
  HAND_RESULT_HOLD_MS,
  NEXT_HAND_COMMIT_MS,
  REALTIME_RESOLUTION_GRACE_MS,
} from '../features/match/timing';
import { useGameSound } from '../hooks/useGameSound';
import { cardStringToPayload } from '../services/socket/socketTypes';
import type {
  BotDecisionTelemetryPayload,
  BotIdentityPayload,
  CardPayload,
  MatchStatePayload,
  PartnerBetProposalPayload,
  PartnerBetProposalResolvedPayload,
  PartnerSignalDebugPayload,
  PartnerSignalKind,
  PartnerSignalPayload,
  Rank,
  RoomStatePayload,
} from '../services/socket/socketTypes';

const TABLE_SEAT_ORDER_1V1 = ['T2A', 'T1A'] as const;
const TABLE_SEAT_ORDER_2V2 = ['T1B', 'T2A', 'T1A', 'T2B'] as const;
const BET_DECLINED_AUTO_NEXT_HAND_DELAY_MS = Math.max(
  AUTO_NEXT_HAND_DELAY_MS,
  BET_FEEDBACK_HOLD_MS + NEXT_HAND_COMMIT_MS,
);
const HAND_OUTCOME_AFTER_ROUND_BADGE_HOLD_MS = 2200;
const BUFFERED_CARD_REPLAY_FIRST_DELAY_MS = 1200;
const BUFFERED_CARD_REPLAY_STEP_MS = 2400;
const BUFFERED_CARD_REPLAY_LANDING_GUARD_MS = 900;
const BUFFERED_CARD_REPLAY_HAND_SYNC_RELEASE_MS = 180;
const VIRA_REVEAL_SHUFFLE_SOUND_DELAY_MS = 620;
const VIRA_REVEAL_FLIP_SOUND_DELAY_MS = 1540;
const NEW_HAND_OPENING_REVEAL_MS = 2720;
const POST_VIRA_TABLE_RELEASE_MS = 520;
const NEW_HAND_OPENING_FAILSAFE_MS = 3600;
const HAND_INTRO_WITH_VIRA_REVEAL_MS = Math.max(
  HAND_INTRO_HOLD_MS,
  NEW_HAND_OPENING_REVEAL_MS + POST_VIRA_TABLE_RELEASE_MS,
);

function shouldLogMatchPageDebug(): boolean {
  if (!import.meta.env.DEV) {
    return false;
  }

  if (typeof window === 'undefined') {
    return false;
  }

  const params = new URLSearchParams(window.location.search);

  return params.get('debugMatch') === '1' || params.get('debugTruco') === '1';
}

function debugMatchPage(event: string, details: Record<string, unknown> = {}): void {
  if (!shouldLogMatchPageDebug()) {
    return;
  }

  console.info('[MATCH_PAGE]', event, details);
}

function summarizeMatchStateForDebug(payload: MatchStatePayload | null): Record<string, unknown> {
  return {
    state: payload?.state ?? null,
    matchId: payload?.matchId ?? null,
    hasHand: Boolean(payload?.currentHand),
    nextDecisionType: payload?.currentHand?.nextDecisionType ?? null,
    handFinished: payload?.currentHand?.finished ?? null,
    winner: payload?.currentHand?.winner ?? null,
    awardedPoints: payload?.currentHand?.awardedPoints ?? null,
    roundsCount: payload?.currentHand?.rounds.length ?? 0,
  };
}

function summarizeRoomStateForDebug(payload: RoomStatePayload | null): Record<string, unknown> {
  return {
    matchId: payload?.matchId ?? null,
    canStart: payload?.canStart ?? null,
    currentTurnSeatId: payload?.currentTurnSeatId ?? null,
    mode: payload?.mode ?? null,
  };
}

function isBetResponseState({
  publicMatchState,
  privateMatchState,
}: {
  publicMatchState: MatchStatePayload | null | undefined;
  privateMatchState: MatchStatePayload | null | undefined;
}): boolean {
  const hand = privateMatchState?.currentHand ?? publicMatchState?.currentHand;

  return Boolean(
    hand &&
    !hand.finished &&
    (hand.nextDecisionType === 'respond-bet' || hand.betState === 'awaiting_response'),
  );
}

type TableSeatView = {
  seatId: string;
  ready: boolean;
  isBot: boolean;
  isCurrentTurn: boolean;
  isMine: boolean;
  displayName: string | null;
  publicName: string | null;
  publicSlug: string | null;
  botIdentity: BotIdentityPayload | null;
};

type MatchStatusTone = 'neutral' | 'success' | 'warning';
type TablePhase = 'missing_context' | 'waiting' | 'playing' | 'hand_finished' | 'match_finished';
type VisualBeat = 'idle' | 'hand_intro' | 'hand_result_hold' | 'hand_reset' | 'live';

type BetFeedbackTone = 'neutral' | 'success' | 'warning';
type BetFeedbackKind = 'requested' | 'accepted' | 'declined' | 'special';

type BetFeedbackState = {
  id: number;
  kind: BetFeedbackKind;
  title: string;
  detail: string;
  tone: BetFeedbackTone;
};

type MatchStateHandPayload = NonNullable<MatchStatePayload['currentHand']>;
type MatchStateRoundPayload = MatchStateHandPayload['rounds'][number];
type MatchStateRoundSeatPlays = NonNullable<MatchStateRoundPayload['seatPlays']>;
type SeatPlayedCardsSnapshot = Record<string, string | null>;
type SeatCardConsumptionCounts = Record<string, number>;

function isVisiblePlayedCard(card: string | null | undefined): card is string {
  return typeof card === 'string' && card.length > 0 && card !== 'HIDDEN';
}

function cardPayloadToString(card: CardPayload): string {
  return `${card.rank}${card.suit}`;
}

function buildBotDecisionLogKey(decision: BotDecisionTelemetryPayload): string {
  return [
    decision.occurredAt ?? 'no-time',
    decision.actorSeatId ?? decision.seatId,
    decision.action,
    decision.selectedCard ?? 'no-card',
    decision.executionStatus ?? 'no-execution',
    decision.executedAction ?? 'no-executed-action',
    decision.partnerSignalKind ?? 'no-signal',
    decision.partnerSignalScope ?? 'no-scope',
    decision.partnerSignalFromSeatId ?? 'no-sender',
    decision.debugRole ?? 'unknown-role',
  ].join('|');
}

function buildPartnerSignalDebugConsolePayload(
  payload: PartnerSignalDebugPayload,
): Record<string, unknown> {
  return {
    phase: payload.phase,
    matchId: payload.matchId,
    kind: payload.kind ?? null,
    label: payload.label ?? null,
    scope: payload.scope ?? null,
    fromSeatId: payload.fromSeatId ?? null,
    toTeamId: payload.toTeamId ?? null,
    botSeatId: payload.botSeatId ?? null,
    botTeamId: payload.botTeamId ?? null,
    partnerSeatId: payload.partnerSeatId ?? null,
    ttlMs: payload.ttlMs ?? null,
    reason: payload.reason ?? null,
    availableSignals: payload.availableSignals ?? [],
    signalId: payload.signalId ?? null,
    createdAt: payload.createdAt ?? null,
    expiresAt: payload.expiresAt ?? null,
    occurredAt: payload.occurredAt,
  };
}

function buildBotDecisionConsolePayload(
  decision: BotDecisionTelemetryPayload,
): Record<string, unknown> {
  return {
    seat: decision.actorSeatId ?? decision.seatId,
    teamId: decision.actorTeamId ?? decision.teamId,
    playerId: decision.playerId,
    profile: decision.profile,
    action: decision.action,
    source: decision.source,
    debugRole: decision.debugRole ?? 'unknown',
    signalReceived: decision.partnerSignalKind ?? null,
    signalScope: decision.partnerSignalScope ?? null,
    signalFromSeat: decision.partnerSignalFromSeatId ?? null,
    signalIntent: decision.partnerSignalIntent ?? null,
    signalStrengthHint: decision.partnerSignalStrengthHint ?? null,
    handMemorySignal: decision.partnerHandMemorySignalKind ?? null,
    roundTacticSignal: decision.partnerRoundTacticSignalKind ?? null,
    betIntentSignal: decision.partnerBetIntentSignalKind ?? null,
    partnerSignalBoost: decision.partnerSignalBoost ?? null,
    partnerSignalExpiresAt: decision.partnerSignalExpiresAt ?? null,
    partnerSignalTtlMs: decision.partnerSignalTtlMs ?? null,
    strategy: decision.strategy ?? null,
    selectedCard: decision.selectedCard ?? null,
    executionStatus: decision.executionStatus ?? null,
    executedAction: decision.executedAction ?? null,
    executionReason: decision.executionReason ?? null,
    reason: decision.reason ?? null,
    winningSeatIdBeforeDecision: decision.winningSeatIdBeforeDecision ?? null,
    winningTeamIdBeforeDecision: decision.winningTeamIdBeforeDecision ?? null,
    winningCardBeforeDecision: decision.winningCardBeforeDecision ?? null,
    partnerWasWinning: decision.partnerWasWinning ?? null,
    actorHandBefore: decision.actorHandBefore ?? [],
    bet: {
      currentValue: decision.betCurrentValue ?? null,
      pendingValue: decision.betPendingValue ?? null,
      state: decision.betState ?? null,
      selectedAction: decision.betSelectedAction ?? null,
      effectiveStrength: decision.betEffectiveStrength ?? null,
      acceptThreshold: decision.betAcceptThreshold ?? null,
      raiseThreshold: decision.betRaiseThreshold ?? null,
      initiativeThreshold: decision.betInitiativeThreshold ?? null,
      declineFloor: decision.betDeclineFloor ?? null,
    },
    occurredAt: decision.occurredAt ?? null,
  };
}

function addVisibleCardToSet(cards: Set<string>, card: string | null | undefined): void {
  if (isVisiblePlayedCard(card)) {
    cards.add(card);
  }
}

function removeVisiblePlayedCardsFromHand(
  cards: CardPayload[],
  playedCards: ReadonlySet<string>,
): CardPayload[] {
  if (playedCards.size === 0) {
    return cards;
  }

  return cards.filter((card) => !playedCards.has(cardPayloadToString(card)));
}

function hasSeatPlayedCards(snapshot: SeatPlayedCardsSnapshot): boolean {
  return Object.values(snapshot).some(isVisiblePlayedCard);
}

function buildSeatPlayedCardsSnapshot(
  round: MatchStateRoundPayload | null,
  fallback: SeatPlayedCardsSnapshot,
): SeatPlayedCardsSnapshot {
  const snapshot: SeatPlayedCardsSnapshot = {};

  Object.entries(round?.seatPlays ?? {}).forEach(([seatId, card]) => {
    snapshot[seatId] = isVisiblePlayedCard(card) ? card : null;
  });

  if (Array.isArray(round?.orderedPlays)) {
    round.orderedPlays.forEach((play) => {
      const seatId = play.seatId ?? play.ownerId;

      if (seatId && isVisiblePlayedCard(play.card)) {
        snapshot[seatId] = play.card;
      }
    });
  }

  Object.entries(fallback).forEach(([seatId, card]) => {
    if (isVisiblePlayedCard(card) && snapshot[seatId] === undefined) {
      snapshot[seatId] = card;
    }
  });

  return snapshot;
}

function maskBufferedReplaySeatPlays(
  hand: MatchStatePayload['currentHand'] | null,
  bufferedSeatReplayLocks: Readonly<Record<string, string>>,
): MatchStatePayload['currentHand'] | null {
  const lockedEntries = Object.entries(bufferedSeatReplayLocks).filter(([, card]) =>
    isVisiblePlayedCard(card),
  );

  if (!hand || lockedEntries.length === 0) {
    return hand;
  }

  let changed = false;
  const maskedRounds: MatchStateRoundPayload[] = hand.rounds.map(
    (round, index): MatchStateRoundPayload => {
      const currentSeatPlays = round.seatPlays;

      if (round.finished || index !== hand.currentRoundIndex || !currentSeatPlays) {
        return round;
      }

      let roundChanged = false;
      const seatPlays: MatchStateRoundSeatPlays = { ...currentSeatPlays };

      lockedEntries.forEach(([seatId, lockedCard]) => {
        if (seatPlays[seatId] === lockedCard) {
          seatPlays[seatId] = null;
          roundChanged = true;
        }
      });

      if (!roundChanged) {
        return round;
      }

      changed = true;

      return {
        ...round,
        seatPlays,
      };
    },
  );

  return changed ? { ...hand, rounds: maskedRounds } : hand;
}

function buildFinishedHandResultKey({
  matchId,
  hand,
}: {
  matchId: string;
  hand: MatchStatePayload['currentHand'] | null;
}): string | null {
  if (!hand?.finished) {
    return null;
  }

  return [
    matchId,
    hand.viraRank,
    hand.winner ?? 'tie',
    hand.awardedPoints ?? 'null',
    hand.rounds.length,
    hand.currentValue,
  ].join('|');
}

function buildAutoNextHandKeyPrefix({
  matchId,
  hand,
  playedRoundsCount,
  scorePlayerOne,
  scorePlayerTwo,
}: {
  matchId: string;
  hand: MatchStateHandPayload;
  playedRoundsCount: number;
  scorePlayerOne: number;
  scorePlayerTwo: number;
}): string {
  return [
    matchId,
    hand.viraRank,
    hand.winner ?? 'tie',
    hand.awardedPoints ?? 'null',
    playedRoundsCount,
    scorePlayerOne,
    scorePlayerTwo,
  ].join('|');
}

function resolveNextBetPendingValue(currentValue: number): number {
  if (currentValue < 3) {
    return 3;
  }

  if (currentValue < 6) {
    return 6;
  }

  if (currentValue < 9) {
    return 9;
  }

  return 12;
}

type PendingBetCycle = {
  requestedBy: 'P1' | 'P2';
  pendingValue: number;
  previousValue: number;
  requestShown: boolean;
  requestSoundPlayed: boolean;
  observedAwaitingResponse: boolean;
};

type PendingMaoDeOnzeCycle = {
  decisionBy: 'P1' | 'P2';
  handKey: string;
  observedDecision: boolean;
};

type LocalMaoDeOnzeDeclineIntent = {
  decisionBy: 'P1' | 'P2';
  handKey: string;
};

type LocalPartnerSignalFeedback = {
  id: string;
  label: string;
  expiresAt: string;
};

type OpeningViraRevealState = {
  key: string;
  card: CardPayload;
  rawCard: string | null;
};

type PendingOpeningViraReveal = {
  matchId: string;
  viraRank: Rank;
  requestedAt: number;
};

type MatchViewModel = {
  resolvedMatchId: string;
  mySeat: string | null;
  isOneVsOne: boolean;
  roomPlayers: TableSeatView[];
  mySeatView: TableSeatView | null;
  opponentSeatView: TableSeatView | null;
  myCards: CardPayload[];
  myPlayedCard: string | null;
  opponentPlayedCard: string | null;
  isMyTurnForVisuals: boolean;
  scoreLabel: string;
  currentTurnSeatId: string | null;
  nextDecisionType: string | null;
  viewerCanActNow: boolean;
  canStartHand: boolean;
  canPlayCard: boolean;
  currentValue: number;
  betState: string;
  pendingValue: number | null;
  requestedBy: string | null;
  specialState: string;
  specialDecisionPending: boolean;
  specialDecisionBy: string | null;
  winner: string | null;
  awardedPoints: number | null;
  availableActions: MatchStateHandPayload['availableActions'];
  availableActionsSource: 'private' | 'public' | 'fallback';
  handFinished: boolean;
  matchFinished: boolean;
  tablePhase: TablePhase;
  handStatusLabel: string;
  handStatusTone: MatchStatusTone;
  latestRound: MatchStateHandPayload['rounds'][number] | null;
  rounds: MatchStateHandPayload['rounds'];
  playedRoundsCount: number;
  currentPublicHand: MatchStatePayload['currentHand'] | null;
  currentPrivateHand: MatchStatePayload['currentHand'] | null;
  lastBotDecision: BotDecisionTelemetryPayload | null;
};

type PendingVisualState = {
  roomState: RoomStatePayload | null;
  publicMatchState: MatchStatePayload | null;
  privateMatchState: MatchStatePayload | null;
};

type RoundTransitionPayload = {
  matchId?: string;
  phase: 'round-resolved' | 'next-round-opened';
  roundWinner?: string | null;
  finishedRoundsCount: number;
  totalRoundsCount: number;
  handContinues: boolean;
  openingSeatId?: string | null;
  currentTurnSeatId?: string | null;
  triggeredBy?: {
    seatId: string;
    teamId: 'T1' | 'T2';
    playerId: 'P1' | 'P2';
    isBot: boolean;
  };
};

type PendingRealtimeResolution = {
  resolutionKey: string;
  finishedRoundsCount: number;
  myPlayerId: 'P1' | 'P2';
  roundWinner: string | null;
};

type TrucoDebugBadgeProps = {
  publicMatchState: MatchStatePayload | null;
  privateMatchState: MatchStatePayload | null;
};

type BetFeedbackBannerProps = {
  feedback: BetFeedbackState | null;
};

function TrucoDebugBadge({ publicMatchState, privateMatchState }: TrucoDebugBadgeProps) {
  const publicHand = publicMatchState?.currentHand ?? null;
  const privateHand = privateMatchState?.currentHand ?? null;
  const publicCanRequest = publicHand?.availableActions?.canRequestTruco ?? false;
  const privateCanRequest = privateHand?.availableActions?.canRequestTruco ?? false;

  return (
    <div className="pointer-events-none absolute bottom-4 right-4 z-30 hidden xl:block">
      <div
        className="rounded-2xl px-4 py-3 backdrop-blur-xl"
        style={{
          background: 'linear-gradient(180deg, rgba(5,10,18,0.92), rgba(7,14,24,0.82))',
          border: '1px solid rgba(230,195,100,0.16)',
          boxShadow: '0 18px 40px rgba(0,0,0,0.34)',
        }}
      >
        <div className="text-[9px] font-black uppercase tracking-[0.22em] text-slate-400">
          Truco debug
        </div>

        <div className="mt-2 space-y-1.5 font-mono text-[11px] leading-5 text-slate-200">
          <div>
            <span className="text-slate-500">PUB</span>{' '}
            <span>decision={publicHand?.nextDecisionType ?? '-'}</span>{' '}
            <span>req={String(publicCanRequest)}</span>
          </div>

          <div>
            <span className="text-slate-500">PVT</span>{' '}
            <span>decision={privateHand?.nextDecisionType ?? '-'}</span>{' '}
            <span>req={String(privateCanRequest)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function shouldShowTrucoDebugBadge(): boolean {
  if (!shouldLogMatchPageDebug()) {
    return false;
  }

  if (typeof window === 'undefined') {
    return false;
  }

  return new URLSearchParams(window.location.search).get('debugTruco') === '1';
}

function buildCardRevealKey(card: string | null | undefined): number {
  if (!card) {
    return 0;
  }

  return Array.from(card).reduce((accumulator, character, index) => {
    return accumulator + character.charCodeAt(0) * (index + 1) * 97;
  }, card.length * 31);
}

function isMaoDeOnzeSpecialState(specialState: string | null | undefined): boolean {
  return specialState === 'mao_de_onze' || specialState === 'mao_de_ferro';
}

const PARTNER_SIGNAL_LABEL_BY_KIND: Record<PartnerSignalKind, string> = {
  'manilha-zap': 'Zap',
  'manilha-copas': 'Copas',
  'manilha-espadilha': 'Espadilha',
  'manilha-ouros': 'Ouros',
  'has-manilha': 'Tenho manilha',
  'strong-manilha': 'Manilha forte',
  'weak-manilha': 'Manilha fraca',
  'no-manilha': 'Tô sem manilha',
  'strong-hand': 'Tô forte',
  'weak-hand': 'Tô fraco',
  hold: 'Segura',
  'kill-round': 'Mata essa',
  'low-card': 'Joga baixo',
  pressure: 'Pressiona',
  'avoid-bet': 'Não compra',
};

function resolvePartnerSignalFeedbackLabel(kind: PartnerSignalKind): string {
  return PARTNER_SIGNAL_LABEL_BY_KIND[kind];
}

function BetFeedbackBanner({ feedback }: BetFeedbackBannerProps) {
  if (!feedback) {
    return null;
  }

  const isSpecial = feedback.kind === 'special';
  const isAccepted = feedback.kind === 'accepted';
  const isDeclined = feedback.kind === 'declined';

  const toneClasses = isSpecial
    ? {
        eyebrow: 'MÃO DE 11',
        mark: '11',
        markColor: '#1a1200',
        markBg: 'linear-gradient(180deg, #fff1b8 0%, #e8c76a 55%, #8a6420 100%)',
        accent: '#ffe6a3',
        accentSoft: 'rgba(255, 230, 163, 0.24)',
        border: '1px solid rgba(255, 230, 163, 0.52)',
        background:
          'radial-gradient(circle at 50% 0%, rgba(255,230,163,0.22), transparent 46%), linear-gradient(180deg, rgba(34, 25, 8, 0.98), rgba(7, 10, 6, 0.96) 100%)',
        glow: '0 0 38px rgba(255,230,163,0.22), 0 20px 44px rgba(0,0,0,0.44), inset 0 1px 0 rgba(255,246,207,0.18)',
        sweep: 'rgba(255, 230, 163, 0.72)',
      }
    : isAccepted
      ? {
          eyebrow: 'APOSTA ACEITA',
          mark: '✓',
          markColor: '#10230f',
          markBg: 'linear-gradient(180deg, #f8df96 0%, #d2a94c 55%, #8a6420 100%)',
          accent: '#f8df96',
          accentSoft: 'rgba(248, 223, 150, 0.22)',
          border: '1px solid rgba(248, 223, 150, 0.50)',
          background:
            'radial-gradient(circle at 50% 0%, rgba(248,223,150,0.20), transparent 46%), linear-gradient(180deg, rgba(31, 24, 8, 0.97), rgba(9, 12, 7, 0.96) 100%)',
          glow: '0 0 34px rgba(201,168,76,0.20), 0 20px 44px rgba(0,0,0,0.44), inset 0 1px 0 rgba(255,246,207,0.16)',
          sweep: 'rgba(248, 223, 150, 0.70)',
        }
      : isDeclined
        ? {
            eyebrow: 'MÃO ENCERRADA',
            mark: '↯',
            markColor: '#fff1d5',
            markBg: 'linear-gradient(180deg, #b95024 0%, #743016 58%, #2b0b05 100%)',
            accent: '#ffcf8b',
            accentSoft: 'rgba(249, 115, 22, 0.24)',
            border: '1px solid rgba(251, 146, 60, 0.46)',
            background:
              'radial-gradient(circle at 50% 0%, rgba(251,146,60,0.19), transparent 46%), linear-gradient(180deg, rgba(54, 20, 7, 0.97), rgba(16, 7, 4, 0.96) 100%)',
            glow: '0 0 34px rgba(249,115,22,0.18), 0 20px 44px rgba(0,0,0,0.44), inset 0 1px 0 rgba(255,210,160,0.12)',
            sweep: 'rgba(251, 146, 60, 0.62)',
          }
        : {
            eyebrow: 'APOSTA',
            mark: '!',
            markColor: '#e8edf8',
            markBg: 'linear-gradient(180deg, #2b3852 0%, #121827 100%)',
            accent: '#cdd8ea',
            accentSoft: 'rgba(148, 163, 184, 0.18)',
            border: '1px solid rgba(148,163,184,0.28)',
            background:
              'radial-gradient(circle at 50% 0%, rgba(148,163,184,0.16), transparent 46%), linear-gradient(180deg, rgba(16, 22, 34, 0.97), rgba(8, 11, 18, 0.95) 100%)',
            glow: '0 0 28px rgba(148,163,184,0.10), 0 20px 44px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,255,255,0.08)',
            sweep: 'rgba(203, 216, 234, 0.54)',
          };

  const railClassName = isSpecial
    ? 'pointer-events-none absolute left-1/2 top-[9%] z-[140] w-full max-w-[500px] -translate-x-1/2 px-4'
    : 'pointer-events-none absolute right-8 top-20 z-[140] w-[360px] max-w-[calc(100%-2rem)] sm:right-10 lg:right-12 xl:right-14';
  const cardClassName = isSpecial
    ? 'relative overflow-hidden rounded-[28px] px-5 py-4 text-center backdrop-blur-xl'
    : 'relative overflow-hidden rounded-[22px] px-4 py-3 text-center backdrop-blur-xl';
  const markerClassName = isSpecial
    ? 'flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[18px] font-black'
    : 'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[15px] font-black';
  const titleClassName = isSpecial
    ? 'mt-1 text-[20px] font-black uppercase leading-none tracking-[0.10em] text-[#fff4dc]'
    : 'mt-0.5 text-[17px] font-black uppercase leading-none tracking-[0.09em] text-[#fff4dc]';
  const detailClassName = isSpecial
    ? 'relative mx-auto mt-3 max-w-[88%] rounded-full px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em]'
    : 'relative mx-auto mt-2 max-w-[92%] rounded-full px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.16em]';

  return (
    <motion.div
      key={feedback.id}
      className={railClassName}
      initial={{ opacity: 0, y: -18, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.98 }}
      transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <motion.div
        className={cardClassName}
        animate={{
          boxShadow: [
            toneClasses.glow,
            `${toneClasses.glow}, 0 0 42px ${toneClasses.accentSoft}`,
            toneClasses.glow,
          ],
        }}
        transition={{ duration: isDeclined ? 0.95 : 1.25, repeat: 1 }}
        style={{
          background: toneClasses.background,
          border: toneClasses.border,
        }}
      >
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 skew-x-[-18deg]"
          initial={{ x: '-120%', opacity: 0 }}
          animate={{ x: '420%', opacity: [0, 0.55, 0] }}
          transition={{ duration: 0.86, ease: [0.2, 0.8, 0.2, 1] }}
          style={{
            background: `linear-gradient(90deg, transparent, ${toneClasses.sweep}, transparent)`,
            filter: 'blur(1px)',
          }}
        />

        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-7 top-0 h-px"
          style={{
            background: `linear-gradient(90deg, transparent 0%, ${toneClasses.accent} 50%, transparent 100%)`,
          }}
        />

        <div className="relative flex items-center justify-center gap-3">
          <motion.div
            className={markerClassName}
            initial={{ scale: 0.72, rotate: isDeclined ? -10 : 0 }}
            animate={{
              scale: isDeclined ? [0.72, 1.1, 1] : [0.72, 1.14, 1],
              rotate: isDeclined ? [-10, 5, 0] : [0, -4, 0],
            }}
            transition={{ duration: 0.38, ease: [0.2, 0.8, 0.2, 1] }}
            style={{
              background: toneClasses.markBg,
              color: toneClasses.markColor,
              border: `1px solid ${toneClasses.accentSoft}`,
              boxShadow: `0 0 18px ${toneClasses.accentSoft}, inset 0 1px 0 rgba(255,255,255,0.22)`,
              fontFamily: 'Georgia, serif',
            }}
          >
            {toneClasses.mark}
          </motion.div>

          <div className="min-w-0 text-left">
            <div
              className="text-[9px] font-black uppercase tracking-[0.30em]"
              style={{ color: toneClasses.accent }}
            >
              {toneClasses.eyebrow}
            </div>
            <motion.div
              className={titleClassName}
              initial={{ letterSpacing: '0.16em', opacity: 0.74 }}
              animate={{ letterSpacing: '0.10em', opacity: 1 }}
              transition={{ duration: 0.28 }}
              style={{
                fontFamily: 'Georgia, serif',
                textShadow: `0 2px 0 rgba(0,0,0,0.48), 0 0 18px ${toneClasses.accentSoft}`,
              }}
            >
              {feedback.title}
            </motion.div>
          </div>
        </div>

        <div
          className={detailClassName}
          style={{
            background: 'rgba(0, 0, 0, 0.26)',
            border: `1px solid ${toneClasses.accentSoft}`,
            color: '#dccdaa',
          }}
        >
          {feedback.detail}
        </div>
      </motion.div>
    </motion.div>
  );
}

function HandTransitionVeil({
  visualBeat,
  suppressCopy = false,
}: {
  visualBeat: VisualBeat;
  isTwoVersusTwo: boolean;
  suppressCopy?: boolean;
}) {
  const isOpeningHand = visualBeat === 'hand_intro';
  const isVisible = isOpeningHand;

  // NOTE: Trick plaques and the hand-result modal already close the previous
  // cycle. This veil only belongs to the next-hand opening, so it must not
  // replay a stale "RESULTADO" layer after shuffle or Vira reveal starts.
  const tone = {
    veil: 'radial-gradient(ellipse at 50% 56%, rgba(8, 18, 28, 0.18) 0%, rgba(3, 8, 14, 0.52) 70%, rgba(2, 5, 10, 0.74) 100%)',
    rim: 'rgba(230, 195, 100, 0.36)',
    rimSoft: 'rgba(230, 195, 100, 0.10)',
    headline: 'NOVA MÃO',
    kicker: 'Preparando próxima mão',
  };

  return (
    <AnimatePresence>
      {isVisible ? (
        <motion.div
          key={`hand-transition-veil-${visualBeat}`}
          aria-live="polite"
          aria-atomic="true"
          className="pointer-events-none absolute inset-0 z-[58] overflow-hidden rounded-[32px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.26, ease: [0.2, 0.8, 0.2, 1] }}
        >
          <div
            className="absolute inset-0"
            style={{
              background: tone.veil,
              boxShadow: `inset 0 0 96px ${tone.rimSoft}`,
            }}
          />

          <motion.div
            className="absolute inset-x-[12%] top-[34%] h-px"
            initial={{ scaleX: 0.18, opacity: 0 }}
            animate={{ scaleX: 1, opacity: 0.78 }}
            exit={{ scaleX: 0.6, opacity: 0 }}
            transition={{ duration: 0.36, ease: [0.2, 0.9, 0.24, 1] }}
            style={{
              background: `linear-gradient(90deg, transparent 0%, ${tone.rim} 50%, transparent 100%)`,
              boxShadow: `0 0 18px ${tone.rim}`,
              transformOrigin: '50% 50%',
            }}
          />

          <motion.div
            className="absolute inset-x-[12%] top-[64%] h-px"
            initial={{ scaleX: 0.18, opacity: 0 }}
            animate={{ scaleX: 1, opacity: 0.78 }}
            exit={{ scaleX: 0.6, opacity: 0 }}
            transition={{
              duration: 0.36,
              delay: 0.04,
              ease: [0.2, 0.9, 0.24, 1],
            }}
            style={{
              background: `linear-gradient(90deg, transparent 0%, ${tone.rim} 50%, transparent 100%)`,
              boxShadow: `0 0 18px ${tone.rim}`,
              transformOrigin: '50% 50%',
            }}
          />

          {!suppressCopy ? (
            <motion.div
              className="absolute inset-x-0 top-[49%] -translate-y-1/2 text-center"
              initial={{ y: 14, opacity: 0, scale: 0.96 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: -8, opacity: 0, scale: 0.98 }}
              transition={{
                duration: 0.34,
                delay: 0.08,
                ease: [0.2, 0.9, 0.24, 1],
              }}
            >
              <div
                className="select-none"
                style={{
                  fontFamily: 'Georgia, serif',
                  fontWeight: 900,
                  fontSize: 'clamp(40px, 5.4vw, 72px)',
                  letterSpacing: '0.06em',
                  lineHeight: 1,
                  background:
                    'linear-gradient(135deg, #f6dfa0 0%, #e8c76a 38%, #c9a84c 70%, #8a6a28 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                  textShadow: '0 8px 28px rgba(0, 0, 0, 0.55)',
                  filter: 'drop-shadow(0 2px 0 rgba(0, 0, 0, 0.42))',
                }}
              >
                {tone.headline}
              </div>

              <div
                className="mt-3 inline-flex items-center justify-center rounded-full px-3.5 py-1.5"
                style={{
                  background: 'rgba(8, 12, 16, 0.62)',
                  border: `1px solid ${tone.rim}`,
                  color: '#f0e6d3',
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: '0.22em',
                  textTransform: 'uppercase',
                  fontFamily: 'Inter, system-ui, sans-serif',
                  backdropFilter: 'blur(8px)',
                  boxShadow: `0 12px 28px rgba(0, 0, 0, 0.34), 0 0 18px ${tone.rimSoft}`,
                }}
              >
                {tone.kicker}
              </div>
            </motion.div>
          ) : null}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function NewHandOpeningMask({ isActive }: { isActive: boolean }) {
  return (
    <AnimatePresence>
      {isActive ? (
        <motion.div
          aria-hidden
          className="pointer-events-none fixed inset-0 z-[180] overflow-hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
        >
          <motion.div
            className="absolute inset-0"
            initial={{ opacity: 0.72 }}
            animate={{ opacity: [0.78, 0.86, 0.82] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
            style={{
              background:
                'radial-gradient(ellipse at 50% 48%, rgba(10, 24, 17, 0.46) 0%, rgba(3, 9, 8, 0.82) 58%, rgba(0, 0, 0, 0.92) 100%)',
              backdropFilter: 'blur(5px)',
            }}
          />

          <motion.div
            className="absolute left-1/2 top-1/2 h-[1px] w-[min(520px,64vw)] -translate-x-1/2 -translate-y-1/2"
            initial={{ opacity: 0, scaleX: 0.32 }}
            animate={{ opacity: [0.18, 0.42, 0.24], scaleX: [0.72, 1, 0.86] }}
            transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
            style={{
              background:
                'linear-gradient(90deg, transparent 0%, rgba(255,241,184,0.42) 50%, transparent 100%)',
              boxShadow: '0 0 22px rgba(201,168,76,0.22)',
            }}
          />
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

export function MatchPage() {
  const params = useParams<{ matchId: string }>();
  const { session } = useAuth();
  const routeMatchId = params.matchId ?? '';
  const effectiveMatchId = routeMatchId || getLastActiveMatchId() || '';
  const mySeatRef = useRef<string | null>(null);
  const [viraRank, setViraRank] = useState<Rank>('4');
  const [openingViraReveal, setOpeningViraReveal] = useState<OpeningViraRevealState | null>(null);
  const [lastKnownViraCard, setLastKnownViraCard] = useState<string | null>(null);
  const pendingOpeningViraRevealRef = useRef<PendingOpeningViraReveal | null>(null);
  const [showSecondary, setShowSecondary] = useState(false);
  const [visualBeat, setVisualBeat] = useState<VisualBeat>('idle');
  const visualBeatRef = useRef<VisualBeat>('idle');
  const openingViraSoundTimeoutsRef = useRef<number[]>([]);
  const openingViraFailsafeTimeoutRef = useRef<number | null>(null);
  const [betFeedback, setBetFeedback] = useState<BetFeedbackState | null>(null);
  const [isAutoNextHandArmed, setIsAutoNextHandArmed] = useState(false);
  const { play } = useGameSound();
  const [cachedMyCards, setCachedMyCards] = useState<CardPayload[]>([]);
  const [latestPlayedSeatId, setLatestPlayedSeatId] = useState<string | null>(null);
  const [seatPlayedCards, setSeatPlayedCards] = useState<SeatPlayedCardsSnapshot>({});
  const [seatCardConsumptionCounts, setSeatCardConsumptionCounts] =
    useState<SeatCardConsumptionCounts>({});
  const [resolvedSeatPlayedCards, setResolvedSeatPlayedCards] = useState<SeatPlayedCardsSnapshot>(
    {},
  );
  // Keeps the last visible 2v2 trick pinned while hand-result snapshots clear.
  const [frozenSeatPlayedCards, setFrozenSeatPlayedCards] = useState<SeatPlayedCardsSnapshot>({});
  const seatPlayedCardsRef = useRef<SeatPlayedCardsSnapshot>({});
  const seatCardConsumptionCountsRef = useRef<SeatCardConsumptionCounts>({});
  const consumedSeatCardKeysRef = useRef<Set<string>>(new Set());
  const pendingNextRoundSeatSnapshotClearRef = useRef(false);
  const pendingNextRoundSeatSnapshotClearTimeoutRef = useRef<number | null>(null);
  // Visual-only fallback for brief null turn ids between room sync events.
  const lastKnownTurnSeatRef = useRef<string | null>(null);
  const lastHydratedHandKeyRef = useRef<string | null>(null);
  const shouldRenderDeveloperTools = shouldLogMatchPageDebug();
  const shouldRenderTrucoDebugBadge = shouldRenderDeveloperTools && shouldShowTrucoDebugBadge();
  const beginHandTransitionRef = useRef<() => void>(() => {});
  const registerIncomingPlayedCardRef = useRef<
    (params: { owner: 'mine' | 'opponent' | null; card: string | null }) => void
  >(() => {});
  const triggerRoundResolutionRef = useRef<
    (params: {
      resolutionKey: string;
      myCard: string | null;
      opponentCard: string | null;
      roundResult?: string | null;
    }) => void
  >(() => {});
  const isDeferringVisualCommitRef = useRef(false);
  const lastHandStartedAtRef = useRef<number | null>(null);
  const handIntroTimeoutRef = useRef<number | null>(null);
  const deferredNextHandTimeoutRef = useRef<number | null>(null);
  const pendingDeferredNextHandStateRef = useRef<PendingVisualState | null>(null);
  const pendingPostBufferedReplayStateRef = useRef<PendingVisualState | null>(null);
  const autoNextHandTimeoutRef = useRef<number | null>(null);
  const lastAutoNextHandKeyRef = useRef<string | null>(null);
  const pendingAutoNextHandKeyRef = useRef<string | null>(null);
  const lastAutoNextHandWaitLogKeyRef = useRef<string | null>(null);
  const latestAutoNextHandPrefixRef = useRef<string | null>(null);
  const lastInitialAutoStartKeyRef = useRef<string | null>(null);
  const initialAutoStartTimeoutRef = useRef<number | null>(null);
  const latestCanStartHandRef = useRef(false);
  const latestIsStartHandPendingRef = useRef(false);
  const latestResolvedMatchIdRef = useRef('');
  const startHandPendingTimeoutRef = useRef<number | null>(null);
  const betFeedbackTimeoutRef = useRef<number | null>(null);
  const pendingRealtimeResolutionRef = useRef<PendingRealtimeResolution | null>(null);
  const pendingRealtimeResolutionTimeoutRef = useRef<number | null>(null);
  const bufferedCardsDuringIntroRef = useRef<
    Array<{ owner: 'mine' | 'opponent'; card: string; seatId: string | null }>
  >([]);
  const bufferedCardReplayTimeoutsRef = useRef<number[]>([]);
  const bufferedCardReplayLandingGuardTimeoutsRef = useRef<number[]>([]);
  const bufferedSeatReplayUnlockTimeoutsRef = useRef<number[]>([]);
  const bufferedSeatReplayLocksRef = useRef<Record<string, string>>({});
  const [bufferedSeatReplayVersion, setBufferedSeatReplayVersion] = useState(0);
  const betFeedbackQueueRef = useRef<BetFeedbackState[]>([]);
  const lastRequestedFeedbackAtRef = useRef<number | null>(null);
  const pendingBetCycleRef = useRef<PendingBetCycle | null>(null);
  const pendingMaoDeOnzeCycleRef = useRef<PendingMaoDeOnzeCycle | null>(null);
  const localMaoDeOnzeDeclineIntentRef = useRef<LocalMaoDeOnzeDeclineIntent | null>(null);
  const handledMaoDeOnzeDeclineKeysRef = useRef<Set<string>>(new Set());
  const lastMaoDeOnzeOpeningClearKeyRef = useRef<string | null>(null);
  const lastMaoDeOnzeOpeningBannerKeyRef = useRef<string | null>(null);
  const lastBotDecisionLogKeyRef = useRef<string | null>(null);
  const [declinedHandResultSkipKey, setDeclinedHandResultSkipKey] = useState<string | null>(null);
  const [isHandOutcomeRevealHoldActive, setIsHandOutcomeRevealHoldActive] = useState(false);
  const isHandOutcomeRevealHoldActiveRef = useRef(false);
  const isRoundResolutionVisualHoldActiveRef = useRef(false);
  const drainBufferedCardsRef = useRef<() => void>(() => {});
  const handOutcomeRevealHoldKeyRef = useRef<string | null>(null);
  const handOutcomeRevealHoldTimeoutRef = useRef<number | null>(null);
  const [lastPartnerSignal, setLastPartnerSignal] = useState<PartnerSignalPayload | null>(null);
  const [pendingPartnerBetProposal, setPendingPartnerBetProposal] =
    useState<PartnerBetProposalPayload | null>(null);
  const [recentApprovedPartnerBetProposal, setRecentApprovedPartnerBetProposal] =
    useState<PartnerBetProposalPayload | null>(null);
  const [lastSentPartnerSignal, setLastSentPartnerSignal] =
    useState<LocalPartnerSignalFeedback | null>(null);

  useEffect(() => {
    if (!shouldRenderDeveloperTools && showSecondary) {
      setShowSecondary(false);
    }
  }, [shouldRenderDeveloperTools, showSecondary]);

  const clearOpeningViraSoundTimers = useCallback(() => {
    openingViraSoundTimeoutsRef.current.forEach((timeoutId) => {
      window.clearTimeout(timeoutId);
    });
    openingViraSoundTimeoutsRef.current = [];
  }, []);

  const scheduleOpeningViraSounds = useCallback(() => {
    clearOpeningViraSoundTimers();

    const shuffleTimeoutId = window.setTimeout(() => {
      openingViraSoundTimeoutsRef.current = openingViraSoundTimeoutsRef.current.filter(
        (timeoutId) => timeoutId !== shuffleTimeoutId,
      );
      play('card-shuffle', 0.72);
    }, VIRA_REVEAL_SHUFFLE_SOUND_DELAY_MS);

    const revealTimeoutId = window.setTimeout(() => {
      openingViraSoundTimeoutsRef.current = openingViraSoundTimeoutsRef.current.filter(
        (timeoutId) => timeoutId !== revealTimeoutId,
      );
      play('vira-reveal', 0.82);
    }, VIRA_REVEAL_FLIP_SOUND_DELAY_MS);

    openingViraSoundTimeoutsRef.current = [shuffleTimeoutId, revealTimeoutId];
  }, [clearOpeningViraSoundTimers, play]);

  const handleOpeningViraRevealComplete = useCallback(() => {
    if (openingViraFailsafeTimeoutRef.current !== null) {
      window.clearTimeout(openingViraFailsafeTimeoutRef.current);
      openingViraFailsafeTimeoutRef.current = null;
    }

    clearOpeningViraSoundTimers();
    setOpeningViraReveal(null);
  }, [clearOpeningViraSoundTimers]);

  useEffect(() => {
    if (openingViraFailsafeTimeoutRef.current !== null) {
      window.clearTimeout(openingViraFailsafeTimeoutRef.current);
      openingViraFailsafeTimeoutRef.current = null;
    }

    if (!openingViraReveal) {
      return undefined;
    }

    openingViraFailsafeTimeoutRef.current = window.setTimeout(() => {
      openingViraFailsafeTimeoutRef.current = null;

      debugMatchPage('openingViraReveal:failsafe-release', {
        openingKey: openingViraReveal.key,
        visualBeat: visualBeatRef.current,
        isDeferringVisualCommit: isDeferringVisualCommitRef.current,
      });

      clearOpeningViraSoundTimers();
      setOpeningViraReveal(null);

      if (visualBeatRef.current === 'hand_intro') {
        if (handIntroTimeoutRef.current !== null) {
          window.clearTimeout(handIntroTimeoutRef.current);
          handIntroTimeoutRef.current = null;
        }

        isDeferringVisualCommitRef.current = false;
        setVisualBeat('live');
      }
    }, NEW_HAND_OPENING_FAILSAFE_MS);

    return () => {
      if (openingViraFailsafeTimeoutRef.current !== null) {
        window.clearTimeout(openingViraFailsafeTimeoutRef.current);
        openingViraFailsafeTimeoutRef.current = null;
      }
    };
  }, [clearOpeningViraSoundTimers, openingViraReveal]);

  useEffect(() => {
    visualBeatRef.current = visualBeat;
  }, [visualBeat]);

  useEffect(() => {
    isHandOutcomeRevealHoldActiveRef.current = isHandOutcomeRevealHoldActive;
  }, [isHandOutcomeRevealHoldActive]);

  useEffect(() => {
    seatPlayedCardsRef.current = seatPlayedCards;
  }, [seatPlayedCards]);

  useEffect(() => {
    seatCardConsumptionCountsRef.current = seatCardConsumptionCounts;
  }, [seatCardConsumptionCounts]);

  // Empty snapshots are common during hand-result holds, so frozen cards only refresh from live card sets.
  useEffect(() => {
    const liveHasCards = Object.values(seatPlayedCards).some(
      (card) => typeof card === 'string' && card.length >= 2,
    );

    if (!liveHasCards) {
      // Empty live snapshots should not clear the frozen table.
      return;
    }

    // A different live card set means the next trick has started.
    const frozenIsStale = Object.entries(seatPlayedCards).some(([seatId, card]) => {
      if (typeof card !== 'string' || card.length < 2) return false;
      return frozenSeatPlayedCards[seatId] !== card;
    });

    if (frozenIsStale) {
      setFrozenSeatPlayedCards(seatPlayedCards);
    }
  }, [seatPlayedCards, frozenSeatPlayedCards]);

  // The hand intro is the hard reset boundary for the frozen table.
  useEffect(() => {
    if (visualBeat === 'hand_intro') {
      setFrozenSeatPlayedCards({});
    }
  }, [visualBeat]);

  const clearSeatPlayedCardsSnapshot = useCallback(() => {
    seatPlayedCardsRef.current = {};
    setSeatPlayedCards({});
    setLatestPlayedSeatId(null);
  }, []);

  const clearSeatCardConsumptionCounts = useCallback(() => {
    seatCardConsumptionCountsRef.current = {};
    consumedSeatCardKeysRef.current = new Set();
    setSeatCardConsumptionCounts({});
  }, []);

  const recordSeatCardConsumption = useCallback((seatId: string | null, card: string | null) => {
    if (!seatId || !isVisiblePlayedCard(card)) {
      return;
    }

    const consumptionKey = `${seatId}|${card}`;

    if (consumedSeatCardKeysRef.current.has(consumptionKey)) {
      return;
    }

    consumedSeatCardKeysRef.current.add(consumptionKey);

    const nextCounts: SeatCardConsumptionCounts = {
      ...seatCardConsumptionCountsRef.current,
      [seatId]: Math.min(3, (seatCardConsumptionCountsRef.current[seatId] ?? 0) + 1),
    };

    seatCardConsumptionCountsRef.current = nextCounts;
    setSeatCardConsumptionCounts(nextCounts);
  }, []);

  const recordSeatPlayedCardSnapshot = useCallback((seatId: string | null, card: string | null) => {
    if (!seatId || !isVisiblePlayedCard(card)) {
      return;
    }

    const nextSnapshot: SeatPlayedCardsSnapshot = {
      ...seatPlayedCardsRef.current,
      [seatId]: card,
    };

    seatPlayedCardsRef.current = nextSnapshot;
    setSeatPlayedCards(nextSnapshot);
    setLatestPlayedSeatId(seatId);
  }, []);

  const commitResolvedSeatPlayedCards = useCallback((round: MatchStateRoundPayload | null) => {
    const snapshot = buildSeatPlayedCardsSnapshot(round, seatPlayedCardsRef.current);

    if (!hasSeatPlayedCards(snapshot)) {
      return;
    }

    setResolvedSeatPlayedCards(snapshot);
    seatPlayedCardsRef.current = {};
    setSeatPlayedCards({});
  }, []);

  const shouldBlockRealtimeResolution = useCallback(() => {
    const currentVisualBeat = visualBeatRef.current;

    return (
      isDeferringVisualCommitRef.current ||
      currentVisualBeat === 'hand_intro' ||
      currentVisualBeat === 'hand_result_hold' ||
      currentVisualBeat === 'hand_reset'
    );
  }, []);

  const [isStartHandPending, setIsStartHandPending] = useState(false);
  const startHandLockRef = useRef(false);
  const latestVisualPublicHandRef = useRef<MatchStatePayload['currentHand'] | null>(null);
  const latestAuthoritativePublicHandRef = useRef<MatchStatePayload['currentHand'] | null>(null);
  const latestAuthoritativePrivateHandRef = useRef<MatchStatePayload['currentHand'] | null>(null);

  const clearBufferedCardReplayTimers = useCallback(() => {
    bufferedCardReplayTimeoutsRef.current.forEach((timeoutId) => {
      window.clearTimeout(timeoutId);
    });
    bufferedCardReplayLandingGuardTimeoutsRef.current.forEach((timeoutId) => {
      window.clearTimeout(timeoutId);
    });
    bufferedSeatReplayUnlockTimeoutsRef.current.forEach((timeoutId) => {
      window.clearTimeout(timeoutId);
    });
    bufferedCardReplayTimeoutsRef.current = [];
    bufferedCardReplayLandingGuardTimeoutsRef.current = [];
    bufferedSeatReplayUnlockTimeoutsRef.current = [];
    setBufferedSeatReplayVersion((version) => version + 1);
  }, []);

  const clearBufferedSeatReplayLocks = useCallback(() => {
    bufferedSeatReplayLocksRef.current = {};
    setBufferedSeatReplayVersion((version) => version + 1);
  }, []);

  const scheduleBufferedSeatReplayUnlock = useCallback(
    ({
      seatId,
      card,
      delayMs = BUFFERED_CARD_REPLAY_HAND_SYNC_RELEASE_MS,
    }: {
      seatId: string | null;
      card: string | null;
      delayMs?: number;
    }) => {
      if (!seatId || !isVisiblePlayedCard(card)) {
        return;
      }

      const timeoutId = window.setTimeout(() => {
        bufferedSeatReplayUnlockTimeoutsRef.current =
          bufferedSeatReplayUnlockTimeoutsRef.current.filter(
            (currentTimeoutId) => currentTimeoutId !== timeoutId,
          );

        if (bufferedSeatReplayLocksRef.current[seatId] !== card) {
          setBufferedSeatReplayVersion((version) => version + 1);
          return;
        }

        const remainingLocks = { ...bufferedSeatReplayLocksRef.current };
        delete remainingLocks[seatId];
        bufferedSeatReplayLocksRef.current = remainingLocks;
        setBufferedSeatReplayVersion((version) => version + 1);
      }, delayMs);

      bufferedSeatReplayUnlockTimeoutsRef.current.push(timeoutId);
      setBufferedSeatReplayVersion((version) => version + 1);
    },
    [],
  );

  const bufferIncomingCardForReplay = useCallback(
    ({
      owner,
      card,
      seatId,
    }: {
      owner: 'mine' | 'opponent' | null;
      card: string | null;
      seatId: string | null;
    }) => {
      if (!owner || !card) {
        return;
      }

      bufferedCardsDuringIntroRef.current.push({ owner, card, seatId });

      if (seatId && isVisiblePlayedCard(card)) {
        bufferedSeatReplayLocksRef.current = {
          ...bufferedSeatReplayLocksRef.current,
          [seatId]: card,
        };
        setBufferedSeatReplayVersion((version) => version + 1);
      }
    },
    [],
  );

  const drainNextBetFeedback = useCallback(() => {
    if (betFeedbackQueueRef.current.length === 0) {
      setBetFeedback(null);
      return;
    }

    const nextFeedback = betFeedbackQueueRef.current.shift() ?? null;

    if (!nextFeedback) {
      setBetFeedback(null);
      return;
    }

    setBetFeedback(nextFeedback);

    if (nextFeedback.kind === 'requested') {
      lastRequestedFeedbackAtRef.current = Date.now();
    }

    if (betFeedbackTimeoutRef.current !== null) {
      window.clearTimeout(betFeedbackTimeoutRef.current);
    }

    betFeedbackTimeoutRef.current = window.setTimeout(() => {
      betFeedbackTimeoutRef.current = null;
      setBetFeedback(null);
      drainNextBetFeedback();
    }, BET_FEEDBACK_HOLD_MS);
  }, [visualBeat]);

  const enqueueBetFeedback = useCallback(
    (nextFeedback: Omit<BetFeedbackState, 'id'>) => {
      const payload: BetFeedbackState = {
        id: Date.now() + Math.floor(Math.random() * 1000),
        ...nextFeedback,
      };

      const activeRequestedAge =
        betFeedback?.kind === 'requested' && lastRequestedFeedbackAtRef.current !== null
          ? Date.now() - lastRequestedFeedbackAtRef.current
          : null;

      const shouldRespectRequestedMinimum =
        betFeedback?.kind === 'requested' &&
        payload.kind !== 'requested' &&
        activeRequestedAge !== null &&
        activeRequestedAge < BET_FEEDBACK_MIN_REQUESTED_MS;

      if (shouldRespectRequestedMinimum) {
        const remaining = BET_FEEDBACK_MIN_REQUESTED_MS - activeRequestedAge;

        if (betFeedbackTimeoutRef.current !== null) {
          window.clearTimeout(betFeedbackTimeoutRef.current);
        }

        betFeedbackTimeoutRef.current = window.setTimeout(() => {
          betFeedbackTimeoutRef.current = null;
          betFeedbackQueueRef.current.push(payload);
          setBetFeedback(null);
          drainNextBetFeedback();
        }, remaining);

        return;
      }

      betFeedbackQueueRef.current.push(payload);

      if (!betFeedback) {
        drainNextBetFeedback();
      }
    },
    [betFeedback, drainNextBetFeedback],
  );

  const tryFlushPendingRealtimeResolution = useCallback(
    (hand: MatchStatePayload['currentHand'] | null) => {
      const pending = pendingRealtimeResolutionRef.current;

      if (!pending || !hand) {
        return;
      }

      if (shouldBlockRealtimeResolution()) {
        debugMatchPage('pendingRealtimeResolution:discarded-visual-transition', {
          pending,
          visualBeat: visualBeatRef.current,
          isDeferringVisualCommit: isDeferringVisualCommitRef.current,
        });
        pendingRealtimeResolutionRef.current = null;

        if (pendingRealtimeResolutionTimeoutRef.current !== null) {
          window.clearTimeout(pendingRealtimeResolutionTimeoutRef.current);
          pendingRealtimeResolutionTimeoutRef.current = null;
        }

        return;
      }

      const rounds = hand.rounds ?? [];
      const finishedRoundIndex = Math.max(0, pending.finishedRoundsCount - 1);
      const finishedRound = rounds[finishedRoundIndex] ?? null;

      if (!finishedRound) {
        return;
      }

      pendingRealtimeResolutionRef.current = null;
      pendingDeferredNextHandStateRef.current = null;
      pendingPostBufferedReplayStateRef.current = null;

      if (pendingRealtimeResolutionTimeoutRef.current !== null) {
        window.clearTimeout(pendingRealtimeResolutionTimeoutRef.current);
        pendingRealtimeResolutionTimeoutRef.current = null;
      }

      const myCard =
        pending.myPlayerId === 'P1' ? finishedRound.playerOneCard : finishedRound.playerTwoCard;
      const opponentCard =
        pending.myPlayerId === 'P1' ? finishedRound.playerTwoCard : finishedRound.playerOneCard;

      commitResolvedSeatPlayedCards(finishedRound);

      triggerRoundResolutionRef.current({
        resolutionKey: pending.resolutionKey,
        myCard,
        opponentCard,
        roundResult: finishedRound.result ?? pending.roundWinner ?? null,
      });
    },
    [commitResolvedSeatPlayedCards, shouldBlockRealtimeResolution],
  );

  const handleRealtimeHandStarted = useCallback(
    (payload: { matchId?: string; viraRank?: Rank | null; viraCard?: string | null }) => {
      debugMatchPage('onHandStarted', {
        payload,
        previousVisualBeat: visualBeat,
        isDeferringVisualCommit: isDeferringVisualCommitRef.current,
        pendingAutoNextHandKey: pendingAutoNextHandKeyRef.current,
        lastAutoNextHandKey: lastAutoNextHandKeyRef.current,
        autoNextTimeoutPending: autoNextHandTimeoutRef.current !== null,
      });

      if (payload.viraRank) {
        const rawViraCard = payload.viraCard ?? null;
        const revealedCard = rawViraCard ? cardStringToPayload(rawViraCard) : null;
        const revealMatchId = payload.matchId ?? effectiveMatchId;

        setViraRank(payload.viraRank);

        if (rawViraCard && revealedCard) {
          const revealKey = ['opening-vira', revealMatchId, rawViraCard, Date.now()].join('|');

          pendingOpeningViraRevealRef.current = null;
          setLastKnownViraCard(rawViraCard);
          setOpeningViraReveal({
            key: revealKey,
            card: revealedCard,
            rawCard: rawViraCard,
          });
          scheduleOpeningViraSounds();
        } else {
          pendingOpeningViraRevealRef.current = {
            matchId: revealMatchId,
            viraRank: payload.viraRank,
            requestedAt: Date.now(),
          };
          setLastKnownViraCard(null);
          setOpeningViraReveal(null);
          clearOpeningViraSoundTimers();

          debugMatchPage('openingViraReveal:waiting-for-vira-card', {
            matchId: revealMatchId,
            viraRank: payload.viraRank,
            rawViraCard,
          });
        }
      } else {
        pendingOpeningViraRevealRef.current = null;
        setOpeningViraReveal(null);
        setLastKnownViraCard(null);
        clearOpeningViraSoundTimers();
      }

      if (autoNextHandTimeoutRef.current !== null) {
        window.clearTimeout(autoNextHandTimeoutRef.current);
        autoNextHandTimeoutRef.current = null;
      }

      pendingRealtimeResolutionRef.current = null;

      if (pendingRealtimeResolutionTimeoutRef.current !== null) {
        window.clearTimeout(pendingRealtimeResolutionTimeoutRef.current);
        pendingRealtimeResolutionTimeoutRef.current = null;
      }

      pendingAutoNextHandKeyRef.current = null;
      lastAutoNextHandKeyRef.current = null;
      lastAutoNextHandWaitLogKeyRef.current = null;
      pendingNextRoundSeatSnapshotClearRef.current = false;

      if (pendingNextRoundSeatSnapshotClearTimeoutRef.current !== null) {
        window.clearTimeout(pendingNextRoundSeatSnapshotClearTimeoutRef.current);
        pendingNextRoundSeatSnapshotClearTimeoutRef.current = null;
      }

      lastHandStartedAtRef.current = Date.now();
      startHandLockRef.current = true;
      setIsStartHandPending(false);
      setIsAutoNextHandArmed(false);
      setVisualBeat('hand_intro');
      clearBufferedCardReplayTimers();
      clearBufferedSeatReplayLocks();
      bufferedCardsDuringIntroRef.current = [];
      clearSeatPlayedCardsSnapshot();
      clearSeatCardConsumptionCounts();
      setResolvedSeatPlayedCards({});
      setFrozenSeatPlayedCards({});
      pendingBetCycleRef.current = null;
      pendingMaoDeOnzeCycleRef.current = null;
      localMaoDeOnzeDeclineIntentRef.current = null;
      lastMaoDeOnzeOpeningBannerKeyRef.current = null;
      setDeclinedHandResultSkipKey(null);
      setLastPartnerSignal(null);
      setLastSentPartnerSignal(null);
    },
    [
      clearBufferedCardReplayTimers,
      clearBufferedSeatReplayLocks,
      clearSeatCardConsumptionCounts,
      clearSeatPlayedCardsSnapshot,
      clearOpeningViraSoundTimers,
      effectiveMatchId,
      scheduleOpeningViraSounds,
      visualBeat,
    ],
  );

  const handleRealtimeCardPlayed = useCallback(
    (payload: {
      matchId?: string;
      playerId?: string | null;
      seatId?: string | null;
      card?: string | null;
    }) => {
      const owner = resolvePlayedCardOwner({
        payloadPlayerId: payload.playerId ?? null,
        payloadSeatId: payload.seatId ?? null,
        mySeat: mySeatRef.current,
      });

      const card = payload.card ?? null;
      const seatId = payload.seatId ?? null;
      const currentVisualBeat = visualBeatRef.current;

      const isBufferedReplayInProgress =
        bufferedCardsDuringIntroRef.current.length > 0 ||
        bufferedCardReplayTimeoutsRef.current.length > 0 ||
        bufferedCardReplayLandingGuardTimeoutsRef.current.length > 0;
      const shouldBufferIncomingCard =
        isDeferringVisualCommitRef.current ||
        currentVisualBeat === 'hand_intro' ||
        isRoundResolutionVisualHoldActiveRef.current ||
        isBufferedReplayInProgress;

      debugMatchPage('onCardPlayed', {
        payload,
        owner,
        card,
        seatId,
        visualBeat: currentVisualBeat,
        isDeferringVisualCommit: isDeferringVisualCommitRef.current,
        isRoundResolutionVisualHoldActive: isRoundResolutionVisualHoldActiveRef.current,
        isBufferedReplayInProgress,
        willBuffer: shouldBufferIncomingCard,
      });

      if (shouldBufferIncomingCard) {
        bufferIncomingCardForReplay({ owner, card, seatId });
        return;
      }

      if (seatId && isVisiblePlayedCard(card)) {
        bufferedSeatReplayLocksRef.current = {
          ...bufferedSeatReplayLocksRef.current,
          [seatId]: card,
        };
        setBufferedSeatReplayVersion((version) => version + 1);
        scheduleBufferedSeatReplayUnlock({ seatId, card });
      }

      recordSeatCardConsumption(seatId, card);
      recordSeatPlayedCardSnapshot(seatId, card);

      debugMatchPage('onCardPlayed:registerIncomingPlayedCard', {
        owner,
        card,
        seatId,
      });

      registerIncomingPlayedCardRef.current({
        owner,
        card,
      });
    },
    [
      bufferIncomingCardForReplay,
      recordSeatCardConsumption,
      recordSeatPlayedCardSnapshot,
      scheduleBufferedSeatReplayUnlock,
    ],
  );

  const handleRealtimeRoundTransition = useCallback(
    (payload: RoundTransitionPayload) => {
      debugMatchPage('onRoundTransition', {
        payload,
        mySeat: mySeatRef.current,
        visualBeat: visualBeatRef.current,
        visualPublicHandRounds: latestVisualPublicHandRef.current?.rounds.length ?? 0,
        isDeferringVisualCommit: isDeferringVisualCommitRef.current,
      });

      if (payload.phase === 'next-round-opened') {
        pendingNextRoundSeatSnapshotClearRef.current = true;

        if (pendingNextRoundSeatSnapshotClearTimeoutRef.current !== null) {
          window.clearTimeout(pendingNextRoundSeatSnapshotClearTimeoutRef.current);
        }

        // Defer cleanup until the resolution hold releases so card counters do not race the landing animation.
        pendingNextRoundSeatSnapshotClearTimeoutRef.current = window.setTimeout(() => {
          pendingNextRoundSeatSnapshotClearTimeoutRef.current = null;

          if (
            !pendingNextRoundSeatSnapshotClearRef.current ||
            isRoundResolutionVisualHoldActiveRef.current
          ) {
            return;
          }

          pendingNextRoundSeatSnapshotClearRef.current = false;
          clearSeatPlayedCardsSnapshot();
        }, 1800);

        debugMatchPage('nextRoundOpened:defer-seat-snapshot-clear', {
          finishedRoundsCount: payload.finishedRoundsCount,
          totalRoundsCount: payload.totalRoundsCount,
          handContinues: payload.handContinues,
          visualBeat: visualBeatRef.current,
          isRoundResolutionVisualHoldActive: isRoundResolutionVisualHoldActiveRef.current,
        });

        return;
      }

      if (payload.phase !== 'round-resolved') {
        return;
      }

      if (shouldBlockRealtimeResolution()) {
        debugMatchPage('onRoundTransition:ignored-visual-transition', {
          payload,
          visualBeat: visualBeatRef.current,
          isDeferringVisualCommit: isDeferringVisualCommitRef.current,
        });
        return;
      }

      const mySeat = mySeatRef.current;
      const myPlayerId = mapSeatToPlayerId(mySeat);

      if (!myPlayerId) {
        return;
      }

      const resolutionKey = [
        payload.matchId ?? 'unknown-match',
        payload.phase,
        payload.finishedRoundsCount,
        payload.roundWinner ?? 'null',
      ].join('|');

      const finishedRoundIndex = Math.max(0, payload.finishedRoundsCount - 1);
      const handCandidates = [
        latestAuthoritativePrivateHandRef.current,
        latestAuthoritativePublicHandRef.current,
        latestVisualPublicHandRef.current,
      ];
      const finishedRound =
        handCandidates
          .map((hand) => hand?.rounds?.[finishedRoundIndex] ?? null)
          .find(
            (round) =>
              round !== null &&
              (round.finished ||
                round.result !== null ||
                round.playerOneCard !== null ||
                round.playerTwoCard !== null),
          ) ?? null;

      if (finishedRound) {
        const myCard =
          myPlayerId === 'P1' ? finishedRound.playerOneCard : finishedRound.playerTwoCard;
        const opponentCard =
          myPlayerId === 'P1' ? finishedRound.playerTwoCard : finishedRound.playerOneCard;

        debugMatchPage('onRoundTransition:triggerRoundResolution', {
          resolutionKey,
          myCard,
          opponentCard,
          roundResult: finishedRound.result ?? payload.roundWinner ?? null,
        });

        commitResolvedSeatPlayedCards(finishedRound);

        triggerRoundResolutionRef.current({
          resolutionKey,
          myCard,
          opponentCard,
          roundResult: finishedRound.result ?? payload.roundWinner ?? null,
        });

        return;
      }

      debugMatchPage('onRoundTransition:pendingRealtimeResolution', {
        resolutionKey,
        finishedRoundsCount: payload.finishedRoundsCount,
        roundWinner: payload.roundWinner ?? null,
        graceMs: REALTIME_RESOLUTION_GRACE_MS,
      });

      pendingRealtimeResolutionRef.current = {
        resolutionKey,
        finishedRoundsCount: payload.finishedRoundsCount,
        myPlayerId,
        roundWinner: payload.roundWinner ?? null,
      };

      if (pendingRealtimeResolutionTimeoutRef.current !== null) {
        window.clearTimeout(pendingRealtimeResolutionTimeoutRef.current);
      }

      pendingRealtimeResolutionTimeoutRef.current = window.setTimeout(() => {
        pendingRealtimeResolutionTimeoutRef.current = null;
        pendingRealtimeResolutionRef.current = null;
      }, REALTIME_RESOLUTION_GRACE_MS);
    },
    [clearSeatPlayedCardsSnapshot, commitResolvedSeatPlayedCards, shouldBlockRealtimeResolution],
  );

  const handleRealtimePartnerSignal = useCallback((payload: PartnerSignalPayload) => {
    setLastPartnerSignal(payload);
  }, []);

  const handleRealtimePartnerSignalDebug = useCallback((payload: PartnerSignalDebugPayload) => {
    if (shouldLogMatchPageDebug()) {
      console.info('[PARTNER_SIGNAL]', buildPartnerSignalDebugConsolePayload(payload));
    }
  }, []);

  const handleRealtimePartnerBetProposal = useCallback((payload: PartnerBetProposalPayload) => {
    setPendingPartnerBetProposal(payload);

    if (shouldLogMatchPageDebug()) {
      console.info('[PARTNER_BET_PROPOSAL]', payload);
    }
  }, []);

  const handleRealtimePartnerBetProposalResolved = useCallback(
    (payload: PartnerBetProposalResolvedPayload) => {
      setPendingPartnerBetProposal((current) =>
        current?.proposalId === payload.proposalId ? null : current,
      );

      if (shouldLogMatchPageDebug()) {
        console.info('[PARTNER_BET_PROPOSAL]', { phase: 'resolved', ...payload });
      }
    },
    [],
  );

  const handleRealtimeBotDecision = useCallback((decision: BotDecisionTelemetryPayload) => {
    const logKey = buildBotDecisionLogKey(decision);

    if (lastBotDecisionLogKeyRef.current === logKey) {
      return;
    }

    lastBotDecisionLogKeyRef.current = logKey;

    if (shouldLogMatchPageDebug()) {
      console.info('[BOT_DECISION]', buildBotDecisionConsolePayload(decision));
    }
  }, []);

  useEffect(() => {
    if (!lastPartnerSignal) {
      return undefined;
    }

    const expiresAt = Date.parse(lastPartnerSignal.expiresAt);
    const delayMs = Number.isFinite(expiresAt) ? Math.max(0, expiresAt - Date.now()) : 9000;
    const timeoutId = window.setTimeout(() => {
      setLastPartnerSignal(null);
    }, delayMs);

    return () => window.clearTimeout(timeoutId);
  }, [lastPartnerSignal]);

  useEffect(() => {
    if (!pendingPartnerBetProposal) {
      return undefined;
    }

    const expiresAt = Date.parse(pendingPartnerBetProposal.expiresAt);
    const delayMs = Number.isFinite(expiresAt) ? Math.max(0, expiresAt - Date.now()) : 9000;
    const timeoutId = window.setTimeout(() => {
      setPendingPartnerBetProposal(null);
    }, delayMs);

    return () => window.clearTimeout(timeoutId);
  }, [pendingPartnerBetProposal]);

  useEffect(() => {
    if (!recentApprovedPartnerBetProposal) {
      return undefined;
    }

    // NOTE: The authoritative match snapshot only identifies the betting team
    // as P1/P2. Keep the approved partner proposal briefly so the drama copy
    // can distinguish "Você pediu" from "Seu parceiro pediu".
    const timeoutId = window.setTimeout(() => {
      setRecentApprovedPartnerBetProposal(null);
    }, BET_FEEDBACK_HOLD_MS + 1600);

    return () => window.clearTimeout(timeoutId);
  }, [recentApprovedPartnerBetProposal]);

  useEffect(() => {
    if (!lastSentPartnerSignal) {
      return undefined;
    }

    const expiresAt = Date.parse(lastSentPartnerSignal.expiresAt);
    const delayMs = Number.isFinite(expiresAt) ? Math.max(0, expiresAt - Date.now()) : 4500;
    const timeoutId = window.setTimeout(() => {
      setLastSentPartnerSignal(null);
    }, delayMs);

    return () => window.clearTimeout(timeoutId);
  }, [lastSentPartnerSignal]);

  const {
    initialSnapshot,
    connectionStatus,
    roomState,
    publicMatchState,
    privateMatchState,
    playerAssigned,
    eventLog,
    appendLog,
    emitGetState,
    emitStartHand,
    emitPlayCard,
    emitRequestTruco,
    emitAcceptBet,
    emitDeclineBet,
    emitRaiseToSix,
    emitRaiseToNine,
    emitRaiseToTwelve,
    emitApprovePartnerBetProposal,
    emitRejectPartnerBetProposal,
    emitAcceptMaoDeOnze,
    emitDeclineMaoDeOnze,
    emitSendPartnerSignal,
  } = useMatchRealtimeSession({
    session,
    effectiveMatchId,
    onHandStarted: handleRealtimeHandStarted,
    onCardPlayed: handleRealtimeCardPlayed,
    onRoundTransition: handleRealtimeRoundTransition,
    onPartnerSignal: handleRealtimePartnerSignal,
    onPartnerSignalDebug: handleRealtimePartnerSignalDebug,
    onPartnerBetProposal: handleRealtimePartnerBetProposal,
    onPartnerBetProposalResolved: handleRealtimePartnerBetProposalResolved,
    onBotDecision: handleRealtimeBotDecision,
    onServerError: () => {
      setIsStartHandPending(false);

      const authoritativeHandInProgress = Boolean(
        publicMatchState?.state === 'in_progress' &&
        publicMatchState.currentHand &&
        !publicMatchState.currentHand.finished,
      );

      if (!authoritativeHandInProgress) {
        startHandLockRef.current = false;
      }
    },
  });

  const handleSendPartnerSignal = useCallback(
    (kind: PartnerSignalKind) => {
      if (!effectiveMatchId) {
        return;
      }

      const createdAt = Date.now();

      if (shouldLogMatchPageDebug()) {
        console.info('[PARTNER_SIGNAL]', {
          phase: 'sent',
          source: 'frontend-local',
          matchId: effectiveMatchId,
          kind,
          label: resolvePartnerSignalFeedbackLabel(kind),
          occurredAt: new Date(createdAt).toISOString(),
        });
      }

      emitSendPartnerSignal(effectiveMatchId, kind);
      setLastSentPartnerSignal({
        id: `${effectiveMatchId}:${kind}:${createdAt}`,
        label: resolvePartnerSignalFeedbackLabel(kind),
        expiresAt: new Date(createdAt + 4500).toISOString(),
      });
      appendLog(`Emitted send-partner-signal (${kind}).`);
    },
    [appendLog, effectiveMatchId, emitSendPartnerSignal],
  );

  useEffect(() => {
    const pendingReveal = pendingOpeningViraRevealRef.current;

    if (!pendingReveal) {
      return;
    }

    const authoritativeHand = privateMatchState?.currentHand ?? publicMatchState?.currentHand;
    const rawViraCard = authoritativeHand?.viraCard ?? null;
    const revealedCard = rawViraCard ? cardStringToPayload(rawViraCard) : null;

    if (!rawViraCard || !revealedCard) {
      return;
    }

    if (authoritativeHand?.viraRank && authoritativeHand.viraRank !== pendingReveal.viraRank) {
      return;
    }

    const revealKey = [
      'opening-vira',
      pendingReveal.matchId,
      rawViraCard,
      pendingReveal.requestedAt,
    ].join('|');

    pendingOpeningViraRevealRef.current = null;
    setViraRank(revealedCard.rank);
    setLastKnownViraCard(rawViraCard);
    setOpeningViraReveal({
      key: revealKey,
      card: revealedCard,
      rawCard: rawViraCard,
    });
    scheduleOpeningViraSounds();

    debugMatchPage('openingViraReveal:resolved-from-match-state', {
      revealKey,
      rawViraCard,
      viraRank: revealedCard.rank,
    });
  }, [privateMatchState, publicMatchState, scheduleOpeningViraSounds]);

  const [visualRoomState, setVisualRoomState] = useState<RoomStatePayload | null>(
    roomState ?? initialSnapshot?.roomState ?? null,
  );
  const [visualPublicMatchState, setVisualPublicMatchState] = useState<MatchStatePayload | null>(
    publicMatchState ?? initialSnapshot?.publicMatchState ?? null,
  );
  const [visualPrivateMatchState, setVisualPrivateMatchState] = useState<MatchStatePayload | null>(
    privateMatchState ?? initialSnapshot?.privateMatchState ?? null,
  );

  useEffect(() => {
    latestAuthoritativePublicHandRef.current = publicMatchState?.currentHand ?? null;
    latestAuthoritativePrivateHandRef.current = privateMatchState?.currentHand ?? null;

    tryFlushPendingRealtimeResolution(
      privateMatchState?.currentHand ??
        publicMatchState?.currentHand ??
        latestVisualPublicHandRef.current,
    );
  }, [privateMatchState, publicMatchState, tryFlushPendingRealtimeResolution]);

  useEffect(() => {
    const hand = visualPublicMatchState?.currentHand ?? null;
    latestVisualPublicHandRef.current = hand;
    tryFlushPendingRealtimeResolution(
      latestAuthoritativePrivateHandRef.current ?? latestAuthoritativePublicHandRef.current ?? hand,
    );
  }, [visualPublicMatchState, tryFlushPendingRealtimeResolution]);

  useEffect(() => {
    mySeatRef.current = playerAssigned?.seatId ?? initialSnapshot?.playerAssigned?.seatId ?? null;
  }, [initialSnapshot?.playerAssigned?.seatId, playerAssigned]);

  const flushPostBufferedReplayState = useCallback(() => {
    const pendingState = pendingPostBufferedReplayStateRef.current;

    if (!pendingState) {
      return;
    }

    pendingPostBufferedReplayStateRef.current = null;

    debugMatchPage('visualCommit:flush-post-buffered-replay', {
      pendingPublic: summarizeMatchStateForDebug(pendingState.publicMatchState),
      pendingPrivate: summarizeMatchStateForDebug(pendingState.privateMatchState),
      pendingRoom: summarizeRoomStateForDebug(pendingState.roomState),
    });

    setVisualRoomState(pendingState.roomState);
    setVisualPublicMatchState(pendingState.publicMatchState);
    setVisualPrivateMatchState(pendingState.privateMatchState);
    setVisualBeat(
      isFreshPlayableHandState({
        publicMatchState: pendingState.publicMatchState,
        privateMatchState: pendingState.privateMatchState,
      })
        ? 'live'
        : 'idle',
    );
  }, []);

  const drainBufferedCards = useCallback(() => {
    const buffered = [...bufferedCardsDuringIntroRef.current];

    debugMatchPage('drainBufferedCards', {
      count: buffered.length,
      buffered,
      visualBeat,
      isDeferringVisualCommit: isDeferringVisualCommitRef.current,
    });

    clearBufferedCardReplayTimers();
    bufferedCardsDuringIntroRef.current = [];

    if (buffered.length === 0) {
      flushPostBufferedReplayState();
      return;
    }

    const bufferedSeatLocks = buffered.reduce<Record<string, string>>((locks, entry) => {
      if (entry.seatId && isVisiblePlayedCard(entry.card)) {
        locks[entry.seatId] = entry.card;
      }

      return locks;
    }, {});

    bufferedSeatReplayLocksRef.current = bufferedSeatLocks;
    setBufferedSeatReplayVersion((version) => version + 1);

    buffered.forEach(({ owner, card, seatId }, index) => {
      const delayMs = BUFFERED_CARD_REPLAY_FIRST_DELAY_MS + index * BUFFERED_CARD_REPLAY_STEP_MS;

      const timeoutId = window.setTimeout(() => {
        bufferedCardReplayTimeoutsRef.current = bufferedCardReplayTimeoutsRef.current.filter(
          (currentTimeoutId) => currentTimeoutId !== timeoutId,
        );
        setBufferedSeatReplayVersion((version) => version + 1);

        debugMatchPage('drainBufferedCards:replay-card', {
          owner,
          card,
          seatId,
          delayMs,
          index,
        });

        recordSeatCardConsumption(seatId, card);
        recordSeatPlayedCardSnapshot(seatId, card);
        registerIncomingPlayedCardRef.current({ owner, card });

        scheduleBufferedSeatReplayUnlock({ seatId, card });

        const landingGuardTimeoutId = window.setTimeout(() => {
          bufferedCardReplayLandingGuardTimeoutsRef.current =
            bufferedCardReplayLandingGuardTimeoutsRef.current.filter(
              (currentTimeoutId) => currentTimeoutId !== landingGuardTimeoutId,
            );
          setBufferedSeatReplayVersion((version) => version + 1);

          const shouldFlushPostBufferedReplayState = Boolean(
            bufferedCardReplayTimeoutsRef.current.length === 0 &&
            bufferedCardReplayLandingGuardTimeoutsRef.current.length === 0 &&
            bufferedCardsDuringIntroRef.current.length === 0 &&
            !isDeferringVisualCommitRef.current &&
            pendingPostBufferedReplayStateRef.current !== null,
          );

          if (shouldFlushPostBufferedReplayState) {
            flushPostBufferedReplayState();
            return;
          }

          const shouldDrainChainedBufferedCards =
            bufferedCardReplayTimeoutsRef.current.length === 0 &&
            bufferedCardReplayLandingGuardTimeoutsRef.current.length === 0 &&
            bufferedCardsDuringIntroRef.current.length > 0 &&
            !isDeferringVisualCommitRef.current &&
            !isRoundResolutionVisualHoldActiveRef.current &&
            visualBeatRef.current !== 'hand_intro' &&
            visualBeatRef.current !== 'hand_result_hold';

          if (shouldDrainChainedBufferedCards) {
            debugMatchPage('drainBufferedCards:chain-next-batch', {
              count: bufferedCardsDuringIntroRef.current.length,
              visualBeat: visualBeatRef.current,
            });

            drainBufferedCardsRef.current();
          }
        }, BUFFERED_CARD_REPLAY_LANDING_GUARD_MS);

        bufferedCardReplayLandingGuardTimeoutsRef.current.push(landingGuardTimeoutId);
        setBufferedSeatReplayVersion((version) => version + 1);
      }, delayMs);

      bufferedCardReplayTimeoutsRef.current.push(timeoutId);
      setBufferedSeatReplayVersion((version) => version + 1);
    });
  }, [
    clearBufferedCardReplayTimers,
    flushPostBufferedReplayState,
    recordSeatCardConsumption,
    recordSeatPlayedCardSnapshot,
    scheduleBufferedSeatReplayUnlock,
    visualBeat,
  ]);

  useEffect(() => {
    drainBufferedCardsRef.current = drainBufferedCards;
  }, [drainBufferedCards]);

  useEffect(() => {
    const displayedHandFinished = isResolvedHandFinished({
      publicMatchState: visualPublicMatchState,
      privateMatchState: visualPrivateMatchState,
    });

    const incomingFreshPlayableHand = isFreshPlayableHandState({
      publicMatchState,
      privateMatchState,
    });

    const shouldDeferNextHandCommit = displayedHandFinished && incomingFreshPlayableHand;
    const incomingBetResponseState = isBetResponseState({
      publicMatchState,
      privateMatchState,
    });
    const hasBufferedReplayWork = Boolean(
      bufferedCardsDuringIntroRef.current.length > 0 ||
      bufferedCardReplayTimeoutsRef.current.length > 0 ||
      bufferedCardReplayLandingGuardTimeoutsRef.current.length > 0,
    );

    debugMatchPage('visualCommit:evaluate', {
      displayedHandFinished,
      incomingFreshPlayableHand,
      currentVisualBeat: visualBeat,
      publicIncoming: summarizeMatchStateForDebug(publicMatchState ?? null),
      privateIncoming: summarizeMatchStateForDebug(privateMatchState ?? null),
      publicVisual: summarizeMatchStateForDebug(visualPublicMatchState),
      privateVisual: summarizeMatchStateForDebug(visualPrivateMatchState),
      roomIncoming: summarizeRoomStateForDebug(roomState ?? null),
      isDeferringVisualCommit: isDeferringVisualCommitRef.current,
    });

    const isFreshOpeningHand =
      !displayedHandFinished &&
      incomingFreshPlayableHand &&
      visualPublicMatchState?.state !== 'in_progress' &&
      visualPrivateMatchState?.state !== 'in_progress' &&
      lastHandStartedAtRef.current !== null;

    if (incomingBetResponseState && (isDeferringVisualCommitRef.current || hasBufferedReplayWork)) {
      const pendingState: PendingVisualState = {
        roomState: roomState ?? null,
        publicMatchState: publicMatchState ?? null,
        privateMatchState: privateMatchState ?? null,
      };

      pendingPostBufferedReplayStateRef.current = pendingState;

      debugMatchPage('visualCommit:hold-bet-response-until-buffered-replay', {
        currentVisualBeat: visualBeat,
        hasBufferedReplayWork,
        isDeferringVisualCommit: isDeferringVisualCommitRef.current,
        pendingPublic: summarizeMatchStateForDebug(pendingState.publicMatchState),
        pendingPrivate: summarizeMatchStateForDebug(pendingState.privateMatchState),
        pendingRoom: summarizeRoomStateForDebug(pendingState.roomState),
      });

      return;
    }

    if (shouldDeferNextHandCommit) {
      debugMatchPage('visualCommit:defer-next-hand', {
        delayMs: HAND_RESULT_HOLD_MS + NEXT_HAND_COMMIT_MS,
        previousVisualBeat: visualBeat,
        pendingPublic: summarizeMatchStateForDebug(publicMatchState ?? null),
        pendingPrivate: summarizeMatchStateForDebug(privateMatchState ?? null),
        pendingRoom: summarizeRoomStateForDebug(roomState ?? null),
      });

      isDeferringVisualCommitRef.current = true;
      setVisualBeat('hand_result_hold');

      const pendingState: PendingVisualState = {
        roomState: roomState ?? null,
        publicMatchState: publicMatchState ?? null,
        privateMatchState: privateMatchState ?? null,
      };

      pendingDeferredNextHandStateRef.current = pendingState;

      if (deferredNextHandTimeoutRef.current !== null) {
        return;
      }

      deferredNextHandTimeoutRef.current = window.setTimeout(() => {
        const latestPendingState = pendingDeferredNextHandStateRef.current ?? pendingState;

        debugMatchPage('visualCommit:flush-deferred-next-hand', {
          pendingPublic: summarizeMatchStateForDebug(latestPendingState.publicMatchState),
          pendingPrivate: summarizeMatchStateForDebug(latestPendingState.privateMatchState),
          pendingRoom: summarizeRoomStateForDebug(latestPendingState.roomState),
        });

        deferredNextHandTimeoutRef.current = null;
        pendingDeferredNextHandStateRef.current = null;

        beginHandTransitionRef.current();

        setVisualRoomState(latestPendingState.roomState);
        setVisualPublicMatchState(latestPendingState.publicMatchState);
        setVisualPrivateMatchState(latestPendingState.privateMatchState);
        setVisualBeat('live');
        isDeferringVisualCommitRef.current = false;

        drainBufferedCards();
      }, HAND_RESULT_HOLD_MS + NEXT_HAND_COMMIT_MS);

      return;
    }

    if (isFreshOpeningHand) {
      debugMatchPage('visualCommit:fresh-opening-hand', {
        delayMs: HAND_INTRO_WITH_VIRA_REVEAL_MS,
        previousVisualBeat: visualBeat,
        publicIncoming: summarizeMatchStateForDebug(publicMatchState ?? null),
        privateIncoming: summarizeMatchStateForDebug(privateMatchState ?? null),
        roomIncoming: summarizeRoomStateForDebug(roomState ?? null),
      });

      if (handIntroTimeoutRef.current !== null) {
        return;
      }

      isDeferringVisualCommitRef.current = true;
      setVisualBeat('hand_intro');

      const pendingState: PendingVisualState = {
        roomState: roomState ?? null,
        publicMatchState: publicMatchState ?? null,
        privateMatchState: privateMatchState ?? null,
      };

      handIntroTimeoutRef.current = window.setTimeout(() => {
        debugMatchPage('visualCommit:flush-hand-intro', {
          pendingPublic: summarizeMatchStateForDebug(pendingState.publicMatchState),
          pendingPrivate: summarizeMatchStateForDebug(pendingState.privateMatchState),
          pendingRoom: summarizeRoomStateForDebug(pendingState.roomState),
        });

        handIntroTimeoutRef.current = null;
        lastHandStartedAtRef.current = null;

        beginHandTransitionRef.current();

        setVisualRoomState(pendingState.roomState);
        setVisualPublicMatchState(pendingState.publicMatchState);
        setVisualPrivateMatchState(pendingState.privateMatchState);
        setOpeningViraReveal(null);
        setVisualBeat('live');
        isDeferringVisualCommitRef.current = false;

        drainBufferedCards();
      }, HAND_INTRO_WITH_VIRA_REVEAL_MS);

      return;
    }

    if (deferredNextHandTimeoutRef.current !== null) {
      window.clearTimeout(deferredNextHandTimeoutRef.current);
      deferredNextHandTimeoutRef.current = null;
      pendingDeferredNextHandStateRef.current = null;
    }

    if (handIntroTimeoutRef.current !== null) {
      window.clearTimeout(handIntroTimeoutRef.current);
      handIntroTimeoutRef.current = null;
      lastHandStartedAtRef.current = null;
    }

    debugMatchPage('visualCommit:direct-commit', {
      nextVisualBeat: incomingFreshPlayableHand ? 'live' : 'idle',
      publicIncoming: summarizeMatchStateForDebug(
        publicMatchState ?? initialSnapshot?.publicMatchState ?? null,
      ),
      privateIncoming: summarizeMatchStateForDebug(
        privateMatchState ?? initialSnapshot?.privateMatchState ?? null,
      ),
      roomIncoming: summarizeRoomStateForDebug(roomState ?? initialSnapshot?.roomState ?? null),
    });

    isDeferringVisualCommitRef.current = false;
    pendingPostBufferedReplayStateRef.current = null;
    setVisualRoomState(roomState ?? initialSnapshot?.roomState ?? null);
    setVisualPublicMatchState(publicMatchState ?? initialSnapshot?.publicMatchState ?? null);
    setVisualPrivateMatchState(privateMatchState ?? initialSnapshot?.privateMatchState ?? null);
    setVisualBeat(incomingFreshPlayableHand ? 'live' : 'idle');
  }, [
    drainBufferedCards,
    initialSnapshot?.privateMatchState,
    initialSnapshot?.publicMatchState,
    initialSnapshot?.roomState,
    privateMatchState,
    publicMatchState,
    roomState,
    visualBeat,
    visualPrivateMatchState,
    visualPublicMatchState,
  ]);

  useEffect(() => {
    return () => {
      isDeferringVisualCommitRef.current = false;
      pendingDeferredNextHandStateRef.current = null;
      pendingPostBufferedReplayStateRef.current = null;

      if (deferredNextHandTimeoutRef.current !== null) {
        window.clearTimeout(deferredNextHandTimeoutRef.current);
      }

      if (handIntroTimeoutRef.current !== null) {
        window.clearTimeout(handIntroTimeoutRef.current);
      }

      if (startHandPendingTimeoutRef.current !== null) {
        window.clearTimeout(startHandPendingTimeoutRef.current);
      }

      if (autoNextHandTimeoutRef.current !== null) {
        window.clearTimeout(autoNextHandTimeoutRef.current);
      }

      if (pendingRealtimeResolutionTimeoutRef.current !== null) {
        window.clearTimeout(pendingRealtimeResolutionTimeoutRef.current);
      }

      if (pendingNextRoundSeatSnapshotClearTimeoutRef.current !== null) {
        window.clearTimeout(pendingNextRoundSeatSnapshotClearTimeoutRef.current);
      }

      if (betFeedbackTimeoutRef.current !== null) {
        window.clearTimeout(betFeedbackTimeoutRef.current);
      }

      if (handOutcomeRevealHoldTimeoutRef.current !== null) {
        window.clearTimeout(handOutcomeRevealHoldTimeoutRef.current);
      }

      clearOpeningViraSoundTimers();

      if (openingViraFailsafeTimeoutRef.current !== null) {
        window.clearTimeout(openingViraFailsafeTimeoutRef.current);
        openingViraFailsafeTimeoutRef.current = null;
      }

      setOpeningViraReveal(null);

      pendingRealtimeResolutionRef.current = null;
      clearBufferedCardReplayTimers();
      clearBufferedSeatReplayLocks();
      clearSeatCardConsumptionCounts();
      bufferedCardsDuringIntroRef.current = [];
      betFeedbackQueueRef.current = [];
      pendingBetCycleRef.current = null;
      pendingMaoDeOnzeCycleRef.current = null;
      localMaoDeOnzeDeclineIntentRef.current = null;
      handledMaoDeOnzeDeclineKeysRef.current.clear();
      lastAutoNextHandKeyRef.current = null;
      lastAutoNextHandWaitLogKeyRef.current = null;
    };
  }, [
    clearBufferedCardReplayTimers,
    clearBufferedSeatReplayLocks,
    clearOpeningViraSoundTimers,
    clearSeatCardConsumptionCounts,
  ]);

  useEffect(() => {
    debugMatchPage('visualBeat:changed', {
      visualBeat,
      isDeferringVisualCommit: isDeferringVisualCommitRef.current,
      isAutoNextHandArmed,
      isStartHandPending,
      startHandLocked: startHandLockRef.current,
    });
  }, [isAutoNextHandArmed, isStartHandPending, visualBeat]);

  const viewModel = useMemo<MatchViewModel>(() => {
    const resolvedMatchId =
      visualPrivateMatchState?.matchId ||
      visualPublicMatchState?.matchId ||
      visualRoomState?.matchId ||
      effectiveMatchId;
    const mySeat = playerAssigned?.seatId ?? null;
    const currentPublicHand = visualPublicMatchState?.currentHand ?? null;
    const currentPrivateHand = visualPrivateMatchState?.currentHand ?? null;
    const effectiveHand = currentPrivateHand ?? currentPublicHand;
    const nextDecisionType = effectiveHand?.nextDecisionType ?? 'idle';
    const viewerCanActNow = effectiveHand?.viewerCanActNow ?? false;
    const pendingBotAction = effectiveHand?.pendingBotAction ?? false;
    const handFinished =
      nextDecisionType === 'start-next-hand' || Boolean(currentPublicHand?.finished);
    const matchFinished =
      nextDecisionType === 'match-finished' || visualPublicMatchState?.state === 'finished';

    const rawAvailableActions =
      currentPrivateHand?.availableActions ??
      currentPublicHand?.availableActions ??
      emptyAvailableActions();

    const resolvedAvailableActions = rawAvailableActions;

    const resolvedAvailableActionsSource: MatchViewModel['availableActionsSource'] =
      currentPrivateHand?.availableActions
        ? 'private'
        : currentPublicHand?.availableActions
          ? 'public'
          : 'fallback';

    const myCards = getViewerCards(currentPrivateHand);
    const lastBotDecision = visualRoomState?.lastBotDecision ?? null;
    const rawRoomCurrentTurnSeatId = visualRoomState?.currentTurnSeatId ?? null;
    // Room turn stays authoritative for card clicks; private action flags can hydrate earlier.
    const inferredCurrentTurnSeatId = rawRoomCurrentTurnSeatId;

    // The turn chip may keep the last known seat during transition gaps; gameplay gates still use live state.
    if (rawRoomCurrentTurnSeatId !== null) {
      lastKnownTurnSeatRef.current = rawRoomCurrentTurnSeatId;
    }
    const stableTurnSeatIdForChip =
      rawRoomCurrentTurnSeatId ?? lastKnownTurnSeatRef.current ?? null;

    const isOneVsOne = visualRoomState?.mode === '1v1';
    const visibleSeatOrder = isOneVsOne ? TABLE_SEAT_ORDER_1V1 : TABLE_SEAT_ORDER_2V2;
    const roomPlayers: TableSeatView[] = visibleSeatOrder.map((seatId) => {
      const player = visualRoomState?.players.find((entry) => entry.seatId === seatId);

      return {
        seatId,
        ready: player?.ready ?? false,
        isBot: player?.isBot ?? false,
        isCurrentTurn: stableTurnSeatIdForChip === seatId,
        isMine: mySeat === seatId,
        displayName: player?.displayName ?? null,
        publicName: player?.publicName ?? null,
        publicSlug: player?.publicSlug ?? null,
        botIdentity: player?.botIdentity ?? null,
      };
    });
    const mySeatView = roomPlayers.find((seat) => seat.isMine) ?? null;
    const opponentSeatView = roomPlayers.find((seat) => !seat.isMine) ?? null;

    const rounds = currentPublicHand?.rounds ?? [];
    const playedRounds = rounds.filter(
      (round) => round.playerOneCard !== null || round.playerTwoCard !== null,
    );
    const latestRound =
      playedRounds.length > 0 ? (playedRounds[playedRounds.length - 1] ?? null) : null;
    const myIsPlayerOne = mySeat === 'T1A' || mySeat === 'T1B';
    const myPlayedCard = latestRound
      ? myIsPlayerOne
        ? latestRound.playerOneCard
        : latestRound.playerTwoCard
      : null;
    const opponentPlayedCard = latestRound
      ? myIsPlayerOne
        ? latestRound.playerTwoCard
        : latestRound.playerOneCard
      : null;

    const isFirstHandReady =
      visualPublicMatchState?.state === 'waiting' &&
      !currentPublicHand &&
      Boolean(visualRoomState?.canStart);

    const isNextHandReady = !matchFinished && nextDecisionType === 'start-next-hand';

    const canStartHand = isFirstHandReady || isNextHandReady;
    const isMyTurn = Boolean(mySeat && inferredCurrentTurnSeatId === mySeat);
    // Betting controls may stay visible through null-turn transition gaps; card plays still use the strict live turn.
    const isMyTurnForVisuals = Boolean(mySeat && stableTurnSeatIdForChip === mySeat);
    const canPlayCard = Boolean(
      !matchFinished &&
      !handFinished &&
      nextDecisionType === 'play-card' &&
      viewerCanActNow &&
      isMyTurn &&
      resolvedAvailableActions.canAttemptPlayCard &&
      myCards.length > 0 &&
      !pendingBotAction,
    );
    const presentationRoomState: RoomStatePayload | null = visualRoomState
      ? {
          ...visualRoomState,
          currentTurnSeatId: inferredCurrentTurnSeatId,
        }
      : null;

    debugMatchPage('can-play:evaluate', {
      canPlayCard,
      nextDecisionType,
      rawRoomCurrentTurnSeatId,
      inferredCurrentTurnSeatId,
      mySeat,
      isMyTurn,
      viewerCanActNow,
      canAttemptPlayCard: resolvedAvailableActions.canAttemptPlayCard,
      myCardsCount: myCards.length,
      pendingBotAction,
      betState: effectiveHand?.betState ?? null,
      specialState: effectiveHand?.specialState ?? null,
      visualBeat,
      handFinished,
      matchFinished,
      trustedRoomTurnOnly: true,
    });

    const contractPresentation = buildMatchContractPresentation({
      publicMatchState: visualPublicMatchState,
      roomState: presentationRoomState,
      canStartHand,
      canPlayCard,
      isMyTurn,
      myCardsCount: myCards.length,
    });

    return {
      resolvedMatchId,
      mySeat,
      isOneVsOne,
      roomPlayers,
      mySeatView,
      opponentSeatView,
      myCards,
      myPlayedCard,
      opponentPlayedCard,
      isMyTurnForVisuals,
      scoreLabel: `T1 ${visualPublicMatchState?.score.playerOne ?? 0} × T2 ${
        visualPublicMatchState?.score.playerTwo ?? 0
      }`,
      currentTurnSeatId: contractPresentation.currentTurnSeatId,
      nextDecisionType,
      viewerCanActNow,
      canStartHand: contractPresentation.canStartHand,
      canPlayCard: contractPresentation.canPlayCard,
      currentValue: contractPresentation.currentValue,
      betState: contractPresentation.betState,
      pendingValue: contractPresentation.pendingValue,
      requestedBy: contractPresentation.requestedBy,
      specialState: contractPresentation.specialState,
      specialDecisionPending: contractPresentation.specialDecisionPending,
      specialDecisionBy: contractPresentation.specialDecisionBy,
      winner: contractPresentation.winner,
      awardedPoints: contractPresentation.awardedPoints,
      availableActions: resolvedAvailableActions,
      availableActionsSource: resolvedAvailableActionsSource,
      handFinished: matchFinished ? false : handFinished,
      matchFinished,
      tablePhase: matchFinished
        ? 'match_finished'
        : handFinished
          ? 'hand_finished'
          : contractPresentation.tablePhase,
      handStatusLabel: matchFinished ? 'Partida encerrada' : contractPresentation.handStatusLabel,
      handStatusTone: matchFinished ? 'success' : contractPresentation.handStatusTone,
      latestRound: contractPresentation.latestRound,
      rounds: contractPresentation.rounds,
      playedRoundsCount: contractPresentation.playedRoundsCount,
      currentPublicHand,
      currentPrivateHand,
      lastBotDecision,
    };
  }, [
    effectiveMatchId,
    playerAssigned,
    visualPrivateMatchState,
    visualPublicMatchState,
    visualRoomState,
  ]);

  useEffect(() => {
    const hand = viewModel.currentPrivateHand ?? viewModel.currentPublicHand;
    const isOpeningMaoDeOnzeDecision =
      viewModel.playedRoundsCount === 0 && viewModel.nextDecisionType === 'resolve-mao-de-onze';

    if (!isOpeningMaoDeOnzeDecision) {
      return;
    }

    const clearKey = [
      viewModel.resolvedMatchId,
      hand?.viraRank ?? 'no-vira',
      hand?.currentValue ?? 'no-value',
      viewModel.nextDecisionType,
    ].join('|');

    if (lastMaoDeOnzeOpeningClearKeyRef.current === clearKey) {
      return;
    }

    lastMaoDeOnzeOpeningClearKeyRef.current = clearKey;
    clearSeatPlayedCardsSnapshot();
    setResolvedSeatPlayedCards({});
    setFrozenSeatPlayedCards({});
  }, [
    clearSeatPlayedCardsSnapshot,
    viewModel.currentPrivateHand,
    viewModel.currentPublicHand,
    viewModel.nextDecisionType,
    viewModel.playedRoundsCount,
    viewModel.resolvedMatchId,
  ]);

  useEffect(() => {
    const hand = viewModel.currentPrivateHand ?? viewModel.currentPublicHand;
    const scorePlayerOne = visualPublicMatchState?.score.playerOne ?? 0;
    const scorePlayerTwo = visualPublicMatchState?.score.playerTwo ?? 0;
    const isElevenElevenOpening = Boolean(
      !viewModel.isOneVsOne &&
      scorePlayerOne === 11 &&
      scorePlayerTwo === 11 &&
      hand !== null &&
      isMaoDeOnzeSpecialState(viewModel.specialState) &&
      viewModel.nextDecisionType === 'play-card' &&
      viewModel.playedRoundsCount === 0 &&
      !viewModel.handFinished &&
      !viewModel.matchFinished,
    );

    if (!isElevenElevenOpening || !hand) {
      return;
    }

    const openingBannerKey = [
      viewModel.resolvedMatchId,
      hand.viraRank,
      hand.currentValue,
      viewModel.specialState,
      scorePlayerOne,
      scorePlayerTwo,
      'mao-de-onze-opening',
    ].join('|');

    if (lastMaoDeOnzeOpeningBannerKeyRef.current === openingBannerKey) {
      return;
    }

    lastMaoDeOnzeOpeningBannerKeyRef.current = openingBannerKey;

    appendLog(
      [
        'Mão de 11 flow',
        'result=started',
        'title=Mão de 11 iniciada',
        'detail=11 x 11 · queda ativa',
        `specialState=${viewModel.specialState}`,
      ].join(' | '),
    );

    play('truco-call', 0.35);
  }, [
    appendLog,
    play,
    viewModel.currentPrivateHand,
    viewModel.currentPublicHand,
    viewModel.handFinished,
    viewModel.isOneVsOne,
    viewModel.matchFinished,
    viewModel.nextDecisionType,
    viewModel.playedRoundsCount,
    viewModel.resolvedMatchId,
    viewModel.specialState,
    visualPublicMatchState?.score.playerOne,
    visualPublicMatchState?.score.playerTwo,
  ]);

  useEffect(() => {
    latestCanStartHandRef.current = viewModel.canStartHand;
    latestIsStartHandPendingRef.current = isStartHandPending;
    latestResolvedMatchIdRef.current = viewModel.resolvedMatchId;
  }, [isStartHandPending, viewModel.canStartHand, viewModel.resolvedMatchId]);

  const liveTableTransition = useMatchTableTransition({
    tablePhase: viewModel.tablePhase,
    myPlayedCard: viewModel.myPlayedCard,
    opponentPlayedCard: viewModel.opponentPlayedCard,
    playedRoundsCount: viewModel.playedRoundsCount,
    latestRoundFinished: Boolean(viewModel.latestRound?.finished),
    currentTurnSeatId: viewModel.currentTurnSeatId,
    nextDecisionType: viewModel.nextDecisionType,
  });

  useEffect(() => {
    beginHandTransitionRef.current = liveTableTransition.beginHandTransition;
    registerIncomingPlayedCardRef.current = liveTableTransition.registerIncomingPlayedCard;
    triggerRoundResolutionRef.current = liveTableTransition.triggerRoundResolution;
  }, [
    liveTableTransition.beginHandTransition,
    liveTableTransition.registerIncomingPlayedCard,
    liveTableTransition.triggerRoundResolution,
  ]);

  useEffect(() => {
    if (viewModel.currentPrivateHand?.viraRank) {
      setViraRank(viewModel.currentPrivateHand.viraRank);
      return;
    }

    if (viewModel.currentPublicHand?.viraRank) {
      setViraRank(viewModel.currentPublicHand.viraRank);
    }
  }, [viewModel.currentPrivateHand?.viraRank, viewModel.currentPublicHand?.viraRank]);

  useEffect(() => {
    const privateHand = viewModel.currentPrivateHand;

    if (!privateHand || privateHand.finished) {
      return;
    }

    const nextHandKey = [
      viewModel.resolvedMatchId,
      privateHand.viraRank,
      privateHand.rounds.length,
      privateHand.currentValue,
      privateHand.betState,
    ].join('|');

    if (viewModel.myCards.length > 0) {
      lastHydratedHandKeyRef.current = nextHandKey;
      setCachedMyCards(viewModel.myCards);
      return;
    }

    if (lastHydratedHandKeyRef.current === nextHandKey) {
      return;
    }
  }, [viewModel.currentPrivateHand, viewModel.myCards, viewModel.resolvedMatchId]);

  useEffect(() => {
    const publicHand = visualPublicMatchState?.currentHand ?? null;
    const privateHand = visualPrivateMatchState?.currentHand ?? null;

    debugMatchPage('frontend-state-snapshot', {
      publicState: {
        betState: publicHand?.betState ?? null,
        currentValue: publicHand?.currentValue ?? null,
        pendingValue: publicHand?.pendingValue ?? null,
        requestedBy: publicHand?.requestedBy ?? null,
        specialState: publicHand?.specialState ?? null,
        specialDecisionPending: publicHand?.specialDecisionPending ?? null,
        nextDecisionType: publicHand?.nextDecisionType ?? null,
        availableActions: publicHand?.availableActions ?? null,
      },
      privateState: {
        betState: privateHand?.betState ?? null,
        currentValue: privateHand?.currentValue ?? null,
        pendingValue: privateHand?.pendingValue ?? null,
        requestedBy: privateHand?.requestedBy ?? null,
        specialState: privateHand?.specialState ?? null,
        specialDecisionPending: privateHand?.specialDecisionPending ?? null,
        nextDecisionType: privateHand?.nextDecisionType ?? null,
        availableActions: privateHand?.availableActions ?? null,
      },
    });
  }, [visualPrivateMatchState, visualPublicMatchState]);

  useEffect(() => {
    debugMatchPage('actions-source-snapshot', {
      source: viewModel.availableActionsSource,
      availableActions: viewModel.availableActions,
      privateCanRequestTruco:
        viewModel.currentPrivateHand?.availableActions?.canRequestTruco ?? null,
      publicCanRequestTruco: viewModel.currentPublicHand?.availableActions?.canRequestTruco ?? null,
      effectiveCanRequestTruco: viewModel.availableActions.canRequestTruco,
    });
  }, [
    viewModel.availableActions,
    viewModel.availableActionsSource,
    viewModel.currentPrivateHand,
    viewModel.currentPublicHand,
  ]);

  useEffect(() => {
    const privateHand = viewModel.currentPrivateHand;
    const publicHand = viewModel.currentPublicHand;
    const effectiveHand = privateHand ?? publicHand;
    const myPlayerId = mapSeatToPlayerId(viewModel.mySeat);
    const opponentIsBot = viewModel.opponentSeatView?.isBot ?? false;

    const awaitingResponseSource =
      privateHand?.betState === 'awaiting_response'
        ? privateHand
        : publicHand?.betState === 'awaiting_response'
          ? publicHand
          : null;

    if (!effectiveHand && !awaitingResponseSource) {
      return;
    }

    if (
      awaitingResponseSource &&
      awaitingResponseSource.pendingValue !== null &&
      (awaitingResponseSource.requestedBy === 'P1' || awaitingResponseSource.requestedBy === 'P2')
    ) {
      const requestedBy = awaitingResponseSource.requestedBy;
      const pendingValue = awaitingResponseSource.pendingValue;
      const existingCycle = pendingBetCycleRef.current;
      const isSameBetRequest = Boolean(
        existingCycle &&
        existingCycle.requestedBy === requestedBy &&
        existingCycle.pendingValue === pendingValue,
      );

      if (existingCycle === null || !isSameBetRequest) {
        pendingBetCycleRef.current = {
          requestedBy,
          pendingValue,
          previousValue: awaitingResponseSource.currentValue,
          requestShown: false,
          requestSoundPlayed: false,
          observedAwaitingResponse: true,
        };
      } else {
        pendingBetCycleRef.current = {
          ...existingCycle,
          observedAwaitingResponse: true,
        };
      }

      const activeCycle = pendingBetCycleRef.current;

      if (activeCycle && !activeCycle.requestSoundPlayed) {
        activeCycle.requestSoundPlayed = true;
        playBetRequestedFeedbackSound(play, activeCycle.pendingValue);
      }

      if (
        activeCycle &&
        myPlayerId !== null &&
        activeCycle.requestedBy === myPlayerId &&
        !activeCycle.requestShown
      ) {
        activeCycle.requestShown = true;

        const detail = opponentIsBot
          ? 'Aguardando resposta do bot.'
          : 'Aguardando resposta do adversário.';

        appendLog(
          [
            'Bet flow',
            'result=requested',
            'title=Truco pedido',
            `detail=${detail}`,
            `value=${activeCycle.previousValue}`,
            'betState=awaiting_response',
            'awardedPoints=null',
          ].join(' | '),
        );

        enqueueBetFeedback({
          kind: 'requested',
          title: 'TRUCO!',
          detail,
          tone: 'neutral',
        });
      }

      return;
    }

    const pendingCycle = pendingBetCycleRef.current;

    if (!pendingCycle || !effectiveHand) {
      return;
    }

    const requesterIsMine = Boolean(myPlayerId && pendingCycle.requestedBy === myPlayerId);
    const responderLabel = opponentIsBot ? 'Bot' : requesterIsMine ? 'Adversário' : 'Você';

    const acceptedValue = effectiveHand.currentValue >= pendingCycle.pendingValue;

    if (!effectiveHand.finished && acceptedValue) {
      const title = requesterIsMine ? `${responderLabel.toUpperCase()} ACEITOU` : 'ACEITO';
      const detail = `Agora vale ${effectiveHand.currentValue} ponto${
        effectiveHand.currentValue === 1 ? '' : 's'
      }.`;

      appendLog(
        [
          'Bet flow',
          'result=accepted',
          `title=${title}`,
          `detail=${detail}`,
          `value=${effectiveHand.currentValue}`,
          `betState=${effectiveHand.betState}`,
          `awardedPoints=${effectiveHand.awardedPoints ?? 'null'}`,
        ].join(' | '),
      );

      enqueueBetFeedback({
        kind: 'accepted',
        title,
        detail,
        tone: 'success',
      });

      playBetAcceptedFeedbackSound(play);
      pendingBetCycleRef.current = null;
      return;
    }

    if (
      pendingCycle.observedAwaitingResponse &&
      effectiveHand.finished &&
      effectiveHand.awardedPoints !== null &&
      effectiveHand.currentValue < pendingCycle.pendingValue
    ) {
      const title = requesterIsMine
        ? opponentIsBot
          ? 'BOT FUGIU'
          : 'ADVERSÁRIO CORREU'
        : 'VOCÊ CORREU';
      const detail = requesterIsMine
        ? `Mão sua · +${effectiveHand.awardedPoints} ponto${
            effectiveHand.awardedPoints === 1 ? '' : 's'
          }.`
        : `Mão deles · +${effectiveHand.awardedPoints} ponto${
            effectiveHand.awardedPoints === 1 ? '' : 's'
          }.`;

      appendLog(
        [
          'Bet flow',
          'result=declined',
          `title=${title}`,
          `detail=${detail}`,
          `value=${effectiveHand.currentValue}`,
          `betState=${effectiveHand.betState}`,
          `awardedPoints=${effectiveHand.awardedPoints ?? 'null'}`,
        ].join(' | '),
      );

      enqueueBetFeedback({
        kind: 'declined',
        title,
        detail,
        tone: 'warning',
      });

      if (!viewModel.isOneVsOne) {
        const declinedResultKey = buildFinishedHandResultKey({
          matchId: viewModel.resolvedMatchId,
          hand: effectiveHand,
        });

        if (declinedResultKey !== null) {
          setDeclinedHandResultSkipKey(declinedResultKey);
        }
      }

      // Declines keep only the live cards visible at refusal time.
      playBetDeclinedFeedbackSound(play);

      pendingBetCycleRef.current = null;
    }
  }, [
    appendLog,
    play,
    viewModel.currentPrivateHand,
    viewModel.currentPublicHand,
    viewModel.isOneVsOne,
    viewModel.mySeat,
    viewModel.opponentSeatView,
    viewModel.resolvedMatchId,
  ]);

  useEffect(() => {
    const privateHand = viewModel.currentPrivateHand;
    const publicHand = viewModel.currentPublicHand;
    const effectiveHand = privateHand ?? publicHand;
    const decisionSource =
      privateHand?.specialState === 'mao_de_onze' && privateHand.specialDecisionPending
        ? privateHand
        : publicHand?.specialState === 'mao_de_onze' && publicHand.specialDecisionPending
          ? publicHand
          : null;
    const myPlayerId = mapSeatToPlayerId(viewModel.mySeat);

    if (
      decisionSource &&
      (decisionSource.specialDecisionBy === 'P1' || decisionSource.specialDecisionBy === 'P2')
    ) {
      const decisionBy = decisionSource.specialDecisionBy;
      const handKey = [
        viewModel.resolvedMatchId,
        decisionSource.viraRank,
        decisionSource.currentValue,
        decisionBy,
        'mao-de-onze',
      ].join('|');
      const existingCycle = pendingMaoDeOnzeCycleRef.current;

      if (existingCycle === null || existingCycle.handKey !== handKey) {
        pendingMaoDeOnzeCycleRef.current = {
          decisionBy,
          handKey,
          observedDecision: true,
        };
      } else {
        pendingMaoDeOnzeCycleRef.current = {
          ...existingCycle,
          observedDecision: true,
        };
      }

      return;
    }

    if (!effectiveHand) {
      return;
    }

    const pendingCycle = pendingMaoDeOnzeCycleRef.current;
    const inferredDecisionBy =
      effectiveHand.finished &&
      effectiveHand.specialState === 'mao_de_onze' &&
      effectiveHand.awardedPoints !== null &&
      viewModel.playedRoundsCount === 0
        ? effectiveHand.winner === 'P1'
          ? 'P2'
          : effectiveHand.winner === 'P2'
            ? 'P1'
            : null
        : null;
    const activeCycle =
      pendingCycle ??
      (inferredDecisionBy !== null
        ? {
            decisionBy: inferredDecisionBy,
            handKey: [
              viewModel.resolvedMatchId,
              effectiveHand.viraRank,
              effectiveHand.currentValue,
              inferredDecisionBy,
              'mao-de-onze-inferred',
            ].join('|'),
            observedDecision: true,
          }
        : null);

    if (!activeCycle) {
      return;
    }

    if (!effectiveHand.finished) {
      pendingMaoDeOnzeCycleRef.current = null;
      return;
    }

    const isDeclinedMaoDeOnze = Boolean(
      activeCycle.observedDecision &&
      effectiveHand.specialState === 'mao_de_onze' &&
      effectiveHand.awardedPoints !== null &&
      viewModel.playedRoundsCount === 0,
    );

    if (!isDeclinedMaoDeOnze) {
      pendingMaoDeOnzeCycleRef.current = null;
      return;
    }

    const awardedPoints = effectiveHand.awardedPoints ?? 1;
    const declineFeedbackKey = [
      viewModel.resolvedMatchId,
      effectiveHand.viraRank,
      effectiveHand.winner ?? 'tie',
      awardedPoints,
      activeCycle.decisionBy,
      viewModel.playedRoundsCount,
      'mao-de-onze-declined',
    ].join('|');

    if (handledMaoDeOnzeDeclineKeysRef.current.has(declineFeedbackKey)) {
      pendingMaoDeOnzeCycleRef.current = null;
      return;
    }

    const decisionByIsMyTeam = Boolean(
      myPlayerId !== null && activeCycle.decisionBy === myPlayerId,
    );
    const viewerWonCurrentHand = Boolean(
      myPlayerId !== null && effectiveHand.winner === myPlayerId,
    );
    const decisionTeamSeats = viewModel.roomPlayers.filter(
      (seat) => mapSeatToPlayerId(seat.seatId) === activeCycle.decisionBy,
    );
    const decisionTeamIsBotOnly = Boolean(
      decisionTeamSeats.length > 0 && decisionTeamSeats.every((seat) => seat.isBot),
    );
    const localDeclineIntent = localMaoDeOnzeDeclineIntentRef.current;
    const viewerTriggeredDecline = Boolean(
      decisionByIsMyTeam &&
      localDeclineIntent !== null &&
      localDeclineIntent.decisionBy === activeCycle.decisionBy &&
      localDeclineIntent.handKey === activeCycle.handKey,
    );
    const title = decisionByIsMyTeam
      ? viewModel.isOneVsOne || viewerTriggeredDecline
        ? 'VOCÊ CORREU DA MÃO DE 11'
        : 'SUA DUPLA CORREU DA MÃO DE 11'
      : decisionTeamIsBotOnly
        ? viewModel.isOneVsOne
          ? 'BOT FUGIU DA MÃO DE 11'
          : 'BOTS FUGIRAM DA MÃO DE 11'
        : viewModel.isOneVsOne
          ? 'ADVERSÁRIO CORREU DA MÃO DE 11'
          : 'RIVAIS CORRERAM DA MÃO DE 11';
    const detail = viewerWonCurrentHand
      ? `Mão sua · +${awardedPoints} ponto${awardedPoints === 1 ? '' : 's'}.`
      : `Mão deles · +${awardedPoints} ponto${awardedPoints === 1 ? '' : 's'}.`;

    appendLog(
      [
        'Mão de 11 flow',
        'result=declined',
        `title=${title}`,
        `detail=${detail}`,
        `decisionBy=${activeCycle.decisionBy}`,
        `viewerTriggered=${String(viewerTriggeredDecline)}`,
        `winner=${effectiveHand.winner ?? 'null'}`,
        `awardedPoints=${effectiveHand.awardedPoints ?? 'null'}`,
      ].join(' | '),
    );

    handledMaoDeOnzeDeclineKeysRef.current.add(declineFeedbackKey);
    enqueueBetFeedback({
      kind: 'declined',
      title,
      detail,
      tone: 'warning',
    });

    play('run', 0.55);
    pendingMaoDeOnzeCycleRef.current = null;
    localMaoDeOnzeDeclineIntentRef.current = null;
  }, [
    appendLog,
    play,
    viewModel.currentPrivateHand,
    viewModel.currentPublicHand,
    viewModel.isOneVsOne,
    viewModel.mySeat,
    viewModel.playedRoundsCount,
    viewModel.resolvedMatchId,
    viewModel.roomPlayers,
  ]);

  const currentHandForOutcome = viewModel.currentPublicHand ?? viewModel.currentPrivateHand;
  const currentFinishedHandResultKey = buildFinishedHandResultKey({
    matchId: viewModel.resolvedMatchId,
    hand: currentHandForOutcome,
  });
  const shouldSkipDeclinedHandResult = Boolean(
    currentFinishedHandResultKey !== null &&
    declinedHandResultSkipKey === currentFinishedHandResultKey,
  );
  const shouldSuppressDeclinedHandSeatCards = false;
  const shouldUseLiveOnlySeatCardsForDeclinedHand = Boolean(
    !viewModel.isOneVsOne &&
    shouldSkipDeclinedHandResult &&
    viewModel.handFinished &&
    !viewModel.matchFinished,
  );

  useEffect(() => {
    if (!currentHandForOutcome?.finished || viewModel.matchFinished) {
      latestAutoNextHandPrefixRef.current = null;
      return;
    }

    latestAutoNextHandPrefixRef.current = buildAutoNextHandKeyPrefix({
      matchId: viewModel.resolvedMatchId,
      hand: currentHandForOutcome,
      playedRoundsCount: viewModel.playedRoundsCount,
      scorePlayerOne: visualPublicMatchState?.score.playerOne ?? 0,
      scorePlayerTwo: visualPublicMatchState?.score.playerTwo ?? 0,
    });
  }, [
    currentHandForOutcome,
    viewModel.matchFinished,
    viewModel.playedRoundsCount,
    viewModel.resolvedMatchId,
    visualPublicMatchState?.score.playerOne,
    visualPublicMatchState?.score.playerTwo,
  ]);

  const suppressHandOutcomeModal =
    betFeedback?.kind === 'requested' || betFeedback?.kind === 'declined';

  const isRoundResolutionVisualHoldActive =
    liveTableTransition.isResolvingRound ||
    liveTableTransition.closingTableCards.mine !== null ||
    liveTableTransition.closingTableCards.opponent !== null ||
    liveTableTransition.resolvedRoundFinished;

  const isNewHandOpeningLocked = visualBeat === 'hand_intro' || openingViraReveal !== null;

  useEffect(() => {
    const wasRoundResolutionVisualHoldActive = isRoundResolutionVisualHoldActiveRef.current;

    isRoundResolutionVisualHoldActiveRef.current = isRoundResolutionVisualHoldActive;

    const shouldReleaseSeatSnapshotAfterRoundHold = Boolean(
      wasRoundResolutionVisualHoldActive &&
      !isRoundResolutionVisualHoldActive &&
      pendingNextRoundSeatSnapshotClearRef.current,
    );

    if (shouldReleaseSeatSnapshotAfterRoundHold) {
      pendingNextRoundSeatSnapshotClearRef.current = false;

      if (pendingNextRoundSeatSnapshotClearTimeoutRef.current !== null) {
        window.clearTimeout(pendingNextRoundSeatSnapshotClearTimeoutRef.current);
        pendingNextRoundSeatSnapshotClearTimeoutRef.current = null;
      }

      clearSeatPlayedCardsSnapshot();
    }

    const shouldDrainBufferedCardsAfterRoundHold =
      wasRoundResolutionVisualHoldActive &&
      !isRoundResolutionVisualHoldActive &&
      bufferedCardsDuringIntroRef.current.length > 0 &&
      bufferedCardReplayTimeoutsRef.current.length === 0 &&
      bufferedCardReplayLandingGuardTimeoutsRef.current.length === 0 &&
      !isDeferringVisualCommitRef.current &&
      visualBeatRef.current !== 'hand_intro' &&
      visualBeatRef.current !== 'hand_result_hold';

    if (shouldDrainBufferedCardsAfterRoundHold) {
      debugMatchPage('roundHold:drain-buffered-cards', {
        count: bufferedCardsDuringIntroRef.current.length,
        visualBeat: visualBeatRef.current,
      });

      drainBufferedCards();
    }
  }, [clearSeatPlayedCardsSnapshot, drainBufferedCards, isRoundResolutionVisualHoldActive]);

  // Card landing suppresses playable UI while flight animations still own the table.
  const isBufferedCardReplayBlockingPlay = Boolean(
    bufferedCardsDuringIntroRef.current.length > 0 ||
    bufferedCardReplayTimeoutsRef.current.length > 0 ||
    bufferedCardReplayLandingGuardTimeoutsRef.current.length > 0,
  );
  const isBetFeedbackBlockingPlay =
    betFeedback?.kind === 'accepted' ||
    betFeedback?.kind === 'declined' ||
    betFeedback?.kind === 'special';
  const isVisualBeatStillPromotingPlayableState = Boolean(
    visualBeat === 'idle' &&
    isFreshPlayableHandState({
      publicMatchState: visualPublicMatchState,
      privateMatchState: visualPrivateMatchState,
    }) &&
    !isDeferringVisualCommitRef.current,
  );

  // Mão de 11 can reopen play before the previous visual hold has fully released.
  const shouldBypassStaleMaoDeOnzeRoundHold = Boolean(
    viewModel.specialState === 'mao_de_onze' &&
    viewModel.nextDecisionType === 'play-card' &&
    viewModel.canPlayCard &&
    visualBeat === 'live' &&
    !liveTableTransition.isAnyCardLandingInProgress &&
    !liveTableTransition.isResolvingRound &&
    !isBufferedCardReplayBlockingPlay &&
    !isBetFeedbackBlockingPlay &&
    !isDeferringVisualCommitRef.current,
  );

  const shouldSuppressPlayableUi = Boolean(
    (isRoundResolutionVisualHoldActive ||
      liveTableTransition.isAnyCardLandingInProgress ||
      isBufferedCardReplayBlockingPlay ||
      isBetFeedbackBlockingPlay ||
      (!isVisualBeatStillPromotingPlayableState && visualBeat !== 'live') ||
      isNewHandOpeningLocked ||
      isDeferringVisualCommitRef.current) &&
    !shouldBypassStaleMaoDeOnzeRoundHold,
  );

  // Card landings block card plays, not team-level betting responses.
  const isOnlyCardLandingSuppressingUi =
    liveTableTransition.isAnyCardLandingInProgress &&
    !isRoundResolutionVisualHoldActive &&
    !isBufferedCardReplayBlockingPlay &&
    !isBetFeedbackBlockingPlay &&
    visualBeat === 'live' &&
    !isDeferringVisualCommitRef.current;

  const isBetResponseDecision = viewModel.nextDecisionType === 'respond-bet';
  const isMaoDeOnzeResponseDecision =
    Boolean(viewModel.currentPrivateHand?.specialDecisionPending) &&
    viewModel.currentPrivateHand?.specialDecisionBy === mapSeatToPlayerId(viewModel.mySeat);

  const safeAvailableActions = useMemo<MatchStateHandPayload['availableActions']>(() => {
    const isStrictViewerTurn = Boolean(
      viewModel.mySeat !== null && viewModel.currentTurnSeatId === viewModel.mySeat,
    );
    const turnSafeAvailableActions: MatchStateHandPayload['availableActions'] = {
      ...viewModel.availableActions,
      canRequestTruco: viewModel.availableActions.canRequestTruco && isStrictViewerTurn,
      canRaiseToSix:
        viewModel.availableActions.canRaiseToSix && (isBetResponseDecision || isStrictViewerTurn),
      canRaiseToNine:
        viewModel.availableActions.canRaiseToNine && (isBetResponseDecision || isStrictViewerTurn),
      canRaiseToTwelve:
        viewModel.availableActions.canRaiseToTwelve &&
        (isBetResponseDecision || isStrictViewerTurn),
    };

    if (!shouldSuppressPlayableUi) {
      return turnSafeAvailableActions;
    }

    if (isOnlyCardLandingSuppressingUi) {
      return {
        ...turnSafeAvailableActions,
        canAttemptPlayCard: false,
      };
    }

    if (isBetResponseDecision) {
      // Mandatory bet responses stay available even while the table is holding a result.
      return {
        ...emptyAvailableActions(),
        canAcceptBet: viewModel.availableActions.canAcceptBet,
        canDeclineBet: viewModel.availableActions.canDeclineBet,
        canRaiseToSix: viewModel.availableActions.canRaiseToSix,
        canRaiseToNine: viewModel.availableActions.canRaiseToNine,
        canRaiseToTwelve: viewModel.availableActions.canRaiseToTwelve,
      };
    }

    if (isMaoDeOnzeResponseDecision) {
      return {
        ...emptyAvailableActions(),
        canAcceptMaoDeOnze: viewModel.availableActions.canAcceptMaoDeOnze,
        canDeclineMaoDeOnze: viewModel.availableActions.canDeclineMaoDeOnze,
      };
    }

    // Visual result holds intentionally outlive the backend round promotion.
    return emptyAvailableActions();
  }, [
    isBetResponseDecision,
    isMaoDeOnzeResponseDecision,
    isOnlyCardLandingSuppressingUi,
    shouldSuppressPlayableUi,
    viewModel.availableActions,
    viewModel.currentTurnSeatId,
    viewModel.mySeat,
  ]);

  const safeCanPlayCard = shouldSuppressPlayableUi ? false : viewModel.canPlayCard;

  useEffect(() => {
    debugMatchPage('playableUiSuppression:evaluate', {
      shouldSuppressPlayableUi,
      shouldBypassStaleMaoDeOnzeRoundHold,
      isRoundResolutionVisualHoldActive,
      isBufferedCardReplayBlockingPlay,
      isBetFeedbackBlockingPlay,
      isNewHandOpeningLocked,
      isOnlyCardLandingSuppressingUi,
      visualBeat,
      isVisualBeatStillPromotingPlayableState,
      rawCanPlayCard: viewModel.canPlayCard,
      safeCanPlayCard,
      rawCanRequestTruco: viewModel.availableActions.canRequestTruco,
      safeCanRequestTruco: safeAvailableActions.canRequestTruco,
      rawCanAcceptBet: viewModel.availableActions.canAcceptBet,
      safeCanAcceptBet: safeAvailableActions.canAcceptBet,
      isBetResponseDecision,
      isResolvingRound: liveTableTransition.isResolvingRound,
      hasClosingMineCard: liveTableTransition.closingTableCards.mine !== null,
      hasClosingOpponentCard: liveTableTransition.closingTableCards.opponent !== null,
      resolvedRoundFinished: liveTableTransition.resolvedRoundFinished,
      isOpponentLandingInProgress: liveTableTransition.isOpponentLandingInProgress,
      isOwnLandingInProgress: liveTableTransition.isOwnLandingInProgress,
      isAnyCardLandingInProgress: liveTableTransition.isAnyCardLandingInProgress,
    });
  }, [
    isBetFeedbackBlockingPlay,
    isBufferedCardReplayBlockingPlay,
    isBetResponseDecision,
    isVisualBeatStillPromotingPlayableState,
    isOnlyCardLandingSuppressingUi,
    isNewHandOpeningLocked,
    isRoundResolutionVisualHoldActive,
    liveTableTransition.closingTableCards.mine,
    liveTableTransition.closingTableCards.opponent,
    liveTableTransition.isAnyCardLandingInProgress,
    liveTableTransition.isOpponentLandingInProgress,
    liveTableTransition.isOwnLandingInProgress,
    liveTableTransition.isResolvingRound,
    liveTableTransition.resolvedRoundFinished,
    safeAvailableActions.canAcceptBet,
    safeAvailableActions.canRequestTruco,
    safeCanPlayCard,
    shouldBypassStaleMaoDeOnzeRoundHold,
    shouldSuppressPlayableUi,
    viewModel.availableActions.canAcceptBet,
    viewModel.availableActions.canRequestTruco,
    viewModel.canPlayCard,
    visualBeat,
  ]);

  const handleApprovePartnerBetProposal = useCallback(() => {
    if (!effectiveMatchId || !pendingPartnerBetProposal) {
      return;
    }

    emitApprovePartnerBetProposal(effectiveMatchId, pendingPartnerBetProposal.proposalId);
    appendLog(`Emitted approve-partner-bet-proposal (${pendingPartnerBetProposal.proposalId}).`);
    setRecentApprovedPartnerBetProposal(pendingPartnerBetProposal);
    setPendingPartnerBetProposal(null);
  }, [appendLog, effectiveMatchId, emitApprovePartnerBetProposal, pendingPartnerBetProposal]);

  const handleRejectPartnerBetProposal = useCallback(() => {
    if (!effectiveMatchId || !pendingPartnerBetProposal) {
      return;
    }

    emitRejectPartnerBetProposal(effectiveMatchId, pendingPartnerBetProposal.proposalId);
    appendLog(`Emitted reject-partner-bet-proposal (${pendingPartnerBetProposal.proposalId}).`);
    setPendingPartnerBetProposal(null);
  }, [appendLog, effectiveMatchId, emitRejectPartnerBetProposal, pendingPartnerBetProposal]);

  const { handleRefreshState, handleStartHand, handlePlayCard, handleMatchAction } =
    useMatchActionBridge({
      resolvedMatchId: viewModel.resolvedMatchId,
      mySeat: viewModel.mySeat,
      canStartHand: viewModel.canStartHand,
      canPlayCard: safeCanPlayCard,
      availableActions: safeAvailableActions,
      appendLog,
      emitGetState,
      emitStartHand,
      emitPlayCard,
      emitRequestTruco,
      emitAcceptBet,
      emitDeclineBet,
      emitRaiseToSix,
      emitRaiseToNine,
      emitRaiseToTwelve,
      emitAcceptMaoDeOnze,
      emitDeclineMaoDeOnze,
      beginHandTransition: liveTableTransition.beginHandTransition,
      beginOwnCardLaunch: liveTableTransition.beginOwnCardLaunch,
      // The bridge receives authoritative gates as the final guard before socket emission.
      currentTurnSeatId: viewModel.currentTurnSeatId,
      viewerCanActNow: viewModel.viewerCanActNow,
      nextDecisionType: viewModel.nextDecisionType,
      tablePhase: viewModel.tablePhase,
      isResolvingRound: liveTableTransition.isResolvingRound,
      isTableInteractionLocked: shouldSuppressPlayableUi,
    });

  const handleStartHandWithGate = useCallback(() => {
    debugMatchPage('startHandWithGate:attempt', {
      startHandLocked: startHandLockRef.current,
      isStartHandPending,
      canStartHand: viewModel.canStartHand,
      visualBeat,
      pendingAutoNextHandKey: pendingAutoNextHandKeyRef.current,
    });

    if (startHandLockRef.current || isStartHandPending || !viewModel.canStartHand) {
      debugMatchPage('startHandWithGate:blocked', {
        startHandLocked: startHandLockRef.current,
        isStartHandPending,
        canStartHand: viewModel.canStartHand,
      });
      appendLog('Ignored start-hand because a start request is already locked.');
      return;
    }

    startHandLockRef.current = true;
    setIsStartHandPending(true);
    setIsAutoNextHandArmed(false);

    if (autoNextHandTimeoutRef.current !== null) {
      window.clearTimeout(autoNextHandTimeoutRef.current);
      autoNextHandTimeoutRef.current = null;
    }

    pendingAutoNextHandKeyRef.current = null;
    lastAutoNextHandKeyRef.current = null;
    lastAutoNextHandWaitLogKeyRef.current = null;

    if (startHandPendingTimeoutRef.current !== null) {
      window.clearTimeout(startHandPendingTimeoutRef.current);
    }

    startHandPendingTimeoutRef.current = window.setTimeout(
      () => {
        setIsStartHandPending(false);
        startHandPendingTimeoutRef.current = null;
      },
      HAND_INTRO_WITH_VIRA_REVEAL_MS + HAND_RESULT_HOLD_MS + NEXT_HAND_COMMIT_MS + 1200,
    );

    handleStartHand();
  }, [appendLog, handleStartHand, isStartHandPending, viewModel.canStartHand, visualBeat]);

  useEffect(() => {
    const isTwoVersusTwo = visualRoomState?.mode === '2v2';
    const hasAnyHand = Boolean(viewModel.currentPublicHand || viewModel.currentPrivateHand);
    const canAutoStartInitialHand =
      isTwoVersusTwo &&
      !hasAnyHand &&
      viewModel.canStartHand &&
      !isStartHandPending &&
      !startHandLockRef.current &&
      viewModel.resolvedMatchId !== 'no-match';

    if (!canAutoStartInitialHand) {
      return;
    }

    const autoStartKey = `${viewModel.resolvedMatchId}|${
      visualRoomState?.players
        .map(
          (player) =>
            `${player.seatId}:${player.isBot ? 'bot' : 'human'}:${player.ready ? 'ready' : 'idle'}`,
        )
        .join('|') ?? 'no-players'
    }`;

    if (lastInitialAutoStartKeyRef.current === autoStartKey) {
      return;
    }

    lastInitialAutoStartKeyRef.current = autoStartKey;

    if (initialAutoStartTimeoutRef.current !== null) {
      window.clearTimeout(initialAutoStartTimeoutRef.current);
    }

    debugMatchPage('initialAutoStart:armed', {
      autoStartKey,
      matchId: viewModel.resolvedMatchId,
      mode: visualRoomState?.mode ?? null,
      players: visualRoomState?.players.length ?? 0,
    });

    initialAutoStartTimeoutRef.current = window.setTimeout(() => {
      initialAutoStartTimeoutRef.current = null;
      handleStartHandWithGate();
    }, 520);

    return () => {
      if (initialAutoStartTimeoutRef.current !== null) {
        window.clearTimeout(initialAutoStartTimeoutRef.current);
        initialAutoStartTimeoutRef.current = null;
      }
    };
  }, [
    handleStartHandWithGate,
    isStartHandPending,
    viewModel.canStartHand,
    viewModel.currentPrivateHand,
    viewModel.currentPublicHand,
    viewModel.resolvedMatchId,
    visualRoomState?.mode,
    visualRoomState?.players,
  ]);

  const tryDispatchAutomaticNextHand = useCallback(() => {
    const pendingKey = pendingAutoNextHandKeyRef.current;

    if (!pendingKey) {
      debugMatchPage('autoNextHand:no-pending-key');
      return;
    }

    const currentPrefix = latestAutoNextHandPrefixRef.current;

    if (!currentPrefix || !pendingKey.startsWith(`${currentPrefix}|`)) {
      debugMatchPage('autoNextHand:discard-stale-key', {
        pendingKey,
        currentPrefix,
      });
      pendingAutoNextHandKeyRef.current = null;
      lastAutoNextHandWaitLogKeyRef.current = null;
      setIsAutoNextHandArmed(false);
      return;
    }

    const isDeclinedAutoNext = pendingKey.endsWith('|declined');

    // Declined bets use their feedback banner as the first outcome beat.
    if (!isDeclinedAutoNext && isHandOutcomeRevealHoldActiveRef.current) {
      const waitKey = `${pendingKey}|waiting-hand-outcome-hold`;

      if (lastAutoNextHandWaitLogKeyRef.current !== waitKey) {
        lastAutoNextHandWaitLogKeyRef.current = waitKey;
        debugMatchPage('autoNextHand:waiting-hand-outcome-hold', {
          pendingKey,
        });
      }

      return;
    }

    if (!latestResolvedMatchIdRef.current) {
      const waitKey = `${pendingKey}|missing-match-id`;

      if (lastAutoNextHandWaitLogKeyRef.current !== waitKey) {
        lastAutoNextHandWaitLogKeyRef.current = waitKey;
        debugMatchPage('autoNextHand:waiting-missing-match-id', { pendingKey });
        appendLog('Automatic next hand is armed, but matchId is unavailable yet.');
      }

      return;
    }

    if (latestIsStartHandPendingRef.current) {
      debugMatchPage('autoNextHand:waiting-start-hand-pending', { pendingKey });
      return;
    }

    if (!latestCanStartHandRef.current) {
      const waitKey = `${pendingKey}|waiting-readiness`;

      if (lastAutoNextHandWaitLogKeyRef.current !== waitKey) {
        lastAutoNextHandWaitLogKeyRef.current = waitKey;
        debugMatchPage('autoNextHand:waiting-authoritative-readiness', {
          pendingKey,
        });
        appendLog('Automatic next hand is armed, waiting for authoritative readiness.');
      }

      return;
    }

    lastAutoNextHandWaitLogKeyRef.current = null;
    debugMatchPage('autoNextHand:dispatch-start-hand', {
      pendingKey,
      matchId: latestResolvedMatchIdRef.current,
      canStartHand: latestCanStartHandRef.current,
    });
    appendLog('Automatic next hand dispatching start-hand.');
    pendingAutoNextHandKeyRef.current = null;
    handleStartHandWithGate();
  }, [appendLog, handleStartHandWithGate]);

  useEffect(() => {
    if (!pendingAutoNextHandKeyRef.current) {
      return;
    }

    tryDispatchAutomaticNextHand();
  }, [
    tryDispatchAutomaticNextHand,
    viewModel.canStartHand,
    isStartHandPending,
    viewModel.resolvedMatchId,
    isHandOutcomeRevealHoldActive,
  ]);

  useEffect(() => {
    const currentHand = viewModel.currentPublicHand ?? viewModel.currentPrivateHand;

    if (betFeedback?.kind !== 'declined' || viewModel.matchFinished || !currentHand?.finished) {
      return;
    }

    // After the decline banner, the hand outcome modal owns next-hand timing.
    debugMatchPage('autoNextHand:declined-owned-by-hand-climax', {
      currentHandFinished: currentHand.finished,
      betFeedbackKind: betFeedback.kind,
    });
  }, [
    betFeedback?.kind,
    viewModel.currentPrivateHand,
    viewModel.currentPublicHand,
    viewModel.matchFinished,
  ]);

  useEffect(() => {
    const handIsLive = Boolean(
      !viewModel.handFinished &&
      !viewModel.matchFinished &&
      (viewModel.tablePhase === 'playing' || viewModel.nextDecisionType === 'play-card'),
    );

    if (!handIsLive) {
      return;
    }

    // A live hand invalidates any delayed auto-next timer from the previous hand.
    pendingAutoNextHandKeyRef.current = null;
    lastAutoNextHandWaitLogKeyRef.current = null;
    setIsAutoNextHandArmed(false);

    if (autoNextHandTimeoutRef.current !== null) {
      window.clearTimeout(autoNextHandTimeoutRef.current);
      autoNextHandTimeoutRef.current = null;
    }

    if (!isStartHandPending) {
      return;
    }

    setIsStartHandPending(false);

    if (startHandPendingTimeoutRef.current !== null) {
      window.clearTimeout(startHandPendingTimeoutRef.current);
      startHandPendingTimeoutRef.current = null;
    }
  }, [
    isStartHandPending,
    viewModel.handFinished,
    viewModel.matchFinished,
    viewModel.nextDecisionType,
    viewModel.tablePhase,
  ]);

  useEffect(() => {
    const authoritativeHandInProgress = Boolean(
      publicMatchState?.state === 'in_progress' &&
      publicMatchState.currentHand &&
      !publicMatchState.currentHand.finished,
    );

    if (authoritativeHandInProgress) {
      startHandLockRef.current = true;

      if (isStartHandPending) {
        setIsStartHandPending(false);
      }

      if (startHandPendingTimeoutRef.current !== null) {
        window.clearTimeout(startHandPendingTimeoutRef.current);
        startHandPendingTimeoutRef.current = null;
      }

      return;
    }

    const canReleaseStartHandLock =
      publicMatchState?.state !== 'in_progress' &&
      privateMatchState?.state !== 'in_progress' &&
      !isStartHandPending;

    if (canReleaseStartHandLock) {
      startHandLockRef.current = false;
    }
  }, [
    isStartHandPending,
    privateMatchState?.state,
    publicMatchState?.currentHand,
    publicMatchState?.state,
  ]);

  const handleHandClimaxDismissed = useCallback(() => {
    const currentHand = viewModel.currentPublicHand ?? viewModel.currentPrivateHand;

    debugMatchPage('handClimaxDismissed:called', {
      matchFinished: viewModel.matchFinished,
      suppressHandOutcomeModal,
      currentHandFinished: currentHand?.finished ?? null,
      visualBeat,
      isAutoNextHandArmed,
    });

    if (viewModel.matchFinished || suppressHandOutcomeModal || !currentHand?.finished) {
      debugMatchPage('handClimaxDismissed:ignored', {
        matchFinished: viewModel.matchFinished,
        suppressHandOutcomeModal,
        currentHandFinished: currentHand?.finished ?? null,
      });
      return;
    }

    const autoStartKey = `${buildAutoNextHandKeyPrefix({
      matchId: viewModel.resolvedMatchId,
      hand: currentHand,
      playedRoundsCount: viewModel.playedRoundsCount,
      scorePlayerOne: visualPublicMatchState?.score.playerOne ?? 0,
      scorePlayerTwo: visualPublicMatchState?.score.playerTwo ?? 0,
    })}|climax`;

    if (lastAutoNextHandKeyRef.current === autoStartKey) {
      return;
    }

    lastAutoNextHandKeyRef.current = autoStartKey;
    pendingAutoNextHandKeyRef.current = null;
    lastAutoNextHandWaitLogKeyRef.current = null;
    debugMatchPage('handClimaxDismissed:arm-auto-next-hand', {
      autoStartKey,
      playedRoundsCount: viewModel.playedRoundsCount,
      scorePlayerOne: visualPublicMatchState?.score.playerOne ?? 0,
      scorePlayerTwo: visualPublicMatchState?.score.playerTwo ?? 0,
    });

    setIsAutoNextHandArmed(true);

    if (autoNextHandTimeoutRef.current !== null) {
      window.clearTimeout(autoNextHandTimeoutRef.current);
    }

    appendLog('Hand result dismissed. Arming automatic next hand.');

    autoNextHandTimeoutRef.current = window.setTimeout(() => {
      autoNextHandTimeoutRef.current = null;
      pendingAutoNextHandKeyRef.current = autoStartKey;
      lastAutoNextHandWaitLogKeyRef.current = null;
      tryDispatchAutomaticNextHand();
    }, AUTO_NEXT_HAND_DELAY_MS);
  }, [
    appendLog,
    suppressHandOutcomeModal,
    tryDispatchAutomaticNextHand,
    viewModel.currentPrivateHand,
    viewModel.currentPublicHand,
    viewModel.matchFinished,
    viewModel.playedRoundsCount,
    viewModel.resolvedMatchId,
    visualPublicMatchState?.score.playerOne,
    visualPublicMatchState?.score.playerTwo,
    visualBeat,
    isAutoNextHandArmed,
  ]);

  const playCardWithSound = useCallback(
    (card: CardPayload) => {
      playCardLaunchSound(play, 'own');
      handlePlayCard(card);
    },
    [handlePlayCard, play],
  );

  const primePendingBetCycleFromCurrentHand = useCallback(() => {
    const currentHand = viewModel.currentPrivateHand ?? viewModel.currentPublicHand;
    const myPlayerId = mapSeatToPlayerId(viewModel.mySeat);

    if (!currentHand || !myPlayerId) {
      return;
    }

    if (currentHand.finished) {
      return;
    }

    if (currentHand.betState !== 'idle') {
      return;
    }

    pendingBetCycleRef.current = {
      requestedBy: myPlayerId,
      pendingValue: resolveNextBetPendingValue(currentHand.currentValue),
      previousValue: currentHand.currentValue,
      requestShown: false,
      requestSoundPlayed: true,
      observedAwaitingResponse: false,
    };
  }, [viewModel.currentPrivateHand, viewModel.currentPublicHand, viewModel.mySeat]);

  const handleMatchActionWithSound = useCallback(
    (action: MatchAction) => {
      if (
        action === 'request-truco' ||
        action === 'raise-to-six' ||
        action === 'raise-to-nine' ||
        action === 'raise-to-twelve'
      ) {
        primePendingBetCycleFromCurrentHand();
        playMatchActionSound(play, action);
      }

      if (action === 'accept-mao-de-onze') {
        localMaoDeOnzeDeclineIntentRef.current = null;
      }

      if (action === 'decline-mao-de-onze') {
        const currentHand = viewModel.currentPrivateHand ?? viewModel.currentPublicHand;
        const myPlayerId = mapSeatToPlayerId(viewModel.mySeat);

        if (
          currentHand?.specialState === 'mao_de_onze' &&
          currentHand.specialDecisionPending &&
          myPlayerId !== null &&
          currentHand.specialDecisionBy === myPlayerId
        ) {
          // The backend identifies the 2v2 special decision side, not the exact local seat.
          localMaoDeOnzeDeclineIntentRef.current = {
            decisionBy: myPlayerId,
            handKey: [
              viewModel.resolvedMatchId,
              currentHand.viraRank,
              currentHand.currentValue,
              myPlayerId,
              'mao-de-onze',
            ].join('|'),
          };
        }
      }

      handleMatchAction(action);
    },
    [
      handleMatchAction,
      play,
      primePendingBetCycleFromCurrentHand,
      viewModel.currentPrivateHand,
      viewModel.currentPublicHand,
      viewModel.mySeat,
      viewModel.resolvedMatchId,
    ],
  );

  const hasMinimumSession = Boolean(session?.backendUrl && session?.authToken);
  const hasHydratedMatchState = Boolean(
    visualRoomState || visualPublicMatchState || visualPrivateMatchState || playerAssigned,
  );
  const canRenderLiveState = Boolean(
    session?.backendUrl && session?.authToken && viewModel.resolvedMatchId,
  );
  const shouldKeepCardsDuringResultBeat =
    visualBeat === 'hand_result_hold' || (viewModel.matchFinished && !isAutoNextHandArmed);
  const displayedMyPlayedCard = liveTableTransition.displayedMyPlayedCard;
  const displayedOpponentPlayedCard = liveTableTransition.displayedOpponentPlayedCard;
  const hiddenMyCardKeys = useMemo(() => {
    const cards = new Set<string>();

    addVisibleCardToSet(cards, displayedMyPlayedCard);
    addVisibleCardToSet(cards, viewModel.myPlayedCard);

    if (liveTableTransition.pendingPlayedCard?.owner === 'mine') {
      addVisibleCardToSet(cards, liveTableTransition.pendingPlayedCard.card);
    }

    if (
      liveTableTransition.isResolvingRound ||
      liveTableTransition.resolvedRoundFinished ||
      viewModel.handFinished
    ) {
      addVisibleCardToSet(cards, liveTableTransition.closingTableCards.mine);
    }

    if (viewModel.mySeat) {
      addVisibleCardToSet(cards, seatPlayedCards[viewModel.mySeat]);
      addVisibleCardToSet(cards, resolvedSeatPlayedCards[viewModel.mySeat]);
      addVisibleCardToSet(cards, frozenSeatPlayedCards[viewModel.mySeat]);
    }

    return cards;
  }, [
    displayedMyPlayedCard,
    frozenSeatPlayedCards,
    liveTableTransition.closingTableCards.mine,
    liveTableTransition.isResolvingRound,
    liveTableTransition.pendingPlayedCard,
    liveTableTransition.resolvedRoundFinished,
    resolvedSeatPlayedCards,
    seatPlayedCards,
    viewModel.handFinished,
    viewModel.myPlayedCard,
    viewModel.mySeat,
  ]);

  const rawEffectiveMyCards = shouldKeepCardsDuringResultBeat
    ? cachedMyCards
    : viewModel.myCards.length > 0
      ? viewModel.myCards
      : cachedMyCards;
  const effectiveMyCards = removeVisiblePlayedCardsFromHand(rawEffectiveMyCards, hiddenMyCardKeys);
  const shouldRenderResolvedSeatSnapshot =
    liveTableTransition.isResolvingRound ||
    liveTableTransition.resolvedRoundFinished ||
    viewModel.handFinished;
  const authoritativeRoundForSeatCards =
    viewModel.currentPublicHand?.rounds[viewModel.currentPublicHand.currentRoundIndex] ??
    viewModel.latestRound;
  const effectiveSeatPlayedCards = useMemo<SeatPlayedCardsSnapshot>(() => {
    const isOpeningMaoDeOnzeDecision =
      viewModel.playedRoundsCount === 0 && viewModel.nextDecisionType === 'resolve-mao-de-onze';

    if (shouldSuppressDeclinedHandSeatCards || isOpeningMaoDeOnzeDecision) {
      return {};
    }

    const snapshot: SeatPlayedCardsSnapshot = {};
    const copyCards = (
      cards: Partial<SeatPlayedCardsSnapshot>,
      options: { skipBufferedReplayLocks?: boolean } = {},
    ): void => {
      Object.entries(cards).forEach(([seatId, card]) => {
        if (
          options.skipBufferedReplayLocks &&
          isVisiblePlayedCard(card) &&
          bufferedSeatReplayLocksRef.current[seatId] === card
        ) {
          return;
        }

        snapshot[seatId] = card ?? null;
      });
    };

    if (shouldUseLiveOnlySeatCardsForDeclinedHand) {
      copyCards(authoritativeRoundForSeatCards?.seatPlays ?? {}, {
        skipBufferedReplayLocks: true,
      });
      copyCards(seatPlayedCards);

      return snapshot;
    }

    if (shouldRenderResolvedSeatSnapshot) {
      // Frozen cards are only a fallback when live and resolved table cards are empty.
      if (hasSeatPlayedCards(seatPlayedCards)) {
        copyCards(seatPlayedCards);
      } else if (hasSeatPlayedCards(resolvedSeatPlayedCards)) {
        copyCards(resolvedSeatPlayedCards);
      } else if (hasSeatPlayedCards(frozenSeatPlayedCards)) {
        copyCards(frozenSeatPlayedCards);
      }

      return snapshot;
    }

    copyCards(authoritativeRoundForSeatCards?.seatPlays ?? {}, {
      skipBufferedReplayLocks: true,
    });
    copyCards(seatPlayedCards);

    return snapshot;
  }, [
    authoritativeRoundForSeatCards,
    bufferedSeatReplayVersion,
    shouldSuppressDeclinedHandSeatCards,
    shouldUseLiveOnlySeatCardsForDeclinedHand,
    viewModel.nextDecisionType,
    viewModel.playedRoundsCount,
    frozenSeatPlayedCards,
    resolvedSeatPlayedCards,
    seatPlayedCards,
    shouldRenderResolvedSeatSnapshot,
  ]);

  const tableCurrentPublicHand = useMemo(() => {
    if (!viewModel.isOneVsOne) {
      // Replay locks hide only table faces; 2v2 hand counters still follow authoritative card-played events.
      return viewModel.currentPublicHand;
    }

    return maskBufferedReplaySeatPlays(
      viewModel.currentPublicHand,
      bufferedSeatReplayLocksRef.current,
    );
  }, [bufferedSeatReplayVersion, viewModel.currentPublicHand, viewModel.isOneVsOne]);

  const handOutcomeRevealHoldKey =
    currentFinishedHandResultKey !== null &&
    (viewModel.handFinished || viewModel.matchFinished) &&
    hasSeatPlayedCards(effectiveSeatPlayedCards)
      ? currentFinishedHandResultKey
      : null;

  const shouldStartHandOutcomeRevealHold = Boolean(
    handOutcomeRevealHoldKey !== null &&
    handOutcomeRevealHoldKeyRef.current !== handOutcomeRevealHoldKey,
  );

  const shouldDelayHandOutcomeModal = Boolean(
    liveTableTransition.isResolvingRound ||
    visualBeat === 'hand_reset' ||
    visualBeat === 'hand_intro' ||
    isHandOutcomeRevealHoldActive ||
    shouldStartHandOutcomeRevealHold,
  );

  useEffect(() => {
    if (handOutcomeRevealHoldKey === null) {
      if (!viewModel.handFinished && !viewModel.matchFinished) {
        handOutcomeRevealHoldKeyRef.current = null;
        setIsHandOutcomeRevealHoldActive(false);

        if (handOutcomeRevealHoldTimeoutRef.current !== null) {
          window.clearTimeout(handOutcomeRevealHoldTimeoutRef.current);
          handOutcomeRevealHoldTimeoutRef.current = null;
        }
      }

      return;
    }

    if (handOutcomeRevealHoldKeyRef.current === handOutcomeRevealHoldKey) {
      return;
    }

    handOutcomeRevealHoldKeyRef.current = handOutcomeRevealHoldKey;
    setIsHandOutcomeRevealHoldActive(true);

    if (handOutcomeRevealHoldTimeoutRef.current !== null) {
      window.clearTimeout(handOutcomeRevealHoldTimeoutRef.current);
    }

    handOutcomeRevealHoldTimeoutRef.current = window.setTimeout(() => {
      handOutcomeRevealHoldTimeoutRef.current = null;
      setIsHandOutcomeRevealHoldActive(false);
    }, HAND_OUTCOME_AFTER_ROUND_BADGE_HOLD_MS);
  }, [handOutcomeRevealHoldKey, viewModel.handFinished, viewModel.matchFinished]);

  useEffect(() => {
    debugMatchPage('handOutcomeSuppression:evaluate', {
      suppressHandOutcomeModal,
      shouldDelayHandOutcomeModal,
      handOutcomeRevealHoldKey,
      isHandOutcomeRevealHoldActive,
      shouldStartHandOutcomeRevealHold,
      hasEffectiveSeatPlayedCards: hasSeatPlayedCards(effectiveSeatPlayedCards),
      isResolvingRound: liveTableTransition.isResolvingRound,
      visualBeat,
      tablePhase: viewModel.tablePhase,
      handFinished: viewModel.handFinished,
      matchFinished: viewModel.matchFinished,
    });
  }, [
    effectiveSeatPlayedCards,
    handOutcomeRevealHoldKey,
    isHandOutcomeRevealHoldActive,
    liveTableTransition.isResolvingRound,
    shouldDelayHandOutcomeModal,
    shouldStartHandOutcomeRevealHold,
    suppressHandOutcomeModal,
    viewModel.handFinished,
    viewModel.matchFinished,
    viewModel.tablePhase,
    visualBeat,
  ]);

  if (!hasMinimumSession) {
    return (
      <section className="mx-auto grid max-w-xl gap-6 pt-20">
        <div
          className="gold-frame rounded-2xl p-8 text-center"
          style={{ background: 'rgba(15,25,35,0.8)' }}
        >
          <div className="text-[10px] font-bold uppercase tracking-[2px] text-amber-400">
            Sessão necessária
          </div>
          <h1 className="mt-3 text-2xl font-black text-white">Faça login para acessar a mesa.</h1>
          <div className="mt-6 flex justify-center gap-3">
            <Link
              to="/"
              className="rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-bold text-slate-900 transition hover:bg-amber-400"
            >
              Ir para home
            </Link>
            <Link
              to="/lobby"
              className="rounded-xl border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              Lobby
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="match-arena-page relative flex h-[100svh] min-h-0 w-full flex-col overflow-hidden bg-[#04070d]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_-12%,rgba(201,168,76,0.12),transparent_42%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(34,110,74,0.16),transparent_34%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_82%_78%,rgba(12,58,34,0.22),transparent_32%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(3,7,12,0.18),rgba(3,7,12,0.72))]" />

      <div className="relative z-50 flex shrink-0 items-center justify-between gap-1.5 px-1.5 py-0.5 sm:px-2 sm:py-1 md:px-5 md:py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[8px] font-bold uppercase tracking-[1.4px] text-amber-200/50 sm:text-[10px] sm:tracking-[2px]">
            Truco Paulista
          </span>
        </div>

        <Link
          to="/lobby"
          className="rounded-full border border-amber-300/10 bg-[#0b120f]/72 px-2 py-1 text-[8px] font-bold uppercase tracking-[1.2px] text-amber-100/60 transition-colors hover:border-amber-300/30 hover:bg-[#101914]/82 hover:text-amber-200 sm:px-4 sm:py-2 sm:text-[10px] sm:tracking-[2px]"
        >
          ← Voltar ao lobby
        </Link>
      </div>

      {/* NOTE: The match route is a fixed-height game arena. The page owns clipping;
          the table frame remains overflow-visible so card hover and launch motion
          can breathe without creating document scroll. */}
      <main className="relative z-10 flex min-h-0 flex-1 flex-col items-center overflow-hidden px-0.5 pb-0.5 sm:px-2 sm:pb-3 md:px-4 md:pb-4">
        <div className="match-arena-frame gold-frame flex h-full min-h-0 w-full min-w-0 max-w-full flex-1 flex-col lg:max-w-[1440px]">
          <MatchPageHeader
            connectionStatus={connectionStatus}
            resolvedMatchId={viewModel.resolvedMatchId}
            mySeat={viewModel.mySeat}
            viraRank={viraRank}
            canStartHand={
              viewModel.canStartHand && !isStartHandPending && !startHandLockRef.current
            }
            onRefreshState={handleRefreshState}
            onStartHand={handleStartHandWithGate}
            scoreLabel={viewModel.scoreLabel}
            currentValue={viewModel.currentValue}
            rounds={viewModel.rounds}
          />

          {!hasHydratedMatchState ? (
            <div className="shrink-0 px-4 py-2 text-center text-[10px] text-slate-500">
              Aguardando estado do servidor…
            </div>
          ) : null}

          <div className="relative flex min-h-0 min-w-0 flex-1 overflow-visible">
            <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-visible">
              {shouldRenderDeveloperTools ? (
                <div className="pointer-events-none absolute right-3 top-3 z-40 hidden xl:block">
                  <button
                    type="button"
                    onClick={() => setShowSecondary((state) => !state)}
                    className="pointer-events-auto rounded-full border border-amber-300/12 bg-[#0b120f]/94 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.2em] text-amber-100/65 transition hover:border-amber-300/28 hover:bg-[#111b15] hover:text-amber-200"
                  >
                    {showSecondary ? 'Ocultar diagnóstico' : 'Abrir diagnóstico'}
                  </button>
                </div>
              ) : null}

              <div className="relative min-h-0 flex-1 overflow-visible">
                {viewModel.isOneVsOne ? (
                  <MatchTableShell
                    handStatusLabel={viewModel.handStatusLabel}
                    handStatusTone={viewModel.handStatusTone}
                    betState={viewModel.betState}
                    currentValue={viewModel.currentValue}
                    pendingValue={viewModel.pendingValue}
                    requestedBy={viewModel.requestedBy}
                    specialState={viewModel.specialState}
                    specialDecisionPending={viewModel.specialDecisionPending}
                    specialDecisionBy={viewModel.specialDecisionBy}
                    winner={viewModel.winner}
                    awardedPoints={viewModel.awardedPoints}
                    latestRound={viewModel.latestRound}
                    latestRoundMyPlayedCard={viewModel.myPlayedCard}
                    latestRoundOpponentPlayedCard={viewModel.opponentPlayedCard}
                    displayedResolvedRoundFinished={liveTableTransition.resolvedRoundFinished}
                    displayedResolvedRoundResult={liveTableTransition.resolvedRoundResult}
                    tablePhase={viewModel.tablePhase}
                    canStartHand={
                      viewModel.canStartHand && !isStartHandPending && !startHandLockRef.current
                    }
                    scoreLabel={viewModel.scoreLabel}
                    opponentSeatView={viewModel.opponentSeatView}
                    mySeatView={viewModel.mySeatView}
                    isOneVsOne={viewModel.isOneVsOne}
                    roomMode={visualRoomState?.mode ?? null}
                    currentTurnSeatId={viewModel.currentTurnSeatId}
                    displayedOpponentPlayedCard={displayedOpponentPlayedCard}
                    displayedMyPlayedCard={displayedMyPlayedCard}
                    opponentRevealKey={liveTableTransition.opponentRevealKey}
                    myRevealKey={
                      liveTableTransition.pendingPlayedCard?.owner === 'mine'
                        ? liveTableTransition.pendingPlayedCard.id
                        : buildCardRevealKey(displayedMyPlayedCard)
                    }
                    myCardLaunching={Boolean(
                      liveTableTransition.pendingPlayedCard?.owner === 'mine' &&
                      !viewModel.myPlayedCard,
                    )}
                    roundIntroKey={liveTableTransition.roundIntroKey}
                    roundResolvedKey={liveTableTransition.roundResolvedKey}
                    isResolvingRound={liveTableTransition.isResolvingRound}
                    closingTableCards={liveTableTransition.closingTableCards}
                    currentPrivateViraRank={viewModel.currentPrivateHand?.viraRank ?? null}
                    currentPublicViraRank={viewModel.currentPublicHand?.viraRank ?? null}
                    currentPrivateViraCard={
                      viewModel.currentPrivateHand?.viraCard ?? lastKnownViraCard
                    }
                    currentPublicViraCard={
                      viewModel.currentPublicHand?.viraCard ?? lastKnownViraCard
                    }
                    viraRank={viraRank}
                    isViraRevealActive={isNewHandOpeningLocked}
                    viraRevealKey={openingViraReveal?.key ?? 'vira-static'}
                    availableActions={safeAvailableActions}
                    onAction={handleMatchActionWithSound}
                    myCards={effectiveMyCards}
                    canPlayCard={safeCanPlayCard}
                    launchingCardKey={liveTableTransition.launchingCardKey}
                    pendingPlayedCard={liveTableTransition.pendingPlayedCard}
                    currentPrivateHand={viewModel.currentPrivateHand}
                    currentPublicHand={tableCurrentPublicHand}
                    onPlayCard={playCardWithSound}
                    playedRoundsCount={viewModel.playedRoundsCount}
                    isMyTurn={safeCanPlayCard && viewModel.currentTurnSeatId === viewModel.mySeat}
                    suppressHandOutcomeModal={
                      suppressHandOutcomeModal || shouldDelayHandOutcomeModal
                    }
                    onHandClimaxDismissed={handleHandClimaxDismissed}
                  />
                ) : (
                  <MatchTableShell2v2
                    handStatusLabel={viewModel.handStatusLabel}
                    handStatusTone={viewModel.handStatusTone}
                    betState={viewModel.betState}
                    currentValue={viewModel.currentValue}
                    pendingValue={viewModel.pendingValue}
                    requestedBy={viewModel.requestedBy}
                    specialState={viewModel.specialState}
                    specialDecisionPending={viewModel.specialDecisionPending}
                    specialDecisionBy={viewModel.specialDecisionBy}
                    winner={viewModel.winner}
                    awardedPoints={viewModel.awardedPoints}
                    latestRound={viewModel.latestRound}
                    latestRoundMyPlayedCard={viewModel.myPlayedCard}
                    latestRoundOpponentPlayedCard={viewModel.opponentPlayedCard}
                    displayedResolvedRoundFinished={liveTableTransition.resolvedRoundFinished}
                    displayedResolvedRoundResult={liveTableTransition.resolvedRoundResult}
                    tablePhase={viewModel.tablePhase}
                    canStartHand={
                      viewModel.canStartHand && !isStartHandPending && !startHandLockRef.current
                    }
                    scoreLabel={viewModel.scoreLabel}
                    opponentSeatView={viewModel.opponentSeatView}
                    mySeatView={viewModel.mySeatView}
                    roomPlayers={viewModel.roomPlayers}
                    isOneVsOne={viewModel.isOneVsOne}
                    roomMode={visualRoomState?.mode ?? null}
                    currentTurnSeatId={viewModel.currentTurnSeatId}
                    latestPlayedSeatId={latestPlayedSeatId}
                    seatPlayedCards={effectiveSeatPlayedCards}
                    seatCardConsumptionCounts={seatCardConsumptionCounts}
                    displayedOpponentPlayedCard={displayedOpponentPlayedCard}
                    displayedMyPlayedCard={displayedMyPlayedCard}
                    opponentRevealKey={liveTableTransition.opponentRevealKey}
                    myRevealKey={
                      liveTableTransition.pendingPlayedCard?.owner === 'mine'
                        ? liveTableTransition.pendingPlayedCard.id
                        : buildCardRevealKey(displayedMyPlayedCard)
                    }
                    myCardLaunching={Boolean(
                      liveTableTransition.pendingPlayedCard?.owner === 'mine' &&
                      !viewModel.myPlayedCard,
                    )}
                    roundIntroKey={liveTableTransition.roundIntroKey}
                    roundResolvedKey={liveTableTransition.roundResolvedKey}
                    isResolvingRound={liveTableTransition.isResolvingRound}
                    closingTableCards={liveTableTransition.closingTableCards}
                    currentPrivateViraRank={viewModel.currentPrivateHand?.viraRank ?? null}
                    currentPublicViraRank={viewModel.currentPublicHand?.viraRank ?? null}
                    currentPrivateViraCard={
                      viewModel.currentPrivateHand?.viraCard ?? lastKnownViraCard
                    }
                    currentPublicViraCard={
                      viewModel.currentPublicHand?.viraCard ?? lastKnownViraCard
                    }
                    viraRank={viraRank}
                    isViraRevealActive={isNewHandOpeningLocked}
                    viraRevealKey={openingViraReveal?.key ?? 'vira-static'}
                    availableActions={safeAvailableActions}
                    onAction={handleMatchActionWithSound}
                    myCards={effectiveMyCards}
                    canPlayCard={safeCanPlayCard}
                    launchingCardKey={liveTableTransition.launchingCardKey}
                    pendingPlayedCard={liveTableTransition.pendingPlayedCard}
                    currentPrivateHand={viewModel.currentPrivateHand}
                    currentPublicHand={tableCurrentPublicHand}
                    onPlayCard={playCardWithSound}
                    playedRoundsCount={viewModel.playedRoundsCount}
                    isMyTurn={viewModel.isMyTurnForVisuals}
                    suppressHandOutcomeModal={
                      suppressHandOutcomeModal || shouldDelayHandOutcomeModal
                    }
                    onHandClimaxDismissed={handleHandClimaxDismissed}
                    partnerSignal={lastPartnerSignal}
                    sentPartnerSignal={lastSentPartnerSignal}
                    partnerBetProposal={pendingPartnerBetProposal}
                    approvedPartnerBetProposal={recentApprovedPartnerBetProposal}
                    onApprovePartnerBetProposal={handleApprovePartnerBetProposal}
                    onRejectPartnerBetProposal={handleRejectPartnerBetProposal}
                    onSendPartnerSignal={handleSendPartnerSignal}
                  />
                )}

                <BetFeedbackBanner
                  feedback={betFeedback?.kind === 'requested' ? null : betFeedback}
                />

                {betFeedback?.kind !== 'declined' &&
                !shouldSkipDeclinedHandResult &&
                Object.values(effectiveSeatPlayedCards).every(
                  (card) => typeof card !== 'string' || card.length < 2,
                ) ? (
                  <HandTransitionVeil
                    visualBeat={visualBeat}
                    isTwoVersusTwo={!viewModel.isOneVsOne}
                    suppressCopy={openingViraReveal !== null}
                  />
                ) : null}

                <NewHandOpeningMask isActive={isNewHandOpeningLocked} />

                {openingViraReveal ? (
                  <ViraRevealAnimation
                    key={openingViraReveal.key}
                    rank={openingViraReveal.card.rank}
                    suit={openingViraReveal.card.suit}
                    isRed={
                      openingViraReveal.card.suit === 'C' || openingViraReveal.card.suit === 'O'
                    }
                    manilhaLabel={`Manilha definida • Vira: ${
                      openingViraReveal.rawCard ?? openingViraReveal.card.rank
                    }`}
                    onComplete={handleOpeningViraRevealComplete}
                  />
                ) : null}

                {shouldRenderTrucoDebugBadge ? (
                  <TrucoDebugBadge
                    publicMatchState={visualPublicMatchState}
                    privateMatchState={visualPrivateMatchState}
                  />
                ) : null}
              </div>
            </div>

            {shouldRenderDeveloperTools && showSecondary ? (
              <div className="hidden xl:block xl:min-h-0 xl:w-[332px] xl:shrink-0 xl:overflow-hidden xl:pl-3">
                <MatchSecondaryPanelSection
                  variant="docked"
                  eventLog={eventLog}
                  connectionStatus={connectionStatus}
                  resolvedMatchId={viewModel.resolvedMatchId}
                  publicState={visualPublicMatchState?.state || '-'}
                  privateState={visualPrivateMatchState?.state || '-'}
                  mySeat={viewModel.mySeat}
                  currentTurnSeatId={viewModel.currentTurnSeatId}
                  canStartHand={
                    viewModel.canStartHand && !isStartHandPending && !startHandLockRef.current
                  }
                  canPlayCard={safeCanPlayCard}
                  betState={viewModel.betState}
                  specialState={viewModel.specialState}
                  availableActions={safeAvailableActions}
                  canRenderLiveState={canRenderLiveState}
                  botDecisionSource={viewModel.lastBotDecision?.source ?? null}
                  botDecisionProfile={viewModel.lastBotDecision?.profile ?? null}
                  botLastAction={viewModel.lastBotDecision?.action ?? null}
                  botDecisionStrategy={viewModel.lastBotDecision?.strategy ?? null}
                  botHandStrength={viewModel.lastBotDecision?.handStrength ?? null}
                  botReason={viewModel.lastBotDecision?.reason ?? null}
                  botDecisionAt={viewModel.lastBotDecision?.occurredAt ?? null}
                  botActorSeatId={viewModel.lastBotDecision?.actorSeatId ?? null}
                  botActorTeamId={viewModel.lastBotDecision?.actorTeamId ?? null}
                  botPartnerSeatId={viewModel.lastBotDecision?.partnerSeatId ?? null}
                  botWinningSeatIdBeforeDecision={
                    viewModel.lastBotDecision?.winningSeatIdBeforeDecision ?? null
                  }
                  botWinningTeamIdBeforeDecision={
                    viewModel.lastBotDecision?.winningTeamIdBeforeDecision ?? null
                  }
                  botWinningCardBeforeDecision={
                    viewModel.lastBotDecision?.winningCardBeforeDecision ?? null
                  }
                  botPartnerWasWinning={viewModel.lastBotDecision?.partnerWasWinning ?? null}
                  botActorHandBefore={viewModel.lastBotDecision?.actorHandBefore ?? null}
                  botSelectedCard={viewModel.lastBotDecision?.selectedCard ?? null}
                  botExecutionStatus={viewModel.lastBotDecision?.executionStatus ?? null}
                  botExecutedAction={viewModel.lastBotDecision?.executedAction ?? null}
                  botExecutionReason={viewModel.lastBotDecision?.executionReason ?? null}
                  botExecutionError={viewModel.lastBotDecision?.executionError ?? null}
                  botBetCurrentValue={viewModel.lastBotDecision?.betCurrentValue ?? null}
                  botBetPendingValue={viewModel.lastBotDecision?.betPendingValue ?? null}
                  botBetSelectedAction={viewModel.lastBotDecision?.betSelectedAction ?? null}
                  botBetProgressBoost={viewModel.lastBotDecision?.betProgressBoost ?? null}
                  botBetScoreBoost={viewModel.lastBotDecision?.betScoreBoost ?? null}
                  botBetEffectiveStrength={viewModel.lastBotDecision?.betEffectiveStrength ?? null}
                  botBetAcceptThreshold={viewModel.lastBotDecision?.betAcceptThreshold ?? null}
                  botBetRaiseThreshold={viewModel.lastBotDecision?.betRaiseThreshold ?? null}
                  botBetInitiativeThreshold={
                    viewModel.lastBotDecision?.betInitiativeThreshold ?? null
                  }
                  botBetDeclineFloor={viewModel.lastBotDecision?.betDeclineFloor ?? null}
                  botBetMyPointsToWin={viewModel.lastBotDecision?.betMyPointsToWin ?? null}
                  botBetOpponentPointsToWin={
                    viewModel.lastBotDecision?.betOpponentPointsToWin ?? null
                  }
                  botBetDeclineLosesMatch={viewModel.lastBotDecision?.betDeclineLosesMatch ?? null}
                  botBetAcceptRisksMatch={viewModel.lastBotDecision?.betAcceptRisksMatch ?? null}
                  rounds={viewModel.rounds}
                  latestRound={viewModel.latestRound}
                  playedRoundsCount={viewModel.playedRoundsCount}
                />
              </div>
            ) : null}

            {shouldRenderDeveloperTools && showSecondary ? (
              <MatchSecondaryPanelSection
                variant="overlay"
                onClose={() => setShowSecondary(false)}
                eventLog={eventLog}
                connectionStatus={connectionStatus}
                resolvedMatchId={viewModel.resolvedMatchId}
                publicState={visualPublicMatchState?.state || '-'}
                privateState={visualPrivateMatchState?.state || '-'}
                mySeat={viewModel.mySeat}
                currentTurnSeatId={viewModel.currentTurnSeatId}
                canStartHand={
                  viewModel.canStartHand && !isStartHandPending && !startHandLockRef.current
                }
                canPlayCard={safeCanPlayCard}
                betState={viewModel.betState}
                specialState={viewModel.specialState}
                availableActions={safeAvailableActions}
                canRenderLiveState={canRenderLiveState}
                botDecisionSource={viewModel.lastBotDecision?.source ?? null}
                botDecisionProfile={viewModel.lastBotDecision?.profile ?? null}
                botLastAction={viewModel.lastBotDecision?.action ?? null}
                botDecisionStrategy={viewModel.lastBotDecision?.strategy ?? null}
                botHandStrength={viewModel.lastBotDecision?.handStrength ?? null}
                botReason={viewModel.lastBotDecision?.reason ?? null}
                botDecisionAt={viewModel.lastBotDecision?.occurredAt ?? null}
                botActorSeatId={viewModel.lastBotDecision?.actorSeatId ?? null}
                botActorTeamId={viewModel.lastBotDecision?.actorTeamId ?? null}
                botPartnerSeatId={viewModel.lastBotDecision?.partnerSeatId ?? null}
                botWinningSeatIdBeforeDecision={
                  viewModel.lastBotDecision?.winningSeatIdBeforeDecision ?? null
                }
                botWinningTeamIdBeforeDecision={
                  viewModel.lastBotDecision?.winningTeamIdBeforeDecision ?? null
                }
                botWinningCardBeforeDecision={
                  viewModel.lastBotDecision?.winningCardBeforeDecision ?? null
                }
                botPartnerWasWinning={viewModel.lastBotDecision?.partnerWasWinning ?? null}
                botActorHandBefore={viewModel.lastBotDecision?.actorHandBefore ?? null}
                botSelectedCard={viewModel.lastBotDecision?.selectedCard ?? null}
                botExecutionStatus={viewModel.lastBotDecision?.executionStatus ?? null}
                botExecutedAction={viewModel.lastBotDecision?.executedAction ?? null}
                botExecutionReason={viewModel.lastBotDecision?.executionReason ?? null}
                botExecutionError={viewModel.lastBotDecision?.executionError ?? null}
                botBetCurrentValue={viewModel.lastBotDecision?.betCurrentValue ?? null}
                botBetPendingValue={viewModel.lastBotDecision?.betPendingValue ?? null}
                botBetSelectedAction={viewModel.lastBotDecision?.betSelectedAction ?? null}
                botBetProgressBoost={viewModel.lastBotDecision?.betProgressBoost ?? null}
                botBetScoreBoost={viewModel.lastBotDecision?.betScoreBoost ?? null}
                botBetEffectiveStrength={viewModel.lastBotDecision?.betEffectiveStrength ?? null}
                botBetAcceptThreshold={viewModel.lastBotDecision?.betAcceptThreshold ?? null}
                botBetRaiseThreshold={viewModel.lastBotDecision?.betRaiseThreshold ?? null}
                botBetInitiativeThreshold={
                  viewModel.lastBotDecision?.betInitiativeThreshold ?? null
                }
                botBetDeclineFloor={viewModel.lastBotDecision?.betDeclineFloor ?? null}
                botBetMyPointsToWin={viewModel.lastBotDecision?.betMyPointsToWin ?? null}
                botBetOpponentPointsToWin={
                  viewModel.lastBotDecision?.betOpponentPointsToWin ?? null
                }
                botBetDeclineLosesMatch={viewModel.lastBotDecision?.betDeclineLosesMatch ?? null}
                botBetAcceptRisksMatch={viewModel.lastBotDecision?.betAcceptRisksMatch ?? null}
                rounds={viewModel.rounds}
                latestRound={viewModel.latestRound}
                playedRoundsCount={viewModel.playedRoundsCount}
              />
            ) : null}
          </div>
        </div>
      </main>
    </section>
  );
}

function getViewerCards(
  currentPrivateHand: MatchStatePayload['currentHand'] | null,
): CardPayload[] {
  if (!currentPrivateHand) {
    return [];
  }

  const rawViewerHand =
    currentPrivateHand.viewerPlayerId === 'P1'
      ? currentPrivateHand.playerOneHand
      : currentPrivateHand.viewerPlayerId === 'P2'
        ? currentPrivateHand.playerTwoHand
        : [];

  return rawViewerHand
    .map((card: string) => cardStringToPayload(card))
    .filter((card): card is CardPayload => card !== null);
}

function emptyAvailableActions(): MatchStateHandPayload['availableActions'] {
  return {
    canRequestTruco: false,
    canRaiseToSix: false,
    canRaiseToNine: false,
    canRaiseToTwelve: false,
    canAcceptBet: false,
    canDeclineBet: false,
    canAcceptMaoDeOnze: false,
    canDeclineMaoDeOnze: false,
    canAttemptPlayCard: false,
  };
}

function resolvePlayedCardOwner({
  payloadPlayerId,
  payloadSeatId,
  mySeat,
}: {
  payloadPlayerId: string | null;
  payloadSeatId: string | null;
  mySeat: string | null;
}): 'mine' | 'opponent' {
  if (!mySeat) {
    return 'opponent';
  }

  if (payloadSeatId) {
    return payloadSeatId === mySeat ? 'mine' : 'opponent';
  }

  if (!payloadPlayerId) {
    return 'opponent';
  }

  const myPlayerId = mapSeatToPlayerId(mySeat);

  if (!myPlayerId) {
    return 'opponent';
  }

  return payloadPlayerId === myPlayerId ? 'mine' : 'opponent';
}

function mapSeatToPlayerId(seatId: string | null): 'P1' | 'P2' | null {
  if (!seatId) {
    return null;
  }

  if (seatId === 'T1A' || seatId === 'T1B') {
    return 'P1';
  }

  if (seatId === 'T2A' || seatId === 'T2B') {
    return 'P2';
  }

  return null;
}

function isHandFinishedState(matchState: MatchStatePayload | null | undefined): boolean {
  const currentHand = matchState?.currentHand;

  if (!matchState || !currentHand) {
    return false;
  }

  return (
    matchState.state === 'finished' ||
    Boolean(currentHand.finished) ||
    currentHand.nextDecisionType === 'start-next-hand' ||
    currentHand.nextDecisionType === 'match-finished'
  );
}

function isFreshPlayableState(matchState: MatchStatePayload | null | undefined): boolean {
  const currentHand = matchState?.currentHand;

  if (!matchState || !currentHand) {
    return false;
  }

  return (
    matchState.state === 'in_progress' &&
    !currentHand.finished &&
    currentHand.nextDecisionType === 'play-card'
  );
}

function isResolvedHandFinished({
  publicMatchState,
  privateMatchState,
}: {
  publicMatchState: MatchStatePayload | null | undefined;
  privateMatchState: MatchStatePayload | null | undefined;
}): boolean {
  return isHandFinishedState(privateMatchState) || isHandFinishedState(publicMatchState);
}

function isFreshPlayableHandState({
  publicMatchState,
  privateMatchState,
}: {
  publicMatchState: MatchStatePayload | null | undefined;
  privateMatchState: MatchStatePayload | null | undefined;
}): boolean {
  return isFreshPlayableState(privateMatchState) || isFreshPlayableState(publicMatchState);
}
