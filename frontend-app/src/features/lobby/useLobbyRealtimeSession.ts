import { useMemo, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';

import { saveMatchSnapshot } from '../match/matchSnapshotStorage';
import { GameSocketClient } from '../../services/socket/gameSocketClient';
import type { FrontendSession } from '../auth/authStorage';
import type {
  MatchStatePayload,
  PlayerAssignedPayload,
  RankingPayload,
  RoomStatePayload,
  ServerErrorPayload,
} from '../../services/socket/socketTypes';

type MatchHistoryParticipantPayload = {
  seatId: string;
  userId: string | null;
  displayName: string | null;
  isBot: boolean;
  botProfile: 'balanced' | 'aggressive' | 'cautious' | null;
};

export type MatchHistoryListItemPayload = {
  id: string;
  matchId: string;
  mode: '1v1' | '2v2' | string;
  status: 'completed' | 'cancelled' | 'aborted' | string;
  startedAt: string | null;
  finishedAt: string | null;
  participants: MatchHistoryParticipantPayload[];
  finalScore: {
    playerOne: number;
    playerTwo: number;
  };
  winnerPlayerId: 'P1' | 'P2' | null | string;
};

type MatchHistoryPayload = {
  items: MatchHistoryListItemPayload[];
};

type UseLobbyRealtimeSessionResult = {
  connectionStatus: 'offline' | 'online';
  roomState: RoomStatePayload | null;
  publicMatchState: MatchStatePayload | null;
  privateMatchState: MatchStatePayload | null;
  playerAssigned: PlayerAssignedPayload | null;
  ranking: RankingPayload['ranking'];
  matchHistory: MatchHistoryListItemPayload[];
  latestHistoryItem: MatchHistoryListItemPayload | null;
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
  handleRefreshHistory: () => void;
};

const LOBBY_RANKING_STORAGE_KEY = 'truco:lobby:ranking';
const DEFAULT_RANKING_LIMIT = 10;
const DEFAULT_HISTORY_LIMIT = 5;

function readStoredRanking(): RankingPayload['ranking'] {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const rawValue = window.localStorage.getItem(LOBBY_RANKING_STORAGE_KEY);

    if (!rawValue) {
      return [];
    }

    const parsedValue = JSON.parse(rawValue) as unknown;

    if (!Array.isArray(parsedValue)) {
      return [];
    }

    return parsedValue.filter((entry): entry is RankingPayload['ranking'][number] => {
      return entry !== null && typeof entry === 'object';
    });
  } catch {
    return [];
  }
}

function persistStoredRanking(ranking: RankingPayload['ranking']): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(LOBBY_RANKING_STORAGE_KEY, JSON.stringify(ranking));
  } catch {
    // NOTE: Ranking persistence is a resilience layer for the lobby only.
    // Storage failures must never break the realtime flow.
  }
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalizedValue = value.trim();

  return normalizedValue ? normalizedValue : null;
}

function asOptionalString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  return asNonEmptyString(value);
}

function asInteger(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isInteger(value) ? value : fallback;
}

function normalizeMatchHistoryParticipant(
  payload: unknown,
): MatchHistoryParticipantPayload | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const candidate = payload as Record<string, unknown>;
  const seatId = asNonEmptyString(candidate.seatId);

  if (!seatId) {
    return null;
  }

  return {
    seatId,
    userId: asOptionalString(candidate.userId),
    displayName: asOptionalString(candidate.displayName),
    isBot: candidate.isBot === true,
    botProfile:
      candidate.botProfile === 'balanced' ||
      candidate.botProfile === 'aggressive' ||
      candidate.botProfile === 'cautious'
        ? candidate.botProfile
        : null,
  };
}

function normalizeMatchHistoryItem(payload: unknown): MatchHistoryListItemPayload | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const candidate = payload as Record<string, unknown>;
  const id = asNonEmptyString(candidate.id);
  const matchId = asNonEmptyString(candidate.matchId);

  if (!id || !matchId) {
    return null;
  }

  const participantsRaw = Array.isArray(candidate.participants) ? candidate.participants : [];
  const participants = participantsRaw
    .map((participant) => normalizeMatchHistoryParticipant(participant))
    .filter((participant): participant is MatchHistoryParticipantPayload => participant !== null);

  const finalScoreRaw =
    candidate.finalScore && typeof candidate.finalScore === 'object'
      ? (candidate.finalScore as Record<string, unknown>)
      : null;

  return {
    id,
    matchId,
    mode:
      candidate.mode === '1v1' || candidate.mode === '2v2'
        ? candidate.mode
        : asNonEmptyString(candidate.mode) ?? '1v1',
    status:
      candidate.status === 'completed' ||
      candidate.status === 'cancelled' ||
      candidate.status === 'aborted'
        ? candidate.status
        : asNonEmptyString(candidate.status) ?? 'completed',
    startedAt: asOptionalString(candidate.startedAt),
    finishedAt: asOptionalString(candidate.finishedAt),
    participants,
    finalScore: {
      playerOne: asInteger(finalScoreRaw?.playerOne),
      playerTwo: asInteger(finalScoreRaw?.playerTwo),
    },
    winnerPlayerId:
      candidate.winnerPlayerId === 'P1' || candidate.winnerPlayerId === 'P2'
        ? candidate.winnerPlayerId
        : null,
  };
}

