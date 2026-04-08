import { useEffect, useMemo, useRef, useState } from 'react';

import type { FrontendSession } from '../auth/authStorage';
import { loadMatchSnapshot, saveMatchSnapshot, type MatchSnapshot } from './matchSnapshotStorage';
import { GameSocketClient } from '../../services/socket/gameSocketClient';
import type {
  CardPayload,
  MatchStatePayload,
  PlayerAssignedPayload,
  Rank,
  RoomStatePayload,
  ServerErrorPayload,
} from '../../services/socket/socketTypes';

type UseMatchRealtimeSessionParams = {
  session: FrontendSession | null;
  effectiveMatchId: string;
  onHandStarted: (payload: { matchId?: string; viraRank?: Rank | null }) => void;
  onCardPlayed: (payload: {
    matchId?: string;
    playerId?: string | null;
    card?: string | null;
  }) => void;
};

type UseMatchRealtimeSessionResult = {
  initialSnapshot: MatchSnapshot | null;
  connectionStatus: 'offline' | 'online';
  roomState: RoomStatePayload | null;
  publicMatchState: MatchStatePayload | null;
  privateMatchState: MatchStatePayload | null;
  playerAssigned: PlayerAssignedPayload | null;
  eventLog: string[];
  appendLog: (line: string) => void;
  emitGetState: (matchId: string) => void;
  emitStartHand: (matchId: string, viraRank: Rank) => void;
  emitPlayCard: (matchId: string, card: CardPayload) => void;
  emitRequestTruco: (matchId: string) => void;
  emitAcceptBet: (matchId: string) => void;
  emitDeclineBet: (matchId: string) => void;
  emitRaiseToSix: (matchId: string) => void;
  emitRaiseToNine: (matchId: string) => void;
  emitRaiseToTwelve: (matchId: string) => void;
  emitAcceptMaoDeOnze: (matchId: string) => void;
  emitDeclineMaoDeOnze: (matchId: string) => void;
};

export function useMatchRealtimeSession(
  params: UseMatchRealtimeSessionParams,
): UseMatchRealtimeSessionResult {
  const { session, effectiveMatchId, onHandStarted, onCardPlayed } = params;

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

          onHandStarted({
            matchId: payload.matchId,
            viraRank: payload.viraRank ?? null,
          });
          appendLog(`Received hand-started (${payload.viraRank}).`);
        },
        onCardPlayed: (payload) => {
          const sameMatch = !payload.matchId || payload.matchId === effectiveMatchId;

          if (!sameMatch) {
            return;
          }

          onCardPlayed({
            matchId: payload.matchId,
            playerId: payload.playerId ?? null,
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
  }, [effectiveMatchId, onCardPlayed, onHandStarted, session?.authToken, session?.backendUrl]);

  return {
    initialSnapshot,
    connectionStatus,
    roomState,
    publicMatchState,
    privateMatchState,
    playerAssigned,
    eventLog,
    appendLog,
    emitGetState: (matchId) => clientRef.current?.emitGetState(matchId),
    emitStartHand: (matchId, viraRank) => clientRef.current?.emitStartHand(matchId, viraRank),
    emitPlayCard: (matchId, card) => clientRef.current?.emitPlayCard(matchId, card),
    emitRequestTruco: (matchId) => clientRef.current?.emitRequestTruco(matchId),
    emitAcceptBet: (matchId) => clientRef.current?.emitAcceptBet(matchId),
    emitDeclineBet: (matchId) => clientRef.current?.emitDeclineBet(matchId),
    emitRaiseToSix: (matchId) => clientRef.current?.emitRaiseToSix(matchId),
    emitRaiseToNine: (matchId) => clientRef.current?.emitRaiseToNine(matchId),
    emitRaiseToTwelve: (matchId) => clientRef.current?.emitRaiseToTwelve(matchId),
    emitAcceptMaoDeOnze: (matchId) => clientRef.current?.emitAcceptMaoDeOnze(matchId),
    emitDeclineMaoDeOnze: (matchId) => clientRef.current?.emitDeclineMaoDeOnze(matchId),
  };
}
