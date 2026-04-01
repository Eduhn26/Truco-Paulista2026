import { Inject, Injectable, Logger } from '@nestjs/common';

import type {
  BotDecision,
  BotDecisionContext,
  BotDecisionPort,
} from '@game/application/ports/bot-decision.port';
import { HeuristicBotAdapter } from '@game/infrastructure/bots/heuristic-bot.adapter';
import {
  PYTHON_BOT_CONFIG,
  type PythonBotConfig,
} from '@game/infrastructure/bots/python-bot.config';

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

@Injectable()
export class PythonBotAdapter implements BotDecisionPort {
  private readonly logger = new Logger(PythonBotAdapter.name);

  constructor(
    @Inject(PYTHON_BOT_CONFIG)
    private readonly config: PythonBotConfig,
    private readonly heuristicBotAdapter: HeuristicBotAdapter,
  ) {}

  decide(context: BotDecisionContext): BotDecision {
    // NOTE: The stable application boundary is still synchronous, so this adapter
    // must fail safe and remain explicit about why runtime falls back to the
    // local baseline instead of hiding transport concerns inside orchestration.
    if (!this.config.enabled) {
      this.logger.log(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          layer: 'infrastructure',
          component: 'python_bot_adapter',
          event: 'python_adapter_disabled_fallback_applied',
          status: 'fallback',
          fallbackAdapter: 'heuristic',
        }),
      );

      return this.heuristicBotAdapter.decide(context);
    }

    this.logger.warn(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        layer: 'infrastructure',
        component: 'python_bot_adapter',
        event: 'remote_decision_deferred_to_fallback',
        status: 'fallback',
        fallbackAdapter: 'heuristic',
        baseUrl: this.config.baseUrl,
        timeoutMs: this.config.timeoutMs,
      }),
    );

    return this.heuristicBotAdapter.decide(context);
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

  // NOTE: The remote bridge stays opt-in at the adapter level so runtime
  // observability can mature before the project promotes network I/O into the
  // main bot turn path.
  async requestRemoteDecision(context: BotDecisionContext): Promise<BotDecision | null> {
    if (!this.config.enabled) {
      this.logger.log(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          layer: 'infrastructure',
          component: 'python_bot_adapter',
          event: 'remote_decision_skipped',
          status: 'skipped',
          reason: 'adapter_disabled',
        }),
      );

      return null;
    }

    const requestPayload = this.mapRequest(context);
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), this.config.timeoutMs);

    this.logger.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        layer: 'infrastructure',
        component: 'python_bot_adapter',
        event: 'remote_decision_attempt_started',
        status: 'started',
        baseUrl: this.config.baseUrl,
        timeoutMs: this.config.timeoutMs,
        matchId: requestPayload.matchId,
        profile: requestPayload.profile,
        playerId: requestPayload.player.playerId,
      }),
    );

    try {
      const response = await fetch(`${this.config.baseUrl}/decide`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestPayload),
        signal: controller.signal,
      });

      if (!response.ok) {
        this.logger.warn(
          JSON.stringify({
            timestamp: new Date().toISOString(),
            layer: 'infrastructure',
            component: 'python_bot_adapter',
            event: 'remote_decision_request_failed',
            status: 'failed',
            httpStatus: response.status,
          }),
        );

        this.logger.warn(
          JSON.stringify({
            timestamp: new Date().toISOString(),
            layer: 'infrastructure',
            component: 'python_bot_adapter',
            event: 'remote_decision_fallback_applied',
            status: 'fallback',
            reason: 'http_not_ok',
            fallbackAdapter: 'heuristic',
          }),
        );

        return null;
      }

      const data: unknown = await response.json();

      if (!this.isPythonBotDecisionResponse(data)) {
        this.logger.warn(
          JSON.stringify({
            timestamp: new Date().toISOString(),
            layer: 'infrastructure',
            component: 'python_bot_adapter',
            event: 'remote_decision_response_rejected',
            status: 'rejected',
          }),
        );

        this.logger.warn(
          JSON.stringify({
            timestamp: new Date().toISOString(),
            layer: 'infrastructure',
            component: 'python_bot_adapter',
            event: 'remote_decision_fallback_applied',
            status: 'fallback',
            reason: 'invalid_response_shape',
            fallbackAdapter: 'heuristic',
          }),
        );

        return null;
      }

      const mappedDecision = this.mapResponse(data);

      this.logger.log(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          layer: 'infrastructure',
          component: 'python_bot_adapter',
          event: 'remote_decision_attempt_succeeded',
          status: 'succeeded',
          action: mappedDecision.action,
        }),
      );

      return mappedDecision;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'unknown_error';

      this.logger.warn(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          layer: 'infrastructure',
          component: 'python_bot_adapter',
          event: 'remote_decision_transport_error',
          status: 'failed',
          errorMessage,
        }),
      );

      this.logger.warn(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          layer: 'infrastructure',
          component: 'python_bot_adapter',
          event: 'remote_decision_fallback_applied',
          status: 'fallback',
          reason: 'transport_error',
          fallbackAdapter: 'heuristic',
        }),
      );

      return null;
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  private isPythonBotDecisionResponse(value: unknown): value is PythonBotDecisionResponse {
    if (!value || typeof value !== 'object') {
      return false;
    }

    const candidate = value as Partial<PythonBotDecisionResponse>;

    if (candidate.action === 'play-card') {
      return typeof candidate.card === 'string';
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
}
