import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../features/auth/authStore';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMatchActionBridge } from '../features/match/useMatchActionBridge';
import type { MatchAction } from '../features/match/matchActionTypes';
import { MatchPageHeader } from '../features/match/matchPageHeader';
import { buildMatchContractPresentation } from '../features/match/matchPresentationSelectors';
import { MatchSecondaryPanelSection } from '../features/match/matchSecondaryPanelSection';
import { getLastActiveMatchId } from '../features/match/matchSnapshotStorage';
import { MatchTableShell } from '../features/match/matchTableShell';
import { useMatchRealtimeSession } from '../features/match/useMatchRealtimeSession';
import { useMatchTableTransition } from '../features/match/useMatchTableTransition';
import { useGameSound } from '../hooks/useGameSound';
import { cardStringToPayload } from '../services/socket/socketTypes';
import type {
  BotIdentityPayload,
  CardPayload,
  MatchStatePayload,
  Rank,
  RoomStatePayload,
} from '../services/socket/socketTypes';

const TABLE_SEAT_ORDER_1V1 = ['T2A', 'T1A'] as const;
const TABLE_SEAT_ORDER_2V2 = ['T1B', 'T2A', 'T1A', 'T2B'] as const;
const HAND_INTRO_HOLD_MS = 720;
const HAND_RESULT_HOLD_MS = 760;
const NEXT_HAND_COMMIT_MS = 180;
const BET_FEEDBACK_HOLD_MS = 1500;
const BET_FEEDBACK_MIN_REQUESTED_MS = 950;
const REALTIME_RESOLUTION_GRACE_MS = 550;
const AUTO_NEXT_HAND_DELAY_MS = 3000;

type TableSeatView = {
  seatId: string;
  ready: boolean;
  isBot: boolean;
  isCurrentTurn: boolean;
  isMine: boolean;
  botIdentity: BotIdentityPayload | null;
};

type MatchStatusTone = 'neutral' | 'success' | 'warning';
type TablePhase = 'missing_context' | 'waiting' | 'playing' | 'hand_finished' | 'match_finished';
type VisualBeat = 'idle' | 'hand_intro' | 'hand_result_hold' | 'hand_reset' | 'live';

type BetFeedbackTone = 'neutral' | 'success' | 'warning';
type BetFeedbackKind = 'requested' | 'accepted' | 'declined';

type BetFeedbackState = {
  id: number;
  kind: BetFeedbackKind;
  title: string;
  detail: string;
  tone: BetFeedbackTone;
};

type MatchStateHandPayload = NonNullable<MatchStatePayload['currentHand']>;

type PendingBetCycle = {
  requestedBy: 'P1' | 'P2';
  pendingValue: number;
  previousValue: number;
  requestShown: boolean;
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
  scoreLabel: string;
  currentTurnSeatId: string | null;
  nextDecisionType: string | null;
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
  if (!import.meta.env.DEV) {
    return false;
  }

  if (typeof window === 'undefined') {
    return false;
  }

  return new URLSearchParams(window.location.search).get('debugTruco') === '1';
}

