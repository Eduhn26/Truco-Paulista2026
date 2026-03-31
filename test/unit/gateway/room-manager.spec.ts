import { RoomManager } from '@game/gateway/multiplayer/room-manager';

function identity(
  userId: string,
  playerToken?: string,
): {
  userId: string;
  playerToken: string;
} {
  return {
    userId,
    playerToken: playerToken ?? `auth:${userId}`,
  };
}

describe('RoomManager (2v2)', () => {
  it('assigns seats in the correct 2v2 order', () => {
    const roomManager = new RoomManager();

    const p1 = roomManager.join('match-1', 'socket-1', identity('user-1', 'token-1'));
    const p2 = roomManager.join('match-1', 'socket-2', identity('user-2', 'token-2'));
    const p3 = roomManager.join('match-1', 'socket-3', identity('user-3', 'token-3'));
    const p4 = roomManager.join('match-1', 'socket-4', identity('user-4', 'token-4'));

    expect(p1.seatId).toBe('T1A');
    expect(p2.seatId).toBe('T2A');
    expect(p3.seatId).toBe('T1B');
    expect(p4.seatId).toBe('T2B');
  });

  it('rejects a fifth player because the match is full', () => {
    const roomManager = new RoomManager();

    roomManager.join('match-1', 'socket-1', identity('user-1', 'token-1'));
    roomManager.join('match-1', 'socket-2', identity('user-2', 'token-2'));
    roomManager.join('match-1', 'socket-3', identity('user-3', 'token-3'));
    roomManager.join('match-1', 'socket-4', identity('user-4', 'token-4'));

    expect(() => roomManager.join('match-1', 'socket-5', identity('user-5', 'token-5'))).toThrow(
      'Room match-1 is full',
    );
  });

  it('assigns the next available seat after a disconnect leaves the previous seat empty', () => {
    const roomManager = new RoomManager();

    const first = roomManager.join('match-1', 'socket-1', identity('user-1', 'token-1'));

    roomManager.leave('socket-1');

    const reconnected = roomManager.join('match-1', 'socket-99', identity('user-1', 'token-1'));

    expect(first.seatId).toBe('T1A');
    expect(reconnected.seatId).toBe('T2A');
    expect(reconnected.teamId).toBe('T2');
    expect(reconnected.domainPlayerId).toBe('P2');
    expect(reconnected.socketId).toBe('socket-99');
    expect(reconnected.userId).toBe('user-1');
  });

  it('only allows start when all four players are ready', () => {
    const roomManager = new RoomManager();

    roomManager.join('match-1', 'socket-1', identity('user-1', 'token-1'));
    roomManager.join('match-1', 'socket-2', identity('user-2', 'token-2'));
    roomManager.join('match-1', 'socket-3', identity('user-3', 'token-3'));
    roomManager.join('match-1', 'socket-4', identity('user-4', 'token-4'));

    expect(roomManager.canStart('match-1')).toBe(false);

    roomManager.setReady('socket-1', true);
    roomManager.setReady('socket-2', true);
    roomManager.setReady('socket-3', true);

    expect(roomManager.canStart('match-1')).toBe(false);

    roomManager.setReady('socket-4', true);

    expect(roomManager.canStart('match-1')).toBe(true);
  });

  it('begins the hand with T1A and rotates turns in 2v2 order', () => {
    const roomManager = new RoomManager();

    roomManager.join('match-1', 'socket-1', identity('user-1', 'token-1'));
    roomManager.join('match-1', 'socket-2', identity('user-2', 'token-2'));
    roomManager.join('match-1', 'socket-3', identity('user-3', 'token-3'));
    roomManager.join('match-1', 'socket-4', identity('user-4', 'token-4'));

    roomManager.setReady('socket-1', true);
    roomManager.setReady('socket-2', true);
    roomManager.setReady('socket-3', true);
    roomManager.setReady('socket-4', true);

    const started = roomManager.beginHand('match-1');

    expect(started.currentTurnSeatId).toBe('T1A');

    roomManager.advanceTurn('match-1');
    expect(roomManager.getState('match-1').currentTurnSeatId).toBe('T2A');

    roomManager.advanceTurn('match-1');
    expect(roomManager.getState('match-1').currentTurnSeatId).toBe('T1B');

    roomManager.advanceTurn('match-1');
    expect(roomManager.getState('match-1').currentTurnSeatId).toBe('T2B');
  });

  it('returns false for turn checks when socket or room does not exist', () => {
    const roomManager = new RoomManager();

    roomManager.join('match-1', 'socket-1', identity('user-1', 'token-1'));
    roomManager.join('match-1', 'socket-2', identity('user-2', 'token-2'));
    roomManager.join('match-1', 'socket-3', identity('user-3', 'token-3'));
    roomManager.join('match-1', 'socket-4', identity('user-4', 'token-4'));

    roomManager.setReady('socket-1', true);
    roomManager.setReady('socket-2', true);
    roomManager.setReady('socket-3', true);
    roomManager.setReady('socket-4', true);

    roomManager.beginHand('match-1');

    expect(roomManager.isPlayersTurn('missing-socket', 'match-1')).toBe(false);
    expect(roomManager.isPlayersTurn('socket-1', 'missing-match')).toBe(false);
  });

  it('returns team user ids grouped by T1 and T2', () => {
    const roomManager = new RoomManager();

    roomManager.join('match-1', 'socket-1', identity('user-alpha', 'alpha'));
    roomManager.join('match-1', 'socket-2', identity('user-beta', 'beta'));
    roomManager.join('match-1', 'socket-3', identity('user-gamma', 'gamma'));
    roomManager.join('match-1', 'socket-4', identity('user-delta', 'delta'));

    const teamUserIds = roomManager.getTeamUserIds('match-1');

    expect(teamUserIds.T1).toEqual(['user-alpha', 'user-gamma']);
    expect(teamUserIds.T2).toEqual(['user-beta', 'user-delta']);
  });

  it('marks rating as applied only once per match', () => {
    const roomManager = new RoomManager();

    roomManager.join('match-1', 'socket-1', identity('user-1', 'token-1'));

    expect(roomManager.tryMarkRatingApplied('match-1')).toBe(true);
    expect(roomManager.tryMarkRatingApplied('match-1')).toBe(false);
  });

  it('returns null when leaving an unknown socket', () => {
    const roomManager = new RoomManager();

    expect(roomManager.leave('missing-socket')).toBeNull();
  });

  it('throws when setting ready before joining a match', () => {
    const roomManager = new RoomManager();

    expect(() => roomManager.setReady('missing-socket', true)).toThrow(
      'Session not found for socket missing-socket',
    );
  });

  it('keeps queue-created 2v2 matches blocked until all assigned humans are ready', () => {
    const roomManager = new RoomManager();

    roomManager.ensureRoom('queue-match-2v2', '2v2');

    roomManager.join('queue-match-2v2', 'socket-1', identity('user-1', 'token-1'));
    roomManager.join('queue-match-2v2', 'socket-2', identity('user-2', 'token-2'));
    roomManager.join('queue-match-2v2', 'socket-3', identity('user-3', 'token-3'));
    roomManager.join('queue-match-2v2', 'socket-4', identity('user-4', 'token-4'));

    const initialState = roomManager.getState('queue-match-2v2');

    expect(initialState.mode).toBe('2v2');
    expect(initialState.currentTurnSeatId).toBeNull();
    expect(initialState.players.map((player) => player.ready)).toEqual([
      false,
      false,
      false,
      false,
    ]);
    expect(roomManager.canStart('queue-match-2v2')).toBe(false);

    roomManager.setReady('socket-1', true);
    roomManager.setReady('socket-2', true);
    roomManager.setReady('socket-3', true);

    expect(roomManager.canStart('queue-match-2v2')).toBe(false);

    roomManager.setReady('socket-4', true);

    expect(roomManager.canStart('queue-match-2v2')).toBe(true);

    const started = roomManager.beginHand('queue-match-2v2');

    expect(started.currentTurnSeatId).toBe('T1A');
  });
});

