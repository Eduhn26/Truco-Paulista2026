import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { useAuth } from '../features/auth/authStore';
import { MatchLiveStatePanel } from '../features/match/matchLiveStatePanel';
import { MatchPageHeader } from '../features/match/matchPageHeader';
import { buildMatchContractPresentation } from '../features/match/matchPresentationSelectors';
import { MatchRoundsHistoryPanel } from '../features/match/matchRoundsHistoryPanel';
import {
  getLastActiveMatchId,
  loadMatchSnapshot,
  saveMatchSnapshot,
} from '../features/match/matchSnapshotStorage';
import { MatchTableShell } from '../features/match/matchTableShell';
import { useMatchTableTransition } from '../features/match/useMatchTableTransition';
import { GameSocketClient } from '../services/socket/gameSocketClient';
import type {
  CardPayload,
  MatchStatePayload,
  PlayerAssignedPayload,
  Rank,
  RoomStatePayload,
  ServerErrorPayload,
} from '../services/socket/socketTypes';

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

const seatPulseAnimation = {
  scale: [1, 1.03, 1],
  boxShadow: [
    '0 0 0 rgba(16,185,129,0)',
    '0 0 28px rgba(16,185,129,0.22)',
    '0 0 0 rgba(16,185,129,0)',
  ],
};

const roundResolvedAnimation = {
  boxShadow: [
    '0 0 0 rgba(250,204,21,0)',
    '0 0 26px rgba(250,204,21,0.24)',
    '0 0 0 rgba(250,204,21,0)',
  ],
};

