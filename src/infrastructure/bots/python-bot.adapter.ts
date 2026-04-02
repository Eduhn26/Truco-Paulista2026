import { Inject, Injectable, Logger } from '@nestjs/common';

import type {
  BotDecision,
  BotDecisionContext,
  BotDecisionPort,
} from '@game/application/ports/bot-decision.port';
import { HeuristicBotAdapter } from '@game/infrastructure/bots/heuristic-bot.adapter';

import { PYTHON_BOT_CONFIG, type PythonBotConfig } from './python-bot.config';

type PythonBotDecisionRequest = {
  matchId: string;
  profile: 'balanced' | 'aggressive' | 'cautious';
  viraRank: string;
  currentRound: {
    playerOneCard: string | null;
    playerTwoCard: string | null;
    finished: boolean;
    result: 'P1' | 'P2' | 'TIE' | null;
  } | null;
  player: {
    playerId: 'P1' | 'P2';
    hand: string[];
  };
};

type PythonBotDecisionResponse =
  | {
      action: 'play-card';
      card: string;
    }
  | {
      action: 'pass';
      reason: 'empty-hand' | 'missing-round' | 'unsupported-state';
    };

type PythonBotFailureType = 'timeout' | 'http_error' | 'invalid_payload' | 'transport_error';

type PythonBotFailureContext = {
  layer: 'infrastructure';
  component: 'python_bot_adapter';
  event: 'python_bot_request_failed' | 'python_bot_response_invalid';
  status: 'failed';
  profile: 'balanced' | 'aggressive' | 'cautious';
  timeoutMs: number;
  url: string;
  errorType: PythonBotFailureType;
  errorMessage: string;
};

type PythonBotFallbackContext = {
  layer: 'infrastructure';
  component: 'python_bot_adapter';
  event: 'python_bot_fallback_applied';
  status: 'fallback';
  profile: 'balanced' | 'aggressive' | 'cautious';
  timeoutMs: number;
  errorType: PythonBotFailureType;
  errorMessage: string;
};

type PythonBotDebugContext = {
  layer: 'infrastructure';
  component: 'python_bot_adapter';
  event: 'python_bot_disabled' | 'python_bot_request_started' | 'python_bot_request_succeeded';
  status: 'skipped' | 'started' | 'succeeded';
  profile: 'balanced' | 'aggressive' | 'cautious';
  timeoutMs: number;
  url?: string;
};

@Injectable()
export class PythonBotAdapter implements BotDecisionPort {
  private readonly logger = new Logger(PythonBotAdapter.name);

  constructor(
    @Inject(PYTHON_BOT_CONFIG)
    private readonly config: PythonBotConfig,
    private readonly heuristicBotAdapter: HeuristicBotAdapter,
  ) {}

  decide(context: BotDecisionContext): BotDecision {
    return this.heuristicBotAdapter.decide(context);
  }

