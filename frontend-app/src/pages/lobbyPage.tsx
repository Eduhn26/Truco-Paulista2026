import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { useAuth } from '../features/auth/authStore';
import { saveMatchSnapshot } from '../features/match/matchSnapshotStorage';
import { GameSocketClient } from '../services/socket/gameSocketClient';
import type {
  MatchStatePayload,
  PlayerAssignedPayload,
  RoomStatePayload,
  ServerErrorPayload,
} from '../services/socket/socketTypes';

export function LobbyPage() {
  const { session } = useAuth();

  const clientRef = useRef<GameSocketClient | null>(null);

  const [connectionStatus, setConnectionStatus] = useState<'offline' | 'online'>('offline');
  const [matchId, setMatchId] = useState('');
  const [roomState, setRoomState] = useState<RoomStatePayload | null>(null);
  const [matchState, setMatchState] = useState<MatchStatePayload | null>(null);
  const [playerAssigned, setPlayerAssigned] = useState<PlayerAssignedPayload | null>(null);
  const [eventLog, setEventLog] = useState<string[]>([]);

  const canConnect = Boolean(session?.backendUrl && session?.authToken);
  const derivedMatchId = matchState?.matchId || roomState?.matchId || playerAssigned?.matchId || matchId;

  function appendLog(line: string): void {
    setEventLog((current) =>
      [`[${new Date().toLocaleTimeString('pt-BR')}] ${line}`, ...current].slice(0, 30),
    );
  }

  function persistSnapshot(next: {
    nextRoomState?: RoomStatePayload | null;
    nextMatchState?: MatchStatePayload | null;
    nextPlayerAssigned?: PlayerAssignedPayload | null;
  }): void {
    const snapshotMatchId =
      next.nextMatchState?.matchId ||
      next.nextRoomState?.matchId ||
      next.nextPlayerAssigned?.matchId ||
      derivedMatchId;

    if (!snapshotMatchId) {
      return;
    }

    saveMatchSnapshot(snapshotMatchId, {
      roomState: next.nextRoomState ?? roomState,
      matchState: next.nextMatchState ?? matchState,
      playerAssigned: next.nextPlayerAssigned ?? playerAssigned,
    });
  }

  function handleConnect(): void {
    if (!session?.backendUrl || !session?.authToken) {
      appendLog('Missing backendUrl or authToken.');
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
          setPlayerAssigned(payload);
          persistSnapshot({ nextPlayerAssigned: payload });
          appendLog(
            `Received player-assigned${payload.seatId ? ` (${payload.seatId})` : ''}.`,
          );
        },
        onRoomState: (payload) => {
          setRoomState(payload);
          persistSnapshot({ nextRoomState: payload });
          appendLog('Received room-state.');
        },
        onMatchState: (payload) => {
          setMatchState(payload);
          persistSnapshot({ nextMatchState: payload });
          appendLog('Received match-state.');
        },
      },
    );
  }

  function handleDisconnect(): void {
    clientRef.current?.disconnect();
    setConnectionStatus('offline');
    appendLog('Socket disconnected manually.');
  }

  function handleCreateMatch(): void {
    clientRef.current?.emitCreateMatch();
    appendLog('Emitted create-match.');
  }

  function handleJoinMatch(): void {
    const normalizedMatchId = matchId.trim();

    if (!normalizedMatchId) {
      appendLog('Match ID is required to join.');
      return;
    }

    clientRef.current?.emitJoinMatch(normalizedMatchId);
    appendLog(`Emitted join-match (${normalizedMatchId}).`);
  }

  function handleReady(): void {
    const mySeatId = playerAssigned?.seatId;
    const currentReady =
      roomState?.players.find((player) => player.seatId === mySeatId)?.ready ?? false;

    clientRef.current?.emitSetReady(!currentReady);
    appendLog(`Emitted set-ready (${String(!currentReady)}).`);
  }

  function handleGetState(): void {
    if (!derivedMatchId) {
      appendLog('No matchId available for get-state.');
      return;
    }

    clientRef.current?.emitGetState(derivedMatchId);
    appendLog(`Emitted get-state (${derivedMatchId}).`);
  }

  const roomPlayers = useMemo(() => roomState?.players ?? [], [roomState]);

  return (
    <section className="grid gap-6 xl:grid-cols-[360px_1fr]">
      <aside className="rounded-3xl border border-white/10 bg-slate-900/70 p-6">
        <h1 className="text-2xl font-black tracking-tight">Lobby</h1>
        <p className="mt-2 text-sm text-slate-400">
          Shell inicial para conexão autenticada e fluxo básico da partida.
        </p>

        <div className="mt-6 grid gap-4">
          <div className="rounded-2xl border border-emerald-400/15 bg-emerald-500/5 p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-emerald-300">
              Authenticated user
            </div>
            <div className="mt-2 text-sm font-bold text-slate-100">
              {session?.user?.displayName ?? session?.user?.email ?? 'Unknown user'}
            </div>
            <div className="mt-1 text-xs text-slate-400">
              provider: {session?.user?.provider ?? '-'}
            </div>
            <div className="mt-1 break-all text-xs text-slate-400">
              userId: {session?.user?.id ?? '-'}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
              Assigned seat
            </div>
            <div className="mt-2 text-sm font-bold text-slate-100">
              {playerAssigned?.seatId ?? '-'}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
              Backend URL
            </div>
            <div className="mt-2 break-all font-mono text-sm text-slate-100">
              {session?.backendUrl || '-'}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
              Session auth
            </div>
            <div
              className={`mt-2 inline-flex rounded-full px-3 py-1 text-sm font-bold ${
                session?.authToken
                  ? 'bg-emerald-500/15 text-emerald-300'
                  : 'bg-rose-500/15 text-rose-300'
              }`}
            >
              {session?.authToken ? 'available' : 'missing'}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
              Connection
            </div>
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

          <label className="grid gap-2 text-sm">
            <span className="text-slate-400">Match ID</span>
            <input
              value={matchId}
              onChange={(event) => setMatchId(event.target.value)}
              className="rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-slate-100 outline-none transition focus:border-emerald-400/40"
              placeholder="Paste a matchId to join an existing room"
            />
          </label>

          <div className="grid gap-3">
            <button
              type="button"
              onClick={handleConnect}
              disabled={!canConnect}
              className="rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Connect socket
            </button>

            <button
              type="button"
              onClick={handleDisconnect}
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-slate-100 transition hover:bg-white/10"
            >
              Disconnect
            </button>

            <button
              type="button"
              onClick={handleCreateMatch}
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-slate-100 transition hover:bg-white/10"
            >
              Create match
            </button>

            <button
              type="button"
              onClick={handleJoinMatch}
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-slate-100 transition hover:bg-white/10"
            >
              Join match
            </button>

            <button
              type="button"
              onClick={handleReady}
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-slate-100 transition hover:bg-white/10"
            >
              Toggle ready
            </button>

            <button
              type="button"
              onClick={handleGetState}
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-slate-100 transition hover:bg-white/10"
            >
              Get state
            </button>

            {derivedMatchId ? (
              <Link
                to={`/match/${derivedMatchId}`}
                className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-center text-sm font-bold text-emerald-300 transition hover:bg-emerald-500/15"
              >
                Open match shell
              </Link>
            ) : null}
          </div>
        </div>
      </aside>

      <div className="grid gap-6">
        <section className="rounded-3xl border border-white/10 bg-slate-900/70 p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold">Room state</h2>
            <span className="text-xs text-slate-500">server-driven</span>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-slate-500">matchId</div>
              <div className="mt-2 break-all font-mono text-sm">{roomState?.matchId || '-'}</div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
                currentTurnSeatId
              </div>
              <div className="mt-2 font-mono text-sm">
                {roomState?.currentTurnSeatId || '-'}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-slate-500">canStart</div>
              <div className="mt-2 font-mono text-sm">{String(roomState?.canStart ?? false)}</div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-slate-500">players</div>
              <div className="mt-2 font-mono text-sm">{roomPlayers.length}</div>
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {roomPlayers.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/40 p-4 text-sm text-slate-400">
                No players received yet.
              </div>
            ) : (
              roomPlayers.map((player) => (
                <div
                  key={player.seatId}
                  className="rounded-2xl border border-white/10 bg-slate-950/70 p-4"
                >
                  <div className="text-sm font-bold text-slate-100">{player.seatId}</div>
                  <div className="mt-2 text-sm text-slate-400">
                    ready: {String(player.ready)}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-slate-900/70 p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold">Match state</h2>
            <span className="text-xs text-slate-500">server-driven</span>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-slate-500">matchId</div>
              <div className="mt-2 break-all font-mono text-sm">{matchState?.matchId || '-'}</div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-slate-500">state</div>
              <div className="mt-2 font-mono text-sm">{matchState?.state || '-'}</div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-slate-500">score</div>
              <div className="mt-2 font-mono text-sm">
                T1 {matchState?.score.playerOne ?? 0} × T2 {matchState?.score.playerTwo ?? 0}
              </div>
            </div>
          </div>
        </section>

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
      </div>
    </section>
  );
}