export function MatchPage() {
  const params = useParams<{ matchId: string }>();
  const { session } = useAuth();

  const routeMatchId = params.matchId ?? '';
  const effectiveMatchId = routeMatchId || getLastActiveMatchId() || '';
  const initialSnapshot = useMemo(() => loadMatchSnapshot(effectiveMatchId), [effectiveMatchId]);

  const clientRef = useRef<GameSocketClient | null>(null);
  const mySeatRef = useRef<string | null>(initialSnapshot?.playerAssigned?.seatId ?? null);

  const [connectionStatus, setConnectionStatus] = useState<'offline' | 'online'>('offline');
  const [roomState, setRoomState] = useState<RoomStatePayload | null>(
    initialSnapshot?.roomState ?? null,
  );
  const [publicMatchState, setPublicMatchState] = useState<MatchStatePayload | null>(
    initialSnapshot?.publicMatchState ?? null,
  );
  const [privateMatchState, setPrivateMatchState] = useState<MatchStatePayload | null>(
    initialSnapshot?.privateMatchState ?? null,
  );
  const [playerAssigned, setPlayerAssigned] = useState<PlayerAssignedPayload | null>(
    initialSnapshot?.playerAssigned ?? null,
  );
  const [viraRank, setViraRank] = useState<Rank>('4');
  const [eventLog, setEventLog] = useState<string[]>([]);

  function appendLog(line: string): void {
    setEventLog((current) =>
      [`[${new Date().toLocaleTimeString('pt-BR')}] ${line}`, ...current].slice(0, 40),
    );
  }

  function persistLiveSnapshot(next: {
    nextRoomState?: RoomStatePayload | null;
    nextPublicMatchState?: MatchStatePayload | null;
    nextPrivateMatchState?: MatchStatePayload | null;
    nextPlayerAssigned?: PlayerAssignedPayload | null;
  }): void {
    const snapshotMatchId =
      next.nextPrivateMatchState?.matchId ||
      next.nextPublicMatchState?.matchId ||
      next.nextRoomState?.matchId ||
      next.nextPlayerAssigned?.matchId ||
      effectiveMatchId;

    if (!snapshotMatchId) {
      return;
    }

    saveMatchSnapshot(snapshotMatchId, {
      roomState: next.nextRoomState ?? roomState,
      publicMatchState: next.nextPublicMatchState ?? publicMatchState,
      privateMatchState: next.nextPrivateMatchState ?? privateMatchState,
      playerAssigned: next.nextPlayerAssigned ?? playerAssigned,
    });
  }

  useEffect(() => {
    mySeatRef.current = playerAssigned?.seatId ?? null;
  }, [playerAssigned]);

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

  const tableTransition = useMatchTableTransition({
    tablePhase: viewModel.tablePhase,
    myPlayedCard: viewModel.myPlayedCard,
    opponentPlayedCard: viewModel.opponentPlayedCard,
    playedRoundsCount: viewModel.playedRoundsCount,
    latestRoundFinished: Boolean(viewModel.latestRound?.finished),
  });

  const displayedMyPlayedCard = tableTransition.displayedMyPlayedCard;
  const displayedOpponentPlayedCard = tableTransition.displayedOpponentPlayedCard;

  useEffect(() => {
    if (!session?.backendUrl || !session?.authToken || !effectiveMatchId) {
      return;
    }

    const client = new GameSocketClient();
    clientRef.current = client;

    client.connect(
      {
        backendUrl: session.backendUrl,
        authToken: session.authToken,
      },
      {
        onConnect: (socketId) => {
          setConnectionStatus('online');
          appendLog(`Socket connected (${socketId}).`);
          client.emitJoinMatch(effectiveMatchId);
          appendLog(`Emitted join-match (${effectiveMatchId}).`);
          client.emitGetState(effectiveMatchId);
          appendLog(`Emitted get-state (${effectiveMatchId}).`);
        },
        onDisconnect: (reason) => {
          setConnectionStatus('offline');
          appendLog(`Socket disconnected (${reason}).`);
        },
        onError: (payload: ServerErrorPayload) => {
          appendLog(
            payload.message ? `Server error: ${payload.message}` : 'Server emitted error event.',
          );
        },
        onPlayerAssigned: (payload) => {
          const sameMatch = !payload.matchId || payload.matchId === effectiveMatchId;

          if (!sameMatch) {
            return;
          }

          setPlayerAssigned(payload);
          persistLiveSnapshot({ nextPlayerAssigned: payload });
          appendLog(
            payload.seatId
              ? `Received player-assigned (${payload.seatId}).`
              : 'Received player-assigned.',
          );
        },
        onRoomState: (payload) => {
          const sameMatch = !payload.matchId || payload.matchId === effectiveMatchId;

          if (!sameMatch) {
            return;
          }

          setRoomState(payload);
          persistLiveSnapshot({ nextRoomState: payload });
          appendLog('Received room-state.');
        },
        onMatchState: (payload) => {
          const sameMatch = !payload.matchId || payload.matchId === effectiveMatchId;

          if (!sameMatch) {
            return;
          }

          setPublicMatchState(payload);
          persistLiveSnapshot({ nextPublicMatchState: payload });
          appendLog('Received public match-state.');
        },
        onPrivateMatchState: (payload) => {
          const sameMatch = !payload.matchId || payload.matchId === effectiveMatchId;

          if (!sameMatch) {
            return;
          }

          setPrivateMatchState(payload);
          persistLiveSnapshot({ nextPrivateMatchState: payload });
          appendLog('Received private match-state.');
        },
        onHandStarted: (payload) => {
          const sameMatch = !payload.matchId || payload.matchId === effectiveMatchId;

          if (!sameMatch) {
            return;
          }

          tableTransition.beginHandTransition();
          if (payload.viraRank) {
            setViraRank(payload.viraRank);
          }
          appendLog(`Received hand-started (${payload.viraRank}).`);
        },
        onCardPlayed: (payload) => {
          const sameMatch = !payload.matchId || payload.matchId === effectiveMatchId;

          if (!sameMatch) {
            return;
          }

          const owner = resolvePlayedCardOwner({
            payloadPlayerId: payload.playerId ?? null,
            mySeat: mySeatRef.current,
          });
          tableTransition.registerIncomingPlayedCard({
            owner,
            card: payload.card ?? null,
          });

          appendLog(
            payload.card ? `Received card-played (${payload.card}).` : 'Received card-played.',
          );
        },
      },
    );

    return () => {
      client.disconnect();
      clientRef.current = null;
    };
  }, [effectiveMatchId, session?.authToken, session?.backendUrl]);

  function handleRefreshState(): void {
    if (!viewModel.resolvedMatchId) {
      appendLog('No matchId available for get-state.');
      return;
    }

    clientRef.current?.emitGetState(viewModel.resolvedMatchId);
    appendLog(`Emitted get-state (${viewModel.resolvedMatchId}).`);
  }

  function handleStartHand(): void {
    if (!viewModel.resolvedMatchId) {
      appendLog('No matchId available for start-hand.');
      return;
    }

    tableTransition.beginHandTransition();
    clientRef.current?.emitStartHand(viewModel.resolvedMatchId, viraRank);
    appendLog(`Emitted start-hand (${viewModel.resolvedMatchId}, ${viraRank}).`);
  }

  function handlePlayCard(card: CardPayload): void {
    if (!viewModel.resolvedMatchId || !viewModel.mySeat || !viewModel.canPlayCard) {
      appendLog('Cannot play card in the current state.');
      return;
    }

    const cardKey = `${card.rank}|${card.suit}`;
    const serverCard = `${card.rank}${card.suit}`;

    tableTransition.beginOwnCardLaunch({
      cardKey,
      serverCard,
    });

    clientRef.current?.emitPlayCard(viewModel.resolvedMatchId, card);
    appendLog(`Emitted play-card (${card.rank}${suitSymbol(card.suit)}).`);
  }

  function handleMatchAction(
    action:
      | 'request-truco'
      | 'accept-bet'
      | 'decline-bet'
      | 'raise-to-six'
      | 'raise-to-nine'
      | 'raise-to-twelve'
      | 'accept-mao-de-onze'
      | 'decline-mao-de-onze',
  ): void {
    if (!viewModel.resolvedMatchId) {
      appendLog(`No matchId available for ${action}.`);
      return;
    }

    if (!isActionEnabled(viewModel.availableActions, action)) {
      appendLog(`Action ${action} is not available in the current backend state.`);
      return;
    }

    if (action === 'request-truco') clientRef.current?.emitRequestTruco(viewModel.resolvedMatchId);
    if (action === 'accept-bet') clientRef.current?.emitAcceptBet(viewModel.resolvedMatchId);
    if (action === 'decline-bet') clientRef.current?.emitDeclineBet(viewModel.resolvedMatchId);
    if (action === 'raise-to-six') clientRef.current?.emitRaiseToSix(viewModel.resolvedMatchId);
    if (action === 'raise-to-nine') clientRef.current?.emitRaiseToNine(viewModel.resolvedMatchId);
    if (action === 'raise-to-twelve')
      clientRef.current?.emitRaiseToTwelve(viewModel.resolvedMatchId);
    if (action === 'accept-mao-de-onze') {
      clientRef.current?.emitAcceptMaoDeOnze(viewModel.resolvedMatchId);
    }
    if (action === 'decline-mao-de-onze') {
      clientRef.current?.emitDeclineMaoDeOnze(viewModel.resolvedMatchId);
    }

    appendLog(`Emitted ${action} (${viewModel.resolvedMatchId}).`);
  }

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
                opponentRevealKey={tableTransition.opponentRevealKey}
                myRevealKey={
                  tableTransition.pendingPlayedCard?.owner === 'mine'
                    ? tableTransition.pendingPlayedCard.id
                    : 0
                }
                myCardLaunching={
                  tableTransition.pendingPlayedCard?.owner === 'mine' && !viewModel.myPlayedCard
                }
                roundIntroKey={tableTransition.roundIntroKey}
                roundResolvedKey={tableTransition.roundResolvedKey}
                currentPrivateViraRank={viewModel.currentPrivateHand?.viraRank ?? null}
                currentPublicViraRank={viewModel.currentPublicHand?.viraRank ?? null}
                viraRank={viraRank}
                availableActions={viewModel.availableActions}
                onAction={handleMatchAction}
                myCards={viewModel.myCards}
                canPlayCard={viewModel.canPlayCard}
                launchingCardKey={tableTransition.launchingCardKey}
                currentPrivateHand={viewModel.currentPrivateHand}
                currentPublicHand={viewModel.currentPublicHand}
                onPlayCard={handlePlayCard}
              />
            </section>

            <MatchRoundsHistoryPanel
              rounds={viewModel.rounds}
              latestRound={viewModel.latestRound}
              playedRoundsCount={viewModel.playedRoundsCount}
            />
          </div>

          <aside className="grid gap-6 self-start">
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

  function HandCompletionBanner({
    tablePhase,
    canStartHand,
    scoreLabel,
  }: {
    tablePhase: TablePhase;
    canStartHand: boolean;
    scoreLabel: string;
  }) {
    const isMatchFinished = tablePhase === 'match_finished';

    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        className={`rounded-[28px] border p-6 ${
          isMatchFinished
            ? 'border-emerald-400/25 bg-emerald-500/10'
            : 'border-amber-400/20 bg-amber-500/10'
        }`}
      >
        <div
          className={`text-[11px] font-bold uppercase tracking-[0.22em] ${
            isMatchFinished ? 'text-emerald-300' : 'text-amber-200'
          }`}
        >
          {isMatchFinished ? 'Match summary' : 'Hand summary'}
        </div>

        <div className="mt-4 text-2xl font-black text-slate-100">
          {isMatchFinished ? 'Partida encerrada' : 'Mão encerrada'}
        </div>

        <div className="mt-2 text-sm leading-6 text-slate-200">
          {isMatchFinished
            ? `O backend já fechou a partida com placar final ${scoreLabel}.`
            : canStartHand
              ? 'O backend já fechou a mão e liberou o início da próxima.'
              : 'O backend já fechou a mão. Aguarde a próxima condição válida para começar outra.'}
        </div>
      </motion.div>
    );
  }

  function HandEmptyState({ tablePhase }: { tablePhase: TablePhase }) {
    let message = 'Waiting for start-hand.';

    if (tablePhase === 'playing') {
      message = 'Waiting for private hand state.';
    }

    if (tablePhase === 'hand_finished') {
      message =
        'Mão encerrada. A ausência da terceira carta pode ser comportamento legítimo quando a mão termina antes.';
    }

    if (tablePhase === 'match_finished') {
      message = 'Partida encerrada. Não há mais cartas para esta mesa.';
    }

    return (
      <div className="rounded-[28px] border border-dashed border-white/10 bg-white/[0.02] px-5 py-6 text-sm leading-6 text-slate-400">
        {message}
      </div>
    );
  }

  function SeatBadge({ seat, label }: { seat: TableSeatView; label: string }) {
    const animateState = seat.isCurrentTurn ? seatPulseAnimation : {};

    return (
      <motion.div
        animate={animateState}
        transition={{ repeat: seat.isCurrentTurn ? Infinity : 0, duration: 1.6 }}
        className={`min-w-[190px] rounded-[30px] border px-5 py-4 ${
          seat.isCurrentTurn
            ? 'border-emerald-400/35 bg-emerald-500/10'
            : 'border-white/10 bg-slate-950/40'
        }`}
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">
              {label}
            </div>
            <div className="mt-2 text-lg font-black text-slate-100">{seat.seatId}</div>
          </div>

          <div className="flex items-center gap-2">
            {seat.isMine ? (
              <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-300">
                You
              </span>
            ) : null}

            <span
              className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] ${
                seat.isCurrentTurn
                  ? 'bg-emerald-500/15 text-emerald-300'
                  : 'bg-white/5 text-slate-400'
              }`}
            >
              {seat.isCurrentTurn ? 'Turn' : 'Idle'}
            </span>
          </div>
        </div>

        <div className="mt-4 grid gap-1.5 text-sm text-slate-300">
          <div>ready: {String(seat.ready)}</div>
          <div className="text-slate-400">bot: {String(seat.isBot)}</div>
        </div>
      </motion.div>
    );
  }

  function MetricCard({
    label,
    value,
    mono = false,
    tone = 'default',
  }: {
    label: string;
    value: string;
    mono?: boolean;
    tone?: 'default' | 'success' | 'danger';
  }) {
    const toneClass =
      tone === 'success'
        ? 'text-emerald-300'
        : tone === 'danger'
          ? 'text-rose-300'
          : 'text-slate-100';

    return (
      <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-5">
        <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">
          {label}
        </div>
        <div className={`mt-3 break-all text-sm font-bold ${mono ? 'font-mono' : ''} ${toneClass}`}>
          {value}
        </div>
      </div>
    );
  }

  function PlayedCardZone({
    title,
    value,
    perspective,
    highlight,
    revealKey,
    isRevealed,
    isLaunching = false,
  }: {
    title: string;
    value: string | null;
    perspective: 'top' | 'bottom';
    highlight: boolean;
    revealKey: number;
    isRevealed: boolean;
    isLaunching?: boolean;
  }) {
    return (
      <div
        className={`rounded-[30px] border p-5 ${
          highlight ? 'border-emerald-400/25 bg-emerald-500/8' : 'border-white/10 bg-slate-950/35'
        }`}
      >
        <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">
          {title}
        </div>

        <div className="mt-4 flex min-h-44 items-center justify-center rounded-[26px] border border-white/10 bg-slate-950/50 p-4 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.02)]">
          <AnimatePresence mode="popLayout">
            {value ? (
              <motion.div
                key={`${value}-${revealKey}`}
                initial={{
                  opacity: 0,
                  y: perspective === 'top' ? -90 : 90,
                  rotateX: perspective === 'top' ? -82 : 82,
                  scale: 0.68,
                  filter: 'blur(6px)',
                }}
                animate={{
                  opacity: 1,
                  y: 0,
                  rotateX: 0,
                  scale: 1,
                  filter: 'blur(0px)',
                }}
                exit={{ opacity: 0, scale: 0.92 }}
                transition={{ type: 'spring', stiffness: 240, damping: 18 }}
                className={isLaunching ? 'drop-shadow-[0_18px_42px_rgba(255,255,255,0.1)]' : ''}
              >
                <TableCardFace card={value} isRevealed={isRevealed} />
              </motion.div>
            ) : (
              <motion.div
                key="empty"
                initial={{ opacity: 0.35 }}
                animate={{ opacity: 1 }}
                className="flex h-32 w-24 items-center justify-center rounded-[22px] border border-dashed border-white/10 bg-slate-900/70 text-3xl font-black text-slate-500"
              >
                —
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    );
  }

  function TableCardFace({ card, isRevealed }: { card: string; isRevealed: boolean }) {
    const normalized = parseCardLabel(card);

    if (!normalized) {
      return (
        <div className="flex h-36 w-28 items-center justify-center rounded-[22px] border border-white/10 bg-[linear-gradient(180deg,#ffffff,#eef2ff)] text-xl font-black text-slate-900 shadow-[0_22px_46px_rgba(2,6,23,0.4)]">
          {card}
        </div>
      );
    }

    return (
      <motion.div
        initial={isRevealed ? { rotateY: 90 } : false}
        animate={{ rotateY: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        style={{ transformStyle: 'preserve-3d' }}
        className="flex h-36 w-28 flex-col items-center justify-between rounded-[22px] border border-white/10 bg-[linear-gradient(180deg,#ffffff,#eef2ff)] px-3 py-4 text-slate-950 shadow-[0_22px_46px_rgba(2,6,23,0.4)]"
      >
        <span className="self-start text-xl font-black">{normalized.rank}</span>
        <span className={`text-5xl ${suitColorClass(normalized.suit)}`}>
          {suitSymbol(normalized.suit)}
        </span>
        <span className="self-end text-xl font-black">{normalized.rank}</span>
      </motion.div>
    );
  }

  function RoundLine({ label, value }: { label: string; value: string }) {
    return (
      <div className="flex items-center justify-between gap-3">
        <span className="text-slate-400">{label}</span>
        <span className="font-mono text-slate-100">{value}</span>
      </div>
    );
  }

  function StatusPanel({
    title,
    value,
    detail,
    tone,
  }: {
    title: string;
    value: string;
    detail: string;
    tone: 'neutral' | 'warning' | 'success';
  }) {
    const toneClass =
      tone === 'success'
        ? 'border-emerald-400/20 bg-emerald-500/10'
        : tone === 'warning'
          ? 'border-amber-400/20 bg-amber-500/10'
          : 'border-white/10 bg-slate-950/45';

    return (
      <div className={`rounded-[28px] border p-5 ${toneClass}`}>
        <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">
          {title}
        </div>
        <div className="mt-3 text-base font-black text-slate-100">{value}</div>
        <p className="mt-2 text-sm leading-6 text-slate-300">{detail}</p>
      </div>
    );
  }

  function ActionBar({
    availableActions,
    onAction,
  }: {
    availableActions: NonNullable<MatchStatePayload['currentHand']>['availableActions'];
    onAction: (
      action:
        | 'request-truco'
        | 'accept-bet'
        | 'decline-bet'
        | 'raise-to-six'
        | 'raise-to-nine'
        | 'raise-to-twelve'
        | 'accept-mao-de-onze'
        | 'decline-mao-de-onze',
    ) => void;
  }) {
    const buttons: Array<{
      action:
        | 'request-truco'
        | 'accept-bet'
        | 'decline-bet'
        | 'raise-to-six'
        | 'raise-to-nine'
        | 'raise-to-twelve'
        | 'accept-mao-de-onze'
        | 'decline-mao-de-onze';
      label: string;
      enabled: boolean;
      tone: 'emerald' | 'amber' | 'rose';
    }> = [
      {
        action: 'request-truco',
        label: 'Pedir truco',
        enabled: availableActions.canRequestTruco,
        tone: 'emerald',
      },
      {
        action: 'accept-bet',
        label: 'Aceitar aposta',
        enabled: availableActions.canAcceptBet,
        tone: 'emerald',
      },
      {
        action: 'decline-bet',
        label: 'Correr',
        enabled: availableActions.canDeclineBet,
        tone: 'rose',
      },
      {
        action: 'raise-to-six',
        label: 'Pedir 6',
        enabled: availableActions.canRaiseToSix,
        tone: 'amber',
      },
      {
        action: 'raise-to-nine',
        label: 'Pedir 9',
        enabled: availableActions.canRaiseToNine,
        tone: 'amber',
      },
      {
        action: 'raise-to-twelve',
        label: 'Pedir 12',
        enabled: availableActions.canRaiseToTwelve,
        tone: 'amber',
      },
      {
        action: 'accept-mao-de-onze',
        label: 'Aceitar mão de 11',
        enabled: availableActions.canAcceptMaoDeOnze,
        tone: 'emerald',
      },
      {
        action: 'decline-mao-de-onze',
        label: 'Recusar mão de 11',
        enabled: availableActions.canDeclineMaoDeOnze,
        tone: 'rose',
      },
    ];

    const visibleButtons = buttons.filter((button) => button.enabled);

    return (
      <div className="rounded-[30px] border border-white/10 bg-slate-950/38 p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-base font-black tracking-tight text-slate-100">Match actions</div>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              O backend continua definindo disponibilidade real. A action bar apenas expõe o que já
              veio autorizado em <code>availableActions</code>.
            </p>
          </div>

          <div className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">
            server-authoritative
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          {visibleButtons.length > 0 ? (
            visibleButtons.map((button) => (
              <button
                key={button.action}
                type="button"
                onClick={() => onAction(button.action)}
                className={`rounded-2xl px-4 py-3 text-sm font-black transition ${
                  button.tone === 'emerald'
                    ? 'bg-emerald-500 text-slate-950 hover:bg-emerald-400'
                    : button.tone === 'amber'
                      ? 'bg-amber-400 text-slate-950 hover:bg-amber-300'
                      : 'bg-rose-500 text-white hover:bg-rose-400'
                }`}
              >
                {button.label}
              </button>
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-3 text-sm text-slate-400">
              Nenhuma ação contextual disponível no estado atual.
            </div>
          )}
        </div>
      </div>
    );
  }

  function ViewerHandPanel({
    myCards,
    canPlayCard,
    launchingCardKey,
    onPlayCard,
  }: {
    myCards: CardPayload[];
    canPlayCard: boolean;
    launchingCardKey: string | null;
    onPlayCard: (card: CardPayload) => void;
  }) {
    return (
      <div className="rounded-[30px] border border-white/10 bg-slate-950/38 p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-base font-black tracking-tight text-slate-100">Your hand</div>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              As cartas renderizadas continuam vindo do estado privado autoritativo do backend.
            </p>
          </div>

          <div className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">
            private state
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-4">
          {myCards.length > 0 ? (
            myCards.map((card) => {
              const cardKey = `${card.rank}|${card.suit}`;
              const isLaunching = launchingCardKey === cardKey;

              return (
                <motion.button
                  key={cardKey}
                  type="button"
                  onClick={() => onPlayCard(card)}
                  disabled={!canPlayCard || isLaunching}
                  whileHover={canPlayCard && !isLaunching ? { y: -6, scale: 1.02 } : {}}
                  whileTap={canPlayCard && !isLaunching ? { scale: 0.98 } : {}}
                  className={`group rounded-[26px] border p-3 transition disabled:cursor-not-allowed ${
                    canPlayCard
                      ? 'border-emerald-400/20 bg-white/[0.04] hover:border-emerald-300/35'
                      : 'border-white/10 bg-white/[0.02] opacity-70'
                  }`}
                >
                  <div className="rounded-[22px] border border-white/10 bg-[linear-gradient(180deg,#ffffff,#eef2ff)] p-4 shadow-[0_22px_46px_rgba(2,6,23,0.4)]">
                    <div className="flex min-h-36 w-24 flex-col items-center justify-between text-slate-950">
                      <span className="self-start text-xl font-black">{card.rank}</span>
                      <span className={`text-5xl ${suitColorClass(card.suit)}`}>
                        {suitSymbol(card.suit)}
                      </span>
                      <span className="self-end text-xl font-black">{card.rank}</span>
                    </div>
                  </div>
                </motion.button>
              );
            })
          ) : (
            <div className="rounded-[26px] border border-dashed border-white/10 bg-white/[0.02] px-5 py-6 text-sm leading-6 text-slate-400">
              Nenhuma carta privada disponível no momento.
            </div>
          )}
        </div>
      </div>
    );
  }
}

function getViewerCards(
  currentPrivateHand: MatchStatePayload['currentHand'] | null,
): CardPayload[] {
  if (!currentPrivateHand) {
    return [];
  }

  // NOTE: The current typed private-hand payload does not expose viewerHand yet.
  // Returning an empty array keeps the screen type-safe until the runtime contract
  // is aligned with the actual private match-state shape.
  return [];
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

function parseCardLabel(card: string): { rank: Rank; suit: CardPayload['suit'] } | null {
  if (!card) {
    return null;
  }

  const normalizedCard = card.trim();
  const suit = normalizedCard.slice(-1) as CardPayload['suit'];
  const rank = normalizedCard.slice(0, -1) as Rank;

  if (!rank || !['C', 'D', 'H', 'S'].includes(suit)) {
    return null;
  }

  return {
    rank,
    suit,
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

function isActionEnabled(
  availableActions: NonNullable<MatchStatePayload['currentHand']>['availableActions'],
  action:
    | 'request-truco'
    | 'accept-bet'
    | 'decline-bet'
    | 'raise-to-six'
    | 'raise-to-nine'
    | 'raise-to-twelve'
    | 'accept-mao-de-onze'
    | 'decline-mao-de-onze',
): boolean {
  if (action === 'request-truco') return availableActions.canRequestTruco;
  if (action === 'accept-bet') return availableActions.canAcceptBet;
  if (action === 'decline-bet') return availableActions.canDeclineBet;
  if (action === 'raise-to-six') return availableActions.canRaiseToSix;
  if (action === 'raise-to-nine') return availableActions.canRaiseToNine;
  if (action === 'raise-to-twelve') return availableActions.canRaiseToTwelve;
  if (action === 'accept-mao-de-onze') return availableActions.canAcceptMaoDeOnze;
  if (action === 'decline-mao-de-onze') return availableActions.canDeclineMaoDeOnze;

  return false;
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

function suitSymbol(suit: CardPayload['suit']): string {
  if (suit === 'H') return '♥';
  if (suit === 'D') return '♦';
  if (suit === 'C') return '♣';
  return '♠';
}

function suitColorClass(suit: CardPayload['suit']): string {
  if (suit === 'H' || suit === 'D') {
    return 'text-rose-600';
  }

  return 'text-slate-900';
}
