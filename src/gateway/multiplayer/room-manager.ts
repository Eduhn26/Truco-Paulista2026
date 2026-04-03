import {
  DEFAULT_BOT_PROFILE_BY_SEAT,
  type BotProfile,
  type BotSeatId,
} from '@game/application/ports/bot-decision.port';

export type MatchMode = '1v1' | '2v2';
export type TeamId = 'T1' | 'T2';
export type SeatId = 'T1A' | 'T2A' | 'T1B' | 'T2B';

type TeamUserIds = {
  T1: string[];
  T2: string[];
};

type BasePlayerSession = {
  socketId: string;
  playerToken: string;
  userId: string;
  matchId: string;
  seatId: SeatId;
  teamId: TeamId;
  domainPlayerId: 'P1' | 'P2';
  ready: boolean;
  isBot: boolean;
  botProfile: BotProfile | null;
};

export type PlayerSession = BasePlayerSession;

type RoomStatePlayer = {
  seatId: SeatId;
  teamId: TeamId;
  playerToken: string | null;
  userId: string | null;
  ready: boolean;
  socketId: string | null;
  domainPlayerId: 'P1' | 'P2';
  isBot: boolean;
  botProfile: BotProfile | null;
};

type InternalRoomState = {
  matchId: string;
  mode: MatchMode;
  players: RoomStatePlayer[];
  currentTurnSeatId: SeatId | null;
};

export type RoomState = {
  matchId: string;
  mode: MatchMode;
  players: RoomStatePlayer[];
  currentTurnSeatId: SeatId | null;
  canStart: boolean;
};

type JoinIdentity = {
  playerToken: string;
  userId: string;
};

const TURN_ORDER_2V2: SeatId[] = ['T1A', 'T2A', 'T1B', 'T2B'];
const TURN_ORDER_1V1: SeatId[] = ['T1A', 'T2A'];

const SEATS_BY_MODE: Record<MatchMode, SeatId[]> = {
  '1v1': ['T1A', 'T2A'],
  '2v2': ['T1A', 'T2A', 'T1B', 'T2B'],
};

const TEAM_BY_SEAT: Record<SeatId, TeamId> = {
  T1A: 'T1',
  T2A: 'T2',
  T1B: 'T1',
  T2B: 'T2',
};

const DOMAIN_PLAYER_BY_TEAM: Record<TeamId, 'P1' | 'P2'> = {
  T1: 'P1',
  T2: 'P2',
};

export class RoomManager {
  private readonly rooms = new Map<string, InternalRoomState>();
  private readonly sessionsBySocketId = new Map<string, PlayerSession>();
  private readonly sessionByTokenAndMatch = new Map<string, PlayerSession>();
  private readonly ratingAppliedMatches = new Set<string>();

  ensureRoom(matchId: string, mode: MatchMode = '2v2'): InternalRoomState {
    const existingRoom = this.rooms.get(matchId);

    if (existingRoom) {
      return existingRoom;
    }

    const room: InternalRoomState = {
      matchId,
      mode,
      players: [],
      currentTurnSeatId: null,
    };

    this.rooms.set(matchId, room);
    return room;
  }

  getState(matchId: string): RoomState {
    const room = this.rooms.get(matchId);

    if (!room) {
      throw new Error(`Room not found for match ${matchId}`);
    }

    return {
      ...room,
      players: room.players.map((player) => ({ ...player })),
      canStart: this.canStart(matchId),
    };
  }

  join(matchId: string, socketId: string, identity: JoinIdentity): PlayerSession {
    const room = this.ensureRoom(matchId);
    const existingSession = this.findExistingSession(matchId, identity.playerToken);

    if (existingSession) {
      const reconnectedSession: PlayerSession = {
        ...existingSession,
        socketId,
      };

      this.sessionsBySocketId.delete(existingSession.socketId);
      this.sessionsBySocketId.set(socketId, reconnectedSession);
      this.sessionByTokenAndMatch.set(
        this.buildTokenMatchKey(matchId, identity.playerToken),
        reconnectedSession,
      );

      const playerIndex = room.players.findIndex(
        (player) => player.seatId === existingSession.seatId,
      );

      if (playerIndex >= 0) {
        const existingPlayer = room.players[playerIndex];

        if (!existingPlayer) {
          throw new Error(
            `Expected room player for seat ${existingSession.seatId} in match ${matchId}`,
          );
        }

        room.players[playerIndex] = {
          ...existingPlayer,
          socketId,
          ready: reconnectedSession.ready,
          playerToken: reconnectedSession.playerToken,
          userId: reconnectedSession.userId,
          isBot: false,
          botProfile: null,
        };
      }

      return reconnectedSession;
    }

    const seatId = this.findAvailableSeat(room);

    if (!seatId) {
      throw new Error(`Room ${matchId} is full`);
    }

    const teamId = TEAM_BY_SEAT[seatId];
    const domainPlayerId = DOMAIN_PLAYER_BY_TEAM[teamId];

    const session: PlayerSession = {
      socketId,
      playerToken: identity.playerToken,
      userId: identity.userId,
      matchId,
      seatId,
      teamId,
      domainPlayerId,
      ready: false,
      isBot: false,
      botProfile: null,
    };

    this.sessionsBySocketId.set(socketId, session);
    this.sessionByTokenAndMatch.set(
      this.buildTokenMatchKey(matchId, identity.playerToken),
      session,
    );

    room.players.push({
      seatId,
      teamId,
      playerToken: identity.playerToken,
      userId: identity.userId,
      ready: false,
      socketId,
      domainPlayerId,
      isBot: false,
      botProfile: null,
    });

    this.sortPlayers(room);
    return session;
  }

