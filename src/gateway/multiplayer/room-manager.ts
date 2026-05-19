import { type BotProfile } from '@game/application/ports/bot-decision.port';
import {
  pickRandomBotIdentityAny,
  type BotIdentity,
} from '@game/application/ports/bot-identity.catalog';

export type MatchMode = '1v1' | '2v2';
export type TeamId = 'T1' | 'T2';
export type SeatId = 'T1A' | 'T2A' | 'T1B' | 'T2B';
export type PrivateFriendPlacement = 'same-team' | 'opposite-team';

type TeamUserIds = {
  T1: string[];
  T2: string[];
};

type BasePlayerSession = {
  socketId: string;
  playerToken: string;
  userId: string;
  displayName: string | null;
  publicName: string | null;
  publicSlug: string | null;
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
  displayName: string | null;
  publicName: string | null;
  publicSlug: string | null;
  ready: boolean;
  socketId: string | null;
  domainPlayerId: 'P1' | 'P2';
  isBot: boolean;
  botProfile: BotProfile | null;
  botIdentity: BotIdentity | null;
};

type InternalRoomState = {
  matchId: string;
  mode: MatchMode;
  players: RoomStatePlayer[];
  currentTurnSeatId: SeatId | null;
  // After the first hand, new starts require connected humans instead of the lobby ready gate.
  handEverStarted: boolean;
  reservedHumanSeatId: SeatId | null;
  fillBotsOnStart: boolean;
};

type RoomOptions = {
  fillBotsOnStart?: boolean;
};

export type RoomState = {
  matchId: string;
  mode: MatchMode;
  players: RoomStatePlayer[];
  currentTurnSeatId: SeatId | null;
  canStart: boolean;
  fillBotsOnStart: boolean;
};

type JoinIdentity = {
  playerToken: string;
  userId: string;
  displayName: string | null;
  publicName: string | null;
  publicSlug: string | null;
};

