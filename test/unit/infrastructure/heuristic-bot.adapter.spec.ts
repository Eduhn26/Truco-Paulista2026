import type { BotDecisionContext } from '../../../src/application/ports/bot-decision.port';
import { HeuristicBotAdapter } from '../../../src/infrastructure/bots/heuristic-bot.adapter';

describe('HeuristicBotAdapter', () => {
  let adapter: HeuristicBotAdapter;

  beforeEach(() => {
    adapter = new HeuristicBotAdapter();
  });

  function createContext(
    overrides: Partial<BotDecisionContext> = {},
  ): BotDecisionContext {
    return {
      matchId: 'match-1',
      profile: 'balanced',
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
      ...overrides,
    };
  }

  it('returns pass when the bot hand is empty', () => {
    const decision = adapter.decide(
      createContext({
        player: {
          seatId: 'T1A',
          teamId: 'T1',
          playerId: 'P1',
          hand: [],
        },
      }),
    );

    expect(decision).toEqual({
      action: 'pass',
      reason: 'empty-hand',
    });
  });

  it('returns pass when there is no current round', () => {
    const decision = adapter.decide(
      createContext({
        currentRound: null,
      }),
    );

    expect(decision).toEqual({
      action: 'pass',
      reason: 'missing-round',
    });
  });

  it('opens with the weakest card for balanced profile', () => {
    const decision = adapter.decide(
      createContext({
        profile: 'balanced',
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
      }),
    );

    expect(decision).toEqual({
      action: 'play-card',
      card: '4O',
    });
  });

  it('opens with the strongest card for aggressive profile', () => {
    const decision = adapter.decide(
      createContext({
        profile: 'aggressive',
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
      }),
    );

    expect(decision).toEqual({
      action: 'play-card',
      card: '3P',
    });
  });

  it('responds with the weakest winning card for balanced profile', () => {
    const decision = adapter.decide(
      createContext({
        profile: 'balanced',
        currentRound: {
          playerOneCard: null,
          playerTwoCard: '7O',
          finished: false,
          result: null,
        },
        player: {
          seatId: 'T1A',
          teamId: 'T1',
          playerId: 'P1',
          hand: ['KO', 'AO', '3P'],
        },
      }),
    );

    expect(decision).toEqual({
      action: 'play-card',
      card: 'KO',
    });
  });

  it('responds with the strongest winning card for aggressive profile', () => {
    const decision = adapter.decide(
      createContext({
        profile: 'aggressive',
        currentRound: {
          playerOneCard: null,
          playerTwoCard: '7O',
          finished: false,
          result: null,
        },
        player: {
          seatId: 'T1A',
          teamId: 'T1',
          playerId: 'P1',
          hand: ['KO', 'AO', '3P'],
        },
      }),
    );

    expect(decision).toEqual({
      action: 'play-card',
      card: '3P',
    });
  });

  it('discards the weakest card when it cannot win and profile is balanced', () => {
    const decision = adapter.decide(
      createContext({
        profile: 'balanced',
        currentRound: {
          playerOneCard: null,
          playerTwoCard: '3O',
          finished: false,
          result: null,
        },
        player: {
          seatId: 'T1A',
          teamId: 'T1',
          playerId: 'P1',
          hand: ['4O', '6C', '7P'],
        },
      }),
    );

    expect(decision).toEqual({
      action: 'play-card',
      card: '4O',
    });
  });

  it('discards the strongest card when it cannot win and profile is aggressive', () => {
    const decision = adapter.decide(
      createContext({
        profile: 'aggressive',
        currentRound: {
          playerOneCard: null,
          playerTwoCard: '3O',
          finished: false,
          result: null,
        },
        player: {
          seatId: 'T1A',
          teamId: 'T1',
          playerId: 'P1',
          hand: ['4O', '6C', '7P'],
        },
      }),
    );

    expect(decision).toEqual({
      action: 'play-card',
      card: '7P',
    });
  });
});