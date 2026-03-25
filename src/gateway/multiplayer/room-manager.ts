import { teamFromSeat, type SeatId, type TeamId } from './seat-id';

type RoomState = {
  matchId: string;
  socketsBySeat: Map<SeatId, string>;
  readyBySeat: Map<SeatId, boolean>;
  currentTurnSeatId: SeatId | null;
  ratingApplied: boolean;
};

export type JoinPlayerIdentity = {
  userId: string;
  playerToken: string;
};

export type PlayerSession = {
  matchId: string;
  seatId: SeatId;
  teamId: TeamId;
  domainPlayerId: 'P1' | 'P2';
  userId: string;
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

// NOTE:
// Presence, seat ownership, ready flags, and turn orchestration remain transport-level state.
// Persisting this into the database would create ghost state that outlives the actual socket lifecycle.
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

  join(matchId: string, socketId: string, identity: JoinPlayerIdentity): PlayerSession {
    this.ensureRoom(matchId);

    const room = this.roomsByMatchId.get(matchId);
    if (!room) throw new Error('room not found');

    const existingSocket = this.sessionsBySocketId.get(socketId);
    if (existingSocket) return existingSocket;

    const key = tokenKey(matchId, identity.playerToken);
    const existingToken = this.sessionsByTokenKey.get(key);

    // NOTE:
    // Reconnection is token-based, not socket-based.
    // The seat must remain stable so transient connection loss does not rewrite multiplayer identity.
    if (existingToken) {
      const oldSocketId = existingToken.socketId;

      room.socketsBySeat.set(existingToken.seatId, socketId);
      this.sessionsBySocketId.delete(oldSocketId);

      const reattached: PlayerSession = {
        ...existingToken,
        socketId,
        userId: identity.userId,
      };

      this.sessionsByTokenKey.set(key, reattached);
      this.sessionsBySocketId.set(socketId, reattached);

      return reattached;
    }

    const seatId = this.nextFreeSeat(room);
    if (!seatId) {
      throw new Error('match is full (2v2 mode)');
    }

    room.socketsBySeat.set(seatId, socketId);
    room.readyBySeat.set(seatId, false);

    const teamId = teamFromSeat(seatId);
    const domainPlayerId: 'P1' | 'P2' = teamId === 'T1' ? 'P1' : 'P2';

    const session: PlayerSession = {
      matchId,
      seatId,
      teamId,
      domainPlayerId,
      userId: identity.userId,
      playerToken: identity.playerToken,
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
    if (room && room.currentTurnSeatId === session.seatId) {
      room.currentTurnSeatId = this.nextOccupiedSeat(room, session.seatId);
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

    return this.toDto(room);
  }

  canStart(matchId: string): boolean {
    const room = this.roomsByMatchId.get(matchId);
    if (!room) return false;

    return TURN_ORDER.every((seatId) => {
      const hasSeat = room.socketsBySeat.has(seatId);
      const isReady = room.readyBySeat.get(seatId) === true;
      return hasSeat && isReady;
    });
  }

  getState(matchId: string): RoomStateDto {
    const room = this.roomsByMatchId.get(matchId);
    if (!room) throw new Error('room not found');

    return this.toDto(room);
  }

  beginHand(matchId: string): RoomStateDto {
    const room = this.roomsByMatchId.get(matchId);
    if (!room) throw new Error('room not found');
    if (!this.canStart(matchId)) {
      throw new Error('all 4 players must be ready before starting the hand');
    }

    room.currentTurnSeatId = TURN_ORDER[0]!;

    return this.toDto(room);
  }

  advanceTurn(matchId: string): RoomStateDto {
    const room = this.roomsByMatchId.get(matchId);
    if (!room) throw new Error('room not found');

    if (!room.currentTurnSeatId) {
      room.currentTurnSeatId = this.firstOccupiedSeat(room);
      return this.toDto(room);
    }

    room.currentTurnSeatId = this.nextOccupiedSeat(room, room.currentTurnSeatId);

    return this.toDto(room);
  }

  isPlayersTurn(socketId: string, matchId: string): boolean {
    const session = this.sessionsBySocketId.get(socketId);
    if (!session) return false;
    if (session.matchId !== matchId) return false;

    const room = this.roomsByMatchId.get(matchId);
    if (!room) return false;

    return room.currentTurnSeatId === session.seatId;
  }

  getTeamUserIds(matchId: string): { T1: string[]; T2: string[] } {
    const teamUserIds = {
      T1: [] as string[],
      T2: [] as string[],
    };

    for (const session of this.sessionsByTokenKey.values()) {
      if (session.matchId !== matchId) continue;

      if (session.teamId === 'T1') {
        teamUserIds.T1.push(session.userId);
      } else {
        teamUserIds.T2.push(session.userId);
      }
    }

    return teamUserIds;
  }

  tryMarkRatingApplied(matchId: string): boolean {
    const room = this.roomsByMatchId.get(matchId);
    if (!room) return false;
    if (room.ratingApplied) return false;

    room.ratingApplied = true;
    return true;
  }

  private toDto(room: RoomState): RoomStateDto {
    const players = TURN_ORDER.filter((seatId) => room.socketsBySeat.has(seatId)).map((seatId) => ({
      seatId,
      teamId: teamFromSeat(seatId),
      ready: room.readyBySeat.get(seatId) === true,
    }));

    return {
      matchId: room.matchId,
      players,
      canStart: this.canStart(room.matchId),
      currentTurnSeatId: room.currentTurnSeatId,
    };
  }

  private nextFreeSeat(room: RoomState): SeatId | null {
    for (const seatId of TURN_ORDER) {
      if (!room.socketsBySeat.has(seatId)) {
        return seatId;
      }
    }

    return null;
  }

  private firstOccupiedSeat(room: RoomState): SeatId | null {
    for (const seatId of TURN_ORDER) {
      if (room.socketsBySeat.has(seatId)) {
        return seatId;
      }
    }

    return null;
  }

  private nextOccupiedSeat(room: RoomState, currentSeatId: SeatId): SeatId | null {
    const currentIndex = TURN_ORDER.indexOf(currentSeatId);
    if (currentIndex < 0) return this.firstOccupiedSeat(room);

    for (let offset = 1; offset <= TURN_ORDER.length; offset += 1) {
      const index = (currentIndex + offset) % TURN_ORDER.length;
      const candidate = TURN_ORDER[index];
      if (candidate && room.socketsBySeat.has(candidate)) {
        return candidate;
      }
    }

    return null;
  }
}