// Describes how the gateway selects the opener for a new hand.
// Explicit seats support tests and replays, loser hints follow Truco Paulista flow,
// and random selection is reserved for fresh or tied hands.
export type BeginHandHint = {
  startingSeatId?: SeatId;
  lastLoserPlayerId?: 'P1' | 'P2' | null;
  random?: boolean;
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

// Domain player ids map back to teams before selecting an occupied opener seat.
const TEAM_BY_DOMAIN_PLAYER: Record<'P1' | 'P2', TeamId> = {
  P1: 'T1',
  P2: 'T2',
};

export class RoomManager {
  private readonly rooms = new Map<string, InternalRoomState>();
  private readonly sessionsBySocketId = new Map<string, PlayerSession>();
  private readonly sessionByTokenAndMatch = new Map<string, PlayerSession>();
  private readonly ratingAppliedMatches = new Set<string>();

  ensureRoom(
    matchId: string,
    mode: MatchMode = '2v2',
    options: RoomOptions = {},
  ): InternalRoomState {
    const existingRoom = this.rooms.get(matchId);

    if (existingRoom) {
      if (options.fillBotsOnStart === true) {
        existingRoom.fillBotsOnStart = true;
      }

      return existingRoom;
    }

    const room: InternalRoomState = {
      matchId,
      mode,
      players: [],
      currentTurnSeatId: null,
      handEverStarted: false,
      reservedHumanSeatId: null,
      fillBotsOnStart: options.fillBotsOnStart ?? false,
    };

    this.rooms.set(matchId, room);
    return room;
  }

  findOpenFlexibleRoom(mode: MatchMode): string | null {
    for (const room of this.rooms.values()) {
      if (!this.isOpenFlexibleRoom(room, mode)) {
        continue;
      }

      return room.matchId;
    }

    return null;
  }

  getState(matchId: string): RoomState {
    const room = this.rooms.get(matchId);

    if (!room) {
      throw new Error(`Room not found for match ${matchId}`);
    }

    return {
      matchId: room.matchId,
      mode: room.mode,
      players: room.players.map((player) => ({ ...player })),
      currentTurnSeatId: room.currentTurnSeatId,
      canStart: this.canStart(matchId),
      fillBotsOnStart: room.fillBotsOnStart,
    };
  }

  join(matchId: string, socketId: string, identity: JoinIdentity): PlayerSession {
    const room = this.ensureRoom(matchId);
    const existingSession = this.findExistingSession(matchId, identity.playerToken);

    if (existingSession) {
      // Reconnected players stay ready after the first hand so transient drops do not
      // block the next hand.
      const restoredReady = room.handEverStarted ? true : existingSession.ready;

      const reconnectedSession: PlayerSession = {
        ...existingSession,
        socketId,
        displayName: identity.displayName,
        publicName: identity.publicName,
        publicSlug: identity.publicSlug,
        ready: restoredReady,
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
          ready: restoredReady,
          playerToken: reconnectedSession.playerToken,
          userId: reconnectedSession.userId,
          displayName: reconnectedSession.displayName,
          publicName: reconnectedSession.publicName,
          publicSlug: reconnectedSession.publicSlug,
          isBot: false,
          botProfile: null,
          botIdentity: null,
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
      displayName: identity.displayName,
      publicName: identity.publicName,
      publicSlug: identity.publicSlug,
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
      displayName: identity.displayName,
      publicName: identity.publicName,
      publicSlug: identity.publicSlug,
      ready: false,
      socketId,
      domainPlayerId,
      isBot: false,
      botProfile: null,
      botIdentity: null,
    });

    this.sortPlayers(room);
    return session;
  }

  reserveNextHumanSeat(matchId: string, seatId: SeatId): RoomState {
    const room = this.rooms.get(matchId);

    if (!room) {
      throw new Error(`Room not found for match ${matchId}`);
    }

    if (room.mode !== '2v2') {
      throw new Error(`Reserved friend seats are only supported for 2v2 rooms`);
    }

    const allowedSeats = SEATS_BY_MODE[room.mode];

    if (!allowedSeats.includes(seatId)) {
      throw new Error(`Seat ${seatId} is not valid for match ${matchId} in mode ${room.mode}`);
    }

    const existingPlayer = room.players.find((player) => player.seatId === seatId);

    if (existingPlayer && !existingPlayer.isBot) {
      throw new Error(`Seat ${seatId} is already occupied in match ${matchId}`);
    }

    // Private rooms reserve whether the invited human joins as partner or opponent.
    room.reservedHumanSeatId = seatId;

    return this.getState(matchId);
  }

  selectSeat(
    socketId: string,
    targetSeatId: SeatId,
  ): { session: PlayerSession; roomState: RoomState } {
    const session = this.sessionsBySocketId.get(socketId);

    if (!session) {
      throw new Error(`Session not found for socket ${socketId}`);
    }

    const room = this.rooms.get(session.matchId);

    if (!room) {
      throw new Error(`Room not found for match ${session.matchId}`);
    }

    if (room.handEverStarted || room.currentTurnSeatId !== null) {
      throw new Error(`Cannot change seats after the match has started`);
    }

    const allowedSeats = SEATS_BY_MODE[room.mode];

    if (!allowedSeats.includes(targetSeatId)) {
      throw new Error(
        `Seat ${targetSeatId} is not valid for match ${session.matchId} in mode ${room.mode}`,
      );
    }

    if (session.seatId === targetSeatId) {
      return { session: { ...session }, roomState: this.getState(session.matchId) };
    }

    const targetPlayer = room.players.find((player) => player.seatId === targetSeatId);

    if (targetPlayer && !targetPlayer.isBot && targetPlayer.socketId !== socketId) {
      throw new Error(`Seat ${targetSeatId} is already occupied in match ${session.matchId}`);
    }

    const teamId = TEAM_BY_SEAT[targetSeatId];
    const domainPlayerId = DOMAIN_PLAYER_BY_TEAM[teamId];
    const updatedSession: PlayerSession = {
      ...session,
      seatId: targetSeatId,
      teamId,
      domainPlayerId,
      ready: false,
    };

    room.players = room.players.filter(
      (player) => player.socketId !== socketId && player.seatId !== targetSeatId,
    );

    room.players.push({
      seatId: targetSeatId,
      teamId,
      playerToken: session.playerToken,
      userId: session.userId,
      displayName: session.displayName,
      publicName: session.publicName,
      publicSlug: session.publicSlug,
      ready: false,
      socketId,
      domainPlayerId,
      isBot: false,
      botProfile: null,
      botIdentity: null,
    });

    this.sessionsBySocketId.set(socketId, updatedSession);
    this.sessionByTokenAndMatch.set(
      this.buildTokenMatchKey(session.matchId, session.playerToken),
      updatedSession,
    );

    if (room.reservedHumanSeatId === targetSeatId) {
      room.reservedHumanSeatId = null;
    }

    this.sortPlayers(room);

    return {
      session: { ...updatedSession },
      roomState: this.getState(session.matchId),
    };
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
        } else if (room.handEverStarted) {
          this.replaceHumanSeatWithBot(room, session.seatId);
        } else {
          room.players[playerIndex] = {
            ...existingPlayer,
            socketId: null,
            ready: false,
          };
        }
      }

      this.sortPlayers(room);
      // Keep the turn pointer stable; if the disconnected player became a bot,
      // the gateway can resume the automatic flow without changing the seat order.
    }

    return { matchId: session.matchId };
  }

  leaveMatch(socketId: string): { matchId: string; roomState: RoomState | null } | null {
    const session = this.sessionsBySocketId.get(socketId);

    if (!session) {
      return null;
    }

    const room = this.rooms.get(session.matchId);

    this.sessionsBySocketId.delete(socketId);
    this.sessionByTokenAndMatch.delete(
      this.buildTokenMatchKey(session.matchId, session.playerToken),
    );

    if (!room) {
      return { matchId: session.matchId, roomState: null };
    }

    if (room.handEverStarted) {
      this.replaceHumanSeatWithBot(room, session.seatId);
    } else {
      room.players = room.players.filter((player) => player.seatId !== session.seatId);

      if (room.currentTurnSeatId === session.seatId) {
        room.currentTurnSeatId = null;
      }
    }

    if (room.reservedHumanSeatId === session.seatId) {
      room.reservedHumanSeatId = null;
    }

    const hasHumanPlayer = room.players.some((player) => !player.isBot);

    if (!hasHumanPlayer) {
      this.rooms.delete(session.matchId);
      this.ratingAppliedMatches.delete(session.matchId);
      return { matchId: session.matchId, roomState: null };
    }

    this.sortPlayers(room);

    return { matchId: session.matchId, roomState: this.getState(session.matchId) };
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

  // The lobby-to-match transition normally requires every seat to be filled and ready.
  // Flexible rooms deliberately loosen that gate; empty seats are converted to bots
  // only when the first hand starts.
  canStart(matchId: string): boolean {
    const room = this.rooms.get(matchId);

    if (!room) {
      return false;
    }

    const seats = SEATS_BY_MODE[room.mode];

    if (room.fillBotsOnStart && !room.handEverStarted) {
      const seatedPlayers = room.players.filter((player) => seats.includes(player.seatId));
      const hasHumanPlayer = seatedPlayers.some((player) => !player.isBot);

      return hasHumanPlayer && seatedPlayers.every((player) => player.ready);
    }

    return seats.every((seatId) => {
      const player = room.players.find((entry) => entry.seatId === seatId);

      return Boolean(player?.ready);
    });
  }

  shouldFillBotsOnStart(matchId: string): boolean {
    const room = this.rooms.get(matchId);

    return Boolean(room?.fillBotsOnStart && !room.handEverStarted);
  }

  // Between hands, reconnect safety matters more than re-checking the original ready intent.
  canStartNextHand(matchId: string): boolean {
    const room = this.rooms.get(matchId);

    if (!room) {
      return false;
    }

    const seats = SEATS_BY_MODE[room.mode];

    return seats.every((seatId) => {
      const player = room.players.find((entry) => entry.seatId === seatId);

      if (!player) {
        return false;
      }

      if (player.isBot) {
        return true;
      }

      return player.socketId !== null;
    });
  }

  // Raw SeatId input remains supported for older tests and callers.
  beginHand(matchId: string, hintOrSeat?: BeginHandHint | SeatId): RoomState {
    const room = this.rooms.get(matchId);

    if (!room) {
      throw new Error(`Room not found for match ${matchId}`);
    }

    // Future hands use the reconnect-safe gate instead of the initial ready gate.
    room.handEverStarted = true;

    const hint: BeginHandHint =
      typeof hintOrSeat === 'string' ? { startingSeatId: hintOrSeat } : (hintOrSeat ?? {});

    const resolvedStartingSeatId = this.resolveOpenerFromHint(room, hint);

    room.currentTurnSeatId = this.resolveValidSeatForRoom(room, resolvedStartingSeatId);

    return this.getState(matchId);
  }

  beginRound(matchId: string, startingSeatId: SeatId): RoomState {
    const room = this.rooms.get(matchId);

    if (!room) {
      throw new Error(`Room not found for match ${matchId}`);
    }

    room.currentTurnSeatId = this.resolveValidSeatForRoom(room, startingSeatId);

    return this.getState(matchId);
  }

  setCurrentTurnSeat(matchId: string, seatId: SeatId | null): RoomState {
    const room = this.rooms.get(matchId);

    if (!room) {
      throw new Error(`Room not found for match ${matchId}`);
    }

    room.currentTurnSeatId = this.resolveValidSeatForRoom(room, seatId);

    return this.getState(matchId);
  }

  clearTurn(matchId: string): RoomState {
    return this.setCurrentTurnSeat(matchId, null);
  }

  advanceTurn(matchId: string, fromSeatId?: SeatId): RoomState {
    const room = this.rooms.get(matchId);

    if (!room) {
      throw new Error(`Room not found for match ${matchId}`);
    }

    const turnOrder = this.getTurnOrder(room.mode);
    const currentSeatId = fromSeatId ?? room.currentTurnSeatId;

    if (!currentSeatId) {
      room.currentTurnSeatId = turnOrder[0] ?? null;
      return this.getState(matchId);
    }

    const currentIndex = turnOrder.indexOf(currentSeatId);

    if (currentIndex < 0) {
      room.currentTurnSeatId = turnOrder[0] ?? null;
      return this.getState(matchId);
    }

    const nextIndex = (currentIndex + 1) % turnOrder.length;
    const nextSeatId = turnOrder[nextIndex] ?? null;

    room.currentTurnSeatId = this.resolveValidSeatForRoom(room, nextSeatId);

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

  private isOpenFlexibleRoom(room: InternalRoomState, mode: MatchMode): boolean {
    if (room.mode !== mode || !room.fillBotsOnStart) {
      return false;
    }

    if (room.handEverStarted || room.currentTurnSeatId !== null) {
      return false;
    }

    if (!this.hasConnectedHumanPlayer(room)) {
      return false;
    }

    return this.hasHumanSeatVacancy(room);
  }

  private hasConnectedHumanPlayer(room: InternalRoomState): boolean {
    return room.players.some((player) => !player.isBot && player.socketId !== null);
  }

  private hasHumanSeatVacancy(room: InternalRoomState): boolean {
    const seats = SEATS_BY_MODE[room.mode];

    return seats.some((seatId) => {
      const player = room.players.find((entry) => entry.seatId === seatId);

      return !player || player.isBot;
    });
  }

  private replaceHumanSeatWithBot(room: InternalRoomState, seatId: SeatId): void {
    const playerIndex = room.players.findIndex((player) => player.seatId === seatId);

    if (playerIndex < 0) {
      return;
    }

    const existingPlayer = room.players[playerIndex];

    if (!existingPlayer || existingPlayer.isBot) {
      return;
    }

    // NOTE: Once a hand is live, seat order is part of the match contract.
    // A leaving human becomes a bot in the same seat so turns, teams, and
    // current-hand ownership keep moving without invalidating the table.
    room.players[playerIndex] = this.createBotSession(room.matchId, seatId);
  }

  private createBotSession(matchId: string, seatId: SeatId): RoomStatePlayer {
    const teamId = TEAM_BY_SEAT[seatId];
    const domainPlayerId = DOMAIN_PLAYER_BY_TEAM[teamId];
    // Bot identity is sampled once per seat so persona, profile, and decision style stay aligned.
    const botIdentity = pickRandomBotIdentityAny();
    const botProfile: BotProfile = botIdentity.profile;

    return {
      seatId,
      teamId,
      playerToken: `bot:${matchId}:${seatId}`,
      userId: null,
      displayName: botIdentity.displayName,
      publicName: botIdentity.displayName,
      publicSlug: null,
      ready: true,
      socketId: null,
      domainPlayerId,
      isBot: true,
      botProfile,
      botIdentity,
    };
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
    if (room.reservedHumanSeatId) {
      const reservedSeatId = room.reservedHumanSeatId;
      const reservedPlayer = room.players.find((player) => player.seatId === reservedSeatId);

      if (!reservedPlayer || reservedPlayer.isBot) {
        if (reservedPlayer?.isBot) {
          room.players = room.players.filter((player) => player.seatId !== reservedSeatId);
        }

        room.reservedHumanSeatId = null;
        return reservedSeatId;
      }

      // Stale reservations fall back to normal seat order to keep reconnects safe.
      room.reservedHumanSeatId = null;
    }

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

  // Centralizes opener precedence so beginHand remains small and transport-agnostic.
  private resolveOpenerFromHint(room: InternalRoomState, hint: BeginHandHint): SeatId | null {
    if (hint.startingSeatId) {
      return hint.startingSeatId;
    }

    if (hint.lastLoserPlayerId === 'P1' || hint.lastLoserPlayerId === 'P2') {
      const targetTeam = TEAM_BY_DOMAIN_PLAYER[hint.lastLoserPlayerId];
      const seatInTeam = this.findFirstOccupiedSeatInTeam(room, targetTeam);

      if (seatInTeam) {
        return seatInTeam;
      }
      // If the target team has no occupied seat, use the safe fallback instead of crashing.
    }

    if (hint.random) {
      return this.pickRandomOccupiedSeat(room);
    }

    // Hint-less callers keep the legacy first-seat fallback.
    return this.getTurnOrder(room.mode)[0] ?? null;
  }

  private findFirstOccupiedSeatInTeam(room: InternalRoomState, teamId: TeamId): SeatId | null {
    const turnOrder = this.getTurnOrder(room.mode);

    for (const seatId of turnOrder) {
      if (TEAM_BY_SEAT[seatId] !== teamId) {
        continue;
      }

      const isOccupied = room.players.some((player) => player.seatId === seatId);

      if (isOccupied) {
        return seatId;
      }
    }

    return null;
  }

  private pickRandomOccupiedSeat(room: InternalRoomState): SeatId | null {
    const turnOrder = this.getTurnOrder(room.mode);
    const occupiedSeats = turnOrder.filter((seatId) =>
      room.players.some((player) => player.seatId === seatId),
    );

    if (occupiedSeats.length === 0) {
      return null;
    }

    // This is a UX-grade opener coin flip, not a security or match-outcome RNG.
    const index = Math.floor(Math.random() * occupiedSeats.length);
    return occupiedSeats[index] ?? null;
  }

  private resolveValidSeatForRoom(
    room: InternalRoomState,
    preferredSeatId: SeatId | null,
  ): SeatId | null {
    if (!preferredSeatId) {
      return null;
    }

    const allowedSeats = SEATS_BY_MODE[room.mode];

    if (!allowedSeats.includes(preferredSeatId)) {
      throw new Error(
        `Seat ${preferredSeatId} is not valid for match ${room.matchId} in mode ${room.mode}`,
      );
    }

    const occupiedSeat = room.players.find((player) => player.seatId === preferredSeatId);

    if (!occupiedSeat) {
      throw new Error(
        `Seat ${preferredSeatId} is not occupied in match ${room.matchId}, so it cannot receive the turn`,
      );
    }

    return preferredSeatId;
  }

  private sortPlayers(room: InternalRoomState): void {
    const seats = SEATS_BY_MODE[room.mode];
    room.players.sort((left, right) => seats.indexOf(left.seatId) - seats.indexOf(right.seatId));
  }
}