describe('RoomManager (1v1)', () => {
  it('preserves 1v1 mode after players join the room', () => {
    const roomManager = new RoomManager();

    roomManager.ensureRoom('match-1', '1v1');

    roomManager.join('match-1', 'socket-1', identity('user-1', 'token-1'));
    roomManager.join('match-1', 'socket-2', identity('user-2', 'token-2'));

    expect(roomManager.getState('match-1').mode).toBe('1v1');
  });

  it('assigns seats only in 1v1 order', () => {
    const roomManager = new RoomManager();

    roomManager.ensureRoom('match-1', '1v1');

    const p1 = roomManager.join('match-1', 'socket-1', identity('user-1', 'token-1'));
    const p2 = roomManager.join('match-1', 'socket-2', identity('user-2', 'token-2'));

    expect(p1.seatId).toBe('T1A');
    expect(p2.seatId).toBe('T2A');
  });

  it('rejects a third player because the 1v1 room is full', () => {
    const roomManager = new RoomManager();

    roomManager.ensureRoom('match-1', '1v1');

    roomManager.join('match-1', 'socket-1', identity('user-1', 'token-1'));
    roomManager.join('match-1', 'socket-2', identity('user-2', 'token-2'));

    expect(() => roomManager.join('match-1', 'socket-3', identity('user-3', 'token-3'))).toThrow(
      'Room match-1 is full',
    );
  });

  it('only allows start when both 1v1 players are ready', () => {
    const roomManager = new RoomManager();

    roomManager.ensureRoom('match-1', '1v1');

    roomManager.join('match-1', 'socket-1', identity('user-1', 'token-1'));
    roomManager.join('match-1', 'socket-2', identity('user-2', 'token-2'));

    expect(roomManager.canStart('match-1')).toBe(false);

    roomManager.setReady('socket-1', true);
    expect(roomManager.canStart('match-1')).toBe(false);

    roomManager.setReady('socket-2', true);

    expect(roomManager.canStart('match-1')).toBe(true);
  });

  it('begins the hand with T1A and rotates turns only between T1A and T2A', () => {
    const roomManager = new RoomManager();

    roomManager.ensureRoom('match-1', '1v1');

    roomManager.join('match-1', 'socket-1', identity('user-1', 'token-1'));
    roomManager.join('match-1', 'socket-2', identity('user-2', 'token-2'));

    roomManager.setReady('socket-1', true);
    roomManager.setReady('socket-2', true);

    const started = roomManager.beginHand('match-1');

    expect(started.currentTurnSeatId).toBe('T1A');

    roomManager.advanceTurn('match-1');
    expect(roomManager.getState('match-1').currentTurnSeatId).toBe('T2A');

    roomManager.advanceTurn('match-1');
    expect(roomManager.getState('match-1').currentTurnSeatId).toBe('T1A');
  });

  it('fills the missing 1v1 seat with a ready bot', () => {
    const roomManager = new RoomManager();

    roomManager.ensureRoom('match-1', '1v1');
    roomManager.join('match-1', 'socket-1', identity('user-1', 'token-1'));

    const roomState = roomManager.fillMissingSeatsWithBots('match-1');

    expect(roomState.mode).toBe('1v1');
    expect(roomState.players).toEqual([
      {
        seatId: 'T1A',
        teamId: 'T1',
        playerToken: 'token-1',
        userId: 'user-1',
        ready: false,
        socketId: 'socket-1',
        domainPlayerId: 'P1',
        isBot: false,
        botProfile: null,
      },
      {
        seatId: 'T2A',
        teamId: 'T2',
        playerToken: 'bot:match-1:T2A',
        userId: null,
        ready: true,
        socketId: null,
        domainPlayerId: 'P2',
        isBot: true,
        botProfile: 'aggressive',
      },
    ]);

    expect(roomManager.canStart('match-1')).toBe(false);

    roomManager.setReady('socket-1', true);

    expect(roomManager.canStart('match-1')).toBe(true);
  });

  it('replaces the 1v1 bot with a human on the same seat', () => {
    const roomManager = new RoomManager();

    roomManager.ensureRoom('match-1', '1v1');
    roomManager.join('match-1', 'socket-1', identity('user-1', 'token-1'));
    roomManager.fillMissingSeatsWithBots('match-1');

    const secondHuman = roomManager.join('match-1', 'socket-2', identity('user-2', 'token-2'));

    const roomState = roomManager.getState('match-1');

    expect(secondHuman.seatId).toBe('T2A');
    expect(roomState.players).toEqual([
      {
        seatId: 'T1A',
        teamId: 'T1',
        playerToken: 'token-1',
        userId: 'user-1',
        ready: false,
        socketId: 'socket-1',
        domainPlayerId: 'P1',
        isBot: false,
        botProfile: null,
      },
      {
        seatId: 'T2A',
        teamId: 'T2',
        playerToken: 'token-2',
        userId: 'user-2',
        ready: false,
        socketId: 'socket-2',
        domainPlayerId: 'P2',
        isBot: false,
        botProfile: null,
      },
    ]);
  });

  it('keeps queue-created 1v1 matches blocked until both assigned humans are ready', () => {
    const roomManager = new RoomManager();

    roomManager.ensureRoom('queue-match-1v1', '1v1');

    const first = roomManager.join('queue-match-1v1', 'socket-1', identity('user-1', 'token-1'));
    const second = roomManager.join('queue-match-1v1', 'socket-2', identity('user-2', 'token-2'));

    const initialState = roomManager.getState('queue-match-1v1');

    expect(initialState.mode).toBe('1v1');
    expect(initialState.currentTurnSeatId).toBeNull();
    expect(first.seatId).toBe('T1A');
    expect(second.seatId).toBe('T2A');
    expect(initialState.players).toEqual([
      expect.objectContaining({
        seatId: 'T1A',
        ready: false,
        socketId: 'socket-1',
        isBot: false,
      }),
      expect.objectContaining({
        seatId: 'T2A',
        ready: false,
        socketId: 'socket-2',
        isBot: false,
      }),
    ]);

    expect(roomManager.canStart('queue-match-1v1')).toBe(false);

    roomManager.setReady('socket-1', true);
    expect(roomManager.canStart('queue-match-1v1')).toBe(false);

    roomManager.setReady('socket-2', true);
    expect(roomManager.canStart('queue-match-1v1')).toBe(true);

    const started = roomManager.beginHand('queue-match-1v1');

    expect(started.currentTurnSeatId).toBe('T1A');
  });
});

