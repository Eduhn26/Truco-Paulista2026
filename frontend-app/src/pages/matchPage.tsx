import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { useAuth } from '../features/auth/authStore';
import { MatchTableShell } from '../features/match/matchTableShell';
import {
  getLastActiveMatchId,
  loadMatchSnapshot,
  saveMatchSnapshot,
} from '../features/match/matchSnapshotStorage';
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

type PendingPlayedCard = {
  owner: 'mine' | 'opponent';
  card: string;
  id: number;
};

type ClosingTableCards = {
  mine: string | null;
  opponent: string | null;
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
  const previousOpponentPlayedCardRef = useRef<string | null>(null);
  const previousPlayedRoundsCountRef = useRef<number>(0);

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
  const [launchingCardKey, setLaunchingCardKey] = useState<string | null>(null);
  const [pendingPlayedCard, setPendingPlayedCard] = useState<PendingPlayedCard | null>(null);
  const [closingTableCards, setClosingTableCards] = useState<ClosingTableCards>({
    mine: null,
    opponent: null,
  });
  const [opponentRevealKey, setOpponentRevealKey] = useState(0);
  const [roundIntroKey, setRoundIntroKey] = useState(0);
  const [roundResolvedKey, setRoundResolvedKey] = useState(0);
  const [isResolvingRound, setIsResolvingRound] = useState(false);

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
          appendLog(`Received player-assigned${payload.seatId ? ` (${payload.seatId})` : ''}.`);
        },
        onRoomState: (payload) => {
          if (payload.matchId && payload.matchId !== effectiveMatchId) {
            return;
          }

          setRoomState(payload);
          persistLiveSnapshot({ nextRoomState: payload });
          appendLog('Received room-state.');
        },
        onMatchState: (payload) => {
          if (payload.matchId && payload.matchId !== effectiveMatchId) {
            return;
          }

          setPublicMatchState(payload);
          persistLiveSnapshot({ nextPublicMatchState: payload });
          appendLog('Received public match-state.');
        },
        onPrivateMatchState: (payload) => {
          if (payload.matchId && payload.matchId !== effectiveMatchId) {
            return;
          }

          setPrivateMatchState(payload);
          persistLiveSnapshot({ nextPrivateMatchState: payload });
          appendLog('Received private match-state.');
        },
        onHandStarted: (payload) => {
          const sameMatch = !payload.matchId || payload.matchId === effectiveMatchId;

          if (!sameMatch || !payload.viraRank) {
            return;
          }

          setClosingTableCards({
            mine: null,
            opponent: null,
          });
          setIsResolvingRound(false);
          setViraRank(payload.viraRank);
          setRoundIntroKey((current) => current + 1);
          appendLog(`Received hand-started (${payload.viraRank}).`);
        },
        onCardPlayed: (payload) => {
          const sameMatch = !payload.matchId || payload.matchId === effectiveMatchId;

          if (!sameMatch) {
            return;
          }

          const owner = resolvePlayedCardOwner({
            payloadPlayerId: payload.playerId,
            mySeat: mySeatRef.current,
          });

          if (owner && payload.card && !isResolvingRound) {
            setClosingTableCards((current) => ({
              ...current,
              [owner]: payload.card,
            }));
          }

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
  }, [effectiveMatchId, isResolvingRound, session?.authToken, session?.backendUrl]);

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
    const currentValue = effectiveHand?.currentValue ?? 1;
    const betState = effectiveHand?.betState ?? 'idle';
    const pendingValue = effectiveHand?.pendingValue ?? null;
    const requestedBy = effectiveHand?.requestedBy ?? null;
    const specialState = effectiveHand?.specialState ?? 'normal';
    const specialDecisionPending = effectiveHand?.specialDecisionPending ?? false;
    const specialDecisionBy = effectiveHand?.specialDecisionBy ?? null;
    const winner = effectiveHand?.winner ?? null;
    const awardedPoints = effectiveHand?.awardedPoints ?? null;

    const tablePhase: TablePhase = !resolvedMatchId
      ? 'missing_context'
      : matchFinished
        ? 'match_finished'
        : handFinished
          ? 'hand_finished'
          : publicMatchState?.state === 'in_progress'
            ? 'playing'
            : 'waiting';

    const { handStatusLabel, handStatusTone } = buildHandStatus({
      publicMatchState,
      currentPublicHand,
      canStartHand,
      canPlayCard,
      isMyTurn,
      myCardsCount: myCards.length,
      playedRoundsCount: playedRounds.length,
      latestRound,
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
      currentTurnSeatId: roomState?.currentTurnSeatId ?? null,
      canStartHand,
      canPlayCard,
      currentValue,
      betState,
      pendingValue,
      requestedBy,
      specialState,
      specialDecisionPending,
      specialDecisionBy,
      winner,
      awardedPoints,
      availableActions,
      handFinished,
      matchFinished,
      tablePhase,
      handStatusLabel,
      handStatusTone,
      latestRound,
      rounds,
      playedRoundsCount: playedRounds.length,
      currentPublicHand,
      currentPrivateHand,
    };
  }, [effectiveMatchId, playerAssigned, privateMatchState, publicMatchState, roomState]);

  const isLiveTableFrame =
    viewModel.tablePhase === 'playing' || viewModel.tablePhase === 'hand_finished';

  const displayedMyPlayedCard =
    (pendingPlayedCard?.owner === 'mine' ? pendingPlayedCard.card : null) ??
    closingTableCards.mine ??
    (isLiveTableFrame ? viewModel.myPlayedCard : null);

  const displayedOpponentPlayedCard =
    closingTableCards.opponent ??
    (pendingPlayedCard?.owner === 'opponent' ? pendingPlayedCard.card : null) ??
    (isLiveTableFrame ? viewModel.opponentPlayedCard : null);

  useEffect(() => {
    if (pendingPlayedCard?.owner === 'mine' && viewModel.myPlayedCard === pendingPlayedCard.card) {
      setLaunchingCardKey(null);
      setPendingPlayedCard(null);
    }
  }, [pendingPlayedCard, viewModel.myPlayedCard]);

  useEffect(() => {
    setClosingTableCards((current) => ({
      mine: current.mine === viewModel.myPlayedCard ? null : current.mine,
      opponent: current.opponent === viewModel.opponentPlayedCard ? null : current.opponent,
    }));
  }, [viewModel.myPlayedCard, viewModel.opponentPlayedCard]);

  useEffect(() => {
    if (publicMatchState?.state !== 'in_progress' || !publicMatchState.currentHand) {
      setPendingPlayedCard(null);
      setClosingTableCards({ mine: null, opponent: null });
      return;
    }
  }, [publicMatchState?.state, publicMatchState?.currentHand?.rounds?.length]);

  useEffect(() => {
    if (!isResolvingRound) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setClosingTableCards({ mine: null, opponent: null });
      setPendingPlayedCard(null);
      setIsResolvingRound(false);
    }, 1100);

    return () => window.clearTimeout(timeout);
  }, [isResolvingRound]);

  useEffect(() => {
    if (
      displayedOpponentPlayedCard &&
      displayedOpponentPlayedCard !== previousOpponentPlayedCardRef.current
    ) {
      setOpponentRevealKey((current) => current + 1);
    }

    previousOpponentPlayedCardRef.current = displayedOpponentPlayedCard;
  }, [displayedOpponentPlayedCard]);

  useEffect(() => {
    const currentPlayedRoundsCount = viewModel.playedRoundsCount;
    const previousPlayedRoundsCount = previousPlayedRoundsCountRef.current;

    if (
      currentPlayedRoundsCount > 0 &&
      currentPlayedRoundsCount !== previousPlayedRoundsCount &&
      viewModel.latestRound?.finished
    ) {
      setRoundResolvedKey((current) => current + 1);
      setIsResolvingRound(true);
    }

    previousPlayedRoundsCountRef.current = currentPlayedRoundsCount;
  }, [viewModel.latestRound, viewModel.playedRoundsCount]);

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

    setRoundIntroKey((current) => current + 1);
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

    setLaunchingCardKey(cardKey);
    setPendingPlayedCard({
      owner: 'mine',
      card: serverCard,
      id: Date.now(),
    });

    clientRef.current?.emitPlayCard(viewModel.resolvedMatchId, card);
    appendLog(`Emitted play-card (${card.rank}${suitSymbol(card.suit)}).`);

    window.setTimeout(() => {
      setLaunchingCardKey((current) => (current === cardKey ? null : current));
    }, 700);
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

  const canRenderLiveState = Boolean(
    session?.backendUrl && session?.authToken && viewModel.resolvedMatchId,
  );

  return (
    <section className="grid gap-8">
      <div className="overflow-hidden rounded-[36px] border border-white/10 bg-slate-900/85 shadow-[0_28px_90px_rgba(15,23,42,0.45)]">
        <div className="border-b border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.18),transparent_42%)] px-8 py-8 lg:px-10 lg:py-10">
          <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr] xl:items-end">
            <div>
              <div className="inline-flex rounded-full border border-emerald-400/20 bg-emerald-500/10 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.24em] text-emerald-300">
                Live match
              </div>

              <h1 className="mt-5 max-w-4xl text-4xl font-black tracking-tight text-white lg:text-5xl">
                Mesa pronta para jogar, ler turno e seguir o ritmo da mão.
              </h1>

              <p className="mt-4 max-w-3xl text-base leading-8 text-slate-300">
                Reestruturada para ler o payload autoritativo primeiro, reduzir derivação ambígua e
                tratar melhor a transição entre rodada, fim de mão e próxima mão.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <MetricCard
                label="Connection"
                value={connectionStatus}
                tone={connectionStatus === 'online' ? 'success' : 'danger'}
              />
              <MetricCard label="Match ID" value={viewModel.resolvedMatchId || '-'} mono />
              <MetricCard label="My seat" value={viewModel.mySeat || '-'} />
            </div>
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/lobby"
              className="rounded-3xl bg-emerald-500 px-5 py-4 text-sm font-black text-slate-950 transition hover:bg-emerald-400"
            >
              Voltar para lobby
            </Link>

            <button
              type="button"
              onClick={handleRefreshState}
              className="rounded-3xl border border-white/10 bg-white/5 px-5 py-4 text-sm font-bold text-slate-100 transition hover:bg-white/10"
            >
              Get state
            </button>

            <select
              value={viraRank}
              onChange={(event) => setViraRank(event.target.value as Rank)}
              className="rounded-3xl border border-white/10 bg-slate-950 px-5 py-4 text-sm font-bold text-slate-100 outline-none transition focus:border-emerald-400/40"
            >
              {VIRA_RANK_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  Vira {option}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={handleStartHand}
              disabled={!viewModel.canStartHand}
              className={`rounded-3xl border px-5 py-4 text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-50 ${
                viewModel.canStartHand
                  ? 'border-emerald-400/30 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/20'
                  : 'border-white/10 bg-white/5 text-slate-100 hover:bg-white/10'
              }`}
            >
              Start next hand
            </button>
          </div>
        </div>

        <div className="grid gap-8 px-8 py-8 lg:px-10 lg:py-10 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="grid gap-6">
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
                opponentRevealKey={opponentRevealKey}
                myRevealKey={pendingPlayedCard?.owner === 'mine' ? pendingPlayedCard.id : 0}
                myCardLaunching={pendingPlayedCard?.owner === 'mine' && !viewModel.myPlayedCard}
                roundIntroKey={roundIntroKey}
                roundResolvedKey={roundResolvedKey}
                currentPrivateViraRank={viewModel.currentPrivateHand?.viraRank ?? null}
                currentPublicViraRank={viewModel.currentPublicHand?.viraRank ?? null}
                viraRank={viraRank}
                availableActions={viewModel.availableActions}
                onAction={handleMatchAction}
                myCards={viewModel.myCards}
                canPlayCard={viewModel.canPlayCard}
                launchingCardKey={launchingCardKey}
                onPlayCard={handlePlayCard}
              />
            </section>

            <section className="rounded-[30px] border border-white/10 bg-slate-950/40 p-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <div className="text-lg font-black tracking-tight text-slate-100">
                    Rounds played
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    Histórico vindo do `currentHand.rounds`, sem depender de narrativa local.
                  </p>
                </div>

                <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-300">
                  {viewModel.playedRoundsCount} / 3
                </span>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-3">
                {[0, 1, 2].map((index) => {
                  const round = viewModel.rounds[index] ?? null;
                  const played = Boolean(round?.playerOneCard || round?.playerTwoCard);
                  const isLatestResolved =
                    viewModel.latestRound != null &&
                    viewModel.latestRound.finished &&
                    viewModel.rounds.indexOf(viewModel.latestRound) === index;

                  return (
                    <motion.div
                      key={index}
                      animate={isLatestResolved ? roundResolvedAnimation : {}}
                      transition={{ duration: 1.2 }}
                      className={`rounded-[28px] border p-5 ${
                        played
                          ? 'border-white/10 bg-white/[0.03]'
                          : 'border-dashed border-white/10 bg-white/[0.02]'
                      }`}
                    >
                      <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">
                        Round {index + 1}
                      </div>

                      <div className="mt-4 grid gap-3 text-sm">
                        <RoundLine label="T1" value={round?.playerOneCard ?? '—'} />
                        <RoundLine label="T2" value={round?.playerTwoCard ?? '—'} />
                      </div>

                      <div className="mt-4 text-xs text-slate-400">
                        Result: {formatRoundResult(round?.result ?? null)}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </section>
          </div>

          <aside className="grid gap-6 self-start">
            <section className="rounded-[30px] border border-white/10 bg-slate-950/50 p-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <div className="text-lg font-black tracking-tight text-slate-100">
                    Match live state
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    Painel técnico segue secundário, mas fiel ao payload.
                  </p>
                </div>

                <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">
                  server-driven
                </span>
              </div>

              <div className="mt-6 grid gap-4">
                <MetricCard
                  label="Connection"
                  value={connectionStatus}
                  tone={connectionStatus === 'online' ? 'success' : 'danger'}
                />
                <MetricCard label="Match ID" value={viewModel.resolvedMatchId || '-'} mono />
                <MetricCard label="Public state" value={publicMatchState?.state || '-'} mono />
                <MetricCard label="Private state" value={privateMatchState?.state || '-'} mono />
                <MetricCard label="My seat" value={viewModel.mySeat || '-'} mono />
                <MetricCard
                  label="Current turn seat"
                  value={viewModel.currentTurnSeatId ?? '-'}
                  mono
                />
                <MetricCard label="Can start" value={String(viewModel.canStartHand)} mono />
                <MetricCard label="Can play card" value={String(viewModel.canPlayCard)} mono />
                <MetricCard label="Bet state" value={viewModel.betState} mono />
                <MetricCard
                  label="Special state"
                  value={formatSpecialState(viewModel.specialState)}
                  mono
                />
                <MetricCard
                  label="Available actions"
                  value={formatAvailableActionsSummary(viewModel.availableActions)}
                  mono
                />

                {!canRenderLiveState ? (
                  <div className="rounded-[28px] border border-amber-400/15 bg-amber-500/5 p-5 text-sm leading-6 text-amber-200">
                    Missing authenticated session or matchId to hydrate the live table.
                  </div>
                ) : null}
              </div>
            </section>

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
          <div className="text-base font-black tracking-tight text-slate-100">
            Available actions
          </div>
          <p className="mt-1 text-sm leading-6 text-slate-400">
            A barra responde ao contrato autoritativo da mão. Nenhum botão é liberado por inferência
            paralela.
          </p>
        </div>

        <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">
          backend truth
        </span>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        {visibleButtons.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-3 text-sm text-slate-400">
            Nenhuma ação especial disponível neste momento.
          </div>
        ) : (
          visibleButtons.map((button) => (
            <button
              key={button.action}
              type="button"
              onClick={() => onAction(button.action)}
              className={`rounded-2xl border px-4 py-3 text-sm font-black transition ${actionButtonToneClass(button.tone)}`}
            >
              {button.label}
            </button>
          ))
        )}
      </div>
    </div>
  );
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

function isActionEnabled(
  actions: NonNullable<MatchStatePayload['currentHand']>['availableActions'],
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
  if (action === 'request-truco') return actions.canRequestTruco;
  if (action === 'accept-bet') return actions.canAcceptBet;
  if (action === 'decline-bet') return actions.canDeclineBet;
  if (action === 'raise-to-six') return actions.canRaiseToSix;
  if (action === 'raise-to-nine') return actions.canRaiseToNine;
  if (action === 'raise-to-twelve') return actions.canRaiseToTwelve;
  if (action === 'accept-mao-de-onze') return actions.canAcceptMaoDeOnze;
  return actions.canDeclineMaoDeOnze;
}

function formatBetStatus(viewModel: MatchViewModel): string {
  if (viewModel.betState === 'awaiting_response') {
    return `Aguardando resposta para ${viewModel.pendingValue ?? viewModel.currentValue}`;
  }

  return `Valor atual: ${viewModel.currentValue}`;
}

function formatBetDetail(viewModel: MatchViewModel): string {
  if (viewModel.betState === 'awaiting_response') {
    return `Solicitada por ${viewModel.requestedBy ?? '-'} · valor pendente ${viewModel.pendingValue ?? '-'}.`;
  }

  return 'Sem aposta pendente no momento.';
}

function formatSpecialState(state: string): string {
  if (state === 'mao_de_onze') return 'Mão de 11';
  if (state === 'mao_de_ferro') return 'Mão de ferro';
  if (state === 'normal') return 'Normal';
  return state;
}

function formatSpecialDetail(viewModel: MatchViewModel): string {
  if (viewModel.specialDecisionPending) {
    return `Decisão pendente para ${viewModel.specialDecisionBy ?? '-'}.`;
  }

  if (viewModel.winner || viewModel.awardedPoints) {
    return `Resultado parcial · winner ${viewModel.winner ?? '-'} · pontos ${viewModel.awardedPoints ?? '-'}.`;
  }

  return 'Nenhum estado especial ativo no momento.';
}

function formatAvailableActionsSummary(
  actions: NonNullable<MatchStatePayload['currentHand']>['availableActions'],
): string {
  const enabled = [
    actions.canRequestTruco ? 'truco' : null,
    actions.canRaiseToSix ? 'raise6' : null,
    actions.canRaiseToNine ? 'raise9' : null,
    actions.canRaiseToTwelve ? 'raise12' : null,
    actions.canAcceptBet ? 'acceptBet' : null,
    actions.canDeclineBet ? 'declineBet' : null,
    actions.canAcceptMaoDeOnze ? 'accept11' : null,
    actions.canDeclineMaoDeOnze ? 'decline11' : null,
    actions.canAttemptPlayCard ? 'playCard' : null,
  ].filter((item): item is string => item !== null);

  return enabled.length > 0 ? enabled.join(', ') : 'none';
}

function actionButtonToneClass(tone: 'emerald' | 'amber' | 'rose'): string {
  if (tone === 'emerald') {
    return 'border-emerald-400/20 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/15';
  }

  if (tone === 'rose') {
    return 'border-rose-400/20 bg-rose-500/10 text-rose-200 hover:bg-rose-500/15';
  }

  return 'border-amber-400/20 bg-amber-500/10 text-amber-200 hover:bg-amber-500/15';
}

function getViewerCards(
  currentPrivateHand: MatchStatePayload['currentHand'] | null,
): CardPayload[] {
  if (!currentPrivateHand || !currentPrivateHand.viewerPlayerId) {
    return [];
  }

  const cards =
    currentPrivateHand.viewerPlayerId === 'P1'
      ? currentPrivateHand.playerOneHand
      : currentPrivateHand.playerTwoHand;

  return cards
    .map((card) => {
      const normalized = card.trim();

      if (normalized === 'HIDDEN' || normalized.length < 2) {
        return null;
      }

      return {
        rank: normalized.slice(0, -1),
        suit: normalized.slice(-1),
      } as CardPayload;
    })
    .filter((card): card is CardPayload => card !== null);
}

function resolvePlayedCardOwner(input: {
  payloadPlayerId: string | undefined;
  mySeat: string | null;
}): 'mine' | 'opponent' | null {
  if (!input.payloadPlayerId || !input.mySeat) {
    return null;
  }

  const myIsPlayerOne = input.mySeat === 'T1A' || input.mySeat === 'T1B';

  if (myIsPlayerOne && input.payloadPlayerId === 'P1') {
    return 'mine';
  }

  if (!myIsPlayerOne && input.payloadPlayerId === 'P2') {
    return 'mine';
  }

  return 'opponent';
}

function buildHandStatus(input: {
  publicMatchState: MatchStatePayload | null;
  currentPublicHand: MatchStatePayload['currentHand'] | null;
  canStartHand: boolean;
  canPlayCard: boolean;
  isMyTurn: boolean;
  myCardsCount: number;
  playedRoundsCount: number;
  latestRound: MatchViewModel['latestRound'];
}): { handStatusLabel: string; handStatusTone: HandStatusVariant } {
  if (input.publicMatchState?.state === 'finished') {
    return {
      handStatusLabel: 'Partida encerrada. O placar final já foi definido.',
      handStatusTone: 'success',
    };
  }

  if (input.currentPublicHand?.finished) {
    return {
      handStatusLabel: input.canStartHand
        ? 'Mão encerrada. O backend já liberou a próxima mão.'
        : 'Mão encerrada. Aguarde a próxima condição válida para continuar.',
      handStatusTone: 'success',
    };
  }

  if (input.publicMatchState?.state === 'waiting' && input.canStartHand) {
    return {
      handStatusLabel: 'Todos estão prontos. Você já pode iniciar a próxima mão.',
      handStatusTone: 'neutral',
    };
  }

  if (input.publicMatchState?.state === 'in_progress' && input.canPlayCard) {
    return {
      handStatusLabel: 'É o seu turno. Escolha uma carta da sua mão.',
      handStatusTone: 'warning',
    };
  }

  if (input.publicMatchState?.state === 'in_progress' && !input.isMyTurn) {
    return {
      handStatusLabel:
        input.latestRound?.finished && input.playedRoundsCount > 0
          ? 'Rodada encerrada. Aguarde o próximo turno definido pelo backend.'
          : 'A mão está em andamento. Aguarde a próxima jogada.',
      handStatusTone: 'neutral',
    };
  }

  return {
    handStatusLabel: 'Aguardando início da mão.',
    handStatusTone: 'neutral',
  };
}

function parseCardLabel(card: string): { rank: string; suit: string } | null {
  const normalized = card.trim();

  if (normalized.length < 2) {
    return null;
  }

  return {
    rank: normalized.slice(0, -1),
    suit: normalized.slice(-1),
  };
}

function formatRoundResult(result: string | null): string {
  if (!result) return '-';
  if (result === 'P1') return 'Team T1';
  if (result === 'P2') return 'Team T2';
  if (result === 'TIE') return 'Tie';
  return result;
}

function suitSymbol(suit: string): string {
  if (suit === 'C') return '♥';
  if (suit === 'O') return '♦';
  if (suit === 'P') return '♣';
  return '♠';
}

function suitColorClass(suit: string): string {
  return suit === 'C' || suit === 'O' ? 'text-rose-500' : 'text-slate-900';
}

function statusToneClass(variant: HandStatusVariant): string {
  if (variant === 'success') {
    return 'border-emerald-400/20 bg-emerald-500/10 text-emerald-300';
  }

  if (variant === 'warning') {
    return 'border-amber-400/20 bg-amber-500/10 text-amber-200';
  }

  return 'border-white/10 bg-slate-900/60 text-slate-200';
}
