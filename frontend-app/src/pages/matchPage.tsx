import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../features/auth/authStore';
import { useMatchActionBridge } from '../features/match/useMatchActionBridge';
import { MatchPageHeader } from '../features/match/matchPageHeader';
import { buildMatchContractPresentation } from '../features/match/matchPresentationSelectors';
import { getLastActiveMatchId } from '../features/match/matchSnapshotStorage';
import { MatchTableShell } from '../features/match/matchTableShell';
import { useMatchRealtimeSession } from '../features/match/useMatchRealtimeSession';
import { useMatchTableTransition } from '../features/match/useMatchTableTransition';
import { cardStringToPayload } from '../services/socket/socketTypes';
import type { CardPayload, MatchStatePayload, Rank, Suit, MatchStateRoundPayload } from '../services/socket/socketTypes';

const MatchLiveStatePanel = lazy(async () =>
  import('../features/match/matchLiveStatePanel').then((module) => ({
    default: module.MatchLiveStatePanel,
  })),
);
const MatchRoundsHistoryPanel = lazy(async () =>
  import('../features/match/matchRoundsHistoryPanel').then((module) => ({
    default: module.MatchRoundsHistoryPanel,
  })),
);

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
  tablePhase: 'missing_context' | 'waiting' | 'playing' | 'hand_finished' | 'match_finished';
  handStatusLabel: string;
  handStatusTone: 'neutral' | 'success' | 'warning';
  latestRound: MatchStateRoundPayload | null;
  rounds: NonNullable<MatchStatePayload['currentHand']>['rounds'];
  playedRoundsCount: number;
  currentPublicHand: MatchStatePayload['currentHand'] | null;
  currentPrivateHand: MatchStatePayload['currentHand'] | null;
};

type SuitDisplay = { symbol: string; colorClass: string };