describe('RoomManager bot fill (2v2)', () => {
  it('fills the two missing 2v2 seats with ready bots', () => {
    const roomManager = new RoomManager();

    roomManager.ensureRoom('match-1', '2v2');
    roomManager.join('match-1', 'socket-1', identity('user-1', 'token-1'));
    roomManager.join('match-1', 'socket-2', identity('user-2', 'token-2'));

    const roomState = roomManager.fillMissingSeatsWithBots('match-1');

    expect(roomState.mode).toBe('2v2');
    expect(roomState.players).toEqual([
      {
        seatId: 'T1A',
        teamId: 'T1',
        playerToken: 'token-1',
        userId: 'user-1',
        ready: false,
        socketId: 'socket-1',
        domainPlayerId: 'P1',
        isBot: false,
        botProfile: null,
      },
      {
        seatId: 'T2A',
        teamId: 'T2',
        playerToken: 'token-2',
        userId: 'user-2',
        ready: false,
        socketId: 'socket-2',
        domainPlayerId: 'P2',
        isBot: false,
        botProfile: null,
      },
      {
        seatId: 'T1B',
        teamId: 'T1',
        playerToken: 'bot:match-1:T1B',
        userId: null,
        ready: true,
        socketId: null,
        domainPlayerId: 'P1',
        isBot: true,
        botProfile: 'cautious',
      },
      {
        seatId: 'T2B',
        teamId: 'T2',
        playerToken: 'bot:match-1:T2B',
        userId: null,
        ready: true,
        socketId: null,
        domainPlayerId: 'P2',
        isBot: true,
        botProfile: 'balanced',
      },
    ]);

    expect(roomManager.canStart('match-1')).toBe(false);

    roomManager.setReady('socket-1', true);
    roomManager.setReady('socket-2', true);

    expect(roomManager.canStart('match-1')).toBe(true);
  });

  it('ignores bots when grouping team user ids', () => {
    const roomManager = new RoomManager();

    roomManager.ensureRoom('match-1', '2v2');
    roomManager.join('match-1', 'socket-1', identity('user-alpha', 'alpha'));
    roomManager.join('match-1', 'socket-2', identity('user-beta', 'beta'));
    roomManager.fillMissingSeatsWithBots('match-1');

    const teamUserIds = roomManager.getTeamUserIds('match-1');

    expect(teamUserIds.T1).toEqual(['user-alpha']);
    expect(teamUserIds.T2).toEqual(['user-beta']);
  });

  it('replaces the first available bot with a human in 2v2 mode', () => {
    const roomManager = new RoomManager();

    roomManager.ensureRoom('match-1', '2v2');
    roomManager.join('match-1', 'socket-1', identity('user-1', 'token-1'));
    roomManager.join('match-1', 'socket-2', identity('user-2', 'token-2'));
    roomManager.fillMissingSeatsWithBots('match-1');

    const thirdHuman = roomManager.join('match-1', 'socket-3', identity('user-3', 'token-3'));

    expect(thirdHuman.seatId).toBe('T1B');

    const roomState = roomManager.getState('match-1');

    expect(roomState.players).toEqual([
      {
        seatId: 'T1A',
        teamId: 'T1',
        playerToken: 'token-1',
        userId: 'user-1',
        ready: false,
        socketId: 'socket-1',
        domainPlayerId: 'P1',
        isBot: false,
        botProfile: null,
      },
      {
        seatId: 'T2A',
        teamId: 'T2',
        playerToken: 'token-2',
        userId: 'user-2',
        ready: false,
        socketId: 'socket-2',
        domainPlayerId: 'P2',
        isBot: false,
        botProfile: null,
      },
      {
        seatId: 'T1B',
        teamId: 'T1',
        playerToken: 'token-3',
        userId: 'user-3',
        ready: false,
        socketId: 'socket-3',
        domainPlayerId: 'P1',
        isBot: false,
        botProfile: null,
      },
      {
        seatId: 'T2B',
        teamId: 'T2',
        playerToken: 'bot:match-1:T2B',
        userId: null,
        ready: true,
        socketId: null,
        domainPlayerId: 'P2',
        isBot: true,
        botProfile: 'balanced',
      },
    ]);
  });
});

