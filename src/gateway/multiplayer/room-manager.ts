import type { SeatId, TeamId } from './seat-id';
import { nextFreeSeat, teamFromSeat } from './seat-id';

type RoomState = {
  matchId: string;
  socketsBySeat: Map<SeatId, string>;
  readyBySeat: Map<SeatId, boolean>;
  currentTurnSeatId: SeatId | null;
};

export type PlayerSession = {
  matchId: string;
  seatId: SeatId;
  teamId: TeamId;
  domainPlayerId: 'P1' | 'P2';
  playerToken: string;
  socketId: string;
};

export type RoomStateDto = {
  matchId: string;
  players: Array<{
    seatId: SeatId;
    teamId: TeamId;
    ready: boolean;
  }>;
  canStart: boolean;
  currentTurnSeatId: SeatId | null;
};

const TURN_ORDER: ReadonlyArray<SeatId> = ['T1A', 'T2A', 'T1B', 'T2B'];

function tokenKey(matchId: string, playerToken: string): string {
  return `${matchId}::${playerToken}`;
}

// NOTE: Presença/seat/ready/turn são efêmeros (transport-level). Persistir isso em DB vira estado “fantasma”.
export class RoomManager {
  private readonly roomsByMatchId = new Map<string, RoomState>();

  private readonly sessionsBySocketId = new Map<string, PlayerSession>();
  private readonly sessionsByTokenKey = new Map<string, PlayerSession>();

  ensureRoom(matchId: string): void {
    if (this.roomsByMatchId.has(matchId)) return;

    this.roomsByMatchId.set(matchId, {
      matchId,
      socketsBySeat: new Map(),
      readyBySeat: new Map(),
      currentTurnSeatId: null,
    });
  }

  join(matchId: string, socketId: string, playerToken: string): PlayerSession {
    this.ensureRoom(matchId);

    const room = this.roomsByMatchId.get(matchId);
    if (!room) throw new Error('room not found');

    const existingSocket = this.sessionsBySocketId.get(socketId);
    if (existingSocket) return existingSocket;

    const key = tokenKey(matchId, playerToken);
    const existingToken = this.sessionsByTokenKey.get(key);

    // NOTE: Reconexão: token mantém o seat; só trocamos o socketId.
    if (existingToken) {
      const oldSocketId = existingToken.socketId;

      room.socketsBySeat.set(existingToken.seatId, socketId);

      this.sessionsBySocketId.delete(oldSocketId);

      const reattached: PlayerSession = {
        ...existingToken,
        socketId,
      };

      this.sessionsByTokenKey.set(key, reattached);
      this.sessionsBySocketId.set(socketId, reattached);

      return reattached;
    }

    const occupied = new Set<SeatId>(room.socketsBySeat.keys());
    const seatId = nextFreeSeat(occupied);
    if (!seatId) throw new Error('match is full');

    room.socketsBySeat.set(seatId, socketId);

    // NOTE: Ready inicia falso apenas no primeiro join do token.
    room.readyBySeat.set(seatId, false);

    const teamId = teamFromSeat(seatId);
    const domainPlayerId: 'P1' | 'P2' = teamId === 'T1' ? 'P1' : 'P2';

    const session: PlayerSession = {
      matchId,
      seatId,
      teamId,
      domainPlayerId,
      playerToken,
      socketId,
    };

    this.sessionsBySocketId.set(socketId, session);
    this.sessionsByTokenKey.set(key, session);

    return session;
  }

  leave(socketId: string): { matchId: string } | null {
    const session = this.sessionsBySocketId.get(socketId);
    if (!session) return null;

    const room = this.roomsByMatchId.get(session.matchId);
    if (room) {
      // NOTE: Mantemos o seat “reservado” pro token (reconnect). Só removemos o socketId antigo no map por socket.
      // O socketsBySeat continua apontando pro socketId antigo até reconectar; não afeta o cálculo de sala cheia.
      // A reconexão vai sobrescrever o socketId do seat com o novo socket.
      //
      // Se o jogador caiu no turno, avançamos (jogo não trava esperando um offline).
      if (room.currentTurnSeatId === session.seatId) {
        room.currentTurnSeatId = this.nextOccupiedSeat(room, session.seatId);
      }
    }

    this.sessionsBySocketId.delete(socketId);

    return { matchId: session.matchId };
  }

  getSessionBySocketId(socketId: string): PlayerSession | null {
    return this.sessionsBySocketId.get(socketId) ?? null;
  }

  setReady(socketId: string, ready: boolean): RoomStateDto {
    const session = this.sessionsBySocketId.get(socketId);
    if (!session) throw new Error('you must join a match first');

    const room = this.roomsByMatchId.get(session.matchId);
    if (!room) throw new Error('room not found');

    room.readyBySeat.set(session.seatId, ready);
    return this.getRoomState(session.matchId);
  }

  beginHand(matchId: string): RoomStateDto {
    const room = this.roomsByMatchId.get(matchId);
    if (!room) throw new Error('room not found');

    room.currentTurnSeatId = 'T1A';
    return this.getRoomState(matchId);
  }

  isPlayersTurn(socketId: string, matchId: string): boolean {
    const session = this.sessionsBySocketId.get(socketId);
    if (!session) return false;

    const room = this.roomsByMatchId.get(matchId);
    if (!room) return false;

    return room.currentTurnSeatId === session.seatId;
  }

  advanceTurn(matchId: string): RoomStateDto {
    const room = this.roomsByMatchId.get(matchId);
    if (!room) throw new Error('room not found');

    if (!room.currentTurnSeatId) {
      room.currentTurnSeatId = 'T1A';
      return this.getRoomState(matchId);
    }

    room.currentTurnSeatId = this.nextOccupiedSeat(room, room.currentTurnSeatId);
    return this.getRoomState(matchId);
  }

  getRoomState(matchId: string): RoomStateDto {
    const room = this.roomsByMatchId.get(matchId);
    if (!room) {
      return { matchId, players: [], canStart: false, currentTurnSeatId: null };
    }

    const players: RoomStateDto['players'] = [];

    for (const [seatId] of room.socketsBySeat.entries()) {
      const teamId = teamFromSeat(seatId);
      const ready = room.readyBySeat.get(seatId) ?? false;
      players.push({ seatId, teamId, ready });
    }

    const isFull = players.length === 4;
    const allReady = isFull && players.every((p) => p.ready);

    return {
      matchId,
      players,
      canStart: allReady,
      currentTurnSeatId: room.currentTurnSeatId,
    };
  }

  canStart(matchId: string): boolean {
    const room = this.roomsByMatchId.get(matchId);
    if (!room) return false;

    if (room.socketsBySeat.size !== 4) return false;

    for (const seatId of room.socketsBySeat.keys()) {
      if (!room.readyBySeat.get(seatId)) return false;
    }

    return true;
  }

  private nextOccupiedSeat(room: RoomState, from: SeatId): SeatId | null {
    if (room.socketsBySeat.size === 0) return null;

    const idx = TURN_ORDER.indexOf(from);
    if (idx === -1) return null;

    for (let step = 1; step <= TURN_ORDER.length; step += 1) {
      const next = TURN_ORDER[(idx + step) % TURN_ORDER.length]!;
      if (room.socketsBySeat.has(next)) return next;
    }

    return null;
  }
}