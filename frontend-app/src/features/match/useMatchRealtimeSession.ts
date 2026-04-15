import { useEffect, useMemo, useRef, useState } from 'react';

import type { FrontendSession } from '../auth/authStorage';
import { loadMatchSnapshot, saveMatchSnapshot, type MatchSnapshot } from './matchSnapshotStorage';
import { GameSocketClient } from '../../services/socket/gameSocketClient';
import type {
  CardPayload,
  CardPlayedPayload,
  MatchStatePayload,
  PlayerAssignedPayload,
  Rank,
  RoomStatePayload,
  RoundTransitionPayload,
  ServerErrorPayload,
} from '../../services/socket/socketTypes';

type UseMatchRealtimeSessionParams = {
  session: FrontendSession | null;
  effectiveMatchId: string;
  onHandStarted: (payload: { matchId?: string; viraRank?: Rank | null }) => void;
  onCardPlayed: (payload: {
    matchId?: string;
    playerId?: string | null;
    seatId?: string | null;
    teamId?: string | null;
    card?: string | null;
    currentTurnSeatId?: string | null;
    isBot?: boolean;
  }) => void;
  onRoundTransition: (payload: {
    matchId?: string;
    phase: 'round-resolved' | 'next-round-opened';
    roundWinner?: string | null;
    finishedRoundsCount: number;
    totalRoundsCount: number;
    handContinues: boolean;
    openingSeatId?: string | null;
    currentTurnSeatId?: string | null;
    triggeredBy?: {
      seatId: string;
      teamId: 'T1' | 'T2';
      playerId: 'P1' | 'P2';
      isBot: boolean;
    };
  }) => void;
  onServerError?: (payload: ServerErrorPayload) => void;
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

type PersistSnapshotParams = {
  effectiveMatchId: string;
  roomStateRef: React.MutableRefObject<RoomStatePayload | null>;
  publicMatchStateRef: React.MutableRefObject<MatchStatePayload | null>;
  privateMatchStateRef: React.MutableRefObject<MatchStatePayload | null>;
  playerAssignedRef: React.MutableRefObject<PlayerAssignedPayload | null>;
  nextRoomState?: RoomStatePayload | null;
  nextPublicMatchState?: MatchStatePayload | null;
  nextPrivateMatchState?: MatchStatePayload | null;
  nextPlayerAssigned?: PlayerAssignedPayload | null;
};

function persistLiveSnapshot(params: PersistSnapshotParams): void {
  const {
    effectiveMatchId,
    roomStateRef,
    publicMatchStateRef,
    privateMatchStateRef,
    playerAssignedRef,
    nextRoomState,
    nextPublicMatchState,
    nextPrivateMatchState,
    nextPlayerAssigned,
  } = params;

  const snapshotMatchId =
    nextPrivateMatchState?.matchId ||
    nextPublicMatchState?.matchId ||
    nextRoomState?.matchId ||
    nextPlayerAssigned?.matchId ||
    effectiveMatchId;

  if (!snapshotMatchId) {
    return;
  }

  saveMatchSnapshot(snapshotMatchId, {
    roomState: nextRoomState ?? roomStateRef.current,
    publicMatchState: nextPublicMatchState ?? publicMatchStateRef.current,
    privateMatchState: nextPrivateMatchState ?? privateMatchStateRef.current,
    playerAssigned: nextPlayerAssigned ?? playerAssignedRef.current,
  });
}

function describeMatchStatePayload(scope: 'public' | 'private', payload: MatchStatePayload): string {
  return [
    `Received ${scope} match-state`,
    `state=${payload.state}`,
    `hand=${payload.currentHand ? 'yes' : 'no'}`,
    `next=${payload.currentHand?.nextDecisionType ?? 'null'}`,
    `finished=${String(payload.currentHand?.finished ?? null)}`,
    `winner=${payload.currentHand?.winner ?? 'null'}`,
  ].join(' | ');
}

function describeRoomStatePayload(payload: RoomStatePayload): string {
  return [
    'Received room-state',
    `canStart=${String(payload.canStart)}`,
    `turn=${payload.currentTurnSeatId ?? 'null'}`,
  ].join(' | ');
}

function describeCardPlayedPayload(payload: CardPlayedPayload): string {
  return [
    'Received card-played',
    `card=${payload.card ?? 'null'}`,
    `playerId=${payload.playerId ?? 'null'}`,
    `seatId=${payload.seatId ?? 'null'}`,
    `turn=${payload.currentTurnSeatId ?? 'null'}`,
    `isBot=${String(payload.isBot ?? false)}`,
  ].join(' | ');
}

function describeRoundTransitionPayload(payload: RoundTransitionPayload): string {
  return [
    'Received round-transition',
    `phase=${payload.phase}`,
    `winner=${payload.roundWinner ?? 'null'}`,
    `finishedRounds=${String(payload.finishedRoundsCount)}`,
    `totalRounds=${String(payload.totalRoundsCount)}`,
    `handContinues=${String(payload.handContinues)}`,
    `openingSeatId=${payload.openingSeatId ?? 'null'}`,
    `turn=${payload.currentTurnSeatId ?? 'null'}`,
  ].join(' | ');
}

export function useMatchRealtimeSession(
  params: UseMatchRealtimeSessionParams,
): UseMatchRealtimeSessionResult {
  const {
    session,
    effectiveMatchId,
    onHandStarted,
    onCardPlayed,
    onRoundTransition,
    onServerError,
  } = params;

  const initialSnapshot = useMemo(() => loadMatchSnapshot(effectiveMatchId), [effectiveMatchId]);

  const clientRef = useRef<GameSocketClient | null>(null);
  const connectionKeyRef = useRef<string | null>(null);
  const assignedSeatRef = useRef<string | null>(initialSnapshot?.playerAssigned?.seatId ?? null);
  const hasAutoReadiedRef = useRef(false);
  const intentionalDisconnectRef = useRef(false);
  const onHandStartedRef = useRef(onHandStarted);
  const onCardPlayedRef = useRef(onCardPlayed);
  const onRoundTransitionRef = useRef(onRoundTransition);
  const onServerErrorRef = useRef(onServerError);

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

  const roomStateRef = useRef<RoomStatePayload | null>(initialSnapshot?.roomState ?? null);
  const publicMatchStateRef = useRef<MatchStatePayload | null>(
    initialSnapshot?.publicMatchState ?? null,
  );
  const privateMatchStateRef = useRef<MatchStatePayload | null>(
    initialSnapshot?.privateMatchState ?? null,
  );
  const playerAssignedRef = useRef<PlayerAssignedPayload | null>(
    initialSnapshot?.playerAssigned ?? null,
  );

  useEffect(() => {
    onHandStartedRef.current = onHandStarted;
  }, [onHandStarted]);

  useEffect(() => {
    onCardPlayedRef.current = onCardPlayed;
  }, [onCardPlayed]);

  useEffect(() => {
    onRoundTransitionRef.current = onRoundTransition;
  }, [onRoundTransition]);

  useEffect(() => {
    onServerErrorRef.current = onServerError;
  }, [onServerError]);

  useEffect(() => {
    roomStateRef.current = roomState;
  }, [roomState]);

  useEffect(() => {
    publicMatchStateRef.current = publicMatchState;
  }, [publicMatchState]);

  useEffect(() => {
    privateMatchStateRef.current = privateMatchState;
  }, [privateMatchState]);

  useEffect(() => {
    playerAssignedRef.current = playerAssigned;
  }, [playerAssigned]);

  useEffect(() => {
    assignedSeatRef.current = initialSnapshot?.playerAssigned?.seatId ?? null;
    roomStateRef.current = initialSnapshot?.roomState ?? null;
    publicMatchStateRef.current = initialSnapshot?.publicMatchState ?? null;
    privateMatchStateRef.current = initialSnapshot?.privateMatchState ?? null;
    playerAssignedRef.current = initialSnapshot?.playerAssigned ?? null;

    setRoomState(initialSnapshot?.roomState ?? null);
    setPublicMatchState(initialSnapshot?.publicMatchState ?? null);
    setPrivateMatchState(initialSnapshot?.privateMatchState ?? null);
    setPlayerAssigned(initialSnapshot?.playerAssigned ?? null);
    setConnectionStatus('offline');
    setEventLog([]);
  }, [initialSnapshot]);

  function appendLog(line: string): void {
    setEventLog((current) =>
      [`[${new Date().toLocaleTimeString('pt-BR')}] ${line}`, ...current].slice(0, 40),
    );
  }

  useEffect(() => {
    if (!session?.backendUrl || !session?.authToken || !effectiveMatchId) {
      return;
    }

    const client = new GameSocketClient();
    const connectionKey = `${session.backendUrl}|${effectiveMatchId}|${session.authToken}`;

    clientRef.current = client;
    connectionKeyRef.current = connectionKey;
    assignedSeatRef.current = initialSnapshot?.playerAssigned?.seatId ?? null;
    hasAutoReadiedRef.current = false;
    intentionalDisconnectRef.current = false;

    client.connect(
      {
        backendUrl: session.backendUrl,
        authToken: session.authToken,
      },
      {
        onConnect: (socketId) => {
          if (connectionKeyRef.current !== connectionKey) {
            return;
          }

          setConnectionStatus('online');
          appendLog(`Socket connected (${socketId}).`);
          client.emitJoinMatch(effectiveMatchId);
          appendLog(`Emitted join-match (${effectiveMatchId}).`);
          client.emitGetState(effectiveMatchId);
          appendLog(`Emitted get-state (${effectiveMatchId}).`);
        },
        onDisconnect: (reason) => {
          if (connectionKeyRef.current !== connectionKey) {
            return;
          }

          setConnectionStatus('offline');

          if (intentionalDisconnectRef.current) {
            return;
          }

          appendLog(`Socket disconnected (${reason}).`);
        },
        onError: (payload: ServerErrorPayload) => {
          if (connectionKeyRef.current !== connectionKey) {
            return;
          }

          appendLog(
            payload.message ? `Server error: ${payload.message}` : 'Server emitted error event.',
          );
          onServerErrorRef.current?.(payload);
        },
        onPlayerAssigned: (payload) => {
          if (connectionKeyRef.current !== connectionKey) {
            return;
          }

          const sameMatch = !payload.matchId || payload.matchId === effectiveMatchId;

          if (!sameMatch) {
            return;
          }

          assignedSeatRef.current = payload.seatId ?? null;
          playerAssignedRef.current = payload;
          setPlayerAssigned(payload);

          persistLiveSnapshot({
            effectiveMatchId,
            roomStateRef,
            publicMatchStateRef,
            privateMatchStateRef,
            playerAssignedRef,
            nextPlayerAssigned: payload,
          });

          appendLog(
            payload.seatId
              ? `Received player-assigned (${payload.seatId}).`
              : 'Received player-assigned.',
          );

          if (payload.seatId && !hasAutoReadiedRef.current) {
            client.emitSetReady(true);
            hasAutoReadiedRef.current = true;
            appendLog('Emitted set-ready (true).');
            client.emitGetState(effectiveMatchId);
            appendLog(`Emitted get-state (${effectiveMatchId}) after auto-ready.`);
          }
        },
        onRoomState: (payload) => {
          if (connectionKeyRef.current !== connectionKey) {
            return;
          }

          const sameMatch = !payload.matchId || payload.matchId === effectiveMatchId;

          if (!sameMatch) {
            return;
          }

          const assignedSeatId = assignedSeatRef.current;
          const myRoomPlayer = assignedSeatId
            ? payload.players.find((player) => player.seatId === assignedSeatId)
            : null;

          if (myRoomPlayer?.ready) {
            hasAutoReadiedRef.current = true;
          }

          roomStateRef.current = payload;
          setRoomState(payload);

          persistLiveSnapshot({
            effectiveMatchId,
            roomStateRef,
            publicMatchStateRef,
            privateMatchStateRef,
            playerAssignedRef,
            nextRoomState: payload,
          });

          appendLog(describeRoomStatePayload(payload));
        },
        onMatchState: (payload) => {
          if (connectionKeyRef.current !== connectionKey) {
            return;
          }

          const sameMatch = !payload.matchId || payload.matchId === effectiveMatchId;

          if (!sameMatch) {
            return;
          }

          publicMatchStateRef.current = payload;
          setPublicMatchState(payload);

          persistLiveSnapshot({
            effectiveMatchId,
            roomStateRef,
            publicMatchStateRef,
            privateMatchStateRef,
            playerAssignedRef,
            nextPublicMatchState: payload,
          });

          appendLog(describeMatchStatePayload('public', payload));
        },
        onPrivateMatchState: (payload) => {
          if (connectionKeyRef.current !== connectionKey) {
            return;
          }

          const sameMatch = !payload.matchId || payload.matchId === effectiveMatchId;

          if (!sameMatch) {
            return;
          }

          privateMatchStateRef.current = payload;
          setPrivateMatchState(payload);

          persistLiveSnapshot({
            effectiveMatchId,
            roomStateRef,
            publicMatchStateRef,
            privateMatchStateRef,
            playerAssignedRef,
            nextPrivateMatchState: payload,
          });

          appendLog(describeMatchStatePayload('private', payload));
        },
        onHandStarted: (payload) => {
          if (connectionKeyRef.current !== connectionKey) {
            return;
          }

          const sameMatch = !payload.matchId || payload.matchId === effectiveMatchId;

          if (!sameMatch) {
            return;
          }

          onHandStartedRef.current({
            ...(payload.matchId ? { matchId: payload.matchId } : {}),
            viraRank: payload.viraRank ?? null,
          });

          appendLog(`Received hand-started (${payload.viraRank}).`);
        },
        onCardPlayed: (payload) => {
          if (connectionKeyRef.current !== connectionKey) {
            return;
          }

          const sameMatch = !payload.matchId || payload.matchId === effectiveMatchId;

          if (!sameMatch) {
            return;
          }

          onCardPlayedRef.current({
            ...(payload.matchId ? { matchId: payload.matchId } : {}),
            ...(payload.playerId ? { playerId: payload.playerId } : {}),
            ...(payload.seatId ? { seatId: payload.seatId } : {}),
            ...(payload.teamId ? { teamId: payload.teamId } : {}),
            ...(payload.card ? { card: payload.card } : {}),
            currentTurnSeatId: payload.currentTurnSeatId ?? null,
            isBot: payload.isBot ?? false,
          });

          appendLog(describeCardPlayedPayload(payload));
        },
        onRoundTransition: (payload) => {
          if (connectionKeyRef.current !== connectionKey) {
            return;
          }

          const sameMatch = !payload.matchId || payload.matchId === effectiveMatchId;

          if (!sameMatch) {
            return;
          }

          onRoundTransitionRef.current({
            ...(payload.matchId ? { matchId: payload.matchId } : {}),
            phase: payload.phase,
            roundWinner: payload.roundWinner ?? null,
            finishedRoundsCount: payload.finishedRoundsCount,
            totalRoundsCount: payload.totalRoundsCount,
            handContinues: payload.handContinues,
            openingSeatId: payload.openingSeatId ?? null,
            currentTurnSeatId: payload.currentTurnSeatId ?? null,
            ...(payload.triggeredBy ? { triggeredBy: payload.triggeredBy } : {}),
          });

          appendLog(describeRoundTransitionPayload(payload));
        },
      },
    );

    return () => {
      intentionalDisconnectRef.current = true;
      connectionKeyRef.current = null;
      client.disconnect();
      clientRef.current = null;
      assignedSeatRef.current = null;
      hasAutoReadiedRef.current = false;
    };
  }, [
    effectiveMatchId,
    initialSnapshot?.playerAssigned?.seatId,
    session?.authToken,
    session?.backendUrl,
  ]);

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