  async requestRemoteDecision(context: BotDecisionContext): Promise<BotDecision> {
    const fallbackDecision = this.heuristicBotAdapter.decide(context);

    if (!this.config.enabled) {
      this.logDebug({
        layer: 'infrastructure',
        component: 'python_bot_adapter',
        event: 'python_bot_disabled',
        status: 'skipped',
        profile: context.profile,
        timeoutMs: this.config.timeoutMs,
      });

      return fallbackDecision;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);
    const requestUrl = `${this.config.baseUrl}/decide`;

    this.logDebug({
      layer: 'infrastructure',
      component: 'python_bot_adapter',
      event: 'python_bot_request_started',
      status: 'started',
      profile: context.profile,
      timeoutMs: this.config.timeoutMs,
      url: requestUrl,
    });

    try {
      const response = await fetch(requestUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(this.mapRequest(context)),
        signal: controller.signal,
      });

      if (!response.ok) {
        return this.fallbackFromFailure(context, fallbackDecision, {
          layer: 'infrastructure',
          component: 'python_bot_adapter',
          event: 'python_bot_request_failed',
          status: 'failed',
          profile: context.profile,
          timeoutMs: this.config.timeoutMs,
          url: requestUrl,
          errorType: 'http_error',
          errorMessage: `Python bot service responded with status ${response.status}.`,
        });
      }

      const rawResponse = (await response.json()) as unknown;

      if (!this.isValidRemoteResponse(rawResponse)) {
        return this.fallbackFromFailure(context, fallbackDecision, {
          layer: 'infrastructure',
          component: 'python_bot_adapter',
          event: 'python_bot_response_invalid',
          status: 'failed',
          profile: context.profile,
          timeoutMs: this.config.timeoutMs,
          url: requestUrl,
          errorType: 'invalid_payload',
          errorMessage: 'Python bot service returned an invalid decision payload.',
        });
      }

      const decision = this.mapResponse(rawResponse);

      this.logDebug({
        layer: 'infrastructure',
        component: 'python_bot_adapter',
        event: 'python_bot_request_succeeded',
        status: 'succeeded',
        profile: context.profile,
        timeoutMs: this.config.timeoutMs,
        url: requestUrl,
      });

      return decision;
    } catch (error) {
      return this.fallbackFromFailure(context, fallbackDecision, {
        layer: 'infrastructure',
        component: 'python_bot_adapter',
        event: 'python_bot_request_failed',
        status: 'failed',
        profile: context.profile,
        timeoutMs: this.config.timeoutMs,
        url: requestUrl,
        errorType: this.isAbortError(error) ? 'timeout' : 'transport_error',
        errorMessage:
          error instanceof Error ? error.message : 'Unexpected python bot transport failure.',
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private mapRequest(context: BotDecisionContext): PythonBotDecisionRequest {
    return {
      matchId: context.matchId,
      profile: context.profile,
      viraRank: context.viraRank,
      currentRound: context.currentRound
        ? {
            playerOneCard: context.currentRound.playerOneCard,
            playerTwoCard: context.currentRound.playerTwoCard,
            finished: context.currentRound.finished,
            result: context.currentRound.result,
          }
        : null,
      player: {
        playerId: context.player.playerId,
        hand: [...context.player.hand],
      },
    };
  }

  private mapResponse(response: PythonBotDecisionResponse): BotDecision {
    if (response.action === 'play-card') {
      return {
        action: 'play-card',
        card: response.card,
      };
    }

    return {
      action: 'pass',
      reason: response.reason,
    };
  }

  private isValidRemoteResponse(value: unknown): value is PythonBotDecisionResponse {
    if (!value || typeof value !== 'object') {
      return false;
    }

    const candidate = value as Partial<PythonBotDecisionResponse>;

    if (candidate.action === 'play-card') {
      return typeof candidate.card === 'string' && candidate.card.trim().length > 0;
    }

    if (candidate.action === 'pass') {
      return (
        candidate.reason === 'empty-hand' ||
        candidate.reason === 'missing-round' ||
        candidate.reason === 'unsupported-state'
      );
    }

    return false;
  }

  private fallbackFromFailure(
    context: BotDecisionContext,
    fallbackDecision: BotDecision,
    failureContext: PythonBotFailureContext,
  ): BotDecision {
    this.logWarn(failureContext);

    this.logWarn({
      layer: 'infrastructure',
      component: 'python_bot_adapter',
      event: 'python_bot_fallback_applied',
      status: 'fallback',
      profile: context.profile,
      timeoutMs: this.config.timeoutMs,
      errorType: failureContext.errorType,
      errorMessage: failureContext.errorMessage,
    });

    return fallbackDecision;
  }

  private isAbortError(error: unknown): boolean {
    return error instanceof Error && error.name === 'AbortError';
  }

  private logDebug(context: PythonBotDebugContext): void {
    this.logger.debug(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        ...context,
      }),
    );
  }

  private logWarn(context: PythonBotFailureContext | PythonBotFallbackContext): void {
    this.logger.warn(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        ...context,
      }),
    );
  }
}
