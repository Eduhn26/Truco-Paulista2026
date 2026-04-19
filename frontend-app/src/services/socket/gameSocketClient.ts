import { io, type Socket } from 'socket.io-client';

import {
  normalizeCardPlayedPayload,
  normalizeHandStartedPayload,
  normalizeMatchStatePayload,
  normalizePlayerAssignedPayload,
  normalizeRankingPayload,
  normalizeRoomStatePayload,
  normalizeRoundTransitionPayload,
  normalizeServerErrorPayload,
  type CardPayload,
  type GameSocketEvents,
} from './socketTypes';

type ConnectOptions = {
  backendUrl: string;
  authToken: string;
};

export class GameSocketClient {
  private socket: Socket | null = null;

  connect(options: ConnectOptions, events: GameSocketEvents): Socket {
    this.disconnect();

    const socket = io(options.backendUrl, {
      transports: ['websocket'],
      auth: {
        authToken: options.authToken,
        token: options.authToken,
      },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 750,
      reconnectionDelayMax: 2500,
      timeout: 10000,
    });

    this.socket = socket;

    socket.on('connect', () => {
      events.onConnect?.(socket.id ?? '');
    });

    socket.on('disconnect', (reason) => {
      events.onDisconnect?.(reason);
    });

    socket.on('error', (payload: unknown) => {
      events.onError?.(normalizeServerErrorPayload(payload));
    });

    socket.on('player-assigned', (payload: unknown) => {
      events.onPlayerAssigned?.(normalizePlayerAssignedPayload(payload));
    });

    socket.on('room-state', (payload: unknown) => {
      events.onRoomState?.(normalizeRoomStatePayload(payload));
    });

    socket.on('match-state', (payload: unknown) => {
      events.onMatchState?.(normalizeMatchStatePayload(payload));
    });

    socket.on('match-state:private', (payload: unknown) => {
      events.onPrivateMatchState?.(normalizeMatchStatePayload(payload));
    });

    socket.on('ranking', (payload: unknown) => {
      events.onRanking?.(normalizeRankingPayload(payload));
    });

    socket.on('hand-started', (payload: unknown) => {
      events.onHandStarted?.(normalizeHandStartedPayload(payload));
    });

    socket.on('card-played', (payload: unknown) => {
      events.onCardPlayed?.(normalizeCardPlayedPayload(payload));
    });

    socket.on('round-transition', (payload: unknown) => {
      events.onRoundTransition?.(normalizeRoundTransitionPayload(payload));
    });

    return socket;
  }

  disconnect(): void {
    if (!this.socket) {
      return;
    }

    this.socket.removeAllListeners();
    this.socket.disconnect();
    this.socket = null;
  }

  emitCreateMatch(mode: '1v1' | '2v2' = '1v1', pointsToWin = 12): void {
    this.socket?.emit('create-match', { mode, pointsToWin });
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

  emitStartHand(matchId: string): void {
    this.socket?.emit('start-hand', { matchId });
  }

  emitPlayCard(matchId: string, card: CardPayload): void {
    this.socket?.emit('play-card', { matchId, card });
  }

  emitRequestTruco(matchId: string): void {
    this.socket?.emit('request-truco', { matchId });
  }

  emitAcceptBet(matchId: string): void {
    this.socket?.emit('accept-bet', { matchId });
  }

  emitDeclineBet(matchId: string): void {
    this.socket?.emit('decline-bet', { matchId });
  }

  emitRaiseToSix(matchId: string): void {
    this.socket?.emit('raise-to-six', { matchId });
  }

  emitRaiseToNine(matchId: string): void {
    this.socket?.emit('raise-to-nine', { matchId });
  }

  emitRaiseToTwelve(matchId: string): void {
    this.socket?.emit('raise-to-twelve', { matchId });
  }

  emitAcceptMaoDeOnze(matchId: string): void {
    this.socket?.emit('accept-mao-de-onze', { matchId });
  }

  emitDeclineMaoDeOnze(matchId: string): void {
    this.socket?.emit('decline-mao-de-onze', { matchId });
  }
}
