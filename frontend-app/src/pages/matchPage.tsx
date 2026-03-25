import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { useAuth } from '../features/auth/authStore';
import {
  getLastActiveMatchId,
  loadMatchSnapshot,
  saveMatchSnapshot,
} from '../features/match/matchSnapshotStorage';
import {
  clearPlayedCards,
  loadLocalHand,
  markSeatAsBackCard,
  playCardFromLocalHand,
  startLocalHand,
  type LocalHandState,
} from '../features/match/localHandSimulation';
import { GameSocketClient } from '../services/socket/gameSocketClient';
import type {
  CardPayload,
  MatchStatePayload,
  PlayerAssignedPayload,
  Rank,
  RoomStatePayload,
  ServerErrorPayload,
} from '../services/socket/socketTypes';

const TABLE_SEAT_ORDER = ['T1B', 'T2A', 'T1A', 'T2B'] as const;
const VIRA_RANK_OPTIONS: Rank[] = ['4', '5', '6', '7', 'Q', 'J', 'K', 'A', '2', '3'];

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
  const [matchState, setMatchState] = useState<MatchStatePayload | null>(
    initialSnapshot?.matchState ?? null,
  );
  const [playerAssigned, setPlayerAssigned] = useState<PlayerAssignedPayload | null>(
    initialSnapshot?.playerAssigned ?? null,
  );
  const [localHand, setLocalHand] = useState<LocalHandState | null>(() =>
    effectiveMatchId ? loadLocalHand(effectiveMatchId) : null,
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
    nextMatchState?: MatchStatePayload | null;
    nextPlayerAssigned?: PlayerAssignedPayload | null;
  }): void {
    const snapshotMatchId =
      next.nextMatchState?.matchId ||
      next.nextRoomState?.matchId ||
      next.nextPlayerAssigned?.matchId ||
      effectiveMatchId;

    if (!snapshotMatchId) {
      return;
    }

    saveMatchSnapshot(snapshotMatchId, {
      roomState: next.nextRoomState ?? roomState,
      matchState: next.nextMatchState ?? matchState,
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
          client.emitGetState(effectiveMatchId);
          appendLog(`Emitted get-state (${effectiveMatchId}).`);
        },
        onDisconnect: (reason) => {
          setConnectionStatus('offline');
          appendLog(`Socket disconnected (${reason}).`);
        },
        onError: (payload: ServerErrorPayload) => {
          appendLog(payload.message ? `Server error: ${payload.message}` : 'Server emitted error event.');
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

          setMatchState(payload);
          persistLiveSnapshot({ nextMatchState: payload });
          appendLog('Received match-state.');
        },
        onHandStarted: (payload) => {
          const sameMatch = !payload.matchId || payload.matchId === effectiveMatchId;

          if (!sameMatch || !payload.viraRank) {
            return;
          }

          const nextLocalHand = startLocalHand(effectiveMatchId, payload.viraRank);
          setLocalHand(nextLocalHand);
          setViraRank(payload.viraRank);
          appendLog(`Received hand-started (${payload.viraRank}).`);
        },
        onCardPlayed: (payload) => {
          const sameMatch = !payload.matchId || payload.matchId === effectiveMatchId;

          if (!sameMatch) {
            return;
          }

          appendLog('Received card-played.');

          if (!payload.seatId || !payload.card) {
            return;
          }

          setLocalHand((current) => {
            if (!current) {
              return current;
            }

            if (playerAssigned?.seatId === payload.seatId) {
              return current;
            }

            return markSeatAsBackCard(current, payload.seatId);
          });
        },
      },
    );

    return () => {
      client.disconnect();
      clientRef.current = null;
    };
  }, [effectiveMatchId, playerAssigned?.seatId, session?.authToken, session?.backendUrl]);

  useEffect(() => {
    if (!localHand) {
      return;
    }

    const playedCards = TABLE_SEAT_ORDER.every((seatId) => localHand.played[seatId]?.kind === 'card');

    if (!playedCards) {
      return;
    }

    const timer = window.setTimeout(() => {
      setLocalHand((current) => (current ? clearPlayedCards(current) : current));
    }, 2500);

    return () => {
      window.clearTimeout(timer);
    };
  }, [localHand]);

  const resolvedMatchId = matchState?.matchId || roomState?.matchId || effectiveMatchId;
  const mySeat = playerAssigned?.seatId ?? null;
  const isMyTurn = Boolean(mySeat && roomState?.currentTurnSeatId === mySeat);
  const canStartHand = Boolean(roomState?.canStart && matchState?.state === 'waiting' && resolvedMatchId);
  const canPlayCard = Boolean(matchState?.state === 'in_progress' && isMyTurn && localHand && mySeat);

  const seatCards = TABLE_SEAT_ORDER.map((seatId) => {
    const player = roomState?.players.find((entry) => entry.seatId === seatId);
    const playedEntry = localHand?.played[seatId] ?? null;

    return {
      seatId,
      ready: player?.ready ?? false,
      isCurrentTurn: roomState?.currentTurnSeatId === seatId,
      isMine: mySeat === seatId,
      playedEntry,
      handCount: localHand?.hands[seatId]?.length ?? 0,
    };
  });

  const myCards = useMemo<CardPayload[]>(() => {
    if (!localHand || !mySeat) {
      return [];
    }

    return Array.isArray(localHand.hands[mySeat]) ? localHand.hands[mySeat] : [];
  }, [localHand, mySeat]);

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
    if (!resolvedMatchId || !mySeat || !canPlayCard || !localHand) {
      appendLog('Cannot play card in the current state.');
      return;
    }

    const nextLocalHand = playCardFromLocalHand(localHand, mySeat, card);
    setLocalHand(nextLocalHand);
    clientRef.current?.emitPlayCard(resolvedMatchId, card);
    appendLog(`Emitted play-card (${card.rank}${suitSymbol(card.suit)}).`);
  }

  const canRenderLiveState = Boolean(session?.backendUrl && session?.authToken && resolvedMatchId);

  return (
    <section className="grid gap-6">
      <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-300">
          Phase 10.E
        </p>

        <h1 className="mt-3 text-3xl font-black tracking-tight">Match {resolvedMatchId || '-'}</h1>

        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
          A mesa agora já executa ações reais do fluxo da partida, com
          <code className="mx-1 rounded bg-white/5 px-2 py-1 text-xs">start-hand</code>,
          <code className="mx-1 rounded bg-white/5 px-2 py-1 text-xs">get-state</code>
          e
          <code className="mx-1 rounded bg-white/5 px-2 py-1 text-xs">play-card</code>,
          mantendo o backend como fonte autoritativa.
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
            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-slate-100 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Start next hand
          </button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <section className="rounded-3xl border border-white/10 bg-slate-900/70 p-6">
          <div className="rounded-[2rem] border border-emerald-500/15 bg-[radial-gradient(circle_at_center,_rgba(16,185,129,0.18),_transparent_55%),linear-gradient(180deg,rgba(10,40,22,0.85),rgba(10,32,22,0.65))] p-6">
            <div className="grid gap-6">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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
                    <div className="mt-1 text-sm text-slate-400">
                      turn: {seat.isCurrentTurn ? 'active' : 'idle'}
                    </div>
                    <div className="mt-1 text-sm text-slate-400">🂠 x{seat.handCount}</div>
                    <div className="mt-3 rounded-2xl border border-white/10 bg-slate-950/60 p-3 text-center text-sm text-slate-200">
                      {renderPlayedEntry(seat.playedEntry)}
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded-3xl border border-white/10 bg-slate-950/40 p-6">
                <div className="text-center">
                  <div className="text-sm uppercase tracking-[0.25em] text-slate-400">
                    Truco table
                  </div>
                  <div className="mt-3 text-2xl font-black tracking-tight text-slate-100">
                    Initial playable table
                  </div>
                  <div className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-300">
                    A mão local só serve para experiência visual inicial. O fluxo autoritativo
                    continua vindo do backend por
                    <code className="mx-1 rounded bg-white/5 px-2 py-1 text-xs">room-state</code>,
                    <code className="mx-1 rounded bg-white/5 px-2 py-1 text-xs">match-state</code>,
                    <code className="mx-1 rounded bg-white/5 px-2 py-1 text-xs">hand-started</code>
                    e
                    <code className="mx-1 rounded bg-white/5 px-2 py-1 text-xs">card-played</code>.
                  </div>
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
                      {matchState?.state === 'in_progress'
                        ? 'Sem cartas na mão ou mão ainda não simulada.'
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

                <div className="mt-4 text-sm text-slate-400">
                  Vira:{' '}
                  <span className="font-mono text-slate-200">
                    {localHand ? `${localHand.vira.rank}${suitSymbol(localHand.vira.suit)}` : '-'}
                  </span>
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
              <div className="text-xs uppercase tracking-[0.2em] text-slate-500">state</div>
              <div className="mt-2 font-mono text-sm text-slate-100">
                {matchState?.state || '-'}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-slate-500">score</div>
              <div className="mt-2 font-mono text-sm text-slate-100">
                T1 {matchState?.score.playerOne ?? 0} × T2 {matchState?.score.playerTwo ?? 0}
              </div>
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
              <div className="text-xs uppercase tracking-[0.2em] text-slate-500">mySeat</div>
              <div className="mt-2 font-mono text-sm text-slate-100">{mySeat || '-'}</div>
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

function renderPlayedEntry(entry: LocalHandState['played'][string]): string {
  if (!entry) {
    return '—';
  }

  if (entry.kind === 'back') {
    return '🂠';
  }

  return `${entry.card.rank}${suitSymbol(entry.card.suit)}`;
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