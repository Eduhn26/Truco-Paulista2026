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
  MatchStatePayload,
  PlayerAssignedPayload,
  RoomStatePayload,
  ServerErrorPayload,
} from '../services/socket/socketTypes';

const TABLE_SEAT_ORDER = ['T1B', 'T2A', 'T1A', 'T2B'] as const;

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
          const errorText = payload.message
            ? `Server error: ${payload.message}`
            : 'Server emitted error event.';

          appendLog(errorText);
        },
        onPlayerAssigned: (payload) => {
          const sameMatch = !payload.matchId || payload.matchId === effectiveMatchId;

          if (!sameMatch) {
            return;
          }

          setPlayerAssigned(payload);
          persistLiveSnapshot({ nextPlayerAssigned: payload });
          appendLog(
            `Received player-assigned${payload.seatId ? ` (${payload.seatId})` : ''}.`,
          );
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
      },
    );

    return () => {
      client.disconnect();
      clientRef.current = null;
    };
  }, [effectiveMatchId, session?.authToken, session?.backendUrl]);

  const resolvedMatchId = matchState?.matchId || roomState?.matchId || effectiveMatchId;

  const seatCards = TABLE_SEAT_ORDER.map((seatId) => {
    const player = roomState?.players.find((entry) => entry.seatId === seatId);

    return {
      seatId,
      ready: player?.ready ?? false,
      isCurrentTurn: roomState?.currentTurnSeatId === seatId,
      isMine: playerAssigned?.seatId === seatId,
    };
  });

  const canRenderLiveState = Boolean(session?.backendUrl && session?.authToken && resolvedMatchId);

  return (
    <section className="grid gap-6">
      <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-300">
          Phase 10.D
        </p>

        <h1 className="mt-3 text-3xl font-black tracking-tight">
          Match {resolvedMatchId || '-'}
        </h1>

        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
          A mesa agora usa a sessão autenticada para se conectar diretamente ao socket e
          refletir o estado da partida em tempo real, sem depender só do snapshot vindo do
          lobby.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            to="/lobby"
            className="rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-emerald-400"
          >
            Voltar para lobby
          </Link>
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

                    <div className="mt-4 text-sm text-slate-300">
                      ready: {String(seat.ready)}
                    </div>
                    <div className="mt-1 text-sm text-slate-400">
                      turn: {seat.isCurrentTurn ? 'active' : 'idle'}
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
                    Live state shell
                  </div>
                  <div className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-300">
                    A tela já reage ao estado vivo do backend. O próximo passo será trocar
                    estes blocos por componentes reais de mesa, mão e jogadas.
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
              <div className="mt-2 font-mono text-sm text-slate-100">
                {playerAssigned?.seatId || '-'}
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