  leave(socketId: string): { matchId: string } | null {
    const session = this.sessionsBySocketId.get(socketId);

    if (!session) {
      return null;
    }

    const room = this.rooms.get(session.matchId);

    this.sessionsBySocketId.delete(socketId);

    const disconnectedSession: PlayerSession = {
      ...session,
      ready: false,
    };

    this.sessionByTokenAndMatch.set(
      this.buildTokenMatchKey(session.matchId, session.playerToken),
      disconnectedSession,
    );

    if (room) {
      const playerIndex = room.players.findIndex((player) => player.seatId === session.seatId);

      if (playerIndex >= 0) {
        const existingPlayer = room.players[playerIndex];

        if (!existingPlayer) {
          throw new Error(
            `Expected room player for seat ${session.seatId} in match ${session.matchId}`,
          );
        }

        if (existingPlayer.isBot) {
          room.players.splice(playerIndex, 1);
        } else {
          room.players[playerIndex] = {
            ...existingPlayer,
            socketId: null,
            ready: false,
          };
        }
      }
    }

    return { matchId: session.matchId };
  }

  getSessionBySocketId(socketId: string): PlayerSession | undefined {
    const session = this.sessionsBySocketId.get(socketId);

    return session ? { ...session } : undefined;
  }

  setReady(socketId: string, ready: boolean): RoomState {
    const session = this.sessionsBySocketId.get(socketId);

    if (!session) {
      throw new Error(`Session not found for socket ${socketId}`);
    }

    const room = this.rooms.get(session.matchId);

    if (!room) {
      throw new Error(`Room not found for match ${session.matchId}`);
    }

    const updatedSession: PlayerSession = {
      ...session,
      ready,
    };

    this.sessionsBySocketId.set(socketId, updatedSession);
    this.sessionByTokenAndMatch.set(
      this.buildTokenMatchKey(updatedSession.matchId, updatedSession.playerToken),
      updatedSession,
    );

    const playerIndex = room.players.findIndex((player) => player.seatId === session.seatId);

    if (playerIndex >= 0) {
      const existingPlayer = room.players[playerIndex];

      if (!existingPlayer) {
        throw new Error(
          `Expected room player for seat ${session.seatId} in match ${session.matchId}`,
        );
      }

      room.players[playerIndex] = {
        ...existingPlayer,
        ready,
      };
    }

    return this.getState(session.matchId);
  }

  canStart(matchId: string): boolean {
    const room = this.rooms.get(matchId);

    if (!room) {
      return false;
    }

    const seats = SEATS_BY_MODE[room.mode];

    return seats.every((seatId) => {
      const player = room.players.find((entry) => entry.seatId === seatId);

      return Boolean(player?.ready);
    });
  }

  beginHand(matchId: string): RoomState {
    const room = this.rooms.get(matchId);

    if (!room) {
      throw new Error(`Room not found for match ${matchId}`);
    }

    const turnOrder = this.getTurnOrder(room.mode);
    room.currentTurnSeatId = turnOrder[0] ?? null;

    return this.getState(matchId);
  }

  advanceTurn(matchId: string): RoomState {
    const room = this.rooms.get(matchId);

    if (!room) {
      throw new Error(`Room not found for match ${matchId}`);
    }

    const turnOrder = this.getTurnOrder(room.mode);

    if (!room.currentTurnSeatId) {
      room.currentTurnSeatId = turnOrder[0] ?? null;
      return this.getState(matchId);
    }

    const currentIndex = turnOrder.indexOf(room.currentTurnSeatId);

    if (currentIndex < 0) {
      room.currentTurnSeatId = turnOrder[0] ?? null;
      return this.getState(matchId);
    }

    const nextIndex = (currentIndex + 1) % turnOrder.length;
    room.currentTurnSeatId = turnOrder[nextIndex] ?? null;

    return this.getState(matchId);
  }

