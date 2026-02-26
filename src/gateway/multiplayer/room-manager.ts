import type { SeatId, TeamId } from './seat-id';
import { teamFromSeat } from './seat-id';

type RoomState = {
  matchId: string;
  socketsBySeat: Map<SeatId, string>;
  readyBySeat: Map<SeatId, boolean>;
  currentTurnSeatId: SeatId | null;
  ratingApplied: boolean;
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

// HACK: Modo 1v1 temporário para teste e gravação de vídeo. Ignora os assentos "B".
const TURN_ORDER: ReadonlyArray<SeatId> = ['T1A', 'T2A'];

function tokenKey(matchId: string, playerToken: string): string {
  return `${matchId}::${playerToken}`;
}

// NOTE: Presença/seat/ready/turn são efêmeros (transport-level).
// Persistir isso em DB vira estado “fantasma”.
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
      ratingApplied: false,
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
    
    // 🔥 CORREÇÃO 1v1 AQUI: Forçar a entrega apenas das cadeiras de Oponentes (T1A e T2A)
    // Ignoramos a função nextFreeSeat antiga que entregava a T1B para o P2.
    let seatId: SeatId;
    if (!occupied.has('T1A')) {
      seatId = 'T1A';
    } else if (!occupied.has('T2A')) {
      seatId = 'T2A';
    } else {
      throw new Error('match is full (1v1 mode)');
    }

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

    // HACK: Modo 1v1 temporário para teste (muda exigência de 4 para 2)
    const isFull = players.length === 2;
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

    // HACK: Modo 1v1 temporário para teste
    if (room.socketsBySeat.size !== 2) return false;

    for (const seatId of room.socketsBySeat.keys()) {
      if (!room.readyBySeat.get(seatId)) return false;
    }

    return true;
  }

  getTeamTokens(matchId: string): { T1: string[]; T2: string[] } {
    const t1: string[] = [];
    const t2: string[] = [];

    for (const session of this.sessionsByTokenKey.values()) {
      if (session.matchId !== matchId) continue;

      if (session.teamId === 'T1') t1.push(session.playerToken);
      if (session.teamId === 'T2') t2.push(session.playerToken);
    }

    return { T1: t1, T2: t2 };
  }

  tryMarkRatingApplied(matchId: string): boolean {
    const room = this.roomsByMatchId.get(matchId);
    if (!room) return false;

    if (room.ratingApplied) return false;

    room.ratingApplied = true;
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