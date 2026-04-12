import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../features/auth/authStore';
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
  CardPayload,
  MatchStatePayload,
  Rank,
  RoomStatePayload,
} from '../services/socket/socketTypes';

const TABLE_SEAT_ORDER_1V1 = ['T2A', 'T1A'] as const;
const TABLE_SEAT_ORDER_2V2 = ['T1B', 'T2A', 'T1A', 'T2B'] as const;
const VIRA_RANK_OPTIONS: Rank[] = ['4', '5', '6', '7', 'Q', 'J', 'K', 'A', '2', '3'];

const HAND_INTRO_HOLD_MS = 650;
const HAND_RESULT_HOLD_MS = 900;
const NEXT_HAND_COMMIT_MS = 220;

type TableSeatView = {
  seatId: string;
  ready: boolean;
  isBot: boolean;
  isCurrentTurn: boolean;
  isMine: boolean;
};

type MatchStatusTone = 'neutral' | 'success' | 'warning';
type TablePhase = 'missing_context' | 'waiting' | 'playing' | 'hand_finished' | 'match_finished';
type VisualBeat = 'idle' | 'hand_intro' | 'hand_result_hold' | 'live';

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
  availableActions: NonNullable<MatchStatePayload['currentHand']>['availableActions'];
  handFinished: boolean;
  matchFinished: boolean;
  tablePhase: TablePhase;
  handStatusLabel: string;
  handStatusTone: MatchStatusTone;
  latestRound: NonNullable<MatchStatePayload['currentHand']>['rounds'][number] | null;
  rounds: NonNullable<MatchStatePayload['currentHand']>['rounds'];
  playedRoundsCount: number;
  currentPublicHand: MatchStatePayload['currentHand'] | null;
  currentPrivateHand: MatchStatePayload['currentHand'] | null;
};

type PendingVisualState = {
  roomState: RoomStatePayload | null;
  publicMatchState: MatchStatePayload | null;
  privateMatchState: MatchStatePayload | null;
};

