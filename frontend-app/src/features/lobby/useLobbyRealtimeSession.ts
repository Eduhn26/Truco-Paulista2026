import { useMemo, useRef, useState } from 'react';

import { saveMatchSnapshot } from '../match/matchSnapshotStorage';
import { GameSocketClient } from '../../services/socket/gameSocketClient';
import type { FrontendSession } from '../auth/authStorage';
import type {
  MatchStatePayload,
  PlayerAssignedPayload,
  RoomStatePayload,
  ServerErrorPayload,
} from '../../services/socket/socketTypes';

type UseLobbyRealtimeSessionResult = {
  connectionStatus: 'offline' | 'online';
  roomState: RoomStatePayload | null;
  publicMatchState: MatchStatePayload | null;
  privateMatchState: MatchStatePayload | null;
  playerAssigned: PlayerAssignedPayload | null;
  eventLog: string[];
  derivedMatchId: string;
  roomPlayers: RoomStatePayload['players'];
  currentReady: boolean;
  hasLobbySnapshot: boolean;
  isSocketOnline: boolean;
  canConnect: boolean;
  canCreateMatch: boolean;
  canJoinMatch: boolean;
  canToggleReady: boolean;
  canRequestState: boolean;
  displayedMatchState: MatchStatePayload | null;
  handleConnect: () => void;
  handleDisconnect: () => void;
  handleCreateMatch: () => void;
  handleJoinMatch: (matchIdInput: string) => void;
  handleReady: () => void;
  handleGetState: () => void;
};

export function useLobbyRealtimeSession(
  session: FrontendSession | null,
  matchIdInput: string,
): UseLobbyRealtimeSessionResult {
  const clientRef = useRef<GameSocketClient | null>(null);

  const [connectionStatus, setConnectionStatus] = useState<'offline' | 'online'>('offline');
  const [roomState, setRoomState] = useState<RoomStatePayload | null>(null);
  const [publicMatchState, setPublicMatchState] = useState<MatchStatePayload | null>(null);
  const [privateMatchState, setPrivateMatchState] = useState<MatchStatePayload | null>(null);
  const [playerAssigned, setPlayerAssigned] = useState<PlayerAssignedPayload | null>(null);
  const [eventLog, setEventLog] = useState<string[]>([]);

  const hasMinimumSession = Boolean(session?.backendUrl && session?.authToken);
  const normalizedMatchId = matchIdInput.trim();

  const derivedMatchId =
    privateMatchState?.matchId ||
    publicMatchState?.matchId ||
    roomState?.matchId ||
    playerAssigned?.matchId ||
    normalizedMatchId;

  function appendLog(line: string): void {
    setEventLog((current) =>
      [`[${new Date().toLocaleTimeString('pt-BR')}] ${line}`, ...current].slice(0, 30),
    );
  }

  function persistSnapshot(next: {
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
      derivedMatchId;

    if (!snapshotMatchId) {
      return;
    }

    // NOTE: The lobby persists a lightweight snapshot so the match screen
    // can hydrate from the latest known server state without depending on
    // this page staying mounted.
    saveMatchSnapshot(snapshotMatchId, {
      roomState: next.nextRoomState ?? roomState,
      publicMatchState: next.nextPublicMatchState ?? publicMatchState,
      privateMatchState: next.nextPrivateMatchState ?? privateMatchState,
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
          appendLog(`Received player-assigned${payload.seatId ? ` (${payload.seatId})` : ''}.`);
        },
        onRoomState: (payload) => {
          setRoomState(payload);
          persistSnapshot({ nextRoomState: payload });
          appendLog('Received room-state.');
        },
        onMatchState: (payload) => {
          setPublicMatchState(payload);
          persistSnapshot({ nextPublicMatchState: payload });
          appendLog('Received public match-state.');
        },
        onPrivateMatchState: (payload) => {
          setPrivateMatchState(payload);
          persistSnapshot({ nextPrivateMatchState: payload });
          appendLog('Received private match-state.');
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
    clientRef.current?.emitCreateMatch('1v1', 12);
    appendLog('Emitted create-match (1v1, 12).');
  }

  function handleJoinMatch(nextMatchIdInput: string): void {
    const nextMatchId = nextMatchIdInput.trim();

    if (!nextMatchId) {
      appendLog('Match ID is required to join.');
      return;
    }

    clientRef.current?.emitJoinMatch(nextMatchId);
    appendLog(`Emitted join-match (${nextMatchId}).`);
  }

  function handleReady(): void {
    const mySeatId = playerAssigned?.seatId;
    const readyNow = roomState?.players.find((player) => player.seatId === mySeatId)?.ready ?? false;

    clientRef.current?.emitSetReady(!readyNow);
    appendLog(`Emitted set-ready (${String(!readyNow)}).`);
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
  const displayedMatchState = privateMatchState ?? publicMatchState;
  const currentReady =
    roomState?.players.find((player) => player.seatId === playerAssigned?.seatId)?.ready ?? false;
  const isSocketOnline = connectionStatus === 'online';
  const hasLobbySnapshot = Boolean(roomState || publicMatchState || privateMatchState || playerAssigned);

  return {
    connectionStatus,
    roomState,
    publicMatchState,
    privateMatchState,
    playerAssigned,
    eventLog,
    derivedMatchId,
    roomPlayers,
    currentReady,
    hasLobbySnapshot,
    isSocketOnline,
    canConnect: hasMinimumSession,
    canCreateMatch: hasMinimumSession && isSocketOnline,
    canJoinMatch: hasMinimumSession && isSocketOnline && Boolean(normalizedMatchId),
    canToggleReady: hasMinimumSession && isSocketOnline && Boolean(playerAssigned?.seatId),
    canRequestState: hasMinimumSession && isSocketOnline && Boolean(derivedMatchId),
    displayedMatchState,
    handleConnect,
    handleDisconnect,
    handleCreateMatch,
    handleJoinMatch,
    handleReady,
    handleGetState,
  };
}