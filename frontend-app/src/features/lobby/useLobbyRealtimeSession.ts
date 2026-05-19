import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Socket } from "socket.io-client";

import { saveMatchSnapshot } from "../match/matchSnapshotStorage";
import {
  GameSocketClient,
  type PrivateFriendPlacement,
} from "../../services/socket/gameSocketClient";
import type { FrontendSession } from "../auth/authStorage";
import type {
  MatchFoundPayload,
  MatchStatePayload,
  PlayerAssignedPayload,
  QueueSnapshotPayload,
  QueueTimeoutPayload,
  RankingPayload,
  RoomStatePayload,
  ServerErrorPayload,
} from "../../services/socket/socketTypes";

type QuickMatchMode = "1v1" | "2v2";
type PublicQueueMode = QuickMatchMode;

type MatchHistoryParticipantPayload = {
  seatId: string;
  userId: string | null;
  displayName: string | null;
  isBot: boolean;
  botProfile: "balanced" | "aggressive" | "cautious" | null;
};

export type MatchHistoryListItemPayload = {
  id: string;
  matchId: string;
  mode: "1v1" | "2v2" | string;
  status: "completed" | "cancelled" | "aborted" | string;
  startedAt: string | null;
  finishedAt: string | null;
  participants: MatchHistoryParticipantPayload[];
  finalScore: {
    playerOne: number;
    playerTwo: number;
  };
  winnerPlayerId: "P1" | "P2" | null | string;
};

type MatchHistoryPayload = {
  items: MatchHistoryListItemPayload[];
};

type UseLobbyRealtimeSessionResult = {
  connectionStatus: "offline" | "online";
  roomState: RoomStatePayload | null;
  publicMatchState: MatchStatePayload | null;
  privateMatchState: MatchStatePayload | null;
  playerAssigned: PlayerAssignedPayload | null;
  ranking: RankingPayload["ranking"];
  matchHistory: MatchHistoryListItemPayload[];
  latestHistoryItem: MatchHistoryListItemPayload | null;
  eventLog: string[];
  derivedMatchId: string;
  roomPlayers: RoomStatePayload["players"];
  currentReady: boolean;
  hasLobbySnapshot: boolean;
  isSocketOnline: boolean;
  // NOTE: Keeps the empty-history state hidden while the lobby reconnects
  // and waits for the first history frame after returning from a match.
  isHydratingHistory: boolean;
  publicQueueSnapshot: QueueSnapshotPayload | null;
  activeQueueMode: PublicQueueMode | null;
  lastMatchFound: MatchFoundPayload | null;
  isInPublicQueue: boolean;
  canConnect: boolean;
  canCreateMatch: boolean;
  canCreatePrivateMatch: boolean;
  canJoinMatch: boolean;
  canToggleReady: boolean;
  canRequestState: boolean;
  canLeaveMatch: boolean;
  canJoinPublicQueue: boolean;
  canLeavePublicQueue: boolean;
  displayedMatchState: MatchStatePayload | null;
  handleConnect: () => void;
  handleDisconnect: () => void;
  handleCreateMatch: (mode?: QuickMatchMode) => void;
  handleCreateFlexibleRoom: (mode?: QuickMatchMode) => void;
  handleCreatePrivateMatch: (friendPlacement?: PrivateFriendPlacement) => void;
  handleCreateHumanOneVsOneRoom: () => void;
  handleJoinMatch: (matchIdInput: string) => void;
  handleLeaveMatch: () => void;
  handleSelectSeat: (seatId: string) => void;
  handleJoinPublicQueue: (mode?: PublicQueueMode) => void;
  handleSwitchToPublicQueue: (mode?: PublicQueueMode) => void;
  handleLeavePublicQueue: () => void;
  handleReady: () => void;
  handleGetState: () => void;
  handleRefreshHistory: () => void;
};

