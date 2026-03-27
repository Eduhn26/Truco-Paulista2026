import type { MatchMode } from '@game/application/dtos/requests/create-match.request.dto';

import { teamFromSeat, type SeatId, type TeamId } from './seat-id';

type RoomState = {
  matchId: string;
  mode: MatchMode;
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
  isBot: boolean;
};

export type RoomStateDto = {
  matchId: string;
  mode: MatchMode;
  players: Array<{
    seatId: SeatId;
    teamId: TeamId;
    ready: boolean;
    isBot: boolean;
  }>;
  canStart: boolean;
  currentTurnSeatId: SeatId | null;
};

const TURN_ORDER_BY_MODE: Readonly<Record<MatchMode, ReadonlyArray<SeatId>>> = {
  '1v1': ['T1A', 'T2A'],
  '2v2': ['T1A', 'T2A', 'T1B', 'T2B'],
};

const BOT_SOCKET_PREFIX = 'bot-socket';
const BOT_TOKEN_PREFIX = 'bot-token';
const BOT_USER_PREFIX = 'bot-user';

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

  ensureRoom(matchId: string, mode?: MatchMode): void {
    const existingRoom = this.roomsByMatchId.get(matchId);

    if (existingRoom) {
      if (mode !== undefined) {
        existingRoom.mode = mode;
      }
      return;
    }

    this.roomsByMatchId.set(matchId, {
      matchId,
      mode: mode ?? '2v2',
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

    const reusableBotSeatId = this.firstBotSeat(room);

    if (reusableBotSeatId) {
      return this.replaceBotWithHuman(room, socketId, identity, reusableBotSeatId);
    }

    const seatId = this.nextFreeSeat(room);
    if (!seatId) {
      throw new Error(`match is full (${room.mode} mode)`);
    }

    const session = this.createHumanSession(matchId, seatId, socketId, identity);

    room.socketsBySeat.set(seatId, socketId);
    room.readyBySeat.set(seatId, false);

    this.sessionsBySocketId.set(socketId, session);
    this.sessionsByTokenKey.set(key, session);

    return session;
  }

  fillMissingSeatsWithBots(matchId: string): RoomStateDto {
    const room = this.roomsByMatchId.get(matchId);
    if (!room) throw new Error('room not found');

    for (const seatId of this.getTurnOrder(room)) {
      if (room.socketsBySeat.has(seatId)) {
        continue;
      }

      const botSession = this.createBotSession(matchId, seatId);

      room.socketsBySeat.set(seatId, botSession.socketId);
      room.readyBySeat.set(seatId, true);
      this.sessionsByTokenKey.set(tokenKey(matchId, botSession.playerToken), botSession);
    }

    return this.toDto(room);
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

    return this.getTurnOrder(room).every((seatId) => {
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
      throw new Error(`all players must be ready before starting the hand in ${room.mode} mode`);
    }

    room.currentTurnSeatId = this.getTurnOrder(room)[0] ?? null;

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
      if (session.isBot) continue;

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
    const players = this.getTurnOrder(room)
      .filter((seatId) => room.socketsBySeat.has(seatId))
      .map((seatId) => {
        const session = this.getSessionBySeat(room.matchId, seatId);

        return {
          seatId,
          teamId: teamFromSeat(seatId),
          ready: room.readyBySeat.get(seatId) === true,
          isBot: session?.isBot ?? false,
        };
      });

    return {
      matchId: room.matchId,
      mode: room.mode,
      players,
      canStart: this.canStart(room.matchId),
      currentTurnSeatId: room.currentTurnSeatId,
    };
  }

  private getTurnOrder(room: RoomState): ReadonlyArray<SeatId> {
    return TURN_ORDER_BY_MODE[room.mode];
  }

  private nextFreeSeat(room: RoomState): SeatId | null {
    for (const seatId of this.getTurnOrder(room)) {
      if (!room.socketsBySeat.has(seatId)) {
        return seatId;
      }
    }

    return null;
  }

  private firstOccupiedSeat(room: RoomState): SeatId | null {
    for (const seatId of this.getTurnOrder(room)) {
      if (room.socketsBySeat.has(seatId)) {
        return seatId;
      }
    }

    return null;
  }

  private nextOccupiedSeat(room: RoomState, currentSeatId: SeatId): SeatId | null {
    const turnOrder = this.getTurnOrder(room);
    const currentIndex = turnOrder.indexOf(currentSeatId);

    if (currentIndex < 0) return this.firstOccupiedSeat(room);

    for (let offset = 1; offset <= turnOrder.length; offset += 1) {
      const index = (currentIndex + offset) % turnOrder.length;
      const candidate = turnOrder[index];

      if (candidate && room.socketsBySeat.has(candidate)) {
        return candidate;
      }
    }

    return null;
  }

  private createHumanSession(
    matchId: string,
    seatId: SeatId,
    socketId: string,
    identity: JoinPlayerIdentity,
  ): PlayerSession {
    const teamId = teamFromSeat(seatId);
    const domainPlayerId: 'P1' | 'P2' = teamId === 'T1' ? 'P1' : 'P2';

    return {
      matchId,
      seatId,
      teamId,
      domainPlayerId,
      userId: identity.userId,
      playerToken: identity.playerToken,
      socketId,
      isBot: false,
    };
  }

  private createBotSession(matchId: string, seatId: SeatId): PlayerSession {
    const teamId = teamFromSeat(seatId);
    const domainPlayerId: 'P1' | 'P2' = teamId === 'T1' ? 'P1' : 'P2';

    return {
      matchId,
      seatId,
      teamId,
      domainPlayerId,
      userId: `${BOT_USER_PREFIX}:${matchId}:${seatId}`,
      playerToken: `${BOT_TOKEN_PREFIX}:${matchId}:${seatId}`,
      socketId: `${BOT_SOCKET_PREFIX}:${matchId}:${seatId}`,
      isBot: true,
    };
  }

  private firstBotSeat(room: RoomState): SeatId | null {
    for (const seatId of this.getTurnOrder(room)) {
      const session = this.getSessionBySeat(room.matchId, seatId);

      if (session?.isBot) {
        return seatId;
      }
    }

    return null;
  }

  private getSessionBySeat(matchId: string, seatId: SeatId): PlayerSession | null {
    for (const session of this.sessionsByTokenKey.values()) {
      if (session.matchId === matchId && session.seatId === seatId) {
        return session;
      }
    }

    return null;
  }

  private replaceBotWithHuman(
    room: RoomState,
    socketId: string,
    identity: JoinPlayerIdentity,
    seatId: SeatId,
  ): PlayerSession {
    const existingBot = this.getSessionBySeat(room.matchId, seatId);

    if (!existingBot || !existingBot.isBot) {
      throw new Error('bot seat not found');
    }

    this.sessionsByTokenKey.delete(tokenKey(room.matchId, existingBot.playerToken));

    const session = this.createHumanSession(room.matchId, seatId, socketId, identity);

    room.socketsBySeat.set(seatId, socketId);
    room.readyBySeat.set(seatId, false);

    this.sessionsBySocketId.set(socketId, session);
    this.sessionsByTokenKey.set(tokenKey(room.matchId, identity.playerToken), session);

    return session;
  }
}