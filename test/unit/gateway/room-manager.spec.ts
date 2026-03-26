import {
  RoomManager,
  type JoinPlayerIdentity,
} from '@game/gateway/multiplayer/room-manager';

function identity(userId: string, playerToken?: string): JoinPlayerIdentity {
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

    expect(() =>
      roomManager.join('match-1', 'socket-5', identity('user-5', 'token-5')),
    ).toThrow('match is full (2v2 mode)');
  });

  it('reattaches the same token to the same seat on reconnect', () => {
    const roomManager = new RoomManager();

    const first = roomManager.join('match-1', 'socket-1', identity('user-1', 'token-1'));

    roomManager.leave('socket-1');

    const reconnected = roomManager.join('match-1', 'socket-99', identity('user-1', 'token-1'));

    expect(reconnected.seatId).toBe(first.seatId);
    expect(reconnected.teamId).toBe(first.teamId);
    expect(reconnected.domainPlayerId).toBe(first.domainPlayerId);
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

    const roomState = roomManager.setReady('socket-4', true);

    expect(roomManager.canStart('match-1')).toBe(true);
    expect(roomState.canStart).toBe(true);
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
      'you must join a match first',
    );
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

    expect(() =>
      roomManager.join('match-1', 'socket-3', identity('user-3', 'token-3')),
    ).toThrow('match is full (1v1 mode)');
  });

  it('only allows start when both 1v1 players are ready', () => {
    const roomManager = new RoomManager();

    roomManager.ensureRoom('match-1', '1v1');

    roomManager.join('match-1', 'socket-1', identity('user-1', 'token-1'));
    roomManager.join('match-1', 'socket-2', identity('user-2', 'token-2'));

    expect(roomManager.canStart('match-1')).toBe(false);

    roomManager.setReady('socket-1', true);
    expect(roomManager.canStart('match-1')).toBe(false);

    const roomState = roomManager.setReady('socket-2', true);

    expect(roomManager.canStart('match-1')).toBe(true);
    expect(roomState.canStart).toBe(true);
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
});