const LOBBY_RANKING_STORAGE_KEY = "truco:lobby:ranking";
const DEFAULT_RANKING_LIMIT = 10;
const DEFAULT_HISTORY_LIMIT = 50;
// NOTE: The lobby reconnects automatically after match navigation, so retries
// must be spaced out enough to avoid flooding a cold or unavailable backend.
const AUTO_RECONNECT_RETRY_MS = 4500;
// NOTE: This grace period prevents the empty-history copy from flashing before
// the reconnect flow has had a chance to receive the first history frame.
const HISTORY_HYDRATION_GRACE_MS = 1500;

function readStoredRanking(): RankingPayload["ranking"] {
  if (typeof window === "undefined") {
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

    return parsedValue.filter(
      (entry): entry is RankingPayload["ranking"][number] => {
        return entry !== null && typeof entry === "object";
      },
    );
  } catch {
    return [];
  }
}

function persistStoredRanking(ranking: RankingPayload["ranking"]): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      LOBBY_RANKING_STORAGE_KEY,
      JSON.stringify(ranking),
    );
  } catch {
    // NOTE: Ranking persistence is a resilience layer for the lobby only.
    // Storage failures must never break the realtime flow.
  }
}

function extractMatchIdInput(value: string): string {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return "";
  }

  try {
    const parsedUrl = new URL(trimmedValue);
    const queryMatchId = parsedUrl.searchParams.get("matchId")?.trim();

    if (queryMatchId) {
      return queryMatchId;
    }

    const pathMatch = parsedUrl.pathname.match(/\/match\/([^/]+)/u);

    return pathMatch?.[1]?.trim() ?? trimmedValue;
  } catch {
    return trimmedValue;
  }
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
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
  return typeof value === "number" && Number.isInteger(value)
    ? value
    : fallback;
}

function normalizeMatchHistoryParticipant(
  payload: unknown,
): MatchHistoryParticipantPayload | null {
  if (!payload || typeof payload !== "object") {
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
      candidate.botProfile === "balanced" ||
      candidate.botProfile === "aggressive" ||
      candidate.botProfile === "cautious"
        ? candidate.botProfile
        : null,
  };
}

function normalizeMatchHistoryItem(
  payload: unknown,
): MatchHistoryListItemPayload | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const candidate = payload as Record<string, unknown>;
  const id = asNonEmptyString(candidate.id);
  const matchId = asNonEmptyString(candidate.matchId);

  if (!id || !matchId) {
    return null;
  }

  const participantsRaw = Array.isArray(candidate.participants)
    ? candidate.participants
    : [];
  const participants = participantsRaw
    .map((participant) => normalizeMatchHistoryParticipant(participant))
    .filter(
      (participant): participant is MatchHistoryParticipantPayload =>
        participant !== null,
    );

  const finalScoreRaw =
    candidate.finalScore && typeof candidate.finalScore === "object"
      ? (candidate.finalScore as Record<string, unknown>)
      : null;

  return {
    id,
    matchId,
    mode:
      candidate.mode === "1v1" || candidate.mode === "2v2"
        ? candidate.mode
        : (asNonEmptyString(candidate.mode) ?? "1v1"),
    status:
      candidate.status === "completed" ||
      candidate.status === "cancelled" ||
      candidate.status === "aborted"
        ? candidate.status
        : (asNonEmptyString(candidate.status) ?? "completed"),
    startedAt: asOptionalString(candidate.startedAt),
    finishedAt: asOptionalString(candidate.finishedAt),
    participants,
    finalScore: {
      playerOne: asInteger(finalScoreRaw?.playerOne),
      playerTwo: asInteger(finalScoreRaw?.playerTwo),
    },
    winnerPlayerId:
      candidate.winnerPlayerId === "P1" || candidate.winnerPlayerId === "P2"
        ? candidate.winnerPlayerId
        : null,
  };
}

