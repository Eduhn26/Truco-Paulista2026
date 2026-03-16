import { RoomManager } from '@game/gateway/multiplayer/room-manager';

describe('RoomManager', () => {
  it('assigns seats in the current 1v1 order', () => {
    const roomManager = new RoomManager();

    const first = roomManager.join('match-1', 'socket-1', 'token-1');
    const second = roomManager.join('match-1', 'socket-2', 'token-2');

    expect(first.seatId).toBe('T1A');
    expect(first.teamId).toBe('T1');
    expect(first.domainPlayerId).toBe('P1');

    expect(second.seatId).toBe('T2A');
    expect(second.teamId).toBe('T2');
    expect(second.domainPlayerId).toBe('P2');
  });

  it('rejects a third player because the current implementation is still 1v1', () => {
    const roomManager = new RoomManager();

    roomManager.join('match-1', 'socket-1', 'token-1');
    roomManager.join('match-1', 'socket-2', 'token-2');

    expect(() => roomManager.join('match-1', 'socket-3', 'token-3')).toThrow(
      'match is full (1v1 mode)',
    );
  });

  it('reattaches the same token to the same seat on reconnect', () => {
    const roomManager = new RoomManager();

    const first = roomManager.join('match-1', 'socket-1', 'token-1');
    roomManager.leave('socket-1');

    const reconnected = roomManager.join('match-1', 'socket-99', 'token-1');

    expect(reconnected.seatId).toBe(first.seatId);
    expect(reconnected.teamId).toBe(first.teamId);
    expect(reconnected.domainPlayerId).toBe(first.domainPlayerId);
    expect(reconnected.socketId).toBe('socket-99');
    expect(roomManager.getSessionBySocketId('socket-1')).toBeNull();
    expect(roomManager.getSessionBySocketId('socket-99')).toEqual(reconnected);
  });

  it('updates ready state and only allows start when both current seats are ready', () => {
    const roomManager = new RoomManager();

    roomManager.join('match-1', 'socket-1', 'token-1');
    roomManager.join('match-1', 'socket-2', 'token-2');

    expect(roomManager.canStart('match-1')).toBe(false);

    roomManager.setReady('socket-1', true);
    expect(roomManager.canStart('match-1')).toBe(false);

    const roomState = roomManager.setReady('socket-2', true);

    expect(roomManager.canStart('match-1')).toBe(true);
    expect(roomState.canStart).toBe(true);
    expect(roomState.players).toEqual([
      { seatId: 'T1A', teamId: 'T1', ready: true },
      { seatId: 'T2A', teamId: 'T2', ready: true },
    ]);
  });

  it('begins the hand with T1A and alternates turns in the current 1v1 cycle', () => {
    const roomManager = new RoomManager();

    roomManager.join('match-1', 'socket-1', 'token-1');
    roomManager.join('match-1', 'socket-2', 'token-2');

    const started = roomManager.beginHand('match-1');
    expect(started.currentTurnSeatId).toBe('T1A');
    expect(roomManager.isPlayersTurn('socket-1', 'match-1')).toBe(true);
    expect(roomManager.isPlayersTurn('socket-2', 'match-1')).toBe(false);

    const afterFirstAdvance = roomManager.advanceTurn('match-1');
    expect(afterFirstAdvance.currentTurnSeatId).toBe('T2A');
    expect(roomManager.isPlayersTurn('socket-1', 'match-1')).toBe(false);
    expect(roomManager.isPlayersTurn('socket-2', 'match-1')).toBe(true);

    const afterSecondAdvance = roomManager.advanceTurn('match-1');
    expect(afterSecondAdvance.currentTurnSeatId).toBe('T1A');
  });

  it('returns false for turn checks when socket or room does not exist', () => {
    const roomManager = new RoomManager();

    roomManager.join('match-1', 'socket-1', 'token-1');
    roomManager.beginHand('match-1');

    expect(roomManager.isPlayersTurn('missing-socket', 'match-1')).toBe(false);
    expect(roomManager.isPlayersTurn('socket-1', 'missing-match')).toBe(false);
  });

  it('returns team tokens grouped by T1 and T2', () => {
    const roomManager = new RoomManager();

    roomManager.join('match-1', 'socket-1', 'alpha');
    roomManager.join('match-1', 'socket-2', 'beta');

    expect(roomManager.getTeamTokens('match-1')).toEqual({
      T1: ['alpha'],
      T2: ['beta'],
    });
  });

  it('marks rating as applied only once per match', () => {
    const roomManager = new RoomManager();

    roomManager.join('match-1', 'socket-1', 'token-1');

    expect(roomManager.tryMarkRatingApplied('match-1')).toBe(true);
    expect(roomManager.tryMarkRatingApplied('match-1')).toBe(false);
    expect(roomManager.tryMarkRatingApplied('missing-match')).toBe(false);
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