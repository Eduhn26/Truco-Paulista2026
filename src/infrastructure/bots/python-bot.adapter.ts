import { Inject, Injectable, Logger } from '@nestjs/common';

import type {
  BotDecision,
  BotDecisionContext,
  BotDecisionMetadata,
  BotDecisionPort,
  BotDecisionRationale,
  BotDecisionStrategy,
  BotPartnerSignalKind,
} from '@game/application/ports/bot-decision.port';
import { HeuristicBotAdapter } from '@game/infrastructure/bots/heuristic-bot.adapter';

import { PYTHON_BOT_CONFIG, type PythonBotConfig } from './python-bot.config';

type PythonBotDecisionRequest = Pick<
  BotDecisionContext,
  'matchId' | 'profile' | 'viraRank' | 'currentRound' | 'player'
> &
  Partial<
    Pick<
      BotDecisionContext,
      | 'mode'
      | 'actorSeatId'
      | 'actorTeamId'
      | 'partnerSeatId'
      | 'partnerSignal'
      | 'partnerSignals'
      | 'bet'
      | 'score'
      | 'handProgress'
    >
  >;

// Rationale is validated at the adapter boundary so the TypeScript decision contract stays closed.
type PythonBotRationalePayload = {
  handStrength?: number;
  strategy?: string;
};

type PythonBotDecisionResponse =
  | {
      action: 'play-card';
      card: string;
      rationale?: PythonBotRationalePayload;
    }
  | {
      action:
        | 'accept-bet'
        | 'decline-bet'
        | 'request-truco'
        | 'raise-to-six'
        | 'raise-to-nine'
        | 'raise-to-twelve'
        | 'accept-mao-de-onze'
        | 'decline-mao-de-onze';
      rationale?: PythonBotRationalePayload;
    }
  | {
      action: 'pass';
      reason: 'empty-hand' | 'missing-round' | 'unsupported-state';
      rationale?: PythonBotRationalePayload;
    };

type PythonBotFailureType =
  | 'timeout'
  | 'http_error'
  | 'invalid_payload'
  | 'unsupported_state'
  | 'transport_error';

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

// The adapter owns remote strategy normalization before mapping into BotDecisionStrategy.
const ACCEPTED_REMOTE_STRATEGIES: ReadonlySet<BotDecisionStrategy> = new Set<BotDecisionStrategy>([
  'opening-weakest',
  'opening-middle',
  'opening-strongest',
  'response-winning-weakest',
  'response-winning-strongest',
  'response-losing-weakest',
  'response-losing-middle',
  'response-losing-strongest',
  'two-versus-two-partner-winning-save-weakest',
  'two-versus-two-response-losing-save-weakest',
  'two-versus-two-signal-hold-save-weakest',
  'two-versus-two-signal-kill-round-weakest-winner',
  'two-versus-two-opening-after-first-win-pressure',
  'two-versus-two-opening-after-first-win-save-weakest',
  'bet-accept',
  'bet-decline',
  'bet-raise',
  'bet-no-response',
  'empty-hand',
  'missing-round',
  'unsupported-state',
]);

@Injectable()
export class PythonBotAdapter implements BotDecisionPort {
  private readonly logger = new Logger(PythonBotAdapter.name);

  constructor(
    @Inject(PYTHON_BOT_CONFIG)
    private readonly config: PythonBotConfig,
    private readonly heuristicBotAdapter: HeuristicBotAdapter,
  ) {}

  async decide(context: BotDecisionContext): Promise<BotDecision> {
    return this.requestRemoteDecision(context);
  }

