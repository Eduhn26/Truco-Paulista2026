import {
  MatchmakingQueueManager,
  type MatchmakingMode,
} from '../../../src/gateway/matchmaking/matchmaking-queue-manager';

function createJoinRequest(overrides?: {
  socketId?: string;
  userId?: string;
  playerToken?: string;
  mode?: MatchmakingMode;
  rating?: number;
}) {
  return {
    socketId: overrides?.socketId ?? 'socket-1',
    userId: overrides?.userId ?? 'user-1',
    playerToken: overrides?.playerToken ?? 'token-1',
    mode: overrides?.mode ?? '1v1',
    rating: overrides?.rating ?? 1000,
  };
}

describe('MatchmakingQueueManager', () => {
  it('stores a player in the correct queue mode', () => {
    const queueManager = new MatchmakingQueueManager();

    const result = queueManager.join(
      createJoinRequest({
        mode: '2v2',
        socketId: 'socket-2',
        userId: 'user-2',
        playerToken: 'token-2',
      }),
    );

    expect(result.entry.mode).toBe('2v2');
    expect(result.snapshot).toEqual({
      mode: '2v2',
      size: 1,
      playersWaiting: [
        expect.objectContaining({
          socketId: 'socket-2',
          userId: 'user-2',
          playerToken: 'token-2',
          rating: 1000,
        }),
      ],
    });
  });

  it('keeps 1v1 and 2v2 queues isolated', () => {
    const queueManager = new MatchmakingQueueManager();

    queueManager.join(
      createJoinRequest({
        mode: '1v1',
        socketId: 'socket-1',
        userId: 'user-1',
        playerToken: 'token-1',
      }),
    );

    queueManager.join(
      createJoinRequest({
        mode: '2v2',
        socketId: 'socket-2',
        userId: 'user-2',
        playerToken: 'token-2',
      }),
    );

    expect(queueManager.getQueueSnapshot('1v1').size).toBe(1);
    expect(queueManager.getQueueSnapshot('2v2').size).toBe(1);
    expect(queueManager.getQueueSnapshot('1v1').playersWaiting[0]?.userId).toBe('user-1');
    expect(queueManager.getQueueSnapshot('2v2').playersWaiting[0]?.userId).toBe('user-2');
  });

  it('replaces an existing queued player when the same playerToken joins again', () => {
    const queueManager = new MatchmakingQueueManager();

    queueManager.join(
      createJoinRequest({
        socketId: 'socket-old',
        userId: 'user-1',
        playerToken: 'token-1',
        mode: '1v1',
      }),
    );

    const result = queueManager.join(
      createJoinRequest({
        socketId: 'socket-new',
        userId: 'user-1',
        playerToken: 'token-1',
        mode: '2v2',
        rating: 1200,
      }),
    );

    expect(queueManager.getQueueSnapshot('1v1').size).toBe(0);
    expect(queueManager.getQueueSnapshot('2v2').size).toBe(1);
    expect(result.entry.socketId).toBe('socket-new');
    expect(result.entry.mode).toBe('2v2');
    expect(result.entry.rating).toBe(1200);
  });

  it('removes a queued player by socketId', () => {
    const queueManager = new MatchmakingQueueManager();

    queueManager.join(
      createJoinRequest({
        socketId: 'socket-1',
        userId: 'user-1',
        playerToken: 'token-1',
      }),
    );

    const removed = queueManager.leaveBySocketId('socket-1');

    expect(removed).toEqual(
      expect.objectContaining({
        socketId: 'socket-1',
        userId: 'user-1',
        playerToken: 'token-1',
      }),
    );
    expect(queueManager.getQueueSnapshot('1v1').size).toBe(0);
  });

  it('removes a queued player by playerToken', () => {
    const queueManager = new MatchmakingQueueManager();

    queueManager.join(
      createJoinRequest({
        socketId: 'socket-1',
        userId: 'user-1',
        playerToken: 'token-1',
      }),
    );

    const removed = queueManager.leaveByPlayerToken('token-1');

    expect(removed).toEqual(
      expect.objectContaining({
        socketId: 'socket-1',
        userId: 'user-1',
        playerToken: 'token-1',
      }),
    );
    expect(queueManager.isQueued('token-1')).toBe(false);
  });

  it('expires entries older than the configured timeout only for the selected mode', () => {
    const queueManager = new MatchmakingQueueManager();

    const now = 10_000;

    jest.spyOn(Date, 'now').mockReturnValueOnce(now - 5_000);
    queueManager.join(
      createJoinRequest({
        socketId: 'socket-expired',
        userId: 'user-expired',
        playerToken: 'token-expired',
        mode: '1v1',
      }),
    );

    jest.spyOn(Date, 'now').mockReturnValueOnce(now - 1_000);
    queueManager.join(
      createJoinRequest({
        socketId: 'socket-active',
        userId: 'user-active',
        playerToken: 'token-active',
        mode: '1v1',
      }),
    );

    jest.spyOn(Date, 'now').mockReturnValueOnce(now - 7_000);
    queueManager.join(
      createJoinRequest({
        socketId: 'socket-other-mode',
        userId: 'user-other-mode',
        playerToken: 'token-other-mode',
        mode: '2v2',
      }),
    );

    const result = queueManager.expireEntriesOlderThan('1v1', 2_000, now);

    expect(result.removed).toHaveLength(1);
    expect(result.removed[0]?.socketId).toBe('socket-expired');
    expect(result.snapshot).toEqual({
      mode: '1v1',
      size: 1,
      playersWaiting: [
        expect.objectContaining({
          socketId: 'socket-active',
        }),
      ],
    });

    expect(queueManager.getQueueSnapshot('2v2')).toEqual({
      mode: '2v2',
      size: 1,
      playersWaiting: [
        expect.objectContaining({
          socketId: 'socket-other-mode',
        }),
      ],
    });
  });

  it('registers and clears pending fallback after timeout', () => {
    const queueManager = new MatchmakingQueueManager();

    const joinResult = queueManager.join(
      createJoinRequest({
        socketId: 'socket-timeout-1',
        userId: 'user-timeout-1',
        playerToken: 'token-timeout-1',
        mode: '1v1',
        rating: 1337,
      }),
    );

    const fallback = queueManager.registerPendingFallback(joinResult.entry, 12_345);

    expect(fallback).toEqual({
      socketId: 'socket-timeout-1',
      userId: 'user-timeout-1',
      playerToken: 'token-timeout-1',
      mode: '1v1',
      rating: 1337,
      timedOutAt: 12_345,
    });

    expect(queueManager.countPendingFallbacks()).toBe(1);

    expect(queueManager.getPendingFallbackBySocketId('socket-timeout-1')).toEqual({
      socketId: 'socket-timeout-1',
      userId: 'user-timeout-1',
      playerToken: 'token-timeout-1',
      mode: '1v1',
      rating: 1337,
      timedOutAt: 12_345,
    });

    expect(queueManager.clearPendingFallbackBySocketId('socket-timeout-1')).toEqual({
      socketId: 'socket-timeout-1',
      userId: 'user-timeout-1',
      playerToken: 'token-timeout-1',
      mode: '1v1',
      rating: 1337,
      timedOutAt: 12_345,
    });

    expect(queueManager.getPendingFallbackBySocketId('socket-timeout-1')).toBeNull();
    expect(queueManager.countPendingFallbacks()).toBe(0);
  });

  it('clears pending fallback automatically when the player rejoins the queue', () => {
    const queueManager = new MatchmakingQueueManager();

    const joinResult = queueManager.join(
      createJoinRequest({
        socketId: 'socket-timeout-2',
        userId: 'user-timeout-2',
        playerToken: 'token-timeout-2',
        mode: '2v2',
        rating: 1500,
      }),
    );

    queueManager.registerPendingFallback(joinResult.entry, 5_000);

    queueManager.join(
      createJoinRequest({
        socketId: 'socket-timeout-2',
        userId: 'user-timeout-2',
        playerToken: 'token-timeout-2',
        mode: '2v2',
        rating: 1500,
      }),
    );

    expect(queueManager.getPendingFallbackBySocketId('socket-timeout-2')).toBeNull();
  });

  it('builds an observability snapshot with queue counts and pending fallback totals', () => {
    const queueManager = new MatchmakingQueueManager();

    jest.spyOn(Date, 'now').mockReturnValueOnce(1_000);
    const firstJoin = queueManager.join(
      createJoinRequest({
        socketId: 'socket-obs-1',
        userId: 'user-obs-1',
        playerToken: 'token-obs-1',
        mode: '1v1',
        rating: 1200,
      }),
    );

    jest.spyOn(Date, 'now').mockReturnValueOnce(2_000);
    queueManager.join(
      createJoinRequest({
        socketId: 'socket-obs-2',
        userId: 'user-obs-2',
        playerToken: 'token-obs-2',
        mode: '2v2',
        rating: 1300,
      }),
    );

    queueManager.registerPendingFallback(firstJoin.entry, 9_999);

    const snapshot = queueManager.getObservabilitySnapshot(12_345);

    expect(snapshot).toEqual({
      generatedAt: 12_345,
      queues: {
        '1v1': {
          waiting: 1,
          playersWaiting: [
            {
              socketId: 'socket-obs-1',
              userId: 'user-obs-1',
              rating: 1200,
              joinedAt: 1_000,
            },
          ],
        },
        '2v2': {
          waiting: 1,
          playersWaiting: [
            {
              socketId: 'socket-obs-2',
              userId: 'user-obs-2',
              rating: 1300,
              joinedAt: 2_000,
            },
          ],
        },
      },
      pendingFallbacks: {
        total: 1,
        byMode: {
          '1v1': 1,
          '2v2': 0,
        },
        players: [
          {
            socketId: 'socket-obs-1',
            userId: 'user-obs-1',
            playerToken: 'token-obs-1',
            mode: '1v1',
            rating: 1200,
            timedOutAt: 9_999,
          },
        ],
      },
    });
  });

  it('tracks whether a playerToken is already queued', () => {
    const queueManager = new MatchmakingQueueManager();

    expect(queueManager.isQueued('token-1')).toBe(false);

    queueManager.join(
      createJoinRequest({
        playerToken: 'token-1',
      }),
    );

    expect(queueManager.isQueued('token-1')).toBe(true);
  });

  it('returns null when leave is called for a missing socket', () => {
    const queueManager = new MatchmakingQueueManager();

    expect(queueManager.leaveBySocketId('missing-socket')).toBeNull();
  });

  it('rejects invalid join payloads', () => {
    const queueManager = new MatchmakingQueueManager();

    expect(() =>
      queueManager.join(
        createJoinRequest({
          userId: '   ',
        }),
      ),
    ).toThrow('userId must not be empty');

    expect(() =>
      queueManager.join(
        createJoinRequest({
          mode: '3v3' as never,
        }),
      ),
    ).toThrow('mode must be either 1v1 or 2v2');

    expect(() =>
      queueManager.join(
        createJoinRequest({
          rating: -1,
        }),
      ),
    ).toThrow('rating must be a non-negative integer');
  });

  it('rejects invalid expiration configuration', () => {
    const queueManager = new MatchmakingQueueManager();

    expect(() => queueManager.expireEntriesOlderThan('1v1', -1)).toThrow(
      'maxWaitMs must be a non-negative integer',
    );
  });

  it('can clear all queues explicitly', () => {
    const queueManager = new MatchmakingQueueManager();

    queueManager.join(
      createJoinRequest({
        socketId: 'socket-1',
        userId: 'user-1',
        playerToken: 'token-1',
        mode: '1v1',
      }),
    );

    queueManager.join(
      createJoinRequest({
        socketId: 'socket-2',
        userId: 'user-2',
        playerToken: 'token-2',
        mode: '2v2',
      }),
    );

    queueManager.registerPendingFallback(
      {
        socketId: 'socket-3',
        userId: 'user-3',
        playerToken: 'token-3',
        mode: '1v1',
        rating: 999,
        joinedAt: 1,
      },
      10,
    );

    queueManager.clear();

    expect(queueManager.getQueueSnapshot('1v1').size).toBe(0);
    expect(queueManager.getQueueSnapshot('2v2').size).toBe(0);
    expect(queueManager.getPendingFallbackBySocketId('socket-3')).toBeNull();
  });
});