describe('RoomManager bot profiles', () => {
  it('assigns deterministic bot profiles by seat in 2v2 mode', () => {
    const roomManager = new RoomManager();

    roomManager.ensureRoom('match-1', '2v2');
    roomManager.join('match-1', 'socket-1', identity('user-1', 'token-1'));
    roomManager.fillMissingSeatsWithBots('match-1');

    expect(roomManager.getBotProfile('match-1', 'T2A')).toBe('aggressive');
    expect(roomManager.getBotProfile('match-1', 'T1B')).toBe('cautious');
    expect(roomManager.getBotProfile('match-1', 'T2B')).toBe('balanced');
  });

  it('assigns deterministic bot profile by seat in 1v1 mode', () => {
    const roomManager = new RoomManager();

    roomManager.ensureRoom('match-1', '1v1');
    roomManager.join('match-1', 'socket-1', identity('user-1', 'token-1'));
    roomManager.fillMissingSeatsWithBots('match-1');

    expect(roomManager.getBotProfile('match-1', 'T2A')).toBe('aggressive');
  });

  it('returns undefined for human seats', () => {
    const roomManager = new RoomManager();

    roomManager.ensureRoom('match-1', '2v2');
    roomManager.join('match-1', 'socket-1', identity('user-1', 'token-1'));
    roomManager.fillMissingSeatsWithBots('match-1');

    expect(roomManager.getBotProfile('match-1', 'T1A')).toBeUndefined();
  });

  it('returns undefined after a human replaces a bot seat', () => {
    const roomManager = new RoomManager();

    roomManager.ensureRoom('match-1', '1v1');
    roomManager.join('match-1', 'socket-1', identity('user-1', 'token-1'));
    roomManager.fillMissingSeatsWithBots('match-1');

    expect(roomManager.getBotProfile('match-1', 'T2A')).toBe('aggressive');

    roomManager.join('match-1', 'socket-2', identity('user-2', 'token-2'));

    expect(roomManager.getBotProfile('match-1', 'T2A')).toBeUndefined();
  });
});
