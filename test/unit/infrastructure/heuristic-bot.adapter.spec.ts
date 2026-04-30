import type {
  BotDecisionContext,
  BotDecisionMetadata,
  BotDecisionStrategy,
} from '../../../src/application/ports/bot-decision.port';
import { HeuristicBotAdapter } from '../../../src/infrastructure/bots/heuristic-bot.adapter';
function heuristicMetadata(strategy: BotDecisionStrategy): BotDecisionMetadata {
  return {
    source: 'heuristic',
    rationale: {
      strategy,
    },
  };
}

describe('HeuristicBotAdapter', () => {
  let adapter: HeuristicBotAdapter;

  beforeEach(() => {
    adapter = new HeuristicBotAdapter();
  });

  function createContext(overrides: Partial<BotDecisionContext> = {}): BotDecisionContext {
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
        playerId: 'P1',
        hand: ['4O', 'AO', '3P'],
      },
      ...overrides,
    };
  }

  function createMaoDeOnzeContext(overrides: Partial<BotDecisionContext> = {}): BotDecisionContext {
    return createContext({
      profile: 'balanced',
      viraRank: '4',
      player: {
        playerId: 'P1',
        hand: ['3P', 'AO', 'KO'],
      },
      bet: {
        currentValue: 1,
        betState: 'idle',
        pendingValue: null,
        requestedBy: null,
        specialState: 'mao_de_onze',
        specialDecisionPending: true,
        availableActions: {
          canRequestTruco: false,
          canRaiseToSix: false,
          canRaiseToNine: false,
          canRaiseToTwelve: false,
          canAcceptBet: false,
          canDeclineBet: false,
          canAcceptMaoDeOnze: true,
          canDeclineMaoDeOnze: true,
          canAttemptPlayCard: false,
        },
      },
      score: {
        playerOne: 11,
        playerTwo: 8,
        pointsToWin: 12,
      },
      ...overrides,
    });
  }

  function expectMaoDeOnzeDecision(
    decision: ReturnType<HeuristicBotAdapter['decide']>,
    action: 'accept-mao-de-onze' | 'decline-mao-de-onze',
    strategy: BotDecisionStrategy,
  ): void {
    expect(decision).toEqual(
      expect.objectContaining({
        action,
        metadata: {
          source: 'heuristic',
          rationale: {
            strategy,
            handStrength: expect.any(Number),
          },
        },
      }),
    );
  }

  it('returns pass when the bot hand is empty', () => {
    const decision = adapter.decide(
      createContext({
        player: {
          playerId: 'P1',
          hand: [],
        },
      }),
    );

    expect(decision).toEqual({
      action: 'pass',
      reason: 'empty-hand',
      metadata: heuristicMetadata('empty-hand'),
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
      metadata: heuristicMetadata('missing-round'),
    });
  });

  it('opens with the middle card for balanced profile', () => {
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
          playerId: 'P1',
          hand: ['4O', 'AO', '3P'],
        },
      }),
    );

    expect(decision).toEqual({
      action: 'play-card',
      card: 'AO',
      metadata: heuristicMetadata('opening-middle'),
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
          playerId: 'P1',
          hand: ['4O', 'AO', '3P'],
        },
      }),
    );

    expect(decision).toEqual({
      action: 'play-card',
      card: '3P',
      metadata: heuristicMetadata('opening-strongest'),
    });
  });

  it('opens with the weakest card for cautious profile', () => {
    const decision = adapter.decide(
      createContext({
        profile: 'cautious',
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
      }),
    );

    expect(decision).toEqual({
      action: 'play-card',
      card: '4O',
      metadata: heuristicMetadata('opening-weakest'),
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
          playerId: 'P1',
          hand: ['KO', 'AO', '3P'],
        },
      }),
    );

    expect(decision).toEqual({
      action: 'play-card',
      card: 'KO',
      metadata: heuristicMetadata('response-winning-weakest'),
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
          playerId: 'P1',
          hand: ['KO', 'AO', '3P'],
        },
      }),
    );

    expect(decision).toEqual({
      action: 'play-card',
      card: '3P',
      metadata: heuristicMetadata('response-winning-strongest'),
    });
  });

  it('responds with the weakest winning card for cautious profile', () => {
    const decision = adapter.decide(
      createContext({
        profile: 'cautious',
        currentRound: {
          playerOneCard: null,
          playerTwoCard: '7O',
          finished: false,
          result: null,
        },
        player: {
          playerId: 'P1',
          hand: ['KO', 'AO', '3P'],
        },
      }),
    );

    expect(decision).toEqual({
      action: 'play-card',
      card: 'KO',
      metadata: heuristicMetadata('response-winning-weakest'),
    });
  });

  it('responds with the only winning card when just one card can beat the opponent', () => {
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
          playerId: 'P1',
          hand: ['4O', '5C', '7P'],
        },
      }),
    );

    expect(decision).toEqual({
      action: 'play-card',
      card: '5C',
      metadata: heuristicMetadata('response-winning-strongest'),
    });
  });

  it('discards the middle card when it cannot win and profile is balanced', () => {
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
          playerId: 'P1',
          hand: ['4O', '6C', '7P'],
        },
      }),
    );

    expect(decision).toEqual({
      action: 'play-card',
      card: '6C',
      metadata: heuristicMetadata('response-losing-middle'),
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
          playerId: 'P1',
          hand: ['4O', '6C', '7P'],
        },
      }),
    );

    expect(decision).toEqual({
      action: 'play-card',
      card: '7P',
      metadata: heuristicMetadata('response-losing-strongest'),
    });
  });

  it('discards the weakest card when it cannot win and profile is cautious', () => {
    const decision = adapter.decide(
      createContext({
        profile: 'cautious',
        currentRound: {
          playerOneCard: null,
          playerTwoCard: '3O',
          finished: false,
          result: null,
        },
        player: {
          playerId: 'P1',
          hand: ['4O', '6C', '7P'],
        },
      }),
    );

    expect(decision).toEqual({
      action: 'play-card',
      card: '4O',
      metadata: heuristicMetadata('response-losing-weakest'),
    });
  });

  it('uses the middle card for balanced profile with a five-card losing hand', () => {
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
          playerId: 'P1',
          hand: ['4O', '5C', '6E', '7P', 'QO'],
        },
      }),
    );

    expect(decision).toEqual({
      action: 'play-card',
      card: '5C',
      metadata: heuristicMetadata('response-winning-weakest'),
    });
  });

  it('uses the middle card for balanced profile with a two-card opening hand', () => {
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
          playerId: 'P1',
          hand: ['4O', 'AO'],
        },
      }),
    );

    expect(decision).toEqual({
      action: 'play-card',
      card: '4O',
      metadata: heuristicMetadata('opening-middle'),
    });
  });

  it('plays the only available card when the hand has one card', () => {
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
          playerId: 'P1',
          hand: ['AO'],
        },
      }),
    );

    expect(decision).toEqual({
      action: 'play-card',
      card: 'AO',
      metadata: heuristicMetadata('opening-middle'),
    });
  });

  it('reads the opponent card from player one side when the bot is player two', () => {
    const decision = adapter.decide(
      createContext({
        profile: 'aggressive',
        currentRound: {
          playerOneCard: '7O',
          playerTwoCard: null,
          finished: false,
          result: null,
        },
        player: {
          playerId: 'P2',
          hand: ['KO', 'AO', '3P'],
        },
      }),
    );

    expect(decision).toEqual({
      action: 'play-card',
      card: '3P',
      metadata: heuristicMetadata('response-winning-strongest'),
    });
  });
  it('accepts mao de onze with a medium-good hand when the profile is aggressive', () => {
    const decision = adapter.decide(
      createMaoDeOnzeContext({
        profile: 'aggressive',
        player: {
          playerId: 'P1',
          hand: ['AO', 'KO', '7C'],
        },
      }),
    );

    expectMaoDeOnzeDecision(decision, 'accept-mao-de-onze', 'mao-de-onze-accept-aggressive-risk');
  });

  it('accepts mao de onze with a good hand when the profile is balanced', () => {
    const decision = adapter.decide(
      createMaoDeOnzeContext({
        profile: 'balanced',
        player: {
          playerId: 'P1',
          hand: ['3P', 'AO', 'KO'],
        },
      }),
    );

    expectMaoDeOnzeDecision(decision, 'accept-mao-de-onze', 'mao-de-onze-accept-balanced-hand');
  });

  it('declines mao de onze with a medium hand when the profile is cautious', () => {
    const decision = adapter.decide(
      createMaoDeOnzeContext({
        profile: 'cautious',
        player: {
          playerId: 'P1',
          hand: ['AO', 'KO', '7C'],
        },
      }),
    );

    expectMaoDeOnzeDecision(decision, 'decline-mao-de-onze', 'mao-de-onze-decline-cautious-risk');
  });

  it('accepts mao de onze with a very strong hand for every profile', () => {
    for (const profile of ['aggressive', 'balanced', 'cautious'] as const) {
      const decision = adapter.decide(
        createMaoDeOnzeContext({
          profile,
          player: {
            playerId: 'P1',
            hand: ['5P', '3P', 'AO'],
          },
        }),
      );

      expect(decision).toEqual(
        expect.objectContaining({
          action: 'accept-mao-de-onze',
          metadata: expect.objectContaining({
            rationale: expect.objectContaining({
              handStrength: expect.any(Number),
            }),
          }),
        }),
      );
    }
  });

  it('declines mao de onze with a very weak hand for every profile', () => {
    for (const profile of ['aggressive', 'balanced', 'cautious'] as const) {
      const decision = adapter.decide(
        createMaoDeOnzeContext({
          profile,
          viraRank: '3',
          player: {
            playerId: 'P1',
            hand: ['5O', '6C', '7E'],
          },
        }),
      );

      expect(decision).toEqual(
        expect.objectContaining({
          action: 'decline-mao-de-onze',
          metadata: expect.objectContaining({
            rationale: expect.objectContaining({
              strategy: expect.stringMatching(/^mao-de-onze-decline-/),
              handStrength: expect.any(Number),
            }),
          }),
        }),
      );
    }
  });

  it('declines mao de onze by match risk when accepting can lose the match', () => {
    const decision = adapter.decide(
      createMaoDeOnzeContext({
        profile: 'balanced',
        player: {
          playerId: 'P1',
          hand: ['AO', 'KO', '7C'],
        },
        score: {
          playerOne: 11,
          playerTwo: 9,
          pointsToWin: 12,
        },
      }),
    );

    expectMaoDeOnzeDecision(decision, 'decline-mao-de-onze', 'mao-de-onze-decline-match-risk');
  });
});
