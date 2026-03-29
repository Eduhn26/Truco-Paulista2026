import { HeuristicBotAdapter } from '../../../src/infrastructure/bots/heuristic-bot.adapter';
import type { BotDecisionRequest } from '../../../src/application/ports/bot-decision.port';

function makeRequest(
  overrides?: Partial<BotDecisionRequest>,
): BotDecisionRequest {
  return {
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
        viewerPlayerId: null,
        playerOneHand: ['7P', '3E', 'AP'],
        playerTwoHand: ['5C', '6P', 'KO'],
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
    ...overrides,
  };
}

describe('HeuristicBotAdapter', () => {
  it('returns null when it is not a bot turn', () => {
    const adapter = new HeuristicBotAdapter();

    const decision = adapter.decideNextMove(
      makeRequest({
        roomState: {
          currentTurnSeatId: 'T1A',
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
      }),
    );

    expect(decision).toBeNull();
  });

  it('balanced profile plays the lowest card when opening the round', () => {
    const adapter = new HeuristicBotAdapter();

    const decision = adapter.decideNextMove(
      makeRequest({
        profile: 'balanced',
      }),
    );

    expect(decision).not.toBeNull();
    expect(decision).toEqual({
      seatId: 'T2A',
      teamId: 'T2',
      playerId: 'P2',
      card: '6P',
    });
  });

  it('aggressive profile plays the highest card when opening the round', () => {
    const adapter = new HeuristicBotAdapter();

    const decision = adapter.decideNextMove(
      makeRequest({
        profile: 'aggressive',
      }),
    );

    expect(decision).not.toBeNull();
    expect(decision).toEqual({
      seatId: 'T2A',
      teamId: 'T2',
      playerId: 'P2',
      card: '5C',
    });
  });

  it('balanced profile plays the lowest winning card when responding', () => {
    const adapter = new HeuristicBotAdapter();

    const decision = adapter.decideNextMove(
      makeRequest({
        profile: 'balanced',
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
            viewerPlayerId: null,
            playerOneHand: ['7P', '3E'],
            playerTwoHand: ['KO', '6P', '5C'],
            rounds: [
              {
                playerOneCard: 'KO',
                playerTwoCard: null,
                result: null,
                finished: false,
              },
            ],
          },
        },
      }),
    );

    expect(decision).not.toBeNull();
    expect(decision).toEqual({
      seatId: 'T2A',
      teamId: 'T2',
      playerId: 'P2',
      card: '5C',
    });
  });

  it('aggressive profile plays the highest winning card when responding', () => {
    const adapter = new HeuristicBotAdapter();

    const decision = adapter.decideNextMove(
      makeRequest({
        profile: 'aggressive',
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
            viewerPlayerId: null,
            playerOneHand: ['7P', '3E'],
            playerTwoHand: ['KO', '6P', '5C'],
            rounds: [
              {
                playerOneCard: 'KO',
                playerTwoCard: null,
                result: null,
                finished: false,
              },
            ],
          },
        },
      }),
    );

    expect(decision).not.toBeNull();
    expect(decision).toEqual({
      seatId: 'T2A',
      teamId: 'T2',
      playerId: 'P2',
      card: '5C',
    });
  });

  it('cautious profile throws away the lowest card when no winning response exists', () => {
    const adapter = new HeuristicBotAdapter();

    const decision = adapter.decideNextMove(
      makeRequest({
        profile: 'cautious',
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
            viewerPlayerId: null,
            playerOneHand: ['3E', 'AP'],
            playerTwoHand: ['7C', 'KO', '5C'],
            rounds: [
              {
                playerOneCard: '3E',
                playerTwoCard: null,
                result: null,
                finished: false,
              },
            ],
          },
        },
      }),
    );

    expect(decision).not.toBeNull();
    expect(decision).toEqual({
      seatId: 'T2A',
      teamId: 'T2',
      playerId: 'P2',
      card: '5C',
    });
  });

  it('aggressive profile throws away the highest card when no winning response exists', () => {
    const adapter = new HeuristicBotAdapter();

    const decision = adapter.decideNextMove(
      makeRequest({
        profile: 'aggressive',
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
            viewerPlayerId: null,
            playerOneHand: ['3E', 'AP'],
            playerTwoHand: ['7C', 'KO', '6P'],
            rounds: [
              {
                playerOneCard: '3E',
                playerTwoCard: null,
                result: null,
                finished: false,
              },
            ],
          },
        },
      }),
    );

    expect(decision).not.toBeNull();
    expect(decision).toEqual({
      seatId: 'T2A',
      teamId: 'T2',
      playerId: 'P2',
      card: 'KO',
    });
  });
});