jest.mock('../../../src/application/runtime/env/runtime-config', () => ({
  readGatewayCorsOrigin: () => 'http://localhost:5173',
}));

import { GameGateway } from '../../../src/gateway/game.gateway';

type GatewayServerMock = {
  to: jest.Mock;
  emit: jest.Mock;
  sockets: {
    sockets: Map<string, TestSocket>;
  };
};

type GameGatewayServerAccess = {
  server: GatewayServerMock;
};

type GameGatewayBotTurnAccess = {
  processBotTurns(matchId: string): Promise<void>;
};

type TestSocket = {
  id: string;
  handshake: {
    auth?: Record<string, unknown>;
  };
  join: jest.Mock<Promise<void>, [string]>;
  emit: jest.Mock<void, [string, unknown]>;
  disconnect: jest.Mock<void, [boolean?]>;
};

type PlayerProfileResult = {
  profile: {
    id: string;
    rating: number;
  };
};

type MatchmakingMode = '1v1' | '2v2';

type QueuePlayer = {
  socketId: string;
  userId: string;
  playerToken: string;
  mode: MatchmakingMode;
  rating: number;
  joinedAt: number;
};

type PendingFallback = {
  socketId: string;
  userId: string;
  playerToken: string;
  mode: MatchmakingMode;
  rating: number;
  timedOutAt: number;
};

function createSocket(options?: { id?: string; authToken?: string; token?: string }): TestSocket {
  const auth: Record<string, unknown> = {};

  if (options?.authToken) {
    auth['authToken'] = options.authToken;
  }

  if (options?.token) {
    auth['token'] = options.token;
  }

  return {
    id: options?.id ?? 'socket-1',
    handshake: {
      auth,
    },
    join: jest.fn().mockResolvedValue(undefined),
    emit: jest.fn(),
    disconnect: jest.fn(),
  };
}

