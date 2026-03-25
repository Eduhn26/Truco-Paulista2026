import { io, type Socket } from 'socket.io-client';

type ConnectOptions = {
  backendUrl: string;
  authToken: string;
};

export type RoomStatePayload = {
  matchId?: string;
  currentTurnSeatId?: string | null;
  canStart?: boolean;
  players?: Array<{
    seatId?: string;
    ready?: boolean;
  }>;
};

export type MatchStatePayload = {
  matchId?: string;
  state?: string;
  score?: {
    playerOne?: number;
    playerTwo?: number;
  };
};

export type RankingPayload = {
  ranking?: Array<{
    playerToken?: string;
    rating?: number;
    wins?: number;
    losses?: number;
    matchesPlayed?: number;
  }>;
};

export type GameSocketEvents = {
  onConnect?: (socketId: string) => void;
  onDisconnect?: (reason: string) => void;
  onError?: (payload: unknown) => void;
  onRoomState?: (payload: RoomStatePayload) => void;
  onMatchState?: (payload: MatchStatePayload) => void;
  onRanking?: (payload: RankingPayload) => void;
  onPlayerAssigned?: (payload: unknown) => void;
};

export class GameSocketClient {
  private socket: Socket | null = null;

  connect(options: ConnectOptions, events: GameSocketEvents): Socket {
    this.disconnect();

    this.socket = io(options.backendUrl, {
      transports: ['websocket'],
      auth: {
        authToken: options.authToken,
        token: options.authToken,
      },
    });

    this.socket.on('connect', () => {
      events.onConnect?.(this.socket?.id ?? '');
    });

    this.socket.on('disconnect', (reason) => {
      events.onDisconnect?.(reason);
    });

    this.socket.on('error', (payload) => {
      events.onError?.(payload);
    });

    this.socket.on('player-assigned', (payload) => {
      events.onPlayerAssigned?.(payload);
    });

    this.socket.on('room-state', (payload: RoomStatePayload) => {
      events.onRoomState?.(payload);
    });

    this.socket.on('match-state', (payload: MatchStatePayload) => {
      events.onMatchState?.(payload);
    });

    this.socket.on('ranking', (payload: RankingPayload) => {
      events.onRanking?.(payload);
    });

    return this.socket;
  }

  disconnect(): void {
    if (!this.socket) {
      return;
    }

    this.socket.disconnect();
    this.socket = null;
  }

  emitCreateMatch(): void {
    this.socket?.emit('create-match', {});
  }

  emitJoinMatch(matchId: string): void {
    this.socket?.emit('join-match', { matchId });
  }

  emitSetReady(ready: boolean): void {
    this.socket?.emit('set-ready', { ready });
  }

  emitGetState(matchId: string): void {
    this.socket?.emit('get-state', { matchId });
  }

  emitGetRanking(limit = 20): void {
    this.socket?.emit('get-ranking', { limit });
  }
}