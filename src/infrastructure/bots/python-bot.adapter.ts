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
    // NOTE: The application boundary remains synchronous in Phase 15.
    // Until adapter selection and end-to-end flow are hardened, the remote adapter
    // must degrade safely to the local baseline instead of leaking transport timing
    // concerns into Gateway orchestration.
    if (!this.config.enabled) {
      return this.heuristicBotAdapter.decide(context);
    }

    this.logger.warn(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        layer: 'infrastructure',
        component: 'python_bot_adapter',
        event: 'remote_decision_deferred_to_fallback',
        status: 'fallback',
        baseUrl: this.config.baseUrl,
        timeoutMs: this.config.timeoutMs,
      }),
    );

    return this.heuristicBotAdapter.decide(context);
  }

  // NOTE: The request mapper is introduced now so the HTTP contract is formalized
  // on the TypeScript side before selection wiring starts using it.
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

  // NOTE: Keep the response parser strict so future remote integration cannot
  // silently invent new shapes outside the backend-supported decision space.
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

  // NOTE: This method is intentionally not called by `decide()` yet.
  // The remote HTTP bridge becomes active only after selection wiring and
  // end-to-end validation are introduced in the next steps.
  async requestRemoteDecision(
    context: BotDecisionContext,
  ): Promise<PythonBotDecisionResponse | null> {
    if (!this.config.enabled) {
      return null;
    }

    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetch(`${this.config.baseUrl}/decide`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(this.mapRequest(context)),
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

        return null;
      }

      return data;
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
