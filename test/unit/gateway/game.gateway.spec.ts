import { GameGateway } from '../../../src/gateway/game.gateway';

describe('GameGateway bot profile flow', () => {
  function createGateway() {
    const createMatchUseCase = { execute: jest.fn() };
    const startHandUseCase = { execute: jest.fn() };
    const playCardUseCase = { execute: jest.fn() };
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
      tryMarkRatingApplied: jest.fn(),
      getTeamUserIds: jest.fn(),
    };
    const botDecisionPort = {
      decideNextMove: jest.fn(),
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

    deps.roomManager.getState.mockReturnValue({
      matchId: 'match-1',
      mode: '2v2',
      players: [
        {
          seatId: 'T1A',
          teamId: 'T1',
          ready: true,
          isBot: false,
        },
        {
          seatId: 'T2A',
          teamId: 'T2',
          ready: true,
          isBot: true,
        },
      ],
      canStart: true,
      currentTurnSeatId: 'T2A',
    });

    deps.roomManager.getBotProfile.mockReturnValue('aggressive');

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
        playerOneHand: ['3E', 'AP'],
        playerTwoHand: ['KO', '6P', '5C'],
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

    deps.botDecisionPort.decideNextMove.mockReturnValue(null);

    await (gateway as any).processBotTurns('match-1');

    expect(deps.roomManager.getBotProfile).toHaveBeenCalledWith('match-1', 'T2A');
    expect(deps.botDecisionPort.decideNextMove).toHaveBeenCalledWith({
      matchId: 'match-1',
      state: {
        matchId: 'match-1',
        state: 'in_progress',
        score: {
          playerOne: 0,
          playerTwo: 0,
        },
        currentHand: {
          viraRank: '4',
          finished: false,
          playerOneHand: ['3E', 'AP'],
          playerTwoHand: ['KO', '6P', '5C'],
          rounds: [
            {
              playerOneCard: null,
              playerTwoCard: null,
              result: null,
              finished: false,
            },
          ],
        },
      },
      profile: 'aggressive',
      roomState: {
        currentTurnSeatId: 'T2A',
        players: [
          {
            seatId: 'T1A',
            teamId: 'T1',
            ready: true,
            isBot: false,
          },
          {
            seatId: 'T2A',
            teamId: 'T2',
            ready: true,
            isBot: true,
          },
        ],
      },
    });
  });

  it('falls back to balanced when no bot profile is found for the seat', async () => {
    const { gateway, deps } = createGateway();

    deps.roomManager.getState.mockReturnValue({
      matchId: 'match-1',
      mode: '1v1',
      players: [
        {
          seatId: 'T1A',
          teamId: 'T1',
          ready: true,
          isBot: false,
        },
        {
          seatId: 'T2A',
          teamId: 'T2',
          ready: true,
          isBot: true,
        },
      ],
      canStart: true,
      currentTurnSeatId: 'T2A',
    });

    deps.roomManager.getBotProfile.mockReturnValue(null);

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
        playerOneHand: ['3E', 'AP'],
        playerTwoHand: ['KO', '6P', '5C'],
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

    deps.botDecisionPort.decideNextMove.mockReturnValue(null);

    await (gateway as any).processBotTurns('match-1');

    expect(deps.botDecisionPort.decideNextMove).toHaveBeenCalledWith(
      expect.objectContaining({
        profile: 'balanced',
      }),
    );
  });
});