  private async requestRemoteDecision(context: BotDecisionContext): Promise<BotDecision> {
    const heuristicDecision = this.heuristicBotAdapter.decide(context);

    if (!this.config.enabled) {
      this.logDebug({
        layer: 'infrastructure',
        component: 'python_bot_adapter',
        event: 'python_bot_disabled',
        status: 'skipped',
        profile: context.profile,
        timeoutMs: this.config.timeoutMs,
      });

      return this.rebrandAsFallback(heuristicDecision);
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
        return this.fallbackFromFailure(context, heuristicDecision, {
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

      let rawResponse: unknown;

      try {
        rawResponse = (await response.json()) as unknown;
      } catch {
        return this.fallbackFromFailure(context, heuristicDecision, {
          layer: 'infrastructure',
          component: 'python_bot_adapter',
          event: 'python_bot_response_invalid',
          status: 'failed',
          profile: context.profile,
          timeoutMs: this.config.timeoutMs,
          url: requestUrl,
          errorType: 'invalid_payload',
          errorMessage: 'Python bot service returned invalid JSON.',
        });
      }

      if (!this.isValidRemoteResponse(rawResponse)) {
        return this.fallbackFromFailure(context, heuristicDecision, {
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

      const semanticRejection = this.getRemoteDecisionRejection(context, rawResponse);

      if (semanticRejection) {
        return this.fallbackFromFailure(context, heuristicDecision, {
          layer: 'infrastructure',
          component: 'python_bot_adapter',
          event: 'python_bot_response_invalid',
          status: 'failed',
          profile: context.profile,
          timeoutMs: this.config.timeoutMs,
          url: requestUrl,
          ...semanticRejection,
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
      return this.fallbackFromFailure(context, heuristicDecision, {
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
      ...(context.mode ? { mode: context.mode } : {}),
      ...(context.actorSeatId ? { actorSeatId: context.actorSeatId } : {}),
      ...(context.actorTeamId ? { actorTeamId: context.actorTeamId } : {}),
      ...(context.partnerSeatId !== undefined ? { partnerSeatId: context.partnerSeatId } : {}),
      viraRank: context.viraRank,
      currentRound: context.currentRound
        ? {
            ...context.currentRound,
            ...(context.currentRound.seatPlays
              ? { seatPlays: { ...context.currentRound.seatPlays } }
              : {}),
            ...(context.currentRound.orderedPlays
              ? {
                  orderedPlays: context.currentRound.orderedPlays.map((play) => ({
                    ...play,
                  })),
                }
              : {}),
          }
        : null,
      player: {
        playerId: context.player.playerId,
        hand: [...context.player.hand],
      },
      ...(context.partnerSignal
        ? {
            partnerSignal: {
              ...context.partnerSignal,
            },
          }
        : {}),
      ...(context.partnerSignals
        ? {
            partnerSignals: {
              ...(context.partnerSignals.handMemory
                ? { handMemory: { ...context.partnerSignals.handMemory } }
                : {}),
              ...(context.partnerSignals.roundTactic
                ? { roundTactic: { ...context.partnerSignals.roundTactic } }
                : {}),
              ...(context.partnerSignals.betIntent
                ? { betIntent: { ...context.partnerSignals.betIntent } }
                : {}),
            },
          }
        : {}),
      ...(context.bet
        ? {
            bet: {
              ...context.bet,
              availableActions: {
                ...context.bet.availableActions,
              },
            },
          }
        : {}),
      ...(context.score ? { score: { ...context.score } } : {}),
      ...(context.handProgress ? { handProgress: { ...context.handProgress } } : {}),
    };
  }

  private mapResponse(response: PythonBotDecisionResponse): BotDecision {
    const metadata: BotDecisionMetadata = {
      source: 'python-remote',
      ...(this.buildRationaleFromPayload(response.rationale) !== undefined
        ? { rationale: this.buildRationaleFromPayload(response.rationale)! }
        : {}),
    };

    if (response.action === 'play-card') {
      return {
        action: 'play-card',
        card: response.card,
        metadata,
      };
    }

    if (response.action === 'pass') {
      return {
        action: 'pass',
        reason: response.reason,
        metadata,
      };
    }

    return {
      action: response.action,
      metadata,
    };
  }

  private buildRationaleFromPayload(
    payload: PythonBotRationalePayload | undefined,
  ): BotDecisionRationale | undefined {
    if (!payload) {
      return undefined;
    }

    const rationale: BotDecisionRationale = {};

    if (typeof payload.handStrength === 'number' && Number.isFinite(payload.handStrength)) {
      rationale.handStrength = payload.handStrength;
    }

    if (typeof payload.strategy === 'string') {
      // Keep the type narrowing local even though invalid strategies are rejected earlier.
      if (ACCEPTED_REMOTE_STRATEGIES.has(payload.strategy as BotDecisionStrategy)) {
        rationale.strategy = payload.strategy as BotDecisionStrategy;
      }
    }

    if (rationale.handStrength === undefined && rationale.strategy === undefined) {
      return undefined;
    }

    return rationale;
  }

  private isValidRemoteResponse(value: unknown): value is PythonBotDecisionResponse {
    if (!value || typeof value !== 'object') {
      return false;
    }

    const candidate = value as Partial<PythonBotDecisionResponse> & {
      rationale?: unknown;
    };

    if (!this.isValidRationalePayload(candidate.rationale)) {
      return false;
    }

    if (candidate.action === 'play-card') {
      return (
        typeof (candidate as { card?: unknown }).card === 'string' &&
        (candidate as { card: string }).card.trim().length > 0
      );
    }

    if (
      candidate.action === 'accept-bet' ||
      candidate.action === 'decline-bet' ||
      candidate.action === 'request-truco' ||
      candidate.action === 'raise-to-six' ||
      candidate.action === 'raise-to-nine' ||
      candidate.action === 'raise-to-twelve' ||
      candidate.action === 'accept-mao-de-onze' ||
      candidate.action === 'decline-mao-de-onze'
    ) {
      return true;
    }

    if (candidate.action === 'pass') {
      const reason = (candidate as { reason?: unknown }).reason;

      return (
        reason === 'empty-hand' || reason === 'missing-round' || reason === 'unsupported-state'
      );
    }

    return false;
  }

  private getRemoteDecisionRejection(
    context: BotDecisionContext,
    decision: PythonBotDecisionResponse,
  ): Pick<PythonBotFailureContext, 'errorType' | 'errorMessage'> | null {
    if (decision.action === 'pass') {
      if (decision.reason === 'unsupported-state') {
        return {
          errorType: 'unsupported_state',
          errorMessage: 'Python bot service does not support the current decision state.',
        };
      }

      if (decision.reason === 'empty-hand' && context.player.hand.length > 0) {
        return {
          errorType: 'invalid_payload',
          errorMessage: 'Python bot service returned empty-hand for a non-empty hand.',
        };
      }

      if (decision.reason === 'missing-round' && context.currentRound !== null) {
        return {
          errorType: 'invalid_payload',
          errorMessage: 'Python bot service returned missing-round while a round exists.',
        };
      }

      return null;
    }

    if (decision.action === 'play-card') {
      if (!context.player.hand.includes(decision.card)) {
        return {
          errorType: 'invalid_payload',
          errorMessage: `Python bot service selected a card outside the bot hand: ${decision.card}.`,
        };
      }

      if (context.bet && !context.bet.availableActions.canAttemptPlayCard) {
        return {
          errorType: 'invalid_payload',
          errorMessage: 'Python bot service attempted to play a card while card play is unavailable.',
        };
      }

      return null;
    }

    const availableActions = context.bet?.availableActions;

    if (!availableActions) {
      return {
        errorType: 'invalid_payload',
        errorMessage: `Python bot service returned ${decision.action} without betting context.`,
      };
    }

    const isAvailable =
      (decision.action === 'request-truco' && availableActions.canRequestTruco) ||
      (decision.action === 'raise-to-six' && availableActions.canRaiseToSix) ||
      (decision.action === 'raise-to-nine' && availableActions.canRaiseToNine) ||
      (decision.action === 'raise-to-twelve' && availableActions.canRaiseToTwelve) ||
      (decision.action === 'accept-bet' && availableActions.canAcceptBet) ||
      (decision.action === 'decline-bet' && availableActions.canDeclineBet) ||
      (decision.action === 'accept-mao-de-onze' && availableActions.canAcceptMaoDeOnze) ||
      (decision.action === 'decline-mao-de-onze' && availableActions.canDeclineMaoDeOnze);

    if (!isAvailable) {
      return {
        errorType: 'invalid_payload',
        errorMessage: `Python bot service returned an unavailable action: ${decision.action}.`,
      };
    }

    return null;
  }

  private isValidRationalePayload(value: unknown): boolean {
    if (value === undefined || value === null) {
      return true;
    }

    if (typeof value !== 'object') {
      return false;
    }

    const candidate = value as { handStrength?: unknown; strategy?: unknown };

    if (candidate.handStrength !== undefined) {
      if (typeof candidate.handStrength !== 'number' || !Number.isFinite(candidate.handStrength)) {
        return false;
      }
    }

    if (candidate.strategy !== undefined) {
      if (typeof candidate.strategy !== 'string') {
        return false;
      }

      // Unknown strategy labels must surface as invalid payloads instead of being ignored.
      if (!ACCEPTED_REMOTE_STRATEGIES.has(candidate.strategy as BotDecisionStrategy)) {
        return false;
      }
    }

    return true;
  }

  private rebrandAsFallback(decision: BotDecision): BotDecision {
    const previousRationale = decision.metadata?.rationale;
    const metadata: BotDecisionMetadata = {
      source: 'heuristic-fallback',
      ...(previousRationale ? { rationale: previousRationale } : {}),
    };

    if (decision.action === 'play-card') {
      return {
        action: 'play-card',
        card: decision.card,
        metadata,
      };
    }

    if (decision.action === 'pass') {
      return {
        action: 'pass',
        reason: decision.reason,
        metadata,
      };
    }

    return {
      action: decision.action,
      metadata,
    };
  }

  private fallbackFromFailure(
    context: BotDecisionContext,
    heuristicDecision: BotDecision,
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

    return this.rebrandAsFallback(heuristicDecision);
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
