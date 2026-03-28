import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { useAuth } from '../features/auth/authStore';
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

export function MatchPage() {
  const params = useParams<{ matchId: string }>();
  const { session } = useAuth();

  const routeMatchId = params.matchId ?? '';
  const effectiveMatchId = routeMatchId || getLastActiveMatchId() || '';

  const initialSnapshot = useMemo(() => loadMatchSnapshot(effectiveMatchId), [effectiveMatchId]);

  const clientRef = useRef<GameSocketClient | null>(null);

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

          setViraRank(payload.viraRank);
          appendLog(`Received hand-started (${payload.viraRank}).`);
        },
        onCardPlayed: (payload) => {
          const sameMatch = !payload.matchId || payload.matchId === effectiveMatchId;

          if (!sameMatch) {
            return;
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
  }, [effectiveMatchId, session?.authToken, session?.backendUrl]);

  const resolvedMatchId =
    privateMatchState?.matchId ||
    publicMatchState?.matchId ||
    roomState?.matchId ||
    effectiveMatchId;

  const mySeat = playerAssigned?.seatId ?? null;
  const currentPrivateHand = privateMatchState?.currentHand ?? null;
  const currentPublicHand = publicMatchState?.currentHand ?? null;
  const isOneVsOne = roomState?.mode === '1v1';
  const visibleSeatOrder = isOneVsOne ? TABLE_SEAT_ORDER_1V1 : TABLE_SEAT_ORDER_2V2;

  const myCards = useMemo<CardPayload[]>(() => {
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
  }, [currentPrivateHand]);

  const rounds = currentPublicHand?.rounds ?? [];
  const playedRounds = rounds.filter(
    (round) => round.playerOneCard !== null || round.playerTwoCard !== null,
  );
  const latestRound = playedRounds.length > 0 ? playedRounds[playedRounds.length - 1] : null;

  const playerOnePlayedCard = latestRound?.playerOneCard ?? null;
  const playerTwoPlayedCard = latestRound?.playerTwoCard ?? null;

  const isMyTurn = Boolean(mySeat && roomState?.currentTurnSeatId === mySeat);
  const handFinished = Boolean(currentPublicHand?.finished);
  const matchWaiting = publicMatchState?.state === 'waiting';
  const canStartHand = Boolean(roomState?.canStart && matchWaiting && resolvedMatchId);
  const canPlayCard = Boolean(
    privateMatchState?.state === 'in_progress' &&
      !handFinished &&
      isMyTurn &&
      mySeat &&
      myCards.length > 0,
  );

  const seatCards: TableSeatView[] = visibleSeatOrder.map((seatId) => {
    const player = roomState?.players.find((entry) => entry.seatId === seatId);

    return {
      seatId,
      ready: player?.ready ?? false,
      isBot: player?.isBot ?? false,
      isCurrentTurn: roomState?.currentTurnSeatId === seatId,
      isMine: mySeat === seatId,
    };
  });

  const handStatus = getHandStatus({
    publicMatchState,
    currentPublicHand,
    isMyTurn,
    canStartHand,
    myCardsCount: myCards.length,
    playedRoundsCount: playedRounds.length,
  });

  function handleRefreshState(): void {
    if (!resolvedMatchId) {
      appendLog('No matchId available for get-state.');
      return;
    }

    clientRef.current?.emitGetState(resolvedMatchId);
    appendLog(`Emitted get-state (${resolvedMatchId}).`);
  }

  function handleStartHand(): void {
    if (!resolvedMatchId) {
      appendLog('No matchId available for start-hand.');
      return;
    }

    clientRef.current?.emitStartHand(resolvedMatchId, viraRank);
    appendLog(`Emitted start-hand (${resolvedMatchId}, ${viraRank}).`);
  }

  function handlePlayCard(card: CardPayload): void {
    if (!resolvedMatchId || !mySeat || !canPlayCard) {
      appendLog('Cannot play card in the current state.');
      return;
    }

    clientRef.current?.emitPlayCard(resolvedMatchId, card);
    appendLog(`Emitted play-card (${card.rank}${suitSymbol(card.suit)}).`);
  }

  const canRenderLiveState = Boolean(session?.backendUrl && session?.authToken && resolvedMatchId);

  return (
    <section className="grid gap-6">
      <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-300">
          Phase 12.N
        </p>

        <h1 className="mt-3 text-3xl font-black tracking-tight">Match {resolvedMatchId || '-'}</h1>

        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
          O frontend agora está consolidado em torno do estado real do backend: mesa pública,
          visão privada do jogador e snapshot explícito para cada camada.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            to="/lobby"
            className="rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-emerald-400"
          >
            Voltar para lobby
          </Link>

          <button
            type="button"
            onClick={handleRefreshState}
            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-slate-100 transition hover:bg-white/10"
          >
            Get state
          </button>

          <select
            value={viraRank}
            onChange={(event) => setViraRank(event.target.value as Rank)}
            className="rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm font-bold text-slate-100 outline-none transition focus:border-emerald-400/40"
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
            disabled={!canStartHand}
            className={`rounded-2xl border px-4 py-3 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${
              canStartHand
                ? 'border-emerald-400/30 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/20'
                : 'border-white/10 bg-white/5 text-slate-100 hover:bg-white/10'
            }`}
          >
            Start next hand
          </button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <section className="rounded-3xl border border-white/10 bg-slate-900/70 p-6">
          <div className="rounded-[2rem] border border-emerald-500/15 bg-[radial-gradient(circle_at_center,_rgba(16,185,129,0.18),_transparent_55%),linear-gradient(180deg,rgba(10,40,22,0.85),rgba(10,32,22,0.65))] p-6">
            <div className="grid gap-6">
              <div
                className={`grid gap-4 ${isOneVsOne ? 'md:grid-cols-2' : 'md:grid-cols-2 xl:grid-cols-4'}`}
              >
                {seatCards.map((seat) => (
                  <div
                    key={seat.seatId}
                    className={`rounded-3xl border p-4 ${
                      seat.isCurrentTurn
                        ? 'border-emerald-400/40 bg-emerald-500/10'
                        : 'border-white/10 bg-slate-950/50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-black tracking-wide text-slate-100">
                        {seat.seatId}
                      </div>

                      {seat.isMine ? (
                        <span className="rounded-full bg-emerald-500/15 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-300">
                          You
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-4 text-sm text-slate-300">ready: {String(seat.ready)}</div>
                    <div className="mt-1 text-sm text-slate-400">bot: {String(seat.isBot)}</div>
                    <div className="mt-1 text-sm text-slate-400">
                      turn: {seat.isCurrentTurn ? 'active' : 'idle'}
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-3xl border border-white/10 bg-slate-950/50 p-5">
                  <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
                    Team T1 card
                  </div>
                  <div className="mt-4 flex min-h-24 items-center justify-center rounded-2xl border border-white/10 bg-slate-900/70 text-2xl font-black text-slate-100">
                    {playerOnePlayedCard ?? '—'}
                  </div>
                </div>

                <div className="rounded-3xl border border-white/10 bg-slate-950/50 p-5">
                  <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
                    Team T2 card
                  </div>
                  <div className="mt-4 flex min-h-24 items-center justify-center rounded-2xl border border-white/10 bg-slate-900/70 text-2xl font-black text-slate-100">
                    {playerTwoPlayedCard ?? '—'}
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-slate-950/40 p-6">
                <div className="grid gap-4 md:grid-cols-4">
                  <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
                    <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Mode</div>
                    <div className="mt-2 text-sm font-bold text-slate-100">
                      {roomState?.mode ?? '-'}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
                    <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Turn</div>
                    <div className="mt-2 text-sm font-bold text-slate-100">
                      {roomState?.currentTurnSeatId ?? '-'}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
                    <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
                      Last round
                    </div>
                    <div className="mt-2 text-sm font-bold text-slate-100">
                      {formatRoundResult(latestRound?.result ?? null)}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
                    <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Score</div>
                    <div className="mt-2 text-sm font-bold text-slate-100">
                      T1 {publicMatchState?.score.playerOne ?? 0} × T2{' '}
                      {publicMatchState?.score.playerTwo ?? 0}
                    </div>
                  </div>
                </div>

                <div
                  className={`mt-4 rounded-2xl border px-4 py-3 text-sm font-bold ${
                    handStatus.variant === 'success'
                      ? 'border-emerald-400/20 bg-emerald-500/10 text-emerald-300'
                      : handStatus.variant === 'warning'
                        ? 'border-amber-400/20 bg-amber-500/10 text-amber-200'
                        : 'border-white/10 bg-slate-900/60 text-slate-200'
                  }`}
                >
                  {handStatus.label}
                </div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-slate-950/40 p-6">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-lg font-bold">Rounds played</h2>
                  <span className="rounded-full bg-slate-700/50 px-3 py-1 text-xs font-bold text-slate-200">
                    {playedRounds.length} / 3
                  </span>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  {[0, 1, 2].map((index) => {
                    const round = rounds[index] ?? null;
                    const played = Boolean(round?.playerOneCard || round?.playerTwoCard);

                    return (
                      <div
                        key={index}
                        className={`rounded-2xl border p-4 ${
                          played
                            ? 'border-white/10 bg-slate-900/60'
                            : 'border-dashed border-white/10 bg-slate-950/30'
                        }`}
                      >
                        <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
                          Round {index + 1}
                        </div>

                        <div className="mt-3 grid gap-2 text-sm">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-slate-400">T1</span>
                            <span className="font-mono text-slate-100">
                              {round?.playerOneCard ?? '—'}
                            </span>
                          </div>

                          <div className="flex items-center justify-between gap-3">
                            <span className="text-slate-400">T2</span>
                            <span className="font-mono text-slate-100">
                              {round?.playerTwoCard ?? '—'}
                            </span>
                          </div>
                        </div>

                        <div className="mt-3 text-xs text-slate-400">
                          Result: {formatRoundResult(round?.result ?? null)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-slate-950/40 p-6">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-lg font-bold">Minha mão</h2>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-bold ${
                      canPlayCard
                        ? 'bg-emerald-500/15 text-emerald-300'
                        : 'bg-slate-700/50 text-slate-300'
                    }`}
                  >
                    {canPlayCard ? 'Your turn' : 'Waiting'}
                  </span>
                </div>

                <div className="mt-4 flex min-h-28 flex-wrap gap-3">
                  {myCards.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/40 px-4 py-6 text-sm text-slate-400">
                      {handFinished
                        ? 'Mão encerrada. A terceira carta não será usada se a mão já foi decidida.'
                        : privateMatchState?.state === 'in_progress'
                          ? 'Aguardando mão privada.'
                          : 'Aguardando start-hand.'}
                    </div>
                  ) : (
                    myCards.map((card) => (
                      <button
                        key={`${card.rank}|${card.suit}`}
                        type="button"
                        onClick={() => handlePlayCard(card)}
                        disabled={!canPlayCard}
                        className="flex h-28 w-20 flex-col items-center justify-between rounded-2xl border border-white/10 bg-slate-950 px-3 py-3 text-sm font-black text-slate-100 transition hover:-translate-y-1 hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
                        title={`Play ${card.rank}${suitSymbol(card.suit)}`}
                      >
                        <span>{card.rank}</span>
                        <span className={suitColorClass(card.suit)}>{suitSymbol(card.suit)}</span>
                        <span>{card.rank}</span>
                      </button>
                    ))
                  )}
                </div>

                <div className="mt-4 flex flex-wrap gap-6 text-sm text-slate-400">
                  <div>
                    Vira:{' '}
                    <span className="font-mono text-slate-200">
                      {currentPrivateHand?.viraRank ?? currentPublicHand?.viraRank ?? '-'}
                    </span>
                  </div>

                  <div>
                    Viewer:{' '}
                    <span className="font-mono text-slate-200">
                      {currentPrivateHand?.viewerPlayerId ?? '-'}
                    </span>
                  </div>

                  <div>
                    Hand finished:{' '}
                    <span className="font-mono text-slate-200">
                      {String(currentPublicHand?.finished ?? false)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <aside className="rounded-3xl border border-white/10 bg-slate-900/70 p-6">
          <h2 className="text-lg font-bold">Match live state</h2>

          <div className="mt-4 grid gap-3">
            <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-slate-500">connection</div>
              <div
                className={`mt-2 inline-flex rounded-full px-3 py-1 text-sm font-bold ${
                  connectionStatus === 'online'
                    ? 'bg-emerald-500/15 text-emerald-300'
                    : 'bg-rose-500/15 text-rose-300'
                }`}
              >
                {connectionStatus}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-slate-500">matchId</div>
              <div className="mt-2 break-all font-mono text-sm text-slate-100">
                {resolvedMatchId || '-'}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-slate-500">public state</div>
              <div className="mt-2 font-mono text-sm text-slate-100">
                {publicMatchState?.state || '-'}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-slate-500">private state</div>
              <div className="mt-2 font-mono text-sm text-slate-100">
                {privateMatchState?.state || '-'}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-slate-500">mySeat</div>
              <div className="mt-2 font-mono text-sm text-slate-100">{mySeat || '-'}</div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
                currentTurnSeatId
              </div>
              <div className="mt-2 font-mono text-sm text-slate-100">
                {roomState?.currentTurnSeatId || '-'}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-slate-500">canStart</div>
              <div className="mt-2 font-mono text-sm text-slate-100">
                {String(roomState?.canStart ?? false)}
              </div>
            </div>

            {!canRenderLiveState ? (
              <div className="rounded-2xl border border-amber-400/15 bg-amber-500/5 p-4 text-sm text-amber-200">
                Missing authenticated session or matchId to hydrate the live table.
              </div>
            ) : null}
          </div>
        </aside>
      </div>

      <section className="rounded-3xl border border-white/10 bg-slate-900/70 p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold">Event log</h2>
          <span className="text-xs text-slate-500">client-side</span>
        </div>

        <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/70 p-4">
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap text-xs text-slate-300">
            {eventLog.length > 0 ? eventLog.join('\n') : 'No events yet.'}
          </pre>
        </div>
      </section>
    </section>
  );
}

function formatRoundResult(result: string | null): string {
  if (!result) return '-';
  if (result === 'P1') return 'Team T1';
  if (result === 'P2') return 'Team T2';
  if (result === 'TIE') return 'Tie';
  return result;
}

function getHandStatus(input: {
  publicMatchState: MatchStatePayload | null;
  currentPublicHand: MatchStatePayload['currentHand'] | null;
  isMyTurn: boolean;
  canStartHand: boolean;
  myCardsCount: number;
  playedRoundsCount: number;
}): { label: string; variant: 'neutral' | 'success' | 'warning' } {
  if (input.publicMatchState?.state === 'finished') {
    return {
      label: 'Partida encerrada. O placar final já foi definido.',
      variant: 'success',
    };
  }

  if (input.currentPublicHand?.finished) {
    return {
      label: `Mão encerrada em ${input.playedRoundsCount} rodada(s). Você já pode iniciar a próxima mão.`,
      variant: 'success',
    };
  }

  if (input.publicMatchState?.state === 'waiting' && input.canStartHand) {
    return {
      label: 'Todos estão prontos. Você já pode iniciar a próxima mão.',
      variant: 'neutral',
    };
  }

  if (input.publicMatchState?.state === 'in_progress' && input.isMyTurn && input.myCardsCount > 0) {
    return {
      label: 'É o seu turno. Escolha uma carta da sua mão.',
      variant: 'warning',
    };
  }

  if (input.publicMatchState?.state === 'in_progress') {
    return {
      label: 'A mão está em andamento. Aguarde a próxima jogada.',
      variant: 'neutral',
    };
  }

  return {
    label: 'Aguardando início da mão.',
    variant: 'neutral',
  };
}

function suitSymbol(suit: string): string {
  if (suit === 'C') return '♥';
  if (suit === 'O') return '♦';
  if (suit === 'P') return '♣';
  return '♠';
}

function suitColorClass(suit: string): string {
  return suit === 'C' || suit === 'O' ? 'text-rose-300' : 'text-slate-100';
}