function BetFeedbackBanner({ feedback }: BetFeedbackBannerProps) {
  if (!feedback) {
    return null;
  }

  const toneClasses =
    feedback.tone === 'success'
      ? {
          chip: 'rgba(134, 239, 172, 0.9)',
          border: '1px solid rgba(74,222,128,0.20)',
          background:
            'linear-gradient(180deg, rgba(5, 40, 26, 0.97), rgba(5, 18, 14, 0.94) 100%)',
          glow: '0 0 28px rgba(34,197,94,0.12), 0 22px 52px rgba(0,0,0,0.42)',
        }
      : feedback.tone === 'warning'
        ? {
            chip: 'rgba(253, 224, 71, 0.92)',
            border: '1px solid rgba(245,158,11,0.24)',
            background:
              'linear-gradient(180deg, rgba(64, 28, 6, 0.97), rgba(26, 12, 8, 0.94) 100%)',
            glow: '0 0 28px rgba(245,158,11,0.12), 0 22px 52px rgba(0,0,0,0.42)',
          }
        : {
            chip: 'rgba(147, 197, 253, 0.92)',
            border: '1px solid rgba(96,165,250,0.22)',
            background:
              'linear-gradient(180deg, rgba(6, 23, 44, 0.97), rgba(5, 12, 24, 0.94) 100%)',
            glow: '0 0 28px rgba(59,130,246,0.10), 0 22px 52px rgba(0,0,0,0.42)',
          };

  return (
    <div className="pointer-events-none absolute left-1/2 top-[23%] z-[70] w-full max-w-[560px] -translate-x-1/2 px-4">
      <div
        className="rounded-[26px] px-6 py-4 text-center backdrop-blur-xl"
        style={{
          background: toneClasses.background,
          border: toneClasses.border,
          boxShadow: toneClasses.glow,
        }}
      >
        <div
          className="text-[10px] font-black uppercase tracking-[0.28em]"
          style={{ color: toneClasses.chip }}
        >
          Truco
        </div>
        <div className="mt-2 text-[18px] font-black uppercase tracking-[0.08em] text-white">
          {feedback.title}
        </div>
        <div className="mt-2 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-200">
          {feedback.detail}
        </div>
      </div>
    </div>
  );
}