export function MatchPage() {
  const params = useParams<{ matchId: string }>();
  const { session } = useAuth();
  const routeMatchId = params.matchId ?? '';
  const effectiveMatchId = routeMatchId || getLastActiveMatchId() || '';
  const mySeatRef = useRef<string | null>(null);
  const [viraRank, setViraRank] = useState<Rank>('4');
  const [showSecondary, setShowSecondary] = useState(false);

  const tableTransition = useMatchTableTransition({
    tablePhase: 'missing_context',
    myPlayedCard: null,
    opponentPlayedCard: null,
    playedRoundsCount: 0,
    latestRoundFinished: false,
  });

  const handleRealtimeHandStarted = useCallback(
    (payload: { matchId?: string; viraRank?: Rank | null }) => {
      tableTransition.beginHandTransition();
      if (payload.viraRank) {
        setViraRank(payload.viraRank);
      }
    },
    [tableTransition],
  );

  const handleRealtimeCardPlayed = useCallback(
    (payload: { matchId?: string; playerId?: string | null; card?: string | null }) => {
      const owner = resolvePlayedCardOwner({
        payloadPlayerId: payload.playerId ?? null,
        mySeat: mySeatRef.current,
      });
      tableTransition.registerIncomingPlayedCard({
        owner,
        card: payload.card ?? null,
      });
    },
    [tableTransition],
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
    const myIsPlayerOne = mySeat === 'T1A' || mySeat === 'T1B';
    const rounds = currentPublicHand?.rounds ?? [];
    const playedRounds = rounds.filter(
      (round) => round.playerOneCard !== null || round.playerTwoCard !== null,
    );
    const latestRound: MatchStateRoundPayload | null =
      playedRounds.length > 0 ? (playedRounds[playedRounds.length - 1] ?? null) : null;
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
    const canStartHand = Boolean(roomState?.canStart && publicMatchState?.state === 'waiting');
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
      scoreLabel: `T1 ${publicMatchState?.score.playerOne ?? 0} × T2 ${
        publicMatchState?.score.playerTwo ?? 0
      }`,
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
      latestRound,
      rounds: contractPresentation.rounds,
      playedRoundsCount: contractPresentation.playedRoundsCount,
      currentPublicHand,
      currentPrivateHand,
    };
  }, [effectiveMatchId, playerAssigned, privateMatchState, publicMatchState, roomState]);

  const liveTableTransition = useMatchTableTransition({
    tablePhase: viewModel.tablePhase,
    myPlayedCard: viewModel.myPlayedCard,
    opponentPlayedCard: viewModel.opponentPlayedCard,
    playedRoundsCount: viewModel.playedRoundsCount,
    latestRoundFinished: Boolean(viewModel.latestRound?.finished),
  });

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

  const hasMinimumSession = Boolean(session?.backendUrl && session?.authToken);
  const hasHydratedMatchState = Boolean(
    roomState || publicMatchState || privateMatchState || playerAssigned,
  );
  const canRenderLiveState = Boolean(
    session?.backendUrl && session?.authToken && viewModel.resolvedMatchId,
  );

  if (!hasMinimumSession) {
    return (
      <section className="mx-auto grid max-w-xl gap-6 pt-20">
        <div className="rounded-2xl p-8 text-center" style={{ background: 'rgba(15,25,35,0.8)', border: '1px solid rgba(201,168,76,0.2)' }}>
          <div className="text-[10px] font-bold uppercase tracking-[2px]" style={{ color: '#c9a84c' }}>
            Sessão necessária
          </div>
          <h1 className="mt-3 text-2xl font-black text-white">Faça login para acessar a mesa.</h1>
          <div className="mt-6 flex justify-center gap-3">
            <Link to="/" className="rounded-xl px-5 py-2.5 text-sm font-bold text-slate-900 transition" style={{ background: '#c9a84c' }}>
              Ir para home
            </Link>
            <Link to="/lobby" className="rounded-xl border px-5 py-2.5 text-sm font-semibold text-white transition" style={{ border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)' }}>
              Lobby
            </Link>
          </div>
        </div>
      </section>
    );
  }

  if (!effectiveMatchId) {
    return (
      <section className="mx-auto grid max-w-xl gap-6 pt-20">
        <div className="rounded-2xl p-8 text-center" style={{ background: 'rgba(15,25,35,0.8)', border: '1px solid rgba(255,255,255,0.1)' }}>
          <div className="text-[10px] font-bold uppercase tracking-[2px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
            Sem contexto de partida
          </div>
          <h1 className="mt-3 text-2xl font-black text-white">Nenhuma partida ativa encontrada.</h1>
          <div className="mt-6">
            <Link to="/lobby" className="rounded-xl px-5 py-2.5 text-sm font-bold text-slate-900 transition" style={{ background: '#c9a84c' }}>
              Voltar para lobby
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="grid gap-4">
      <div className="overflow-hidden rounded-[20px]" style={{ border: '1px solid rgba(201,168,76,0.12)', background: 'rgba(8,15,10,0.95)', boxShadow: '0 0 0 1px rgba(201,168,76,0.05), 0 32px 80px rgba(0,0,0,0.6)' }}>
        <MatchPageHeader
          connectionStatus={connectionStatus}
          resolvedMatchId={viewModel.resolvedMatchId}
          mySeat={viewModel.mySeat}
          viraRank={viraRank}
          viraRankOptions={VIRA_RANK_OPTIONS as Rank[]}
          canStartHand={viewModel.canStartHand}
          onRefreshState={handleRefreshState}
          onChangeViraRank={setViraRank}
          onStartHand={handleStartHand}
        />
        {!hasHydratedMatchState && (
          <div className="px-4 py-2 text-center text-[10px]" style={{ color: 'rgba(255,255,255,0.25)' }}>
            Aguardando estado do servidor…&nbsp;
            <span style={{ color: connectionStatus === 'online' ? 'rgba(45,106,79,0.7)' : 'rgba(192,57,43,0.5)' }}>
              {connectionStatus}
            </span>
          </div>
        )}
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
          myCardLaunching={
            liveTableTransition.pendingPlayedCard?.owner === 'mine' && !viewModel.myPlayedCard
          }
          roundIntroKey={liveTableTransition.roundIntroKey}
          roundResolvedKey={liveTableTransition.roundResolvedKey}
          currentPrivateViraRank={viewModel.currentPrivateHand?.viraRank ?? null}
          currentPublicViraRank={viewModel.currentPublicHand?.viraRank ?? null}
          viraRank={viraRank}
          availableActions={viewModel.availableActions}
          // ✅ CORREÇÃO: Cast explícito para satisfazer a tipagem do onAction
          onAction={(action) => handleMatchAction(action as any)}
          myCards={viewModel.myCards}
          canPlayCard={viewModel.canPlayCard}
          launchingCardKey={liveTableTransition.launchingCardKey}
          currentPrivateHand={viewModel.currentPrivateHand}
          currentPublicHand={viewModel.currentPublicHand}
          onPlayCard={handlePlayCard}
          playedRoundsCount={viewModel.playedRoundsCount}
        />
      </div>
      <div>
        <button
          type="button"
          onClick={() => setShowSecondary((s) => !s)}
          className="flex w-full items-center justify-center gap-2 rounded-xl py-2 text-[10px] font-bold uppercase tracking-[2px] transition"
          style={{ color: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}
        >
          {showSecondary ? '▲' : '▼'} Painel técnico
        </button>
        {showSecondary && (
          <div className="mt-3 grid gap-3 xl:grid-cols-3">
            <Suspense fallback={<SecondaryFallback title="Rodadas" />}>
              <MatchRoundsHistoryPanel
                rounds={viewModel.rounds}
                latestRound={viewModel.latestRound}
                playedRoundsCount={viewModel.playedRoundsCount}
              />
            </Suspense>
            <Suspense fallback={<SecondaryFallback title="Estado ao vivo" />}>
              <MatchLiveStatePanel
                connectionStatus={connectionStatus}
                resolvedMatchId={viewModel.resolvedMatchId}
                publicState={publicMatchState?.state || '-'}
                privateState={privateMatchState?.state || '-'}
                mySeat={viewModel.mySeat}
                currentTurnSeatId={viewModel.currentTurnSeatId}
                canStartHand={viewModel.canStartHand}
                canPlayCard={viewModel.canPlayCard}
                betState={viewModel.betState}
                specialStateLabel={formatSpecialState(viewModel.specialState)}
                availableActionsSummary={formatAvailableActionsSummary(viewModel.availableActions)}
                canRenderLiveState={canRenderLiveState}
              />
            </Suspense>
            <section className="rounded-2xl p-5" style={{ border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(15,25,35,0.6)' }}>
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm font-black text-slate-100">Event log</div>
                <span className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[1.5px]" style={{ color: 'rgba(255,255,255,0.25)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  client-side
                </span>
              </div>
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap text-[11px] leading-6" style={{ color: 'rgba(255,255,255,0.4)' }}>
                {eventLog.length > 0 ? eventLog.join('\n') : 'Sem eventos.'}
              </pre>
            </section>
          </div>
        )}
      </div>
    </section>
  );
}

function SecondaryFallback({ title }: { title: string }) {
  return (
    <section className="rounded-2xl p-5" style={{ border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(15,25,35,0.5)' }}>
      <div className="text-sm font-black text-slate-100">{title}</div>
      <div className="mt-3 h-3 w-24 animate-pulse rounded-full bg-white/10" />
    </section>
  );
}

// ── Pure helpers ──────────────────────────────────────────────────────────────
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

function emptyAvailableActions(): NonNullable<MatchStatePayload['currentHand']>['availableActions'] {
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

function formatAvailableActionsSummary(
  availableActions: NonNullable<MatchStatePayload['currentHand']>['availableActions'],
): string {
  const enabled = [
    availableActions.canRequestTruco ? 'truco' : null,
    availableActions.canRaiseToSix ? 'raise6' : null,
    availableActions.canRaiseToNine ? 'raise9' : null,
    availableActions.canRaiseToTwelve ? 'raise12' : null,
    availableActions.canAcceptBet ? 'acceptBet' : null,
    availableActions.canDeclineBet ? 'declineBet' : null,
    availableActions.canAcceptMaoDeOnze ? 'accept11' : null,
    availableActions.canDeclineMaoDeOnze ? 'decline11' : null,
    availableActions.canAttemptPlayCard ? 'playCard' : null,
  ].filter((action): action is string => action !== null);
  return enabled.length > 0 ? enabled.join(', ') : 'none';
}

function formatSpecialState(value: string): string {
  if (value === 'mao_de_onze') return 'Mão de 11';
  if (value === 'mao_de_ferro') return 'Mão de ferro';
  if (value === 'normal') return 'Normal';
  return value;
}

function getSuitDisplay(suit: Suit): SuitDisplay {
  if (suit === 'O' || suit === 'D') return { symbol: '♦', colorClass: 'text-rose-600' };
  if (suit === 'P' || suit === 'H') return { symbol: '♥', colorClass: 'text-rose-600' };
  if (suit === 'E' || suit === 'S') return { symbol: '♠', colorClass: 'text-slate-900' };
  return { symbol: '♣', colorClass: 'text-slate-900' };
}

function suitSymbol(suit: Suit): string {
  return getSuitDisplay(suit).symbol;
}

function suitColorClass(suit: Suit): string {
  return getSuitDisplay(suit).colorClass;
}
