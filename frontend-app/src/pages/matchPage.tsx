import { AnimatePresence, motion } from 'framer-motion';
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
import type { CardPayload, MatchStatePayload, Rank, Suit } from '../services/socket/socketTypes';

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

type TablePhase = 'missing_context' | 'waiting' | 'playing' | 'hand_finished' | 'match_finished';

type HandStatusVariant = 'neutral' | 'success' | 'warning';

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
  handStatusTone: HandStatusVariant;
  latestRound: MatchStatePayload['currentHand'] extends infer H
    ? H extends { rounds: infer R }
      ? R extends Array<infer Item>
        ? Item | null
        : null
      : null
    : null;
  rounds: NonNullable<MatchStatePayload['currentHand']>['rounds'];
  playedRoundsCount: number;
  currentPublicHand: MatchStatePayload['currentHand'] | null;
  currentPrivateHand: MatchStatePayload['currentHand'] | null;
};

type SuitDisplay = {
  symbol: string;
  colorClass: string;
};

const seatPulseAnimation = {
  scale: [1, 1.03, 1],
  boxShadow: [
    '0 0 0 rgba(16,185,129,0)',
    '0 0 28px rgba(16,185,129,0.22)',
    '0 0 0 rgba(16,185,129,0)',
  ],
};

export function MatchPage() {
  const params = useParams<{ matchId: string }>();
  const { session } = useAuth();

  const routeMatchId = params.matchId ?? '';
  const effectiveMatchId = routeMatchId || getLastActiveMatchId() || '';

  const mySeatRef = useRef<string | null>(null);
  const [viraRank, setViraRank] = useState<Rank>('4');

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
    const latestRound: MatchViewModel['latestRound'] =
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
    const matchFinished = publicMatchState?.state === 'finished';
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
      latestRound: contractPresentation.latestRound,
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
      <section className="mx-auto grid max-w-5xl gap-8">
        <section className="rounded-[36px] border border-amber-400/20 bg-slate-900/85 p-8 shadow-[0_28px_90px_rgba(15,23,42,0.45)]">
          <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-amber-300">
            Session required
          </div>
          <h1 className="mt-4 text-3xl font-black tracking-tight text-white lg:text-4xl">
            A MatchPage precisa de uma sessão íntegra antes de hidratar a mesa.
          </h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300">
            A borda de rota já tenta impedir esta entrada, mas este fallback mantém a tela
            semanticamente honesta caso o estado do browser fique inconsistente.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              to="/"
              className="rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-emerald-400"
            >
              Voltar para home
            </Link>
            <Link
              to="/lobby"
              className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:border-white/20 hover:bg-white/10"
            >
              Ir para lobby
            </Link>
          </div>
        </section>
      </section>
    );
  }

  if (!effectiveMatchId) {
    return (
      <section className="mx-auto grid max-w-5xl gap-8">
        <section className="rounded-[36px] border border-white/10 bg-slate-900/85 p-8 shadow-[0_28px_90px_rgba(15,23,42,0.45)]">
          <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">
            Missing match context
          </div>
          <h1 className="mt-4 text-3xl font-black tracking-tight text-white lg:text-4xl">
            Ainda não existe contexto suficiente para abrir esta partida.
          </h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300">
            Nenhum matchId foi encontrado na rota nem no último snapshot salvo. Volte para o lobby,
            crie uma sala ou recupere uma partida ativa antes de entrar na mesa.
          </p>
          <div className="mt-6">
            <Link
              to="/lobby"
              className="rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-emerald-400"
            >
              Voltar para lobby
            </Link>
          </div>
        </section>
      </section>
    );
  }

  return (
    <section className="grid gap-8">
      <div className="overflow-hidden rounded-[36px] border border-white/10 bg-slate-900/85 shadow-[0_28px_90px_rgba(15,23,42,0.45)]">
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

        <div className="grid gap-8 px-8 py-8 lg:px-10 lg:py-10 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="grid gap-6">
            {!hasHydratedMatchState ? (
              <section className="rounded-[34px] border border-white/10 bg-slate-950/45 p-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">
                      Waiting for hydration
                    </div>
                    <div className="mt-3 text-2xl font-black tracking-tight text-slate-100">
                      A mesa já tem matchId, mas ainda aguarda estado autoritativo suficiente.
                    </div>
                    <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">
                      Este estado é legítimo quando a página abre antes do primeiro room-state ou
                      match-state. A interface agora comunica isso de forma explícita, sem parecer
                      erro estrutural.
                    </p>
                  </div>

                  <div className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">
                    {connectionStatus}
                  </div>
                </div>
              </section>
            ) : null}

            <section className="rounded-[34px] border border-white/10 bg-slate-950/35 p-4 sm:p-6">
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
                  liveTableTransition.pendingPlayedCard?.owner === 'mine' &&
                  !viewModel.myPlayedCard
                }
                roundIntroKey={liveTableTransition.roundIntroKey}
                roundResolvedKey={liveTableTransition.roundResolvedKey}
                currentPrivateViraRank={viewModel.currentPrivateHand?.viraRank ?? null}
                currentPublicViraRank={viewModel.currentPublicHand?.viraRank ?? null}
                viraRank={viraRank}
                availableActions={viewModel.availableActions}
                onAction={handleMatchAction}
                myCards={viewModel.myCards}
                canPlayCard={viewModel.canPlayCard}
                launchingCardKey={liveTableTransition.launchingCardKey}
                currentPrivateHand={viewModel.currentPrivateHand}
                currentPublicHand={viewModel.currentPublicHand}
                onPlayCard={handlePlayCard}
              />
            </section>

            <Suspense fallback={<MatchSecondaryPanelFallback title="Rounds played" />}>
              <MatchRoundsHistoryPanel
                rounds={viewModel.rounds}
                latestRound={viewModel.latestRound}
                playedRoundsCount={viewModel.playedRoundsCount}
              />
            </Suspense>
          </div>

          <aside className="grid gap-6 self-start">
            <Suspense fallback={<MatchSecondaryPanelFallback title="Match live state" />}>
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

            <section className="rounded-[30px] border border-white/10 bg-slate-950/50 p-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <div className="text-lg font-black tracking-tight text-slate-100">Event log</div>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    Visibilidade operacional mantida sem dominar a mesa.
                  </p>
                </div>

                <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">
                  client-side
                </span>
              </div>

              <div className="mt-6 rounded-[28px] border border-white/10 bg-slate-950/70 p-5">
                <pre className="max-h-96 overflow-auto whitespace-pre-wrap text-xs leading-7 text-slate-300">
                  {eventLog.length > 0 ? eventLog.join('\n') : 'No events yet.'}
                </pre>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </section>
  );
}