export function MatchPage() {
  const params = useParams<{ matchId: string }>();
  const { session } = useAuth();
  const routeMatchId = params.matchId ?? '';
  const effectiveMatchId = routeMatchId || getLastActiveMatchId() || '';
  const mySeatRef = useRef<string | null>(null);
  const [viraRank, setViraRank] = useState<Rank>('4');
  const [showSecondary, setShowSecondary] = useState(false);
  const [visualBeat, setVisualBeat] = useState<VisualBeat>('idle');
  const { play } = useGameSound();
  const [cachedMyCards, setCachedMyCards] = useState<CardPayload[]>([]);
  const beginHandTransitionRef = useRef<() => void>(() => {});
  const registerIncomingPlayedCardRef = useRef<
    (params: { owner: 'mine' | 'opponent' | null; card: string | null }) => void
  >(() => {});
  const isDeferringVisualCommitRef = useRef(false);
  const lastHandStartedAtRef = useRef<number | null>(null);
  const handIntroTimeoutRef = useRef<number | null>(null);

  const handleRealtimeHandStarted = useCallback(
    (payload: { matchId?: string; viraRank?: Rank | null }) => {
      if (payload.viraRank) {
        setViraRank(payload.viraRank);
      }

      lastHandStartedAtRef.current = Date.now();
      setVisualBeat('hand_intro');
    },
    [],
  );

  const handleRealtimeCardPlayed = useCallback(
    (payload: { matchId?: string; playerId?: string | null; card?: string | null }) => {
      const owner = resolvePlayedCardOwner({
        payloadPlayerId: payload.playerId ?? null,
        mySeat: mySeatRef.current,
      });

      const isBlockingRealtimeCard =
        isDeferringVisualCommitRef.current || visualBeat === 'hand_intro';

      console.log('[matchPage][event][card-played]', {
        owner,
        card: payload.card ?? null,
        playerId: payload.playerId ?? null,
        mySeat: mySeatRef.current,
        isDeferringVisualCommit: isDeferringVisualCommitRef.current,
        visualBeat,
        isBlockingRealtimeCard,
      });

      // NOTE: The next-hand commit already has a dedicated delayed visual path.
      // Realtime card events that arrive during that hold must not pierce the
      // transition, or the bot move appears "glued" to the previous trick.
      if (isBlockingRealtimeCard) {
        console.log('[matchPage][event][card-played][deferred-skip]', {
          owner,
          card: payload.card ?? null,
          playerId: payload.playerId ?? null,
          visualBeat,
        });
        return;
      }

      registerIncomingPlayedCardRef.current({
        owner,
        card: payload.card ?? null,
      });
    },
    [visualBeat],
  );

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

  const visualPublicMatchStateRef = useRef<MatchStatePayload | null>(visualPublicMatchState);
  const visualPrivateMatchStateRef = useRef<MatchStatePayload | null>(visualPrivateMatchState);
  const pendingVisualStateRef = useRef<PendingVisualState | null>(null);
  const deferredNextHandTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    visualPublicMatchStateRef.current = visualPublicMatchState;
  }, [visualPublicMatchState]);

  useEffect(() => {
    visualPrivateMatchStateRef.current = visualPrivateMatchState;
  }, [visualPrivateMatchState]);

  useEffect(() => {
    mySeatRef.current = playerAssigned?.seatId ?? initialSnapshot?.playerAssigned?.seatId ?? null;
  }, [initialSnapshot?.playerAssigned?.seatId, playerAssigned]);

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

      pendingVisualStateRef.current = {
        roomState: roomState ?? null,
        publicMatchState: publicMatchState ?? null,
        privateMatchState: privateMatchState ?? null,
      };

      if (deferredNextHandTimeoutRef.current !== null) {
        return;
      }

      deferredNextHandTimeoutRef.current = window.setTimeout(() => {
        const pendingState = pendingVisualStateRef.current;
        pendingVisualStateRef.current = null;
        deferredNextHandTimeoutRef.current = null;

        beginHandTransitionRef.current();

        setVisualRoomState(pendingState?.roomState ?? null);
        setVisualPublicMatchState(pendingState?.publicMatchState ?? null);
        setVisualPrivateMatchState(pendingState?.privateMatchState ?? null);
        setVisualBeat('live');

        // NOTE: Keep the gate until the deferred state has been committed.
        // The authoritative match state will drive the next visible cards after
        // this point, so releasing the gate here avoids the event path racing
        // ahead of the committed visual frame.
        isDeferringVisualCommitRef.current = false;
      }, HAND_RESULT_HOLD_MS + NEXT_HAND_COMMIT_MS);

      return;
    }

    if (isFreshOpeningHand) {
      if (handIntroTimeoutRef.current !== null) {
        return;
      }

      isDeferringVisualCommitRef.current = true;
      setVisualBeat('hand_intro');

      pendingVisualStateRef.current = {
        roomState: roomState ?? null,
        publicMatchState: publicMatchState ?? null,
        privateMatchState: privateMatchState ?? null,
      };

      handIntroTimeoutRef.current = window.setTimeout(() => {
        const pendingState = pendingVisualStateRef.current;
        pendingVisualStateRef.current = null;
        handIntroTimeoutRef.current = null;
        lastHandStartedAtRef.current = null;

        beginHandTransitionRef.current();

        setVisualRoomState(pendingState?.roomState ?? null);
        setVisualPublicMatchState(pendingState?.publicMatchState ?? null);
        setVisualPrivateMatchState(pendingState?.privateMatchState ?? null);
        setVisualBeat('live');
        isDeferringVisualCommitRef.current = false;
      }, HAND_INTRO_HOLD_MS);

      return;
    }

    if (deferredNextHandTimeoutRef.current !== null) {
      window.clearTimeout(deferredNextHandTimeoutRef.current);
      deferredNextHandTimeoutRef.current = null;
      pendingVisualStateRef.current = null;
    }

    if (handIntroTimeoutRef.current !== null) {
      window.clearTimeout(handIntroTimeoutRef.current);
      handIntroTimeoutRef.current = null;
      pendingVisualStateRef.current = null;
      lastHandStartedAtRef.current = null;
    }

    isDeferringVisualCommitRef.current = false;
    setVisualRoomState(roomState ?? initialSnapshot?.roomState ?? null);
    setVisualPublicMatchState(publicMatchState ?? initialSnapshot?.publicMatchState ?? null);
    setVisualPrivateMatchState(privateMatchState ?? initialSnapshot?.privateMatchState ?? null);
    setVisualBeat(incomingFreshPlayableHand ? 'live' : 'idle');
  }, [
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
      };
    });
    const mySeatView = roomPlayers.find((seat) => seat.isMine) ?? null;
    const opponentSeatView = roomPlayers.find((seat) => !seat.isMine) ?? null;
    const myCards = getViewerCards(currentPrivateHand);
    const availableActions = effectiveHand?.availableActions ?? emptyAvailableActions();
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
        availableActions.canAttemptPlayCard &&
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
      scoreLabel: `T1 ${visualPublicMatchState?.score.playerOne ?? 0} × T2 ${visualPublicMatchState?.score.playerTwo ?? 0}`,
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
      availableActions: contractPresentation.availableActions,
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
    console.log('[matchPage][viewModel][opponentPlayedCard]', {
      opponentPlayedCard: viewModel.opponentPlayedCard,
      myPlayedCard: viewModel.myPlayedCard,
      latestRoundFinished: Boolean(viewModel.latestRound?.finished),
      playedRoundsCount: viewModel.playedRoundsCount,
      tablePhase: viewModel.tablePhase,
      currentTurnSeatId: viewModel.currentTurnSeatId,
      mySeat: viewModel.mySeat,
      visualBeat,
    });
  }, [
    viewModel.currentTurnSeatId,
    viewModel.latestRound?.finished,
    viewModel.myPlayedCard,
    viewModel.mySeat,
    viewModel.opponentPlayedCard,
    viewModel.playedRoundsCount,
    viewModel.tablePhase,
    visualBeat,
  ]);

  useEffect(() => {
    console.log('[matchPage][visualStates]', {
      roomTurn: visualRoomState?.currentTurnSeatId ?? null,
      publicState: visualPublicMatchState?.state ?? null,
      privateState: visualPrivateMatchState?.state ?? null,
      publicNext: visualPublicMatchState?.currentHand?.nextDecisionType ?? null,
      privateNext: visualPrivateMatchState?.currentHand?.nextDecisionType ?? null,
      publicLatestRound:
        visualPublicMatchState?.currentHand?.rounds[
          visualPublicMatchState.currentHand.rounds.length - 1
        ] ?? null,
      privateLatestRound:
        visualPrivateMatchState?.currentHand?.rounds[
          visualPrivateMatchState.currentHand.rounds.length - 1
        ] ?? null,
      isDeferringVisualCommit: isDeferringVisualCommitRef.current,
      visualBeat,
    });
  }, [visualBeat, visualPrivateMatchState, visualPublicMatchState, visualRoomState]);

  useEffect(() => {
    mySeatRef.current = viewModel.mySeat;
  }, [viewModel.mySeat]);

  useEffect(() => {
    if (viewModel.myCards.length > 0 && !viewModel.handFinished) {
      setCachedMyCards(viewModel.myCards);
    }
  }, [viewModel.myCards, viewModel.handFinished]);

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
    console.log('[matchPage][transition-output]', {
      displayedOpponentPlayedCard: liveTableTransition.displayedOpponentPlayedCard,
      displayedMyPlayedCard: liveTableTransition.displayedMyPlayedCard,
      closingTableCards: liveTableTransition.closingTableCards,
      isResolvingRound: liveTableTransition.isResolvingRound,
      pendingPlayedCard: liveTableTransition.pendingPlayedCard,
      opponentRevealKey: liveTableTransition.opponentRevealKey,
      visualBeat,
    });
  }, [
    liveTableTransition.closingTableCards,
    liveTableTransition.displayedMyPlayedCard,
    liveTableTransition.displayedOpponentPlayedCard,
    liveTableTransition.isResolvingRound,
    liveTableTransition.opponentRevealKey,
    liveTableTransition.pendingPlayedCard,
    visualBeat,
  ]);

  useEffect(() => {
    beginHandTransitionRef.current = liveTableTransition.beginHandTransition;
    registerIncomingPlayedCardRef.current = liveTableTransition.registerIncomingPlayedCard;
  }, [liveTableTransition.beginHandTransition, liveTableTransition.registerIncomingPlayedCard]);

  const displayedMyPlayedCard = liveTableTransition.displayedMyPlayedCard;
  const displayedOpponentPlayedCard = liveTableTransition.displayedOpponentPlayedCard;

  useEffect(() => {
    if (viewModel.currentPrivateHand?.viraRank) {
      setViraRank(viewModel.currentPrivateHand.viraRank);
      return;
    }

    if (viewModel.currentPublicHand?.viraRank) {
      setViraRank(viewModel.currentPublicHand.viraRank);
    }
  }, [viewModel.currentPrivateHand?.viraRank, viewModel.currentPublicHand?.viraRank]);

  const { handleRefreshState, handleStartHand, handlePlayCard, handleMatchAction } =
    useMatchActionBridge({
      resolvedMatchId: viewModel.resolvedMatchId,
      mySeat: viewModel.mySeat,
      canStartHand: viewModel.canStartHand,
      canPlayCard: viewModel.canPlayCard,
      availableActions: viewModel.availableActions,
      viraRank,
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

  const playCardWithSound = useCallback(
    (card: CardPayload) => {
      play('play-card', 0.4);
      handlePlayCard(card);
    },
    [play, handlePlayCard],
  );

  const handleMatchActionWithSound = useCallback(
    (action: MatchAction) => {
      if (action === 'request-truco') {
        play('truco-call', 0.7);
      }

      handleMatchAction(action);
    },
    [play, handleMatchAction],
  );

  const hasMinimumSession = Boolean(session?.backendUrl && session?.authToken);
  const hasHydratedMatchState = Boolean(
    visualRoomState || visualPublicMatchState || visualPrivateMatchState || playerAssigned,
  );
  const canRenderLiveState = Boolean(
    session?.backendUrl && session?.authToken && viewModel.resolvedMatchId,
  );
  const effectiveMyCards = viewModel.handFinished ? cachedMyCards : viewModel.myCards;

  if (!hasMinimumSession) {
    return (
      <section className="mx-auto grid max-w-xl gap-6 pt-20">
        <div
          className="rounded-2xl p-8 text-center gold-frame"
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
            viraRankOptions={VIRA_RANK_OPTIONS}
            canStartHand={viewModel.canStartHand}
            onRefreshState={handleRefreshState}
            onChangeViraRank={setViraRank}
            onStartHand={handleStartHand}
          />

          {!hasHydratedMatchState && (
            <div className="shrink-0 px-4 py-2 text-center text-[10px] text-slate-500">
              Aguardando estado do servidor…
            </div>
          )}

          <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="min-h-0 flex-1">
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
                tablePhase={viewModel.tablePhase}
                canStartHand={viewModel.canStartHand}
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
                    : 0
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
              />
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
                canStartHand={viewModel.canStartHand}
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

function emptyAvailableActions(): NonNullable<
  MatchStatePayload['currentHand']
>['availableActions'] {
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
