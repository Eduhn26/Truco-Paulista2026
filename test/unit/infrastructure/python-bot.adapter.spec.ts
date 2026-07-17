import type { BotDecisionContext } from '../../../src/application/ports/bot-decision.port';
import { HeuristicBotAdapter } from '../../../src/infrastructure/bots/heuristic-bot.adapter';
import { PythonBotAdapter } from '../../../src/infrastructure/bots/python-bot.adapter';
import type { PythonBotConfig } from '../../../src/infrastructure/bots/python-bot.config';

describe('PythonBotAdapter', () => {
  const originalFetch = globalThis.fetch;

  let fetchMock: jest.Mock;
  let heuristicBotAdapter: HeuristicBotAdapter;
  let adapter: PythonBotAdapter;

  const config: PythonBotConfig = {
    enabled: true,
    baseUrl: 'http://python-bot-service:8000',
    timeoutMs: 1000,
  };

  beforeEach(() => {
    fetchMock = jest.fn();
    globalThis.fetch = fetchMock as typeof fetch;

    heuristicBotAdapter = {
      decide: jest.fn().mockReturnValue({
        action: 'play-card',
        card: '3P',
        metadata: {
          source: 'heuristic',
          rationale: {
            strategy: 'opening-strongest',
          },
        },
      }),
    } as unknown as HeuristicBotAdapter;

    adapter = new PythonBotAdapter(config, heuristicBotAdapter);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  function createContext(overrides: Partial<BotDecisionContext> = {}): BotDecisionContext {
    return {
      matchId: 'match-1',
      profile: 'balanced',
      mode: '1v1',
      actorSeatId: 'T2A',
      actorTeamId: 'T2',
      partnerSeatId: null,
      viraRank: '4',
      currentRound: {
        playerOneCard: null,
        playerTwoCard: null,
        finished: false,
        result: null,
      },
      player: {
        playerId: 'P2',
        hand: ['4O', 'AO', '3P'],
      },
      bet: {
        currentValue: 1,
        betState: 'idle',
        pendingValue: null,
        requestedBy: null,
        specialState: 'normal',
        specialDecisionPending: false,
        availableActions: {
          canRequestTruco: true,
          canRaiseToSix: false,
          canRaiseToNine: false,
          canRaiseToTwelve: false,
          canAcceptBet: false,
          canDeclineBet: false,
          canAcceptMaoDeOnze: false,
          canDeclineMaoDeOnze: false,
          canAttemptPlayCard: true,
        },
      },
      score: {
        playerOne: 3,
        playerTwo: 6,
        pointsToWin: 12,
      },
      handProgress: {
        roundsWonByMe: 0,
        roundsWonByOpponent: 0,
        roundsTied: 0,
        currentRoundIndex: 0,
      },
      ...overrides,
    };
  }

  function mockJsonResponse(payload: unknown, status = 200): void {
    fetchMock.mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: jest.fn().mockResolvedValue(payload),
    } as unknown as Response);
  }

  it('uses a valid remote card decision as the live bot decision', async () => {
    mockJsonResponse({
      action: 'play-card',
      card: 'AO',
    });

    const decision = await adapter.decide(createContext());

    expect(decision).toEqual({
      action: 'play-card',
      card: 'AO',
      metadata: {
        source: 'python-remote',
      },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://python-bot-service:8000/decide',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
      }),
    );
  });

  it('accepts a remote action only when it is available in the current context', async () => {
    mockJsonResponse({
      action: 'request-truco',
    });

    const decision = await adapter.decide(createContext());

    expect(decision).toEqual({
      action: 'request-truco',
      metadata: {
        source: 'python-remote',
      },
    });
  });

  it('falls back when the remote service selects a card outside the bot hand', async () => {
    mockJsonResponse({
      action: 'play-card',
      card: '7C',
    });

    const decision = await adapter.decide(createContext());

    expect(decision).toEqual({
      action: 'play-card',
      card: '3P',
      metadata: {
        source: 'heuristic-fallback',
        rationale: {
          strategy: 'opening-strongest',
        },
      },
    });
  });

  it('falls back when the remote service returns an unavailable action', async () => {
    mockJsonResponse({
      action: 'raise-to-six',
    });

    const decision = await adapter.decide(createContext());

    expect(decision.metadata?.source).toBe('heuristic-fallback');
  });

  it('falls back when the remote service explicitly reports an unsupported state', async () => {
    mockJsonResponse({
      action: 'pass',
      reason: 'unsupported-state',
    });

    const decision = await adapter.decide(createContext());

    expect(decision.metadata?.source).toBe('heuristic-fallback');
  });

  it('falls back when the remote service returns invalid JSON', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockRejectedValue(new SyntaxError('Unexpected token')),
    } as unknown as Response);

    const decision = await adapter.decide(createContext());

    expect(decision.metadata?.source).toBe('heuristic-fallback');
  });

  it('falls back when the remote service responds with an HTTP error', async () => {
    mockJsonResponse({ status: 'error' }, 422);

    const decision = await adapter.decide(createContext());

    expect(decision.metadata?.source).toBe('heuristic-fallback');
  });
});