  isPlayersTurn(socketId: string, matchId: string): boolean {
    const session = this.sessionsBySocketId.get(socketId);
    const room = this.rooms.get(matchId);

    if (!session || !room) {
      return false;
    }

    return room.currentTurnSeatId === session.seatId;
  }

  fillMissingSeatsWithBots(matchId: string): RoomState {
    const room = this.rooms.get(matchId);

    if (!room) {
      throw new Error(`Room not found for match ${matchId}`);
    }

    const seats = SEATS_BY_MODE[room.mode];

    for (const seatId of seats) {
      const existingPlayer = room.players.find((player) => player.seatId === seatId);

      if (!existingPlayer) {
        room.players.push(this.createBotSession(matchId, seatId));
        continue;
      }

      if (existingPlayer.isBot && existingPlayer.socketId !== null) {
        room.players = room.players.filter((player) => player.seatId !== seatId);
        room.players.push(this.createBotSession(matchId, seatId));
      }
    }

    this.sortPlayers(room);
    return this.getState(matchId);
  }

  getHumanSessions(matchId: string): PlayerSession[] {
    return Array.from(this.sessionsBySocketId.values())
      .filter((session) => session.matchId === matchId && !session.isBot)
      .map((session) => ({ ...session }));
  }

  getBotProfile(matchId: string, seatId: SeatId): BotProfile | undefined {
    const room = this.rooms.get(matchId);

    if (!room) {
      return undefined;
    }

    return (
      room.players.find((player) => player.seatId === seatId && player.isBot)?.botProfile ??
      undefined
    );
  }

  getTeamUserIds(matchId: string): TeamUserIds {
    const room = this.rooms.get(matchId);

    if (!room) {
      throw new Error(`Room not found for match ${matchId}`);
    }

    return room.players.reduce<TeamUserIds>(
      (accumulator, player) => {
        if (player.userId && !player.isBot) {
          accumulator[player.teamId].push(player.userId);
        }

        return accumulator;
      },
      { T1: [], T2: [] },
    );
  }

  tryMarkRatingApplied(matchId: string): boolean {
    if (this.ratingAppliedMatches.has(matchId)) {
      return false;
    }

    this.ratingAppliedMatches.add(matchId);
    return true;
  }

  private createBotSession(matchId: string, seatId: SeatId): RoomStatePlayer {
    const teamId = TEAM_BY_SEAT[seatId];
    const domainPlayerId = DOMAIN_PLAYER_BY_TEAM[teamId];
    const botProfile = this.resolveBotProfile(seatId);

    return {
      seatId,
      teamId,
      playerToken: `bot:${matchId}:${seatId}`,
      userId: null,
      ready: true,
      socketId: null,
      domainPlayerId,
      isBot: true,
      botProfile,
    };
  }

  private resolveBotProfile(seatId: SeatId): BotProfile {
    return DEFAULT_BOT_PROFILE_BY_SEAT[seatId as BotSeatId];
  }

  private buildTokenMatchKey(matchId: string, playerToken: string): string {
    return `${matchId}:${playerToken}`;
  }

  private findExistingSession(matchId: string, playerToken: string): PlayerSession | undefined {
    const existingSession = this.sessionByTokenAndMatch.get(
      this.buildTokenMatchKey(matchId, playerToken),
    );

    return existingSession ? { ...existingSession } : undefined;
  }

  private findAvailableSeat(room: InternalRoomState): SeatId | null {
    const seats = SEATS_BY_MODE[room.mode];

    for (const seatId of seats) {
      const existingPlayer = room.players.find((player) => player.seatId === seatId);

      if (!existingPlayer) {
        return seatId;
      }

      if (existingPlayer.isBot) {
        room.players = room.players.filter((player) => player.seatId !== seatId);
        return seatId;
      }
    }

    return null;
  }

  private getTurnOrder(mode: MatchMode): SeatId[] {
    return mode === '1v1' ? TURN_ORDER_1V1 : TURN_ORDER_2V2;
  }

  private sortPlayers(room: InternalRoomState): void {
    const seats = SEATS_BY_MODE[room.mode];
    room.players.sort((left, right) => seats.indexOf(left.seatId) - seats.indexOf(right.seatId));
  }
}
