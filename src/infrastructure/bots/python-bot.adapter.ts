import { Inject, Injectable, Logger } from '@nestjs/common';

import type {
  BotDecision,
  BotDecisionContext,
  BotDecisionMetadata,
  BotDecisionPort,
  BotDecisionRationale,
  BotDecisionStrategy,
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
  bet?: {
    currentValue: number;
    betState: 'idle' | 'awaiting_response';
    pendingValue: number | null;
    requestedBy: 'P1' | 'P2' | null;
    specialState: 'normal' | 'mao_de_onze' | 'mao_de_ferro';
    specialDecisionPending: boolean;
    availableActions: {
      canRequestTruco: boolean;
      canRaiseToSix: boolean;
      canRaiseToNine: boolean;
      canRaiseToTwelve: boolean;
      canAcceptBet: boolean;
      canDeclineBet: boolean;
      canAcceptMaoDeOnze: boolean;
      canDeclineMaoDeOnze: boolean;
      canAttemptPlayCard: boolean;
    };
  };
};

// Optional rationale payload coming from the python service. Shape mirrors BotDecisionRationale but
// is validated defensively at the adapter boundary: unknown strategy labels trigger invalid_payload
// (which in turn triggers the heuristic-fallback path). This keeps the TS-side union closed while
// letting the python service opt-in to emitting rationale whenever it is ready.
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
      action: 'accept-bet' | 'decline-bet' | 'raise-to-six' | 'raise-to-nine' | 'raise-to-twelve';
      rationale?: PythonBotRationalePayload;
    }
  | {
      action: 'pass';
      reason: 'empty-hand' | 'missing-round' | 'unsupported-state';
      rationale?: PythonBotRationalePayload;
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

// Closed whitelist of strategy labels accepted from the python service. Must stay in sync with
// BotDecisionStrategy in the port. Kept local (not exported from the port) to make the adapter
// solely responsible for normalizing inbound payloads.
const ACCEPTED_REMOTE_STRATEGIES: ReadonlySet<BotDecisionStrategy> = new Set<BotDecisionStrategy>([
  'opening-weakest',
  'opening-middle',
  'opening-strongest',
  'response-winning-weakest',
  'response-winning-strongest',
  'response-losing-weakest',
  'response-losing-middle',
  'response-losing-strongest',
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

  decide(context: BotDecisionContext): BotDecision {
    // Sync entry-point: delegates to the heuristic but rebrands provenance as 'heuristic-fallback'
    // so telemetry distinguishes "heuristic was wired directly" from "python was wired but served
    // via heuristic". The underlying rationale (strategy/handStrength) is preserved as-is.
    const heuristicDecision = this.heuristicBotAdapter.decide(context);

    return this.rebrandAsFallback(heuristicDecision);
  }

  async requestRemoteDecision(context: BotDecisionContext): Promise<BotDecision> {
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

      const rawResponse = (await response.json()) as unknown;

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
      ...(context.bet
        ? {
            bet: {
              currentValue: context.bet.currentValue,
              betState: context.bet.betState,
              pendingValue: context.bet.pendingValue,
              requestedBy: context.bet.requestedBy,
              specialState: context.bet.specialState,
              specialDecisionPending: context.bet.specialDecisionPending,
              availableActions: {
                ...context.bet.availableActions,
              },
            },
          }
        : {}),
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
      // Narrow via the whitelist — isValidRemoteResponse has already rejected unknown labels,
      // but we guard again here to keep the type-narrowing local and explicit.
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
        ((candidate as { card: string }).card).trim().length > 0
      );
    }

    if (
      candidate.action === 'accept-bet' ||
      candidate.action === 'decline-bet' ||
      candidate.action === 'raise-to-six' ||
      candidate.action === 'raise-to-nine' ||
      candidate.action === 'raise-to-twelve'
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

      // Reject unknown strategy labels instead of silently dropping them — this ensures drift
      // between the python service and the TS contract surfaces as invalid_payload (fallback).
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
