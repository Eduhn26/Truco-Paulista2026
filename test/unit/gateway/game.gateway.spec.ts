import { GameGateway } from '../../../src/gateway/game.gateway';

describe('GameGateway bot profile flow', () => {
  function createGateway() {
    const createMatchUseCase = { execute: jest.fn() };
    const startHandUseCase = { execute: jest.fn() };
    const playCardUseCase = { execute: jest.fn().mockResolvedValue({ matchId: 'match-1' }) };
    const viewMatchStateUseCase = { execute: jest.fn() };
    const getOrCreatePlayerProfileUseCase = { execute: jest.fn() };
    const updateRatingUseCase = { execute: jest.fn() };
    const getRankingUseCase = { execute: jest.fn() };
    const getOrCreateUserUseCase = { execute: jest.fn() };
    const authTokenService = { verifyToken: jest.fn() };
    const roomManager = {
      getState: jest.fn(),
      getBotProfile: jest.fn(),
      advanceTurn: jest.fn(),
      tryMarkRatingApplied: jest.fn().mockReturnValue(false),
      getTeamUserIds: jest.fn(),
      getHumanSessions: jest.fn().mockReturnValue([]),
    };
    const botDecisionPort = {
      decide: jest.fn(),
    };

    const gateway = new GameGateway(
      createMatchUseCase as never,
      startHandUseCase as never,
      playCardUseCase as never,
      viewMatchStateUseCase as never,
      getOrCreatePlayerProfileUseCase as never,
      updateRatingUseCase as never,
      getRankingUseCase as never,
      getOrCreateUserUseCase as never,
      authTokenService as never,
      roomManager as never,
      botDecisionPort as never,
    );

    (gateway as any).server = {
      to: jest.fn(() => ({
        emit: jest.fn(),
      })),
    };

    return {
      gateway,
      deps: {
        createMatchUseCase,
        startHandUseCase,
        playCardUseCase,
        viewMatchStateUseCase,
        getOrCreatePlayerProfileUseCase,
        updateRatingUseCase,
        getRankingUseCase,
        getOrCreateUserUseCase,
        authTokenService,
        roomManager,
        botDecisionPort,
      },
    };
  }

  it('passes the seat bot profile into BotDecisionPort during bot turn processing', async () => {
    const { gateway, deps } = createGateway();

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

    await (gateway as any).processBotTurns('match-1');

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
        seatId: 'T1A',
        teamId: 'T1',
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
    const { gateway, deps } = createGateway();

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

    await (gateway as any).processBotTurns('match-1');

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
});