describe('GameGateway bot profile flow', () => {
  function createGateway() {
    const socketRegistry = new Map<string, TestSocket>();

    const createMatchUseCase = {
      execute: jest.fn().mockResolvedValue({ matchId: 'queue-match-1' }),
    };
    const startHandUseCase = { execute: jest.fn() };
    const playCardUseCase = { execute: jest.fn().mockResolvedValue({ matchId: 'match-1' }) };
    const requestTrucoUseCase = {
      execute: jest.fn().mockResolvedValue({ matchId: 'match-1' }),
    };
    const acceptBetUseCase = {
      execute: jest.fn().mockResolvedValue({ matchId: 'match-1' }),
    };
    const declineBetUseCase = {
      execute: jest.fn().mockResolvedValue({ matchId: 'match-1' }),
    };
    const raiseToSixUseCase = {
      execute: jest.fn().mockResolvedValue({ matchId: 'match-1' }),
    };
    const raiseToNineUseCase = {
      execute: jest.fn().mockResolvedValue({ matchId: 'match-1' }),
    };
    const raiseToTwelveUseCase = {
      execute: jest.fn().mockResolvedValue({ matchId: 'match-1' }),
    };
    const viewMatchStateUseCase = { execute: jest.fn() };
    const getOrCreatePlayerProfileUseCase = {
      execute: jest.fn<Promise<PlayerProfileResult>, [{ userId: string }]>(),
    };
    const updateRatingUseCase = { execute: jest.fn() };
    const getRankingUseCase = { execute: jest.fn() };
    const getMatchHistoryUseCase = { execute: jest.fn() };
    const getMatchReplayUseCase = { execute: jest.fn() };
    const getOrCreateUserUseCase = {
      execute: jest.fn().mockResolvedValue({
        user: { id: 'legacy-user-1' },
      }),
    };
    const authTokenService = {
      verifyToken: jest.fn().mockReturnValue({
        sub: 'auth-user-1',
      }),
    };
    const roomManager = {
      ensureRoom: jest.fn(),
      join: jest.fn(),
      getState: jest.fn().mockReturnValue({
        currentTurnSeatId: null,
        players: [],
      }),
      getBotProfile: jest.fn(),
      advanceTurn: jest.fn(),
      tryMarkRatingApplied: jest.fn().mockReturnValue(false),
      getTeamUserIds: jest.fn(),
      getHumanSessions: jest.fn().mockReturnValue([]),
      getSessionBySocketId: jest.fn(),
      leave: jest.fn(),
      fillMissingSeatsWithBots: jest.fn(),
      setReady: jest.fn(),
      canStart: jest.fn(),
      beginHand: jest.fn(),
      isPlayersTurn: jest.fn(),
    };

    const queueStateByMode: Record<MatchmakingMode, QueuePlayer[]> = {
      '1v1': [],
      '2v2': [],
    };

    const pendingFallbacksByMode: Record<MatchmakingMode, PendingFallback[]> = {
      '1v1': [],
      '2v2': [],
    };

    const QUEUE_TIMEOUT_MS = 2 * 60 * 1000;

    const toQueueSnapshot = (mode: MatchmakingMode) => ({
      mode,
      size: queueStateByMode[mode].length,
      playersWaiting: queueStateByMode[mode].map(
        ({ socketId, userId, playerToken, rating, joinedAt }) => ({
          socketId,
          userId,
          playerToken,
          rating,
          joinedAt,
        }),
      ),
    });

    const removeWaitingBySocketId = (socketId: string): QueuePlayer | null => {
      for (const mode of ['1v1', '2v2'] as const) {
        const index = queueStateByMode[mode].findIndex((player) => player.socketId === socketId);

        if (index >= 0) {
          const [removed] = queueStateByMode[mode].splice(index, 1);
          return removed ?? null;
        }
      }

      return null;
    };

    const removePendingFallbackBySocketId = (socketId: string): PendingFallback | null => {
      for (const mode of ['1v1', '2v2'] as const) {
        const index = pendingFallbacksByMode[mode].findIndex(
          (player) => player.socketId === socketId,
        );

        if (index >= 0) {
          const [removed] = pendingFallbacksByMode[mode].splice(index, 1);
          return removed ?? null;
        }
      }

      return null;
    };

    const expireQueue = (mode: MatchmakingMode) => {
      const now = Date.now();
      const timedOutFallbacks: PendingFallback[] = [];

      const remainingPlayers: QueuePlayer[] = [];

      for (const player of queueStateByMode[mode]) {
        if (now > player.joinedAt + QUEUE_TIMEOUT_MS) {
          const fallback: PendingFallback = {
            socketId: player.socketId,
            userId: player.userId,
            playerToken: player.playerToken,
            mode: player.mode,
            rating: player.rating,
            timedOutAt: player.joinedAt + QUEUE_TIMEOUT_MS + 1,
          };

          pendingFallbacksByMode[mode].push(fallback);
          timedOutFallbacks.push(fallback);
          continue;
        }

        remainingPlayers.push(player);
      }

      queueStateByMode[mode] = remainingPlayers;

      return {
        snapshot: toQueueSnapshot(mode),
        timedOutFallbacks,
      };
    };

    const gatewayMatchmakingService = {
      getObservabilitySnapshot: jest.fn(() => ({
        generatedAt: Date.now(),
        queues: {
          '1v1': {
            waiting: queueStateByMode['1v1'].length,
            playersWaiting: queueStateByMode['1v1'].map(
              ({ socketId, userId, rating, joinedAt }) => ({
                socketId,
                userId,
                rating,
                joinedAt,
              }),
            ),
          },
          '2v2': {
            waiting: queueStateByMode['2v2'].length,
            playersWaiting: queueStateByMode['2v2'].map(
              ({ socketId, userId, rating, joinedAt }) => ({
                socketId,
                userId,
                rating,
                joinedAt,
              }),
            ),
          },
        },
        pendingFallbacks: {
          total: pendingFallbacksByMode['1v1'].length + pendingFallbacksByMode['2v2'].length,
          byMode: {
            '1v1': pendingFallbacksByMode['1v1'].length,
            '2v2': pendingFallbacksByMode['2v2'].length,
          },
          players: [...pendingFallbacksByMode['1v1'], ...pendingFallbacksByMode['2v2']].map(
            ({ socketId, userId, playerToken, mode, rating, timedOutAt }) => ({
              socketId,
              userId,
              playerToken,
              mode,
              rating,
              timedOutAt,
            }),
          ),
        },
      })),

      getFallbackState: jest.fn((socketId: string) => {
        return (
          pendingFallbacksByMode['1v1'].find((player) => player.socketId === socketId) ??
          pendingFallbacksByMode['2v2'].find((player) => player.socketId === socketId) ??
          null
        );
      }),

      joinQueue: jest.fn(
        ({
          socketId,
          userId,
          playerToken,
          mode,
          rating,
        }: {
          socketId: string;
          userId: string;
          playerToken: string;
          mode: MatchmakingMode;
          rating: number;
        }) => {
          removeWaitingBySocketId(socketId);
          removePendingFallbackBySocketId(socketId);

          queueStateByMode[mode].push({
            socketId,
            userId,
            playerToken,
            mode,
            rating,
            joinedAt: Date.now(),
          });

          return toQueueSnapshot(mode);
        },
      ),

      continueQueue: jest.fn((socketId: string) => {
        const fallback = removePendingFallbackBySocketId(socketId);

        if (!fallback) {
          return null;
        }

        queueStateByMode[fallback.mode].push({
          socketId: fallback.socketId,
          userId: fallback.userId,
          playerToken: fallback.playerToken,
          mode: fallback.mode,
          rating: fallback.rating,
          joinedAt: Date.now(),
        });

        return {
          fallback,
          snapshot: toQueueSnapshot(fallback.mode),
        };
      }),

      takeFallback: jest.fn((socketId: string) => {
        return removePendingFallbackBySocketId(socketId);
      }),

      leaveQueue: jest.fn((socketId: string) => {
        const removedWaiting = removeWaitingBySocketId(socketId);

        if (removedWaiting) {
          const maintenance = expireQueue(removedWaiting.mode);

          return {
            removed: removedWaiting,
            snapshot: maintenance.snapshot,
          };
        }

        const removedFallback = removePendingFallbackBySocketId(socketId);

        if (removedFallback) {
          return {
            removed: {
              socketId: removedFallback.socketId,
              userId: removedFallback.userId,
              playerToken: removedFallback.playerToken,
              mode: removedFallback.mode,
              rating: removedFallback.rating,
              joinedAt: removedFallback.timedOutAt,
            },
            snapshot: toQueueSnapshot(removedFallback.mode),
          };
        }

        return {
          removed: null,
          snapshot: null,
        };
      }),

      getQueueState: jest.fn((mode: MatchmakingMode) => {
        return expireQueue(mode);
      }),

      tryResolvePair: jest.fn((mode: MatchmakingMode) => {
        const maintenance = expireQueue(mode);
        const requiredPlayers = mode === '1v1' ? 2 : 4;

        if (maintenance.snapshot.playersWaiting.length < requiredPlayers) {
          return {
            snapshot: maintenance.snapshot,
            timedOutFallbacks: maintenance.timedOutFallbacks,
            pair: null,
          };
        }

        const players = maintenance.snapshot.playersWaiting.slice(0, requiredPlayers);

        return {
          snapshot: maintenance.snapshot,
          timedOutFallbacks: maintenance.timedOutFallbacks,
          pair: {
            mode,
            players,
          },
        };
      }),

      completeMatchedPair: jest.fn(
        (pair: { mode: MatchmakingMode; players: Array<{ socketId: string }> }) => {
          for (const player of pair.players) {
            removeWaitingBySocketId(player.socketId);
            removePendingFallbackBySocketId(player.socketId);
          }

          return toQueueSnapshot(pair.mode);
        },
      ),
    };

    const botDecisionPort = {
      decide: jest.fn(),
    };

    const gateway = new GameGateway(
      createMatchUseCase as never,
      startHandUseCase as never,
      playCardUseCase as never,
      requestTrucoUseCase as never,
      acceptBetUseCase as never,
      declineBetUseCase as never,
      raiseToSixUseCase as never,
      raiseToNineUseCase as never,
      raiseToTwelveUseCase as never,
      viewMatchStateUseCase as never,
      getOrCreatePlayerProfileUseCase as never,
      updateRatingUseCase as never,
      getRankingUseCase as never,
      getMatchHistoryUseCase as never,
      getMatchReplayUseCase as never,
      getOrCreateUserUseCase as never,
      authTokenService as never,
      roomManager as never,
      gatewayMatchmakingService as never,
      botDecisionPort as never,
    );

    const gatewayServerAccess = gateway as unknown as GameGatewayServerAccess;
    const gatewayBotTurnAccess = gateway as unknown as GameGatewayBotTurnAccess;

    gatewayServerAccess.server = {
      to: jest.fn(() => ({
        emit: jest.fn(),
      })),
      emit: jest.fn(),
      sockets: {
        sockets: socketRegistry,
      },
    };

    return {
      gateway,
      gatewayBotTurnAccess,
      deps: {
        createMatchUseCase,
        startHandUseCase,
        playCardUseCase,
        requestTrucoUseCase,
        acceptBetUseCase,
        declineBetUseCase,
        raiseToSixUseCase,
        raiseToNineUseCase,
        raiseToTwelveUseCase,
        viewMatchStateUseCase,
        getOrCreatePlayerProfileUseCase,
        updateRatingUseCase,
        getRankingUseCase,
        getMatchHistoryUseCase,
        getMatchReplayUseCase,
        getOrCreateUserUseCase,
        authTokenService,
        roomManager,
        gatewayMatchmakingService,
        botDecisionPort,
      },
      server: gatewayServerAccess.server,
      registerSocket(socket: TestSocket) {
        socketRegistry.set(socket.id, socket);
      },
    };
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('passes the seat bot profile into BotDecisionPort during bot turn processing', async () => {
    const { gatewayBotTurnAccess, deps } = createGateway();

    deps.roomManager.getState
      .mockReturnValueOnce({
        currentTurnSeatId: 'T1A',
        players: [
          {
            seatId: 'T1A',
            teamId: 'T1',
            ready: true,
            isBot: true,
          },
        ],
      })
      .mockReturnValueOnce({
        currentTurnSeatId: null,
        players: [
          {
            seatId: 'T1A',
            teamId: 'T1',
            ready: true,
            isBot: true,
          },
        ],
      });

    deps.roomManager.getBotProfile.mockReturnValue('aggressive');

    deps.roomManager.advanceTurn.mockReturnValue({
      currentTurnSeatId: null,
      players: [
        {
          seatId: 'T1A',
          teamId: 'T1',
          ready: true,
          isBot: true,
        },
      ],
    });

    deps.viewMatchStateUseCase.execute.mockResolvedValue({
      matchId: 'match-1',
      state: 'in_progress',
      score: {
        playerOne: 0,
        playerTwo: 0,
      },
      currentHand: {
        viraRank: '4',
        finished: false,
        viewerPlayerId: null,
        playerOneHand: ['4O', 'AO', '3P'],
        playerTwoHand: ['7O', 'KO', 'JC'],
        rounds: [
          {
            playerOneCard: null,
            playerTwoCard: null,
            result: null,
            finished: false,
          },
        ],
      },
    });

    deps.botDecisionPort.decide.mockReturnValue({
      action: 'play-card',
      card: '3P',
    });

    await gatewayBotTurnAccess.processBotTurns('match-1');

    expect(deps.botDecisionPort.decide).toHaveBeenCalledWith({
      matchId: 'match-1',
      profile: 'aggressive',
      viraRank: '4',
      currentRound: {
        playerOneCard: null,
        playerTwoCard: null,
        finished: false,
        result: null,
      },
      player: {
        playerId: 'P1',
        hand: ['4O', 'AO', '3P'],
      },
    });

    expect(deps.playCardUseCase.execute).toHaveBeenCalledWith({
      matchId: 'match-1',
      playerId: 'P1',
      card: '3P',
    });
  });

  it('falls back to balanced when no bot profile is found for the seat', async () => {
    const { gatewayBotTurnAccess, deps } = createGateway();

    deps.roomManager.getState
      .mockReturnValueOnce({
        currentTurnSeatId: 'T1A',
        players: [
          {
            seatId: 'T1A',
            teamId: 'T1',
            ready: true,
            isBot: true,
          },
        ],
      })
      .mockReturnValueOnce({
        currentTurnSeatId: null,
        players: [
          {
            seatId: 'T1A',
            teamId: 'T1',
            ready: true,
            isBot: true,
          },
        ],
      });

    deps.roomManager.getBotProfile.mockReturnValue(undefined);

    deps.roomManager.advanceTurn.mockReturnValue({
      currentTurnSeatId: null,
      players: [
        {
          seatId: 'T1A',
          teamId: 'T1',
          ready: true,
          isBot: true,
        },
      ],
    });

    deps.viewMatchStateUseCase.execute.mockResolvedValue({
      matchId: 'match-1',
      state: 'in_progress',
      score: {
        playerOne: 0,
        playerTwo: 0,
      },
      currentHand: {
        viraRank: '4',
        finished: false,
        viewerPlayerId: null,
        playerOneHand: ['4O', 'AO', '3P'],
        playerTwoHand: ['7O', 'KO', 'JC'],
        rounds: [
          {
            playerOneCard: null,
            playerTwoCard: null,
            result: null,
            finished: false,
          },
        ],
      },
    });

    deps.botDecisionPort.decide.mockReturnValue({
      action: 'play-card',
      card: '4O',
    });

    await gatewayBotTurnAccess.processBotTurns('match-1');

    expect(deps.botDecisionPort.decide).toHaveBeenCalledWith(
      expect.objectContaining({
        profile: 'balanced',
      }),
    );

    expect(deps.playCardUseCase.execute).toHaveBeenCalledWith({
      matchId: 'match-1',
      playerId: 'P1',
      card: '4O',
    });
  });

  it('joins the public queue using authenticated user rating', async () => {
    const { gateway, deps, server } = createGateway();
    const socket = createSocket({
      id: 'socket-auth-1',
      authToken: 'auth-token-1',
    });

    deps.getOrCreatePlayerProfileUseCase.execute.mockResolvedValue({
      profile: {
        id: 'profile-1',
        rating: 1320,
      },
    });

    const response = await gateway.handleJoinQueue(socket as never, {
      mode: '1v1',
    });

    expect(deps.authTokenService.verifyToken).toHaveBeenCalledWith('auth-token-1');
    expect(deps.getOrCreatePlayerProfileUseCase.execute).toHaveBeenCalledWith({
      userId: 'auth-user-1',
    });

    expect(response).toEqual({
      event: 'queue-joined',
      data: {
        mode: '1v1',
        size: 1,
        playersWaiting: [
          expect.objectContaining({
            socketId: 'socket-auth-1',
            userId: 'auth-user-1',
            playerToken: 'auth:auth-user-1',
            rating: 1320,
          }),
        ],
      },
    });

    expect(socket.emit).toHaveBeenCalledWith(
      'queue-joined',
      expect.objectContaining({
        mode: '1v1',
        size: 1,
      }),
    );

    expect(server.emit).toHaveBeenCalledWith(
      'queue-state',
      expect.objectContaining({
        mode: '1v1',
        size: 1,
      }),
    );
  });

  it('joins the public queue using legacy token identity fallback', async () => {
    const { gateway, deps } = createGateway();
    const socket = createSocket({
      id: 'socket-legacy-1',
      token: 'legacy-token-1',
    });

    deps.getOrCreateUserUseCase.execute.mockResolvedValue({
      user: { id: 'legacy-user-77' },
    });

    deps.getOrCreatePlayerProfileUseCase.execute.mockResolvedValue({
      profile: {
        id: 'profile-legacy-1',
        rating: 980,
      },
    });

    const response = await gateway.handleJoinQueue(socket as never, {
      mode: '2v2',
    });

    expect(deps.getOrCreateUserUseCase.execute).toHaveBeenCalledWith({
      provider: 'legacy-socket',
      providerUserId: 'legacy-token-1',
      displayName: 'Legacy legacy-token-1',
    });

    expect(response).toEqual({
      event: 'queue-joined',
      data: {
        mode: '2v2',
        size: 1,
        playersWaiting: [
          expect.objectContaining({
            socketId: 'socket-legacy-1',
            userId: 'legacy-user-77',
            playerToken: 'legacy-token-1',
            rating: 980,
          }),
        ],
      },
    });
  });

  it('rejects queue join when player is already assigned to a room', async () => {
    const { gateway, deps } = createGateway();
    const socket = createSocket({
      id: 'socket-room-1',
      authToken: 'auth-token-2',
    });

    deps.roomManager.getSessionBySocketId.mockReturnValue({
      matchId: 'match-1',
      seatId: 'T1A',
      teamId: 'T1',
      domainPlayerId: 'P1',
    });

    const response = await gateway.handleJoinQueue(socket as never, {
      mode: '1v1',
    });

    expect(response).toEqual({
      event: 'error',
      data: {
        code: 'transport_error',
        message: 'Player is already assigned to a room.',
      },
    });

    expect(deps.getOrCreatePlayerProfileUseCase.execute).not.toHaveBeenCalled();
  });

  it('rejects queue join when mode is invalid', async () => {
    const { gateway } = createGateway();
    const socket = createSocket({
      id: 'socket-invalid-mode',
      authToken: 'auth-token-3',
    });

    const response = await gateway.handleJoinQueue(socket as never, {
      mode: '3v3',
    });

    expect(response).toEqual({
      event: 'error',
      data: {
        code: 'validation_error',
        message: 'Invalid payload: mode must be either "1v1" or "2v2".',
      },
    });
  });

  it('returns queue snapshot for the requested mode', async () => {
    const { gateway, deps } = createGateway();
    const firstSocket = createSocket({
      id: 'socket-state-1',
      authToken: 'auth-token-state-1',
    });

    deps.authTokenService.verifyToken.mockReturnValueOnce({ sub: 'auth-user-state-1' });

    deps.getOrCreatePlayerProfileUseCase.execute.mockResolvedValueOnce({
      profile: {
        id: 'profile-state-1',
        rating: 1100,
      },
    });

    await gateway.handleJoinQueue(firstSocket as never, { mode: '1v1' });

    const response = gateway.handleGetQueueState(createSocket() as never, {
      mode: '1v1',
    });

    expect(response).toEqual({
      event: 'queue-state',
      data: {
        mode: '1v1',
        size: 1,
        playersWaiting: [
          expect.objectContaining({
            socketId: 'socket-state-1',
            userId: 'auth-user-state-1',
            rating: 1100,
          }),
        ],
      },
    });
  });

  it('creates a match when the queue reaches enough compatible players', async () => {
    const { gateway, deps, server, registerSocket } = createGateway();
    const firstSocket = createSocket({
      id: 'socket-match-1',
      authToken: 'auth-token-match-1',
    });
    const secondSocket = createSocket({
      id: 'socket-match-2',
      authToken: 'auth-token-match-2',
    });

    registerSocket(firstSocket);
    registerSocket(secondSocket);

    deps.authTokenService.verifyToken
      .mockReturnValueOnce({ sub: 'auth-user-match-1' })
      .mockReturnValueOnce({ sub: 'auth-user-match-2' });

    deps.getOrCreatePlayerProfileUseCase.execute
      .mockResolvedValueOnce({
        profile: {
          id: 'profile-match-1',
          rating: 1200,
        },
      })
      .mockResolvedValueOnce({
        profile: {
          id: 'profile-match-2',
          rating: 1210,
        },
      })
      .mockResolvedValueOnce({
        profile: {
          id: 'profile-match-1',
          rating: 1200,
        },
      })
      .mockResolvedValueOnce({
        profile: {
          id: 'profile-match-2',
          rating: 1210,
        },
      });

    deps.roomManager.join
      .mockReturnValueOnce({
        matchId: 'queue-match-1',
        seatId: 'T1A',
        teamId: 'T1',
        domainPlayerId: 'P1',
      })
      .mockReturnValueOnce({
        matchId: 'queue-match-1',
        seatId: 'T2A',
        teamId: 'T2',
        domainPlayerId: 'P2',
      });

    deps.viewMatchStateUseCase.execute.mockResolvedValue({
      matchId: 'queue-match-1',
      state: 'pending',
      score: {
        playerOne: 0,
        playerTwo: 0,
      },
      currentHand: null,
    });

    await gateway.handleJoinQueue(firstSocket as never, { mode: '1v1' });
    const response = await gateway.handleJoinQueue(secondSocket as never, { mode: '1v1' });

    expect(deps.createMatchUseCase.execute).toHaveBeenCalledWith({
      mode: '1v1',
    });

    expect(deps.roomManager.ensureRoom).toHaveBeenCalledWith('queue-match-1', '1v1');

    expect(firstSocket.join).toHaveBeenCalledWith('queue-match-1');
    expect(secondSocket.join).toHaveBeenCalledWith('queue-match-1');

    expect(deps.roomManager.join).toHaveBeenCalledWith('queue-match-1', 'socket-match-1', {
      userId: 'auth-user-match-1',
      playerToken: 'auth:auth-user-match-1',
    });
    expect(deps.roomManager.join).toHaveBeenCalledWith('queue-match-1', 'socket-match-2', {
      userId: 'auth-user-match-2',
      playerToken: 'auth:auth-user-match-2',
    });

    expect(firstSocket.emit).toHaveBeenCalledWith(
      'player-assigned',
      expect.objectContaining({
        matchId: 'queue-match-1',
        seatId: 'T1A',
        teamId: 'T1',
        playerId: 'P1',
        profileId: 'profile-match-1',
      }),
    );
    expect(secondSocket.emit).toHaveBeenCalledWith(
      'player-assigned',
      expect.objectContaining({
        matchId: 'queue-match-1',
        seatId: 'T2A',
        teamId: 'T2',
        playerId: 'P2',
        profileId: 'profile-match-2',
      }),
    );

    expect(response).toEqual({
      event: 'match-found',
      data: {
        matchId: 'queue-match-1',
        mode: '1v1',
        players: [
          expect.objectContaining({
            userId: 'auth-user-match-1',
            rating: 1200,
          }),
          expect.objectContaining({
            userId: 'auth-user-match-2',
            rating: 1210,
          }),
        ],
      },
    });

    expect(server.emit).toHaveBeenLastCalledWith('queue-state', {
      mode: '1v1',
      size: 0,
      playersWaiting: [],
    });
  });

  it('emits queue-timeout and removes expired players during queue state reads', async () => {
    const { gateway, deps, server } = createGateway();
    const expiredSocket = createSocket({
      id: 'socket-expired-1',
      authToken: 'auth-token-expired-1',
    });

    deps.authTokenService.verifyToken.mockReturnValueOnce({ sub: 'auth-user-expired-1' });
    deps.getOrCreatePlayerProfileUseCase.execute.mockResolvedValueOnce({
      profile: {
        id: 'profile-expired-1',
        rating: 1300,
      },
    });

    const nowSpy = jest.spyOn(Date, 'now');

    nowSpy.mockReturnValue(1_000);

    await gateway.handleJoinQueue(expiredSocket as never, { mode: '1v1' });

    nowSpy.mockReturnValue(1_000 + 2 * 60 * 1000 + 1);

    const response = gateway.handleGetQueueState(createSocket() as never, {
      mode: '1v1',
    });

    expect(response).toEqual({
      event: 'queue-state',
      data: {
        mode: '1v1',
        size: 0,
        playersWaiting: [],
      },
    });

    expect(server.to).toHaveBeenCalledWith('socket-expired-1');
    expect(server.emit).toHaveBeenLastCalledWith('queue-state', {
      mode: '1v1',
      size: 0,
      playersWaiting: [],
    });
  });

  it('returns matchmaking observability snapshot with waiting queues and pending fallbacks', async () => {
    const { gateway, deps } = createGateway();
    const waitingSocket = createSocket({
      id: 'socket-obs-waiting',
      authToken: 'auth-token-obs-waiting',
    });
    const timeoutSocket = createSocket({
      id: 'socket-obs-timeout',
      authToken: 'auth-token-obs-timeout',
    });

    deps.authTokenService.verifyToken
      .mockReturnValueOnce({ sub: 'auth-user-obs-waiting' })
      .mockReturnValueOnce({ sub: 'auth-user-obs-timeout' });

    deps.getOrCreatePlayerProfileUseCase.execute
      .mockResolvedValueOnce({
        profile: {
          id: 'profile-obs-waiting',
          rating: 1400,
        },
      })
      .mockResolvedValueOnce({
        profile: {
          id: 'profile-obs-timeout',
          rating: 1500,
        },
      });

    const nowSpy = jest.spyOn(Date, 'now');

    nowSpy.mockReturnValue(1_000);
    await gateway.handleJoinQueue(waitingSocket as never, { mode: '2v2' });

    nowSpy.mockReturnValue(2_000);
    await gateway.handleJoinQueue(timeoutSocket as never, { mode: '1v1' });

    nowSpy.mockReturnValue(2_000 + 2 * 60 * 1000 + 1);
    gateway.handleGetQueueState(createSocket() as never, {
      mode: '1v1',
    });

    nowSpy.mockReturnValue(9_999);

    const response = gateway.handleGetMatchmakingSnapshot(createSocket() as never);

    expect(response).toEqual({
      event: 'matchmaking-snapshot',
      data: {
        snapshot: {
          generatedAt: 9_999,
          queues: {
            '1v1': {
              waiting: 0,
              playersWaiting: [],
            },
            '2v2': {
              waiting: 1,
              playersWaiting: [
                {
                  socketId: 'socket-obs-waiting',
                  userId: 'auth-user-obs-waiting',
                  rating: 1400,
                  joinedAt: 1_000,
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
                socketId: 'socket-obs-timeout',
                userId: 'auth-user-obs-timeout',
                playerToken: 'auth:auth-user-obs-timeout',
                mode: '1v1',
                rating: 1500,
                timedOutAt: 122_001,
              },
            ],
          },
        },
      },
    });
  });

  it('leaves queue and broadcasts updated snapshot', async () => {
    const { gateway, deps, server } = createGateway();
    const socket = createSocket({
      id: 'socket-leave-1',
      authToken: 'auth-token-leave-1',
    });

    deps.getOrCreatePlayerProfileUseCase.execute.mockResolvedValue({
      profile: {
        id: 'profile-leave-1',
        rating: 1250,
      },
    });

    await gateway.handleJoinQueue(socket as never, { mode: '2v2' });

    const response = gateway.handleLeaveQueue(socket as never);

    expect(response).toEqual({
      event: 'queue-left',
      data: {
        left: true,
        mode: '2v2',
        snapshot: {
          mode: '2v2',
          size: 0,
          playersWaiting: [],
        },
      },
    });

    expect(server.emit).toHaveBeenLastCalledWith('queue-state', {
      mode: '2v2',
      size: 0,
      playersWaiting: [],
    });
  });

  it('returns left false when socket is not queued', () => {
    const { gateway } = createGateway();
    const socket = createSocket({
      id: 'socket-not-queued',
      authToken: 'auth-token-not-queued',
    });

    const response = gateway.handleLeaveQueue(socket as never);

    expect(response).toEqual({
      event: 'queue-left',
      data: {
        left: false,
      },
    });
  });

  it('removes queued player on disconnect before room cleanup', async () => {
    const { gateway, deps, server } = createGateway();
    const socket = createSocket({
      id: 'socket-disconnect-1',
      authToken: 'auth-token-disconnect-1',
    });

    deps.getOrCreatePlayerProfileUseCase.execute.mockResolvedValue({
      profile: {
        id: 'profile-disconnect-1',
        rating: 1400,
      },
    });

    deps.roomManager.getSessionBySocketId.mockReturnValue(undefined);
    deps.roomManager.leave.mockReturnValue(null);

    await gateway.handleJoinQueue(socket as never, { mode: '1v1' });

    gateway.handleDisconnect(socket as never);

    expect(server.emit).toHaveBeenLastCalledWith('queue-state', {
      mode: '1v1',
      size: 0,
      playersWaiting: [],
    });

    const queueState = gateway.handleGetQueueState(createSocket() as never, {
      mode: '1v1',
    });

    expect(queueState).toEqual({
      event: 'queue-state',
      data: {
        mode: '1v1',
        size: 0,
        playersWaiting: [],
      },
    });
  });

  it('returns match history for a user and emits match-history', async () => {
    const { gateway, deps } = createGateway();
    const socket = createSocket({
      id: 'socket-history-1',
      authToken: 'auth-token-history-1',
    });

    deps.getMatchHistoryUseCase.execute.mockResolvedValue({
      items: [
        {
          id: 'record-1',
          matchId: 'match-1',
          mode: '1v1',
          status: 'completed',
          startedAt: '2026-04-01T01:00:00.000Z',
          finishedAt: '2026-04-01T01:10:00.000Z',
          participants: [
            {
              seatId: 'T1A',
              userId: 'user-1',
              displayName: 'Eduardo',
              isBot: false,
              botProfile: null,
            },
          ],
          finalScore: {
            playerOne: 12,
            playerTwo: 8,
          },
          winnerPlayerId: 'P1',
        },
      ],
    });

    const response = await gateway.handleGetMatchHistory(socket as never, {
      userId: 'user-1',
      limit: 5,
    });

    expect(deps.getMatchHistoryUseCase.execute).toHaveBeenCalledWith({
      userId: 'user-1',
      limit: 5,
    });

    expect(socket.emit).toHaveBeenCalledWith('match-history', {
      items: [
        expect.objectContaining({
          id: 'record-1',
          matchId: 'match-1',
        }),
      ],
    });

    expect(response).toEqual({
      event: 'match-history',
      data: {
        ok: true,
      },
    });
  });

  it('rejects get-match-history when userId is missing', async () => {
    const { gateway } = createGateway();
    const socket = createSocket({
      id: 'socket-history-invalid-1',
      authToken: 'auth-token-history-invalid-1',
    });

    const response = await gateway.handleGetMatchHistory(socket as never, {});

    expect(response).toEqual({
      event: 'error',
      data: {
        code: 'validation_error',
        message: 'Invalid payload: userId is required.',
      },
    });
  });

  it('returns match replay and emits match-replay', async () => {
    const { gateway, deps } = createGateway();
    const socket = createSocket({
      id: 'socket-replay-1',
      authToken: 'auth-token-replay-1',
    });

    deps.getMatchReplayUseCase.execute.mockResolvedValue({
      matchId: 'match-1',
      events: [
        {
          sequence: 0,
          occurredAt: '2026-04-01T01:00:00.000Z',
          payload: {
            type: 'match-created',
            pointsToWin: 12,
            mode: '1v1',
          },
        },
      ],
    });

    const response = await gateway.handleGetMatchReplay(socket as never, {
      matchId: 'match-1',
    });

    expect(deps.getMatchReplayUseCase.execute).toHaveBeenCalledWith({
      matchId: 'match-1',
    });

    expect(socket.emit).toHaveBeenCalledWith('match-replay', {
      matchId: 'match-1',
      events: [
        expect.objectContaining({
          sequence: 0,
        }),
      ],
    });

    expect(response).toEqual({
      event: 'match-replay',
      data: {
        ok: true,
      },
    });
  });

  it('emits match-replay with null data when replay is not found', async () => {
    const { gateway, deps } = createGateway();
    const socket = createSocket({
      id: 'socket-replay-null-1',
      authToken: 'auth-token-replay-null-1',
    });

    deps.getMatchReplayUseCase.execute.mockResolvedValue(null);

    const response = await gateway.handleGetMatchReplay(socket as never, {
      matchId: 'missing-match',
    });

    expect(socket.emit).toHaveBeenCalledWith('match-replay', null);
    expect(response).toEqual({
      event: 'match-replay',
      data: {
        ok: true,
      },
    });
  });

  it('rejects get-match-replay when matchId is missing', async () => {
    const { gateway } = createGateway();
    const socket = createSocket({
      id: 'socket-replay-invalid-1',
      authToken: 'auth-token-replay-invalid-1',
    });

    const response = await gateway.handleGetMatchReplay(socket as never, {});

    expect(response).toEqual({
      event: 'error',
      data: {
        code: 'validation_error',
        message: 'Invalid payload: matchId is required.',
      },
    });
  });
});