function MatchSecondaryPanelFallback({ title }: { title: string }) {
  return (
    <section className="rounded-[30px] border border-white/10 bg-slate-950/45 p-6">
      <div className="text-lg font-black tracking-tight text-slate-100">{title}</div>
      <div className="mt-2 text-sm leading-6 text-slate-400">
        Carregando painel secundário da mesa.
      </div>

      <div className="mt-6 grid gap-4">
        <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
          <div className="h-3 w-24 animate-pulse rounded-full bg-white/10" />
          <div className="mt-3 h-4 w-3/4 animate-pulse rounded-full bg-white/10" />
        </div>
        <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
          <div className="h-3 w-20 animate-pulse rounded-full bg-white/10" />
          <div className="mt-3 h-4 w-2/3 animate-pulse rounded-full bg-white/10" />
        </div>
        <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
          <div className="h-3 w-28 animate-pulse rounded-full bg-white/10" />
          <div className="mt-3 h-4 w-4/5 animate-pulse rounded-full bg-white/10" />
        </div>
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

  // NOTE: The private contract is viewer-aware through viewerPlayerId plus the
  // two explicit hand arrays. We derive the visible hand from that contract
  // instead of assuming a separate viewerHand field that does not exist.
  return rawViewerHand
    .map((card) => cardStringToPayload(card))
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
  if (value === 'mao_de_onze') {
    return 'Mão de 11';
  }

  if (value === 'none') {
    return 'None';
  }

  return value;
}

function getSuitDisplay(suit: Suit): SuitDisplay {
  if (suit === 'O' || suit === 'D') {
    return {
      symbol: '♦',
      colorClass: 'text-rose-600',
    };
  }

  if (suit === 'P' || suit === 'H') {
    return {
      symbol: '♥',
      colorClass: 'text-rose-600',
    };
  }

  if (suit === 'E' || suit === 'S') {
    return {
      symbol: '♠',
      colorClass: 'text-slate-900',
    };
  }

  return {
    symbol: '♣',
    colorClass: 'text-slate-900',
  };
}

function suitSymbol(suit: Suit): string {
  return getSuitDisplay(suit).symbol;
}

function suitColorClass(suit: Suit): string {
  return getSuitDisplay(suit).colorClass;
}