function normalizeMatchHistoryPayload(payload: unknown): MatchHistoryPayload {
  if (!payload || typeof payload !== 'object') {
    return { items: [] };
  }

  const candidate = payload as Record<string, unknown>;
  const itemsRaw = Array.isArray(candidate.items) ? candidate.items : [];

  return {
    items: itemsRaw
      .map((item) => normalizeMatchHistoryItem(item))
      .filter((item): item is MatchHistoryListItemPayload => item !== null),
  };
}

export function useLobbyRealtimeSession(
  session: FrontendSession | null,
  matchIdInput: string,
): UseLobbyRealtimeSessionResult {
  const clientRef = useRef<GameSocketClient | null>(null);
  const rawSocketRef = useRef<Socket | null>(null);

  const [connectionStatus, setConnectionStatus] = useState<'offline' | 'online'>('offline');
  const [roomState, setRoomState] = useState<RoomStatePayload | null>(null);
  const [publicMatchState, setPublicMatchState] = useState<MatchStatePayload | null>(null);
  const [privateMatchState, setPrivateMatchState] = useState<MatchStatePayload | null>(null);
  const [playerAssigned, setPlayerAssigned] = useState<PlayerAssignedPayload | null>(null);
  const [ranking, setRanking] = useState<RankingPayload['ranking']>(() => readStoredRanking());
  const [matchHistory, setMatchHistory] = useState<MatchHistoryListItemPayload[]>([]);
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

  function requestRanking(reason: 'connect' | 'create-match' | 'join-match' | 'get-state'): void {
    clientRef.current?.emitGetRanking(DEFAULT_RANKING_LIMIT);
    appendLog(`Emitted get-ranking (${DEFAULT_RANKING_LIMIT}) [${reason}].`);
  }

  function requestMatchHistory(reason: 'connect' | 'get-state' | 'manual-refresh'): void {
    const userId = session?.user?.id?.trim();

    if (!userId) {
      appendLog(`Skipped get-match-history [${reason}] because userId is missing.`);
      return;
    }

    rawSocketRef.current?.emit('get-match-history', {
      userId,
      limit: DEFAULT_HISTORY_LIMIT,
    });

    appendLog(`Emitted get-match-history (${DEFAULT_HISTORY_LIMIT}) [${reason}].`);
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

    const socket = client.connect(
      {
        backendUrl: session.backendUrl,
        authToken: session.authToken,
      },
      {
        onConnect: (socketId) => {
          setConnectionStatus('online');
          appendLog(`Socket connected (${socketId}).`);
          requestRanking('connect');
          requestMatchHistory('connect');
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
        onRanking: (payload) => {
          setRanking(payload.ranking);
          persistStoredRanking(payload.ranking);
          appendLog(`Received ranking (${payload.ranking.length}).`);
        },
      },
    );

    rawSocketRef.current = socket;

    socket.off('match-history');
    socket.on('match-history', (payload: unknown) => {
      const normalizedPayload = normalizeMatchHistoryPayload(payload);
      setMatchHistory(normalizedPayload.items);
      appendLog(`Received match-history (${normalizedPayload.items.length}).`);
    });
  }

  function handleDisconnect(): void {
    rawSocketRef.current?.off('match-history');
    rawSocketRef.current = null;
    clientRef.current?.disconnect();
    setConnectionStatus('offline');
    appendLog('Socket disconnected manually.');
  }

  function handleCreateMatch(): void {
    clientRef.current?.emitCreateMatch('1v1', 12);
    appendLog('Emitted create-match (1v1, 12).');
    requestRanking('create-match');
  }

  function handleJoinMatch(nextMatchIdInput: string): void {
    const nextMatchId = nextMatchIdInput.trim();

    if (!nextMatchId) {
      appendLog('Match ID is required to join.');
      return;
    }

    clientRef.current?.emitJoinMatch(nextMatchId);
    appendLog(`Emitted join-match (${nextMatchId}).`);
    requestRanking('join-match');
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
    requestRanking('get-state');
    requestMatchHistory('get-state');
  }

  function handleRefreshHistory(): void {
    requestMatchHistory('manual-refresh');
  }

  const roomPlayers = useMemo(() => roomState?.players ?? [], [roomState]);
  const displayedMatchState = privateMatchState ?? publicMatchState;
  const currentReady =
    roomState?.players.find((player) => player.seatId === playerAssigned?.seatId)?.ready ?? false;
  const isSocketOnline = connectionStatus === 'online';
  const hasLobbySnapshot = Boolean(roomState || publicMatchState || privateMatchState || playerAssigned);
  const latestHistoryItem = matchHistory[0] ?? null;

  return {
    connectionStatus,
    roomState,
    publicMatchState,
    privateMatchState,
    playerAssigned,
    ranking,
    matchHistory,
    latestHistoryItem,
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
    handleRefreshHistory,
  };
}
