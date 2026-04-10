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
import type { CardPayload, MatchStatePayload, Rank } from '../services/socket/socketTypes';

const TABLE_SEAT_ORDER_1V1 = ['T2A', 'T1A'] as const;
const TABLE_SEAT_ORDER_2V2 = ['T1B', 'T2A', 'T1A', 'T2B'] as const;
const VIRA_RANK_OPTIONS: Rank[] = ['4', '5', '6', '7', 'Q', 'J', 'K', 'A', '2', '3'];

type TableSeatView = {
  seatId: string;
  ready: boolean;
  isBot: boolean;
  isCurrentTurn: boolean;
  isMine: boolean;
};

type MatchStatusTone = 'neutral' | 'success' | 'warning';
type TablePhase = 'missing_context' | 'waiting' | 'playing' | 'hand_finished' | 'match_finished';

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

export function MatchPage() {
  const params = useParams<{ matchId: string }>();
  const { session } = useAuth();
  const routeMatchId = params.matchId ?? '';
  const effectiveMatchId = routeMatchId || getLastActiveMatchId() || '';

  const mySeatRef = useRef<string | null>(null);
  const [viraRank, setViraRank] = useState<Rank>('4');
  const [showSecondary, setShowSecondary] = useState(false);
  const { play } = useGameSound();

  const [cachedMyCards, setCachedMyCards] = useState<CardPayload[]>([]);

  const beginHandTransitionRef = useRef<() => void>(() => {});
  const registerIncomingPlayedCardRef = useRef<
    (params: { owner: 'mine' | 'opponent' | null; card: string | null }) => void
  >(() => {});

  const handleRealtimeHandStarted = useCallback(
    (payload: { matchId?: string; viraRank?: Rank | null }) => {
      beginHandTransitionRef.current();
      if (payload.viraRank) {
        setViraRank(payload.viraRank);
      }
    },
    [],
  );

  const handleRealtimeCardPlayed = useCallback(
    (payload: { matchId?: string; playerId?: string | null; card?: string | null }) => {
      const owner = resolvePlayedCardOwner({
        payloadPlayerId: payload.playerId ?? null,
        mySeat: mySeatRef.current,
      });
      registerIncomingPlayedCardRef.current({
        owner,
        card: payload.card ?? null,
      });
    },
    [],
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

  useEffect(() => {
    mySeatRef.current = playerAssigned?.seatId ?? initialSnapshot?.playerAssigned?.seatId ?? null;
  }, [initialSnapshot?.playerAssigned?.seatId, playerAssigned]);

  const viewModel = useMemo<MatchViewModel>(() => {
    const resolvedMatchId =
      privateMatchState?.matchId ||
      publicMatchState?.matchId ||
      roomState?.matchId ||
      effectiveMatchId;
    const mySeat = playerAssigned?.seatId ?? null;
    const currentPublicHand = publicMatchState?.currentHand ?? null;
    const currentPrivateHand = privateMatchState?.currentHand ?? null;
    const isOneVsOne = roomState?.mode === '1v1';
    const visibleSeatOrder = isOneVsOne ? TABLE_SEAT_ORDER_1V1 : TABLE_SEAT_ORDER_2V2;

    const roomPlayers: TableSeatView[] = visibleSeatOrder.map((seatId) => {
      const player = roomState?.players.find((entry) => entry.seatId === seatId);
      return {
        seatId,
        ready: player?.ready ?? false,
        isBot: player?.isBot ?? false,
        isCurrentTurn: roomState?.currentTurnSeatId === seatId,
        isMine: mySeat === seatId,
      };
    });

    const mySeatView = roomPlayers.find((seat) => seat.isMine) ?? null;
    const opponentSeatView = roomPlayers.find((seat) => !seat.isMine) ?? null;
    const myCards = getViewerCards(currentPrivateHand);
    const effectiveHand = currentPrivateHand ?? currentPublicHand;
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

    const handFinished = Boolean(currentPublicHand?.finished);

    // NOTE: Keep the CTA visible after a hand ends, but only enable the action
    // when the backend room state has actually released the next hand.
    // This avoids the previous transport rejection while preventing the button
    // from disappearing during the hand-finished transition.
    const canStartHand =
      Boolean(roomState?.canStart) || (handFinished && publicMatchState?.state !== 'finished');

    const isMyTurn = Boolean(mySeat && roomState?.currentTurnSeatId === mySeat);
    const canPlayCard = Boolean(
      availableActions.canAttemptPlayCard && mySeat && myCards.length > 0 && !handFinished,
    );

    const contractPresentation = buildMatchContractPresentation({
      publicMatchState,
      roomState,
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
      scoreLabel: `T1 ${publicMatchState?.score.playerOne ?? 0} × T2 ${publicMatchState?.score.playerTwo ?? 0}`,
      currentTurnSeatId: contractPresentation.currentTurnSeatId,
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
      handFinished: contractPresentation.handFinished,
      matchFinished: contractPresentation.matchFinished,
      tablePhase: contractPresentation.tablePhase,
      handStatusLabel: contractPresentation.handStatusLabel,
      handStatusTone: contractPresentation.handStatusTone,
      latestRound: contractPresentation.latestRound,
      rounds: contractPresentation.rounds,
      playedRoundsCount: contractPresentation.playedRoundsCount,
      currentPublicHand,
      currentPrivateHand,
    };
  }, [effectiveMatchId, playerAssigned, privateMatchState, publicMatchState, roomState]);

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
  });

  useEffect(() => {
    beginHandTransitionRef.current = liveTableTransition.beginHandTransition;
    registerIncomingPlayedCardRef.current = liveTableTransition.registerIncomingPlayedCard;
  }, [liveTableTransition.beginHandTransition, liveTableTransition.registerIncomingPlayedCard]);

  const prevLatestRoundFinished = useRef(false);
  useEffect(() => {
    const currentFinished = Boolean(viewModel.latestRound?.finished);
    if (prevLatestRoundFinished.current && !currentFinished) {
      liveTableTransition.beginHandTransition();
    }
    prevLatestRoundFinished.current = currentFinished;
  }, [viewModel.latestRound?.finished, liveTableTransition.beginHandTransition]);

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
    roomState || publicMatchState || privateMatchState || playerAssigned,
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
    <section className="relative min-h-screen w-full overflow-hidden bg-[#050810]">
      {/* Background Atmosphere */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(201,168,76,0.08),transparent_50%)] pointer-events-none" />

      {/* Header Navigation */}
      <div className="relative z-50 flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-bold uppercase tracking-[2px] text-slate-500">
            Truco Paulista
          </span>
        </div>
        <Link
          to="/lobby"
          className="rounded-full px-4 py-2 text-[10px] font-bold uppercase tracking-[2px] text-slate-400 hover:text-amber-400 transition-colors border border-white/5 hover:border-amber-400/30"
        >
          ← Voltar ao lobby
        </Link>
      </div>

      {/* Main Game Area */}
      <main className="relative z-10 flex flex-col items-center justify-center p-4 md:p-6 h-[calc(100vh-100px)]">
        {/* The Premium Table Container */}
        <div className="relative w-full max-w-6xl h-full flex flex-col gold-frame bg-[radial-gradient(ellipse_at_center,_#0d1a0f_0%,_#050810_100%)] overflow-hidden">
          {/* Top Header / HUD */}
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
            <div className="px-4 py-2 text-center text-[10px] text-slate-500">
              Aguardando estado do servidor…
            </div>
          )}

          {/* The Battle Arena */}
          <div className="flex-1 relative w-full">
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
              tablePhase={viewModel.tablePhase}
              canStartHand={viewModel.canStartHand}
              scoreLabel={viewModel.scoreLabel}
              opponentSeatView={viewModel.opponentSeatView}
              mySeatView={viewModel.mySeatView}
              isOneVsOne={viewModel.isOneVsOne}
              roomMode={roomState?.mode ?? null}
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
                liveTableTransition.pendingPlayedCard?.owner === 'mine' && !viewModel.myPlayedCard,
              )}
              roundIntroKey={liveTableTransition.roundIntroKey}
              roundResolvedKey={liveTableTransition.roundResolvedKey}
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
        </div>
      </main>

      {/* Secondary Panel (Technical) */}
      <div className="relative z-10 w-full max-w-6xl mx-auto pb-4 px-4">
        <MatchSecondaryPanelSection
          showSecondary={showSecondary}
          onToggle={() => setShowSecondary((state) => !state)}
          eventLog={eventLog}
          connectionStatus={connectionStatus}
          resolvedMatchId={viewModel.resolvedMatchId}
          publicState={publicMatchState?.state || '-'}
          privateState={privateMatchState?.state || '-'}
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
  return payloadPlayerId === mySeat ? 'mine' : 'opponent';
}
