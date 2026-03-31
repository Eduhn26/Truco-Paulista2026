import {
  MatchmakingPairingPolicy,
  type MatchmakingQueueCandidate,
} from '../../../src/gateway/matchmaking/matchmaking-pairing-policy';

describe('MatchmakingPairingPolicy', () => {
  function createEntry(overrides?: {
    socketId?: string;
    userId?: string;
    playerToken?: string;
    rating?: number;
    joinedAt?: number;
  }): MatchmakingQueueCandidate {
    return {
      socketId: overrides?.socketId ?? 'socket-1',
      userId: overrides?.userId ?? 'user-1',
      playerToken: overrides?.playerToken ?? 'token-1',
      rating: overrides?.rating ?? 1000,
      joinedAt: overrides?.joinedAt ?? 1,
    };
  }

  it('returns null when there are not enough players for 1v1', () => {
    const policy = new MatchmakingPairingPolicy();

    const result = policy.findPair('1v1', [
      createEntry({
        socketId: 'socket-1',
        userId: 'user-1',
        playerToken: 'token-1',
        rating: 1000,
      }),
    ]);

    expect(result).toBeNull();
  });

  it('returns the closest rating pair for 1v1', () => {
    const policy = new MatchmakingPairingPolicy();

    const result = policy.findPair('1v1', [
      createEntry({
        socketId: 'socket-1',
        userId: 'user-1',
        playerToken: 'token-1',
        rating: 800,
        joinedAt: 1,
      }),
      createEntry({
        socketId: 'socket-2',
        userId: 'user-2',
        playerToken: 'token-2',
        rating: 1010,
        joinedAt: 2,
      }),
      createEntry({
        socketId: 'socket-3',
        userId: 'user-3',
        playerToken: 'token-3',
        rating: 1000,
        joinedAt: 3,
      }),
    ]);

    expect(result).not.toBeNull();
    expect(result?.mode).toBe('1v1');
    expect(result?.averageRating).toBe(1005);
    expect(result?.players).toHaveLength(2);
    expect(result?.players.map((player) => player.socketId)).toEqual(['socket-2', 'socket-3']);
  });

  it('returns the closest rating block for 2v2', () => {
    const policy = new MatchmakingPairingPolicy();

    const result = policy.findPair('2v2', [
      createEntry({
        socketId: 'socket-1',
        playerToken: 'token-1',
        userId: 'user-1',
        rating: 800,
        joinedAt: 1,
      }),
      createEntry({
        socketId: 'socket-2',
        playerToken: 'token-2',
        userId: 'user-2',
        rating: 1100,
        joinedAt: 2,
      }),
      createEntry({
        socketId: 'socket-3',
        playerToken: 'token-3',
        userId: 'user-3',
        rating: 1110,
        joinedAt: 3,
      }),
      createEntry({
        socketId: 'socket-4',
        playerToken: 'token-4',
        userId: 'user-4',
        rating: 1090,
        joinedAt: 4,
      }),
      createEntry({
        socketId: 'socket-5',
        playerToken: 'token-5',
        userId: 'user-5',
        rating: 1120,
        joinedAt: 5,
      }),
    ]);

    expect(result).not.toBeNull();
    expect(result?.mode).toBe('2v2');
    expect(result?.averageRating).toBe(1105);
    expect(result?.players).toHaveLength(4);
    expect(result?.players.map((player) => player.socketId)).toEqual([
      'socket-2',
      'socket-3',
      'socket-4',
      'socket-5',
    ]);
  });
});
