import { io, type Socket } from 'socket.io-client';

import {
  normalizeCardPlayedPayload,
  normalizeHandStartedPayload,
  normalizeMatchStatePayload,
  normalizePlayerAssignedPayload,
  normalizeRankingPayload,
  normalizeRoomStatePayload,
  normalizeServerErrorPayload,
  type CardPayload,
  type GameSocketEvents,
  type Rank,
} from './socketTypes';

type ConnectOptions = {
  backendUrl: string;
  authToken: string;
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

    this.socket.on('error', (payload: unknown) => {
      events.onError?.(normalizeServerErrorPayload(payload));
    });

    this.socket.on('player-assigned', (payload: unknown) => {
      events.onPlayerAssigned?.(normalizePlayerAssignedPayload(payload));
    });

    this.socket.on('room-state', (payload: unknown) => {
      events.onRoomState?.(normalizeRoomStatePayload(payload));
    });

    this.socket.on('match-state', (payload: unknown) => {
      events.onMatchState?.(normalizeMatchStatePayload(payload));
    });

    this.socket.on('ranking', (payload: unknown) => {
      events.onRanking?.(normalizeRankingPayload(payload));
    });

    this.socket.on('hand-started', (payload: unknown) => {
      events.onHandStarted?.(normalizeHandStartedPayload(payload));
    });

    this.socket.on('card-played', (payload: unknown) => {
      events.onCardPlayed?.(normalizeCardPlayedPayload(payload));
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

  emitStartHand(matchId: string, viraRank: Rank): void {
    this.socket?.emit('start-hand', { matchId, viraRank });
  }

  emitPlayCard(matchId: string, card: CardPayload): void {
    this.socket?.emit('play-card', { matchId, card });
  }
}