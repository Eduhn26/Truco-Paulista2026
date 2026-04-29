import { type BotProfile } from '@game/application/ports/bot-decision.port';
import {
  pickRandomBotIdentityAny,
  type BotIdentity,
} from '@game/application/ports/bot-identity.catalog';

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
  botIdentity: BotIdentity | null;
};

type InternalRoomState = {
  matchId: string;
  mode: MatchMode;
  players: RoomStatePlayer[];
  currentTurnSeatId: SeatId | null;
  // NOTE: Tracks whether the first hand has ever started for this room.
  // Once true, the ready gate for start-hand is replaced by canStartNextHand(),
  // which only requires all human players to be connected (socketId present).
  handEverStarted: boolean;
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

// CHANGE (debt #1 — bot never opened the first round):
// `beginHand` previously fell back to the first seat in the turn order
// (always T1A in 1v1) whenever no `startingSeatId` was passed. The
// gateway never passed one. This shape lets the gateway communicate
// intent in three ways:
//
//   • { startingSeatId } — explicit pin for tests / replays. Highest
//     precedence. Validated against the room's seat occupancy.
//
//   • { lastLoserPlayerId } — canonical Truco Paulista rule: the loser
//     of the previous hand opens the next. Translated to a seat by
//     mapping P1→T1, P2→T2 and picking the first occupied seat in that
//     team for the room's mode.
//
//   • { random: true } — first hand of a fresh match, or any hand
//     whose previous result was a true tie. Coin-flip between the
//     occupied seats in the turn order. Avoids the structural edge
//     T1A had under the old fallback.
//
// When all hint fields are missing, we still fall back to the legacy
// "first seat in turn order" behaviour so older callers (tests,
// replays) keep working. The gateway is being patched in tandem to
// always pass a hint in production paths.
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

// CHANGE (debt #1): Reverse of DOMAIN_PLAYER_BY_TEAM. Used to translate a
// PlayerId hint (P1/P2) coming from the domain into a seat lookup. P1
// always maps to T1, P2 to T2; we then pick the first occupied seat in
// that team's slice of the turn order.
const TEAM_BY_DOMAIN_PLAYER: Record<'P1' | 'P2', TeamId> = {
  P1: 'T1',
  P2: 'T2',
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
      handEverStarted: false,
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
      // NOTE: On reconnect after the first hand has started, we restore the
      // player's ready flag to true so canStartNextHand() does not block the
      // next hand start due to a transient disconnect mid-match.
      const restoredReady = room.handEverStarted ? true : existingSession.ready;

      const reconnectedSession: PlayerSession = {
        ...existingSession,
        socketId,
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
      botIdentity: null,
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

      // NOTE: If the disconnected player held the current turn, we intentionally
      // keep the seat pointer stable. The transport layer can then decide whether
      // to reconnect, replace with a bot, or advance explicitly.
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

  // NOTE: Checks that every seat (human or bot) has ready = true.
  // Used as the gate for the FIRST hand start (lobby → match transition).
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

  // NOTE: Checks that every human seat has an active socket connection.
  // Used as the gate for the SUBSEQUENT hand starts (between hands).
  // We do not re-check ready because the player already expressed intent
  // to play when they first set ready before the first hand. A transient
  // disconnect must not permanently block the match from continuing.
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

      // Bots are always considered available.
      if (player.isBot) {
        return true;
      }

      // Human players must have an active socket connection.
      return player.socketId !== null;
    });
  }

  // CHANGE (debt #1): backwards-compatible signature.
  //   • Old callers passing a raw SeatId still work (via overload).
  //   • New callers pass a `BeginHandHint` — see the type's docblock for
  //     precedence rules.
  //   • No-arg callers retain the previous "first seat in turn order"
  //     fallback so this patch can be deployed before the gateway is
  //     updated, without regressing.
  beginHand(matchId: string, hintOrSeat?: BeginHandHint | SeatId): RoomState {
    const room = this.rooms.get(matchId);

    if (!room) {
      throw new Error(`Room not found for match ${matchId}`);
    }

    // NOTE: Mark that at least one hand has started for this room.
    // From this point forward, canStartNextHand() is used instead of canStart().
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

  private createBotSession(matchId: string, seatId: SeatId): RoomStatePlayer {
    const teamId = TEAM_BY_SEAT[seatId];
    const domainPlayerId = DOMAIN_PLAYER_BY_TEAM[teamId];
    // NOTE: Identity is sampled once here — at the moment the bot is first
    // placed into the seat — and lives with the room player for the rest of
    // the match. No re-sampling between hands. The bot's profile is derived
    // from the sampled identity, NOT from the seatId: otherwise a 1v1 match
    // (where the bot always takes the same seat) would always end up with
    // the same profile. Identity is cosmetic; the profile is what feeds the
    // decision port, so the two must agree by construction.
    const botIdentity = pickRandomBotIdentityAny();
    const botProfile: BotProfile = botIdentity.profile;

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

  // CHANGE (debt #1): central opener resolver. Translates a `BeginHandHint`
  // into the actual SeatId that should hold the turn at hand-start time.
  // Encapsulates the precedence rules and the safe-fallback path so
  // `beginHand` itself stays small.
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
      // NOTE: if the team has no occupied seats (corrupt room), fall
      // through to random — better UX than crashing the start-hand call.
    }

    if (hint.random) {
      return this.pickRandomOccupiedSeat(room);
    }

    // Legacy backstop for hint-less callers (tests, older transports).
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

    // NOTE: Math.random is fine here — this is a UX-grade coin flip,
    // not a security-critical RNG. Match outcomes don't depend on it.
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