function normalizeMatchHistoryPayload(payload: unknown): MatchHistoryPayload {
  if (!payload || typeof payload !== "object") {
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
  // NOTE: React StrictMode may re-run the reconnect effect in development;
  // this guard keeps the socket client creation single-flight.
  const isConnectingRef = useRef(false);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const historyHydrationTimeoutRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const hasReceivedHistoryRef = useRef(false);

  const [connectionStatus, setConnectionStatus] = useState<
    "offline" | "online"
  >("offline");
  const [roomState, setRoomState] = useState<RoomStatePayload | null>(null);
  const [publicMatchState, setPublicMatchState] =
    useState<MatchStatePayload | null>(null);
  const [privateMatchState, setPrivateMatchState] =
    useState<MatchStatePayload | null>(null);
  const [playerAssigned, setPlayerAssigned] =
    useState<PlayerAssignedPayload | null>(null);
  const [ranking, setRanking] = useState<RankingPayload["ranking"]>(() =>
    readStoredRanking(),
  );
  const [matchHistory, setMatchHistory] = useState<
    MatchHistoryListItemPayload[]
  >([]);
  const [eventLog, setEventLog] = useState<string[]>([]);
  const [publicQueueSnapshot, setPublicQueueSnapshot] =
    useState<QueueSnapshotPayload | null>(null);
  const [activeQueueMode, setActiveQueueMode] =
    useState<PublicQueueMode | null>(null);
  const [lastMatchFound, setLastMatchFound] =
    useState<MatchFoundPayload | null>(null);
  const [isHydratingHistory, setIsHydratingHistory] = useState(false);

  const hasMinimumSession = Boolean(session?.backendUrl && session?.authToken);
  const normalizedMatchId = extractMatchIdInput(matchIdInput);

  const derivedMatchId =
    privateMatchState?.matchId ||
    publicMatchState?.matchId ||
    roomState?.matchId ||
    playerAssigned?.matchId ||
    normalizedMatchId;

  const appendLog = useCallback((line: string): void => {
    setEventLog((current) =>
      [`[${new Date().toLocaleTimeString("pt-BR")}] ${line}`, ...current].slice(
        0,
        30,
      ),
    );
  }, []);

  const requestRanking = useCallback(
    (
      reason:
        | "connect"
        | "create-match"
        | "join-match"
        | "get-state"
        | "auto-refresh",
    ): void => {
      clientRef.current?.emitGetRanking(DEFAULT_RANKING_LIMIT);
      appendLog(`Emitted get-ranking (${DEFAULT_RANKING_LIMIT}) [${reason}].`);
    },
    [appendLog],
  );

  const requestMatchHistory = useCallback(
    (
      reason: "connect" | "get-state" | "manual-refresh" | "auto-refresh",
    ): void => {
      const userId = session?.user?.id?.trim();

      if (!userId) {
        appendLog(
          `Skipped get-match-history [${reason}] because userId is missing.`,
        );
        return;
      }

      rawSocketRef.current?.emit("get-match-history", {
        userId,
        limit: DEFAULT_HISTORY_LIMIT,
      });

      appendLog(
        `Emitted get-match-history (${DEFAULT_HISTORY_LIMIT}) [${reason}].`,
      );
    },
    [appendLog, session?.user?.id],
  );

  const persistSnapshot = useCallback(
    (next: {
      nextRoomState?: RoomStatePayload | null;
      nextPublicMatchState?: MatchStatePayload | null;
      nextPrivateMatchState?: MatchStatePayload | null;
      nextPlayerAssigned?: PlayerAssignedPayload | null;
    }): void => {
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
    },
    [
      derivedMatchId,
      playerAssigned,
      privateMatchState,
      publicMatchState,
      roomState,
    ],
  );

  const clearActiveRoomState = useCallback((): void => {
    setRoomState(null);
    setPublicMatchState(null);
    setPrivateMatchState(null);
    setPlayerAssigned(null);
  }, []);

  const clearPublicQueueState = useCallback((): void => {
    setPublicQueueSnapshot(null);
    setActiveQueueMode(null);
    setLastMatchFound(null);
  }, []);

  const normalizePublicQueueMode = useCallback(
    (mode: string | undefined): PublicQueueMode | null => {
      return mode === "1v1" || mode === "2v2" ? mode : null;
    },
    [],
  );

  const handleConnect = useCallback((): void => {
    if (!session?.backendUrl || !session?.authToken) {
      appendLog("Missing backendUrl or authToken.");
      return;
    }

    if (isConnectingRef.current || clientRef.current) {
      appendLog("Connect requested but a session is already active.");
      return;
    }

    isConnectingRef.current = true;
    hasReceivedHistoryRef.current = false;
    setIsHydratingHistory(true);

    const client = new GameSocketClient();
    clientRef.current = client;

    const socket = client.connect(
      {
        backendUrl: session.backendUrl,
        authToken: session.authToken,
      },
      {
        onConnect: (socketId) => {
          isConnectingRef.current = false;
          setConnectionStatus("online");
          appendLog(`Socket connected (${socketId}).`);
          requestRanking("connect");
          requestMatchHistory("connect");

          // NOTE: History hydration must release even when the backend cannot
          // return a history frame for the current session.
          if (historyHydrationTimeoutRef.current !== null) {
            clearTimeout(historyHydrationTimeoutRef.current);
          }
          historyHydrationTimeoutRef.current = setTimeout(() => {
            historyHydrationTimeoutRef.current = null;
            if (!hasReceivedHistoryRef.current) {
              setIsHydratingHistory(false);
            }
          }, HISTORY_HYDRATION_GRACE_MS);
        },
        onDisconnect: (reason) => {
          isConnectingRef.current = false;
          setConnectionStatus("offline");
          appendLog(`Socket disconnected (${reason}).`);
        },
        onError: (payload: ServerErrorPayload) => {
          const errorText = payload.message
            ? `Server error: ${payload.message}`
            : "Server emitted error event.";

          appendLog(errorText);
        },
        onPlayerAssigned: (payload) => {
          setPlayerAssigned(payload);
          persistSnapshot({ nextPlayerAssigned: payload });
          appendLog(
            `Received player-assigned${payload.seatId ? ` (${payload.seatId})` : ""}.`,
          );
        },
        onRoomLeft: (payload) => {
          clearActiveRoomState();
          appendLog(
            `Received room-left${payload.matchId ? ` (${payload.matchId})` : ""}.`,
          );
        },
        onQueueJoined: (payload) => {
          const mode = normalizePublicQueueMode(payload.mode);
          setPublicQueueSnapshot(payload);
          setActiveQueueMode(mode);
          appendLog(
            `Received queue-joined (${payload.mode}, size=${payload.size}).`,
          );
        },
        onQueueState: (payload) => {
          setPublicQueueSnapshot((current) => {
            if (!current && activeQueueMode !== payload.mode) {
              return current;
            }

            return payload;
          });
          appendLog(
            `Received queue-state (${payload.mode}, size=${payload.size}).`,
          );
        },
        onQueueLeft: (payload) => {
          clearPublicQueueState();
          appendLog(`Received queue-left (left=${String(payload.left)}).`);
        },
        onQueueTimeout: (payload: QueueTimeoutPayload) => {
          clearPublicQueueState();
          appendLog(`Received queue-timeout (${payload.mode}).`);
        },
        onMatchFound: (payload) => {
          clearPublicQueueState();
          setLastMatchFound(payload);
          appendLog(
            `Received match-found (${payload.matchId}, ${payload.mode}).`,
          );
        },
        onRoomState: (payload) => {
          setRoomState(payload);
          persistSnapshot({ nextRoomState: payload });
          appendLog("Received room-state.");
        },
        onMatchState: (payload) => {
          setPublicMatchState(payload);
          persistSnapshot({ nextPublicMatchState: payload });
          appendLog("Received public match-state.");
        },
        onPrivateMatchState: (payload) => {
          setPrivateMatchState(payload);
          persistSnapshot({ nextPrivateMatchState: payload });
          appendLog("Received private match-state.");
        },
        onRanking: (payload) => {
          setRanking(payload.ranking);
          persistStoredRanking(payload.ranking);
          appendLog(`Received ranking (${payload.ranking.length}).`);
        },
      },
    );

    rawSocketRef.current = socket;

    socket.off("match-history");
    socket.on("match-history", (payload: unknown) => {
      const normalizedPayload = normalizeMatchHistoryPayload(payload);
      setMatchHistory(normalizedPayload.items);
      hasReceivedHistoryRef.current = true;
      setIsHydratingHistory(false);
      if (historyHydrationTimeoutRef.current !== null) {
        clearTimeout(historyHydrationTimeoutRef.current);
        historyHydrationTimeoutRef.current = null;
      }
      appendLog(`Received match-history (${normalizedPayload.items.length}).`);
    });
  }, [
    activeQueueMode,
    appendLog,
    clearActiveRoomState,
    clearPublicQueueState,
    normalizePublicQueueMode,
    persistSnapshot,
    requestMatchHistory,
    requestRanking,
    session,
  ]);

  const handleDisconnect = useCallback((): void => {
    rawSocketRef.current?.off("match-history");
    rawSocketRef.current = null;
    clientRef.current?.disconnect();
    clientRef.current = null;
    isConnectingRef.current = false;
    setConnectionStatus("offline");
    clearPublicQueueState();
    appendLog("Socket disconnected manually.");
  }, [appendLog, clearPublicQueueState]);

  // NOTE: Returning from a finished match lands on the lobby with no active
  // socket, so the lobby reconnects as soon as a valid session is available.
  useEffect(() => {
    if (!hasMinimumSession) {
      return;
    }

    if (
      connectionStatus === "online" ||
      isConnectingRef.current ||
      clientRef.current
    ) {
      return;
    }

    handleConnect();

    return () => {
      if (reconnectTimeoutRef.current !== null) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
  }, [connectionStatus, handleConnect, hasMinimumSession]);

  // NOTE: Cold starts and transient network failures may leave the lobby
  // offline after the first attempt; retry with a single scheduled timer.
  useEffect(() => {
    if (
      !hasMinimumSession ||
      connectionStatus === "online" ||
      isConnectingRef.current ||
      clientRef.current ||
      reconnectTimeoutRef.current !== null
    ) {
      return;
    }

    reconnectTimeoutRef.current = setTimeout(() => {
      reconnectTimeoutRef.current = null;
      if (!clientRef.current && !isConnectingRef.current) {
        appendLog("Auto-reconnect: retry tick.");
        handleConnect();
      }
    }, AUTO_RECONNECT_RETRY_MS);

    return () => {
      if (reconnectTimeoutRef.current !== null) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
  }, [appendLog, connectionStatus, handleConnect, hasMinimumSession]);

  // NOTE: The socket owns listeners outside React; unmount must release them
  // before another lobby instance can create a fresh client.
  useEffect(() => {
    return () => {
      if (historyHydrationTimeoutRef.current !== null) {
        clearTimeout(historyHydrationTimeoutRef.current);
        historyHydrationTimeoutRef.current = null;
      }
      if (reconnectTimeoutRef.current !== null) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      rawSocketRef.current?.off("match-history");
      rawSocketRef.current = null;
      clientRef.current?.disconnect();
      clientRef.current = null;
      isConnectingRef.current = false;
    };
  }, []);

  function leavePublicQueueBeforeRoomAction(reason: string): void {
    if (!activeQueueMode) {
      return;
    }

    clientRef.current?.emitLeaveQueue();
    clearPublicQueueState();
    appendLog(`Emitted leave-queue before ${reason}.`);
  }

  function handleCreateMatch(mode: QuickMatchMode = "1v1"): void {
    leavePublicQueueBeforeRoomAction(`create-match (${mode})`);
    clientRef.current?.emitCreateMatch(mode, 12);
    appendLog(`Emitted create-match (${mode}, 12).`);
    requestRanking("create-match");
  }

  function handleCreateFlexibleRoom(mode: QuickMatchMode = "2v2"): void {
    leavePublicQueueBeforeRoomAction(`join-or-create-flexible-room (${mode})`);
    clientRef.current?.emitCreateFlexibleRoom(mode, 12);
    appendLog(`Emitted create-flexible-room (${mode}, 12) as join-or-create.`);
    requestRanking("create-match");
  }

  function handleCreatePrivateMatch(
    friendPlacement: PrivateFriendPlacement = "opposite-team",
  ): void {
    leavePublicQueueBeforeRoomAction("create-private-match");
    clientRef.current?.emitCreatePrivateMatch(friendPlacement, 12);
    appendLog(`Emitted create-private-match (2v2, 12, ${friendPlacement}).`);
    requestRanking("create-match");
  }

  function handleCreateHumanOneVsOneRoom(): void {
    leavePublicQueueBeforeRoomAction("create-human-1v1-room");
    clientRef.current?.emitCreateHumanOneVsOneRoom(12);
    appendLog("Emitted create-human-1v1-room (1v1, 12).");
    requestRanking("create-match");
  }

  function handleJoinMatch(nextMatchIdInput: string): void {
    const nextMatchId = extractMatchIdInput(nextMatchIdInput);

    if (!nextMatchId) {
      appendLog("Match ID is required to join.");
      return;
    }

    leavePublicQueueBeforeRoomAction("join-match");
    clientRef.current?.emitJoinMatch(nextMatchId);
    appendLog(`Emitted join-match (${nextMatchId}).`);
    requestRanking("join-match");
  }

  function handleLeaveMatch(): void {
    if (!derivedMatchId) {
      clearActiveRoomState();
      appendLog("Cleared lobby room state.");
      return;
    }

    clientRef.current?.emitLeaveMatch();
    clearActiveRoomState();
    appendLog(`Emitted leave-match (${derivedMatchId}).`);
    requestRanking("get-state");
  }

  function handleSelectSeat(seatId: string): void {
    if (!derivedMatchId) {
      appendLog("Cannot select a seat without an active room.");
      return;
    }

    clientRef.current?.emitSelectSeat(derivedMatchId, seatId);
    appendLog(`Emitted select-seat (${seatId}).`);
  }

  function handleJoinPublicQueue(mode: PublicQueueMode = "2v2"): void {
    if (derivedMatchId) {
      appendLog("Cannot join queue while assigned to a room.");
      return;
    }

    clientRef.current?.emitJoinQueue(mode);
    setActiveQueueMode(mode);
    setLastMatchFound(null);
    appendLog(`Emitted join-queue (${mode}).`);
  }

  function handleSwitchToPublicQueue(mode: PublicQueueMode = "1v1"): void {
    if (derivedMatchId) {
      if (activeQueueMode) {
        clientRef.current?.emitLeaveQueue();
        clearPublicQueueState();
        appendLog("Cleared stale public queue state before queue switch.");
      }

      clientRef.current?.emitLeaveMatch();
      clearActiveRoomState();
      appendLog(`Emitted leave-match (${derivedMatchId}) before queue switch.`);
    } else if (activeQueueMode === mode) {
      appendLog("Already waiting in public queue.");
      return;
    } else if (activeQueueMode) {
      clientRef.current?.emitLeaveQueue();
      clearPublicQueueState();
      appendLog("Emitted leave-queue before switching queue mode.");
    }

    clientRef.current?.emitJoinQueue(mode);
    setActiveQueueMode(mode);
    setLastMatchFound(null);
    appendLog(`Emitted join-queue (${mode}) after queue switch.`);
  }

  function handleLeavePublicQueue(): void {
    clientRef.current?.emitLeaveQueue();
    clearPublicQueueState();
    appendLog("Emitted leave-queue.");
  }

  function handleReady(): void {
    const mySeatId = playerAssigned?.seatId;
    const readyNow =
      roomState?.players.find((player) => player.seatId === mySeatId)?.ready ??
      false;

    clientRef.current?.emitSetReady(!readyNow);
    appendLog(`Emitted set-ready (${String(!readyNow)}).`);
  }

  function handleGetState(): void {
    if (!derivedMatchId) {
      appendLog("No matchId available for get-state.");
      return;
    }

    clientRef.current?.emitGetState(derivedMatchId);
    appendLog(`Emitted get-state (${derivedMatchId}).`);
    requestRanking("get-state");
    requestMatchHistory("get-state");
  }

  function handleRefreshHistory(): void {
    requestMatchHistory("manual-refresh");
  }

  const roomPlayers = useMemo(() => {
    const players = roomState?.players ?? [];

    if (!playerAssigned?.seatId) {
      return players;
    }

    return players.map((player) => {
      if (player.seatId !== playerAssigned.seatId) {
        return player;
      }

      return {
        ...player,
        userId: player.userId ?? session?.user?.id ?? null,
        playerToken: player.playerToken ?? playerAssigned.playerToken ?? null,
        displayName:
          player.displayName ??
          playerAssigned.displayName ??
          session?.user?.displayName ??
          null,
        publicName:
          player.publicName ??
          playerAssigned.publicName ??
          session?.user?.displayName ??
          null,
        publicSlug: player.publicSlug ?? playerAssigned.publicSlug ?? null,
      };
    });
  }, [
    playerAssigned?.displayName,
    playerAssigned?.playerToken,
    playerAssigned?.publicName,
    playerAssigned?.publicSlug,
    playerAssigned?.seatId,
    roomState,
    session?.user?.displayName,
    session?.user?.id,
  ]);
  const displayedMatchState = privateMatchState ?? publicMatchState;
  const currentReady =
    roomState?.players.find(
      (player) => player.seatId === playerAssigned?.seatId,
    )?.ready ?? false;
  const isSocketOnline = connectionStatus === "online";
  const hasLobbySnapshot = Boolean(
    roomState || publicMatchState || privateMatchState || playerAssigned,
  );
  const latestHistoryItem = matchHistory[0] ?? null;
  const isInPublicQueue = activeQueueMode !== null;

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
    isHydratingHistory,
    publicQueueSnapshot,
    activeQueueMode,
    lastMatchFound,
    isInPublicQueue,
    canConnect: hasMinimumSession,
    canCreateMatch: hasMinimumSession && isSocketOnline,
    canCreatePrivateMatch: hasMinimumSession && isSocketOnline,
    canJoinMatch:
      hasMinimumSession && isSocketOnline && Boolean(normalizedMatchId),
    canToggleReady:
      hasMinimumSession && isSocketOnline && Boolean(playerAssigned?.seatId),
    canRequestState:
      hasMinimumSession && isSocketOnline && Boolean(derivedMatchId),
    canLeaveMatch:
      hasMinimumSession && isSocketOnline && Boolean(derivedMatchId),
    canJoinPublicQueue:
      hasMinimumSession &&
      isSocketOnline &&
      !derivedMatchId &&
      !isInPublicQueue,
    canLeavePublicQueue: hasMinimumSession && isSocketOnline && isInPublicQueue,
    displayedMatchState,
    handleConnect,
    handleDisconnect,
    handleCreateMatch,
    handleCreateFlexibleRoom,
    handleCreatePrivateMatch,
    handleCreateHumanOneVsOneRoom,
    handleJoinMatch,
    handleLeaveMatch,
    handleSelectSeat,
    handleJoinPublicQueue,
    handleSwitchToPublicQueue,
    handleLeavePublicQueue,
    handleReady,
    handleGetState,
    handleRefreshHistory,
  };
}