export function MatchPage() {
  const params = useParams<{ matchId: string }>();
  const { session } = useAuth();
  const routeMatchId = params.matchId ?? '';
  const effectiveMatchId = routeMatchId || getLastActiveMatchId() || '';
  const mySeatRef = useRef<string | null>(null);
  const [viraRank, setViraRank] = useState<Rank>('4');
  const [showSecondary, setShowSecondary] = useState(false);
  const [visualBeat, setVisualBeat] = useState<VisualBeat>('idle');
  const [betFeedback, setBetFeedback] = useState<BetFeedbackState | null>(null);
  const [isAutoNextHandArmed, setIsAutoNextHandArmed] = useState(false);
  const { play } = useGameSound();
  const [cachedMyCards, setCachedMyCards] = useState<CardPayload[]>([]);
  const lastHydratedHandKeyRef = useRef<string | null>(null);
  const shouldRenderTrucoDebugBadge = shouldShowTrucoDebugBadge();
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
  const autoNextHandTimeoutRef = useRef<number | null>(null);
  const lastAutoNextHandKeyRef = useRef<string | null>(null);
  const pendingAutoNextHandKeyRef = useRef<string | null>(null);
  const lastAutoNextHandWaitLogKeyRef = useRef<string | null>(null);
  const latestCanStartHandRef = useRef(false);
  const latestIsStartHandPendingRef = useRef(false);
  const latestResolvedMatchIdRef = useRef('');
  const startHandPendingTimeoutRef = useRef<number | null>(null);
  const betFeedbackTimeoutRef = useRef<number | null>(null);
  const pendingRealtimeResolutionRef = useRef<PendingRealtimeResolution | null>(null);
  const pendingRealtimeResolutionTimeoutRef = useRef<number | null>(null);
  const bufferedCardsDuringIntroRef = useRef<Array<{ owner: 'mine' | 'opponent'; card: string }>>(
    [],
  );
  const betFeedbackQueueRef = useRef<BetFeedbackState[]>([]);
  const lastRequestedFeedbackAtRef = useRef<number | null>(null);
  const pendingBetCycleRef = useRef<PendingBetCycle | null>(null);

  const [isStartHandPending, setIsStartHandPending] = useState(false);
  const startHandLockRef = useRef(false);
  const latestVisualPublicHandRef = useRef<MatchStatePayload['currentHand'] | null>(null);

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
  }, []);

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

      const rounds = hand.rounds ?? [];
      const finishedRoundIndex = Math.max(0, pending.finishedRoundsCount - 1);
      const finishedRound = rounds[finishedRoundIndex] ?? null;

      if (!finishedRound) {
        return;
      }

      pendingRealtimeResolutionRef.current = null;

      if (pendingRealtimeResolutionTimeoutRef.current !== null) {
        window.clearTimeout(pendingRealtimeResolutionTimeoutRef.current);
        pendingRealtimeResolutionTimeoutRef.current = null;
      }

      const myCard =
        pending.myPlayerId === 'P1' ? finishedRound.playerOneCard : finishedRound.playerTwoCard;
      const opponentCard =
        pending.myPlayerId === 'P1' ? finishedRound.playerTwoCard : finishedRound.playerOneCard;

      triggerRoundResolutionRef.current({
        resolutionKey: pending.resolutionKey,
        myCard,
        opponentCard,
        roundResult: finishedRound.result ?? pending.roundWinner ?? null,
      });
    },
    [],
  );

  const handleRealtimeHandStarted = useCallback((payload: {
    matchId?: string;
    viraRank?: Rank | null;
  }) => {
    if (payload.viraRank) {
      setViraRank(payload.viraRank);
    }

    if (autoNextHandTimeoutRef.current !== null) {
      window.clearTimeout(autoNextHandTimeoutRef.current);
      autoNextHandTimeoutRef.current = null;
    }

    pendingAutoNextHandKeyRef.current = null;
    lastAutoNextHandKeyRef.current = null;
    lastAutoNextHandWaitLogKeyRef.current = null;
    lastHandStartedAtRef.current = Date.now();
    startHandLockRef.current = true;
    setIsStartHandPending(false);
    setIsAutoNextHandArmed(false);
    setVisualBeat('hand_intro');
    bufferedCardsDuringIntroRef.current = [];
    pendingBetCycleRef.current = null;
  }, []);

  const handleRealtimeCardPlayed = useCallback(
    (payload: { matchId?: string; playerId?: string | null; card?: string | null }) => {
      const owner = resolvePlayedCardOwner({
        payloadPlayerId: payload.playerId ?? null,
        mySeat: mySeatRef.current,
      });

      const card = payload.card ?? null;

      if (isDeferringVisualCommitRef.current || visualBeat === 'hand_intro') {
        if (owner && card) {
          bufferedCardsDuringIntroRef.current.push({ owner, card });
        }

        return;
      }

      registerIncomingPlayedCardRef.current({
        owner,
        card,
      });
    },
    [visualBeat],
  );

  const handleRealtimeRoundTransition = useCallback((payload: RoundTransitionPayload) => {
    if (payload.phase !== 'round-resolved') {
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

    const visualPublicHand = latestVisualPublicHandRef.current;
    const rounds = visualPublicHand?.rounds ?? [];
    const finishedRoundIndex = Math.max(0, payload.finishedRoundsCount - 1);
    const finishedRound = rounds[finishedRoundIndex] ?? null;

    if (finishedRound) {
      const myCard =
        myPlayerId === 'P1' ? finishedRound.playerOneCard : finishedRound.playerTwoCard;
      const opponentCard =
        myPlayerId === 'P1' ? finishedRound.playerTwoCard : finishedRound.playerOneCard;

      triggerRoundResolutionRef.current({
        resolutionKey,
        myCard,
        opponentCard,
        roundResult: finishedRound.result ?? payload.roundWinner ?? null,
      });

      return;
    }

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
  }, []);

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
    emitAcceptMaoDeOnze,
    emitDeclineMaoDeOnze,
  } = useMatchRealtimeSession({
    session,
    effectiveMatchId,
    onHandStarted: handleRealtimeHandStarted,
    onCardPlayed: handleRealtimeCardPlayed,
    onRoundTransition: handleRealtimeRoundTransition,
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
    const hand = visualPublicMatchState?.currentHand ?? null;
    latestVisualPublicHandRef.current = hand;
    tryFlushPendingRealtimeResolution(hand);
  }, [visualPublicMatchState, tryFlushPendingRealtimeResolution]);

  useEffect(() => {
    mySeatRef.current = playerAssigned?.seatId ?? initialSnapshot?.playerAssigned?.seatId ?? null;
  }, [initialSnapshot?.playerAssigned?.seatId, playerAssigned]);

  const drainBufferedCards = useCallback(() => {
    const buffered = bufferedCardsDuringIntroRef.current;
    bufferedCardsDuringIntroRef.current = [];

    for (const { owner, card } of buffered) {
      registerIncomingPlayedCardRef.current({ owner, card });
    }
  }, []);

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

    const isFreshOpeningHand =
      !displayedHandFinished &&
      incomingFreshPlayableHand &&
      visualPublicMatchState?.state !== 'in_progress' &&
      visualPrivateMatchState?.state !== 'in_progress' &&
      lastHandStartedAtRef.current !== null;

    if (shouldDeferNextHandCommit) {
      isDeferringVisualCommitRef.current = true;
      setVisualBeat('hand_result_hold');

      const pendingState: PendingVisualState = {
        roomState: roomState ?? null,
        publicMatchState: publicMatchState ?? null,
        privateMatchState: privateMatchState ?? null,
      };

      if (deferredNextHandTimeoutRef.current !== null) {
        return;
      }

      deferredNextHandTimeoutRef.current = window.setTimeout(() => {
        deferredNextHandTimeoutRef.current = null;

        beginHandTransitionRef.current();

        setVisualRoomState(pendingState.roomState);
        setVisualPublicMatchState(pendingState.publicMatchState);
        setVisualPrivateMatchState(pendingState.privateMatchState);
        setVisualBeat('live');
        isDeferringVisualCommitRef.current = false;

        drainBufferedCards();
      }, HAND_RESULT_HOLD_MS + NEXT_HAND_COMMIT_MS);

      return;
    }

    if (isFreshOpeningHand) {
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
        handIntroTimeoutRef.current = null;
        lastHandStartedAtRef.current = null;

        beginHandTransitionRef.current();

        setVisualRoomState(pendingState.roomState);
        setVisualPublicMatchState(pendingState.publicMatchState);
        setVisualPrivateMatchState(pendingState.privateMatchState);
        setVisualBeat('live');
        isDeferringVisualCommitRef.current = false;

        drainBufferedCards();
      }, HAND_INTRO_HOLD_MS);

      return;
    }

    if (deferredNextHandTimeoutRef.current !== null) {
      window.clearTimeout(deferredNextHandTimeoutRef.current);
      deferredNextHandTimeoutRef.current = null;
    }

    if (handIntroTimeoutRef.current !== null) {
      window.clearTimeout(handIntroTimeoutRef.current);
      handIntroTimeoutRef.current = null;
      lastHandStartedAtRef.current = null;
    }

    isDeferringVisualCommitRef.current = false;
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
    visualPrivateMatchState,
    visualPublicMatchState,
  ]);

  useEffect(() => {
    return () => {
      isDeferringVisualCommitRef.current = false;

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

      if (betFeedbackTimeoutRef.current !== null) {
        window.clearTimeout(betFeedbackTimeoutRef.current);
      }

      pendingRealtimeResolutionRef.current = null;
      bufferedCardsDuringIntroRef.current = [];
      betFeedbackQueueRef.current = [];
      pendingBetCycleRef.current = null;
      lastAutoNextHandKeyRef.current = null;
      lastAutoNextHandWaitLogKeyRef.current = null;
    };
  }, []);

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

    const isOneVsOne = visualRoomState?.mode === '1v1';
    const visibleSeatOrder = isOneVsOne ? TABLE_SEAT_ORDER_1V1 : TABLE_SEAT_ORDER_2V2;
    const roomPlayers: TableSeatView[] = visibleSeatOrder.map((seatId) => {
      const player = visualRoomState?.players.find((entry) => entry.seatId === seatId);

      return {
        seatId,
        ready: player?.ready ?? false,
        isBot: player?.isBot ?? false,
        isCurrentTurn: visualRoomState?.currentTurnSeatId === seatId,
        isMine: mySeat === seatId,
        botIdentity: player?.botIdentity ?? null,
      };
    });
    const mySeatView = roomPlayers.find((seat) => seat.isMine) ?? null;
    const opponentSeatView = roomPlayers.find((seat) => !seat.isMine) ?? null;
    const myCards = getViewerCards(currentPrivateHand);

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
    const isMyTurn = Boolean(mySeat && visualRoomState?.currentTurnSeatId === mySeat);
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

    const contractPresentation = buildMatchContractPresentation({
      publicMatchState: visualPublicMatchState,
      roomState: visualRoomState,
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
      scoreLabel: `T1 ${visualPublicMatchState?.score.playerOne ?? 0} × T2 ${
        visualPublicMatchState?.score.playerTwo ?? 0
      }`,
      currentTurnSeatId: contractPresentation.currentTurnSeatId,
      nextDecisionType,
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
    };
  }, [
    effectiveMatchId,
    playerAssigned,
    visualPrivateMatchState,
    visualPublicMatchState,
    visualRoomState,
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

    console.log('[truco][frontend-debug]', {
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
    console.log('[truco][actions-source]', {
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

      if (existingCycle === null) {
        pendingBetCycleRef.current = {
          requestedBy,
          pendingValue,
          previousValue: awaitingResponseSource.currentValue,
          requestShown: false,
        };
      } else {
        pendingBetCycleRef.current = {
          ...existingCycle,
          requestedBy,
          pendingValue,
          previousValue: existingCycle.previousValue,
        };
      }

      const activeCycle = pendingBetCycleRef.current;

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

        play('truco-call', 0.55);
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

      play('truco-call', 0.35);
      pendingBetCycleRef.current = null;
      return;
    }

    if (effectiveHand.finished && effectiveHand.awardedPoints === pendingCycle.previousValue) {
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

      pendingBetCycleRef.current = null;
    }
  }, [
    appendLog,
    enqueueBetFeedback,
    play,
    viewModel.currentPrivateHand,
    viewModel.currentPublicHand,
    viewModel.mySeat,
    viewModel.opponentSeatView,
  ]);

  const suppressHandOutcomeModal =
    betFeedback?.kind === 'requested' || betFeedback?.kind === 'declined';

  const { handleRefreshState, handleStartHand, handlePlayCard, handleMatchAction } =
    useMatchActionBridge({
      resolvedMatchId: viewModel.resolvedMatchId,
      mySeat: viewModel.mySeat,
      canStartHand: viewModel.canStartHand,
      canPlayCard: viewModel.canPlayCard,
      availableActions: viewModel.availableActions,
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
    });

  const handleStartHandWithGate = useCallback(() => {
    if (startHandLockRef.current || isStartHandPending || !viewModel.canStartHand) {
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

    startHandPendingTimeoutRef.current = window.setTimeout(() => {
      setIsStartHandPending(false);
      startHandPendingTimeoutRef.current = null;
    }, HAND_INTRO_HOLD_MS + HAND_RESULT_HOLD_MS + NEXT_HAND_COMMIT_MS + 1200);

    handleStartHand();
  }, [appendLog, handleStartHand, isStartHandPending, viewModel.canStartHand]);

  const tryDispatchAutomaticNextHand = useCallback(() => {
    const pendingKey = pendingAutoNextHandKeyRef.current;

    if (!pendingKey) {
      return;
    }

    if (!latestResolvedMatchIdRef.current) {
      const waitKey = `${pendingKey}|missing-match-id`;

      if (lastAutoNextHandWaitLogKeyRef.current !== waitKey) {
        lastAutoNextHandWaitLogKeyRef.current = waitKey;
        appendLog('Automatic next hand is armed, but matchId is unavailable yet.');
      }

      return;
    }

    if (latestIsStartHandPendingRef.current) {
      return;
    }

    if (!latestCanStartHandRef.current) {
      const waitKey = `${pendingKey}|waiting-readiness`;

      if (lastAutoNextHandWaitLogKeyRef.current !== waitKey) {
        lastAutoNextHandWaitLogKeyRef.current = waitKey;
        appendLog('Automatic next hand is armed, waiting for authoritative readiness.');
      }

      return;
    }

    lastAutoNextHandWaitLogKeyRef.current = null;
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
  ]);

  useEffect(() => {
    const currentHand = viewModel.currentPublicHand ?? viewModel.currentPrivateHand;

    if (betFeedback?.kind !== 'declined' || viewModel.matchFinished || !currentHand?.finished) {
      return;
    }

    const autoStartKey = [
      viewModel.resolvedMatchId,
      currentHand.viraRank,
      currentHand.winner ?? 'tie',
      currentHand.awardedPoints ?? 'null',
      viewModel.playedRoundsCount,
      visualPublicMatchState?.score.playerOne ?? 0,
      visualPublicMatchState?.score.playerTwo ?? 0,
      'declined',
    ].join('|');

    if (lastAutoNextHandKeyRef.current === autoStartKey) {
      return;
    }

    lastAutoNextHandKeyRef.current = autoStartKey;
    pendingAutoNextHandKeyRef.current = null;
    lastAutoNextHandWaitLogKeyRef.current = null;
    setIsAutoNextHandArmed(true);
    setVisualBeat('hand_reset');
    beginHandTransitionRef.current();

    if (autoNextHandTimeoutRef.current !== null) {
      window.clearTimeout(autoNextHandTimeoutRef.current);
    }

    appendLog('Bet declined. Arming automatic next hand.');

    autoNextHandTimeoutRef.current = window.setTimeout(() => {
      autoNextHandTimeoutRef.current = null;
      pendingAutoNextHandKeyRef.current = autoStartKey;
      lastAutoNextHandWaitLogKeyRef.current = null;
      tryDispatchAutomaticNextHand();
    }, AUTO_NEXT_HAND_DELAY_MS);
  }, [
    appendLog,
    betFeedback?.kind,
    tryDispatchAutomaticNextHand,
    viewModel.currentPrivateHand,
    viewModel.currentPublicHand,
    viewModel.matchFinished,
    viewModel.playedRoundsCount,
    viewModel.resolvedMatchId,
    visualPublicMatchState?.score.playerOne,
    visualPublicMatchState?.score.playerTwo,
  ]);

  useEffect(() => {
    const handIsLive =
      viewModel.tablePhase === 'playing' || viewModel.nextDecisionType === 'play-card';

    if (!isStartHandPending || !handIsLive) {
      return;
    }

    setIsStartHandPending(false);

    if (startHandPendingTimeoutRef.current !== null) {
      window.clearTimeout(startHandPendingTimeoutRef.current);
      startHandPendingTimeoutRef.current = null;
    }
  }, [isStartHandPending, viewModel.nextDecisionType, viewModel.tablePhase]);

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

    if (viewModel.matchFinished || suppressHandOutcomeModal || !currentHand?.finished) {
      return;
    }

    const autoStartKey = [
      viewModel.resolvedMatchId,
      currentHand.viraRank,
      currentHand.winner ?? 'tie',
      currentHand.awardedPoints ?? 'null',
      viewModel.playedRoundsCount,
      visualPublicMatchState?.score.playerOne ?? 0,
      visualPublicMatchState?.score.playerTwo ?? 0,
      'climax',
    ].join('|');

    if (lastAutoNextHandKeyRef.current === autoStartKey) {
      return;
    }

    lastAutoNextHandKeyRef.current = autoStartKey;
    pendingAutoNextHandKeyRef.current = null;
    lastAutoNextHandWaitLogKeyRef.current = null;
    setIsAutoNextHandArmed(true);
    setVisualBeat('hand_reset');
    beginHandTransitionRef.current();

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
  ]);

  const playCardWithSound = useCallback(
    (card: CardPayload) => {
      play('play-card', 0.4);
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
      pendingValue: currentHand.currentValue === 1 ? 3 : currentHand.currentValue,
      previousValue: currentHand.currentValue,
      requestShown: false,
    };
  }, [viewModel.currentPrivateHand, viewModel.currentPublicHand, viewModel.mySeat]);

  const handleMatchActionWithSound = useCallback(
    (action: MatchAction) => {
      if (action === 'request-truco') {
        primePendingBetCycleFromCurrentHand();
        play('truco-call', 0.7);
      }

      handleMatchAction(action);
    },
    [handleMatchAction, play, primePendingBetCycleFromCurrentHand],
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
  const shouldDelayHandOutcomeModal =
    liveTableTransition.isResolvingRound ||
    visualBeat === 'hand_reset' ||
    visualBeat === 'hand_intro';

  const effectiveMyCards = shouldKeepCardsDuringResultBeat
    ? cachedMyCards
    : viewModel.myCards.length > 0
      ? viewModel.myCards
      : cachedMyCards;

  const displayedMyPlayedCard = liveTableTransition.displayedMyPlayedCard;
  const displayedOpponentPlayedCard = liveTableTransition.displayedOpponentPlayedCard;

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
    <section className="relative flex h-screen min-h-0 w-full flex-col overflow-hidden bg-[#050810]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(201,168,76,0.08),transparent_50%)]" />

      <div className="relative z-50 flex shrink-0 items-center justify-between px-5 py-3 md:px-6 md:py-4">
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-bold uppercase tracking-[2px] text-slate-500">
            Truco Paulista
          </span>
        </div>

        <Link
          to="/lobby"
          className="rounded-full border border-white/5 px-4 py-2 text-[10px] font-bold uppercase tracking-[2px] text-slate-400 transition-colors hover:border-amber-400/30 hover:text-amber-400"
        >
          ← Voltar ao lobby
        </Link>
      </div>

      <main className="relative z-10 flex min-h-0 flex-1 flex-col items-center px-2 pb-2 md:px-4 md:pb-3">
        <div className="gold-frame flex min-h-0 w-full max-w-7xl flex-1 flex-col overflow-hidden">
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
          />

          {!hasHydratedMatchState ? (
            <div className="shrink-0 px-4 py-2 text-center text-[10px] text-slate-500">
              Aguardando estado do servidor…
            </div>
          ) : null}

          <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="relative min-h-0 flex-1">
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
                    : (displayedMyPlayedCard?.length ?? 0)
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
                viraRank={viraRank}
                availableActions={viewModel.availableActions}
                onAction={handleMatchActionWithSound}
                myCards={effectiveMyCards}
                canPlayCard={viewModel.canPlayCard}
                launchingCardKey={liveTableTransition.launchingCardKey}
                currentPrivateHand={viewModel.currentPrivateHand}
                currentPublicHand={viewModel.currentPublicHand}
                onPlayCard={playCardWithSound}
                playedRoundsCount={viewModel.playedRoundsCount}
                isMyTurn={viewModel.currentTurnSeatId === viewModel.mySeat}
                suppressHandOutcomeModal={
                  suppressHandOutcomeModal || shouldDelayHandOutcomeModal
                }
                onHandClimaxDismissed={handleHandClimaxDismissed}
              />

              <BetFeedbackBanner feedback={betFeedback} />

              {shouldRenderTrucoDebugBadge ? (
                <TrucoDebugBadge
                  publicMatchState={visualPublicMatchState}
                  privateMatchState={visualPrivateMatchState}
                />
              ) : null}
            </div>

            <div className="shrink-0 px-2 pb-2 pt-1 md:px-3 md:pb-3">
              <MatchSecondaryPanelSection
                showSecondary={showSecondary}
                onToggle={() => setShowSecondary((state) => !state)}
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
                canPlayCard={viewModel.canPlayCard}
                betState={viewModel.betState}
                specialState={viewModel.specialState}
                availableActions={viewModel.availableActions}
                canRenderLiveState={canRenderLiveState}
                rounds={viewModel.rounds}
                latestRound={viewModel.latestRound}
                playedRoundsCount={viewModel.playedRoundsCount}
              />
            </div>
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
  mySeat,
}: {
  payloadPlayerId: string | null;
  mySeat: string | null;
}): 'mine' | 'opponent' {
  if (!payloadPlayerId || !mySeat) {
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
