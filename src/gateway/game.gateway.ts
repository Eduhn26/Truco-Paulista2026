import { Inject, Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  type WsResponse,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';

import type { ViewMatchStateResponseDto } from '@game/application/dtos/responses/view-match-state.response.dto';
import type {
  CreateMatchRequestDto,
  MatchMode,
} from '@game/application/dtos/requests/create-match.request.dto';
import type { CreateMatchResponseDto } from '@game/application/dtos/responses/create-match.response.dto';
import type { AcceptBetRequestDto } from '@game/application/dtos/requests/accept-bet.request.dto';
import type { AcceptMaoDeOnzeRequestDto } from '@game/application/dtos/requests/accept-mao-de-onze.request.dto';
import type { DeclineBetRequestDto } from '@game/application/dtos/requests/decline-bet.request.dto';
import type { DeclineMaoDeOnzeRequestDto } from '@game/application/dtos/requests/decline-mao-de-onze.request.dto';
import type { PlayCardRequestDto } from '@game/application/dtos/requests/play-card.request.dto';
import type { RaiseToNineRequestDto } from '@game/application/dtos/requests/raise-to-nine.request.dto';
import type { RaiseToSixRequestDto } from '@game/application/dtos/requests/raise-to-six.request.dto';
import type { RaiseToTwelveRequestDto } from '@game/application/dtos/requests/raise-to-twelve.request.dto';
import type { RequestTrucoRequestDto } from '@game/application/dtos/requests/request-truco.request.dto';
import type { StartHandRequestDto } from '@game/application/dtos/requests/start-hand.request.dto';
import type {
  CreateMatchRecordInputDto,
  HistoricalMatchMode,
  HistoricalPlayerId,
  MatchReplayEventDto,
} from '@game/application/dtos/match-record.dto';
import {
  BOT_DECISION_PORT,
  type BotDecision,
  type BotDecisionContext,
  type BotDecisionMetadata,
  type BotDecisionPort,
  type BotHandProgressView,
  type BotProfile,
  type BotRoundView,
} from '@game/application/ports/bot-decision.port';
import { readGatewayCorsOrigin } from '@game/application/runtime/env/runtime-config';
import { AcceptBetUseCase } from '@game/application/use-cases/accept-bet.use-case';
import { AcceptMaoDeOnzeUseCase } from '@game/application/use-cases/accept-mao-de-onze.use-case';
import { CreateMatchUseCase } from '@game/application/use-cases/create-match.use-case';
import { DeclineBetUseCase } from '@game/application/use-cases/decline-bet.use-case';
import { DeclineMaoDeOnzeUseCase } from '@game/application/use-cases/decline-mao-de-onze.use-case';
import { GetMatchHistoryUseCase } from '@game/application/use-cases/get-match-history.use-case';
import { GetMatchReplayUseCase } from '@game/application/use-cases/get-match-replay.use-case';
import { GetOrCreatePlayerProfileUseCase } from '@game/application/use-cases/get-or-create-player-profile.use-case';
import { GetOrCreateUserUseCase } from '@game/application/use-cases/get-or-create-user.use-case';
import { GetRankingUseCase } from '@game/application/use-cases/get-ranking.use-case';
import { PlayCardUseCase } from '@game/application/use-cases/play-card.use-case';
import { RaiseToNineUseCase } from '@game/application/use-cases/raise-to-nine.use-case';
import { RaiseToSixUseCase } from '@game/application/use-cases/raise-to-six.use-case';
import { RaiseToTwelveUseCase } from '@game/application/use-cases/raise-to-twelve.use-case';
import { RequestTrucoUseCase } from '@game/application/use-cases/request-truco.use-case';
import { SaveMatchRecordUseCase } from '@game/application/use-cases/save-match-record.use-case';
import { StartHandUseCase } from '@game/application/use-cases/start-hand.use-case';
import { UpdateRatingUseCase } from '@game/application/use-cases/update-rating.use-case';
import { ViewMatchStateUseCase } from '@game/application/use-cases/view-match-state.use-case';
import { AuthTokenService } from '@game/auth/auth-token.service';
import { DomainError } from '@game/domain/exceptions/domain-error';

import { GatewayMatchmakingService } from './matchmaking/gateway-matchmaking.service';
import type {
  MatchmakingMode,
  MatchmakingObservabilitySnapshot,
  PendingFallbackState,
  QueueSnapshot,
} from './matchmaking/matchmaking-queue-manager';
import type { MatchmakingPair } from './matchmaking/matchmaking-pairing-policy';
import { RoomManager, type SeatId } from './multiplayer/room-manager';

type GatewayErrorCode =
  | 'validation_error'
  | 'transport_error'
  | 'domain_error'
  | 'unexpected_error';

type ErrorResponseDto = {
  code: GatewayErrorCode;
  message: string;
};

type CreateMatchPayload = {
  pointsToWin?: unknown;
  mode?: unknown;
};

type StartHandPayload = {
  matchId?: unknown;
  viraRank?: unknown;
};

type PlayCardPayload = {
  matchId?: unknown;
  card?: {
    rank?: unknown;
    suit?: unknown;
  };
};

type GetStatePayload = {
  matchId?: unknown;
};

type JoinMatchPayload = {
  matchId?: unknown;
};

type SetReadyPayload = {
  ready?: unknown;
};

type GetRankingPayload = {
  limit?: unknown;
};

type GetMatchHistoryPayload = {
  userId?: unknown;
  limit?: unknown;
};

type GetMatchReplayPayload = {
  matchId?: unknown;
};

type JoinQueuePayload = {
  mode?: unknown;
};

type GetQueueStatePayload = {
  mode?: unknown;
};

type QueueLeftResponseDto = {
  left: boolean;
  mode?: MatchmakingMode;
  snapshot?: QueueSnapshot;
};

type MatchFoundResponseDto = {
  matchId: string;
  mode: MatchmakingMode;
  players: Array<{
    userId: string;
    playerToken: string;
    rating: number;
  }>;
};

type FallbackStateResponseDto = {
  hasPendingFallback: boolean;
  fallback?: {
    mode: MatchmakingMode;
    rating: number;
    timedOutAt: number;
    availableActions: ['continue-queue', 'start-bot-match', 'decline-fallback'];
  };
};

type ContinueQueueResponseDto = {
  resumed: boolean;
  snapshot?: QueueSnapshot;
  matchFound?: MatchFoundResponseDto;
};

type BotMatchCreatedResponseDto = {
  matchId: string;
  mode: MatchmakingMode;
};

type DeclineFallbackResponseDto = {
  declined: boolean;
};

type MatchmakingSnapshotResponseDto = {
  snapshot: MatchmakingObservabilitySnapshot;
};

type GatewayLogContext = {
  layer: 'gateway';
  event:
    | 'socket_connected'
    | 'socket_disconnected'
    | 'socket_disconnected_without_match'
    | 'create_match_requested'
    | 'create_match_succeeded'
    | 'create_match_rejected'
    | 'join_match_requested'
    | 'join_match_succeeded'
    | 'join_match_rejected'
    | 'join_queue_requested'
    | 'join_queue_succeeded'
    | 'join_queue_rejected'
    | 'queue_timeout'
    | 'get_matchmaking_snapshot_requested'
    | 'get_matchmaking_snapshot_succeeded'
    | 'get_fallback_state_requested'
    | 'get_fallback_state_succeeded'
    | 'continue_queue_requested'
    | 'continue_queue_succeeded'
    | 'continue_queue_rejected'
    | 'start_bot_match_requested'
    | 'start_bot_match_succeeded'
    | 'start_bot_match_rejected'
    | 'decline_fallback_requested'
    | 'decline_fallback_succeeded'
    | 'decline_fallback_rejected'
    | 'match_found'
    | 'leave_queue_requested'
    | 'leave_queue_succeeded'
    | 'leave_queue_rejected'
    | 'get_queue_state_requested'
    | 'get_queue_state_succeeded'
    | 'get_queue_state_rejected'
    | 'set_ready_requested'
    | 'set_ready_succeeded'
    | 'set_ready_rejected'
    | 'start_hand_requested'
    | 'start_hand_succeeded'
    | 'start_hand_rejected'
    | 'play_card_requested'
    | 'play_card_succeeded'
    | 'play_card_rejected'
    | 'request_truco_requested'
    | 'request_truco_succeeded'
    | 'request_truco_rejected'
    | 'accept_bet_requested'
    | 'accept_bet_succeeded'
    | 'accept_bet_rejected'
    | 'decline_bet_requested'
    | 'decline_bet_succeeded'
    | 'decline_bet_rejected'
    | 'raise_to_six_requested'
    | 'raise_to_six_succeeded'
    | 'raise_to_six_rejected'
    | 'raise_to_nine_requested'
    | 'raise_to_nine_succeeded'
    | 'raise_to_nine_rejected'
    | 'raise_to_twelve_requested'
    | 'raise_to_twelve_succeeded'
    | 'raise_to_twelve_rejected'
    | 'accept_mao_de_onze_requested'
    | 'accept_mao_de_onze_succeeded'
    | 'accept_mao_de_onze_rejected'
    | 'decline_mao_de_onze_requested'
    | 'decline_mao_de_onze_succeeded'
    | 'decline_mao_de_onze_rejected'
    | 'match_finished'
    | 'save_match_record_succeeded'
    | 'save_match_record_rejected'
    | 'get_ranking_requested'
    | 'get_ranking_succeeded'
    | 'get_ranking_rejected'
    | 'get_match_history_requested'
    | 'get_match_history_succeeded'
    | 'get_match_history_rejected'
    | 'get_match_replay_requested'
    | 'get_match_replay_succeeded'
    | 'get_match_replay_rejected'
    | 'get_state_requested'
    | 'get_state_succeeded'
    | 'get_state_rejected';
  status: 'started' | 'succeeded' | 'rejected' | 'connected' | 'disconnected';
  socketId?: string;
  userId?: string;
  matchId?: string;
  seatId?: string;
  teamId?: string;
  playerId?: string;
  playerTokenSuffix?: string;
  pointsToWin?: number;
  viraRank?: string;
  card?: string;
  limit?: number;
  mode?: MatchmakingMode;
  rating?: number;
  queueSize?: number;
  errorType?: GatewayErrorCode;
  errorMessage?: string;
};

type RejectContext = Omit<
  GatewayLogContext,
  'layer' | 'event' | 'status' | 'errorMessage' | 'errorType'
>;

type ResolvedHandshakeIdentity = {
  userId: string;
  playerToken: string;
};

type BotTurnDecisionActor = {
  seatId: string;
  teamId: 'T1' | 'T2';
  playerId: 'P1' | 'P2';
};

type BotTurnDecisionContext = BotTurnDecisionActor & {
  context: BotDecisionContext;
};

type BotDecisionTelemetry = {
  seatId: string;
  teamId: 'T1' | 'T2';
  playerId: 'P1' | 'P2';
  profile: BotProfile;
  action: BotDecision['action'];
  source: 'heuristic' | 'python-remote' | 'heuristic-fallback' | 'unknown';
  strategy?: string;
  handStrength?: number;
  reason?: string;
  occurredAt: string;
};

type RoundTransitionPhase = 'round-resolved' | 'next-round-opened';

type RoundTransitionPayload = {
  matchId: string;
  phase: RoundTransitionPhase;
  roundWinner: 'P1' | 'P2' | 'TIE' | null;
  finishedRoundsCount: number;
  totalRoundsCount: number;
  handContinues: boolean;
  openingSeatId: string | null;
  currentTurnSeatId: string | null;
  triggeredBy?: {
    seatId: string;
    teamId: 'T1' | 'T2';
    playerId: 'P1' | 'P2';
    isBot: boolean;
  };
};

type CardPlayedActor = {
  seatId: string;
  teamId: 'T1' | 'T2';
  playerId: 'P1' | 'P2';
  isBot: boolean;
};

// [AÇÃO B] Aumentado de 900 para 1800 — dá tempo ao frontend de exibir a
// resolução da rodada (hold ~1600ms) antes que o bot jogue a próxima carta.
const BOT_CHAINED_TURN_DELAY_MS = 1800;

// NOTE: Round-resolution state sync is intentionally delayed so clients can
// render card settle + WIN/PERDEU/EMPATE climax + clean-frame before receiving
// the next playable round or hand-finished state. This keeps the backend
// authoritative while separating game truth from visual pacing.
const ROUND_RESOLUTION_STATE_SYNC_DELAY_MS = 2050;

// [NEW] Pacing diferenciado para respostas de aposta — um bot "pensante" varia
// o tempo de resposta conforme a complexidade da decisão. Mantém a partida
// menos robótica sem mover decisão de jogo para o frontend.
const BOT_BET_RESPONSE_DELAY_MS = {
  accept: 1200,
  decline: 1400,
  raise: 2200,
  initiative: 2600,
} as const;

type BotBetPacingKind = keyof typeof BOT_BET_RESPONSE_DELAY_MS;

type BotBetAction =
  | 'accept-bet'
  | 'decline-bet'
  | 'request-truco'
  | 'raise-to-six'
  | 'raise-to-nine'
  | 'raise-to-twelve';

@WebSocketGateway({
  cors: {
    origin: readGatewayCorsOrigin(),
    credentials: true,
  },
})
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  private readonly server!: Server;

  private readonly logger = new Logger(GameGateway.name);
  private readonly scheduledBotTurns = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly pendingStartHands = new Set<string>();
  private readonly lastBotDecisionByMatch = new Map<string, BotDecisionTelemetry>();

  constructor(
    private readonly createMatchUseCase: CreateMatchUseCase,
    private readonly startHandUseCase: StartHandUseCase,
    private readonly playCardUseCase: PlayCardUseCase,
    private readonly requestTrucoUseCase: RequestTrucoUseCase,
    private readonly acceptBetUseCase: AcceptBetUseCase,
    private readonly declineBetUseCase: DeclineBetUseCase,
    private readonly acceptMaoDeOnzeUseCase: AcceptMaoDeOnzeUseCase,
    private readonly declineMaoDeOnzeUseCase: DeclineMaoDeOnzeUseCase,
    private readonly raiseToSixUseCase: RaiseToSixUseCase,
    private readonly raiseToNineUseCase: RaiseToNineUseCase,
    private readonly raiseToTwelveUseCase: RaiseToTwelveUseCase,
    private readonly viewMatchStateUseCase: ViewMatchStateUseCase,
    private readonly saveMatchRecordUseCase: SaveMatchRecordUseCase,
    private readonly getOrCreatePlayerProfileUseCase: GetOrCreatePlayerProfileUseCase,
    private readonly updateRatingUseCase: UpdateRatingUseCase,
    private readonly getRankingUseCase: GetRankingUseCase,
    private readonly getMatchHistoryUseCase: GetMatchHistoryUseCase,
    private readonly getMatchReplayUseCase: GetMatchReplayUseCase,
    private readonly getOrCreateUserUseCase: GetOrCreateUserUseCase,
    private readonly authTokenService: AuthTokenService,
    private readonly roomManager: RoomManager,
    private readonly gatewayMatchmakingService: GatewayMatchmakingService,
    @Inject(BOT_DECISION_PORT)
    private readonly botDecisionPort: BotDecisionPort,
  ) {}

  private formatGatewayLog(context: GatewayLogContext): string {
    return JSON.stringify({
      timestamp: new Date().toISOString(),
      ...context,
    });
  }

  private logGateway(level: 'debug' | 'log' | 'warn', context: GatewayLogContext): void {
    const message = this.formatGatewayLog(context);

    if (level === 'debug') {
      this.logger.debug(message);
      return;
    }

    if (level === 'warn') {
      this.logger.warn(message);
      return;
    }

    this.logger.log(message);
  }

  private async delay(ms: number): Promise<void> {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  private maskPlayerToken(playerToken: string): string {
    return playerToken.length <= 6 ? playerToken : playerToken.slice(-6);
  }

  private reject(
    event: GatewayLogContext['event'],
    message: string,
    context: RejectContext,
    errorType: GatewayErrorCode,
  ): WsResponse<ErrorResponseDto> {
    this.logGateway('warn', {
      layer: 'gateway',
      event,
      status: 'rejected',
      errorType,
      errorMessage: message,
      ...context,
    });

    return {
      event: 'error',
      data: {
        code: errorType,
        message,
      },
    };
  }

  private rejectFromError(
    event: GatewayLogContext['event'],
    error: unknown,
    context: RejectContext,
  ): WsResponse<ErrorResponseDto> {
    if (error instanceof DomainError) {
      return this.reject(event, error.message, context, 'domain_error');
    }

    const message = error instanceof Error ? error.message : 'Unknown error';

    return this.reject(event, message, context, 'unexpected_error');
  }

  private readHandshakeAuthValue(socket: Socket, key: 'token' | 'authToken'): string | undefined {
    const rawValue = (socket.handshake as { auth?: Record<string, unknown> })?.auth?.[key];

    if (typeof rawValue !== 'string') {
      return undefined;
    }

    const normalizedValue = rawValue.trim();

    return normalizedValue || undefined;
  }

  private extractPlayerToken(socket: Socket): string {
    const playerToken = this.readHandshakeAuthValue(socket, 'token');

    if (!playerToken) {
      throw new Error('Missing player token. Provide it via Socket.IO handshake auth.token.');
    }

    return playerToken;
  }

  private resolveAuthenticatedUserId(authToken: string): string {
    const payload = this.authTokenService.verifyToken(authToken);

    return payload.sub;
  }

  private async resolveLegacyUserId(playerToken: string): Promise<string> {
    const result = await this.getOrCreateUserUseCase.execute({
      provider: 'legacy-socket',
      providerUserId: playerToken,
      displayName: `Legacy ${playerToken}`,
    });

    return result.user.id;
  }

  private async resolveHandshakeIdentity(socket: Socket): Promise<ResolvedHandshakeIdentity> {
    const authToken = this.readHandshakeAuthValue(socket, 'authToken');

    if (authToken) {
      const userId = this.resolveAuthenticatedUserId(authToken);

      return {
        userId,
        playerToken: `auth:${userId}`,
      };
    }

    const playerToken = this.extractPlayerToken(socket);
    const userId = await this.resolveLegacyUserId(playerToken);

    return {
      userId,
      playerToken,
    };
  }

  private normalizeMode(value: unknown): MatchMode | undefined {
    if (value === undefined) {
      return undefined;
    }

    if (value === '1v1' || value === '2v2') {
      return value;
    }

    return null as never;
  }

  private normalizeRequiredQueueMode(value: unknown): MatchmakingMode | null {
    const mode = this.normalizeMode(value);

    if (mode === '1v1' || mode === '2v2') {
      return mode;
    }

    return null;
  }

  private resolveViewerPlayerId(socketId: string, matchId: string): 'P1' | 'P2' | undefined {
    const session = this.roomManager.getSessionBySocketId(socketId);

    if (!session || session.matchId !== matchId) {
      return undefined;
    }

    return session.domainPlayerId;
  }

  private async getAuthoritativeMatchState(matchId: string): Promise<ViewMatchStateResponseDto> {
    return this.viewMatchStateUseCase.execute({ matchId });
  }

  private canStartSubsequentHand(state: ViewMatchStateResponseDto): boolean {
    return state.state === 'waiting' && Boolean(state.currentHand?.finished);
  }

  private toPublicMatchState(state: ViewMatchStateResponseDto): ViewMatchStateResponseDto {
    if (!state.currentHand) {
      return state;
    }

    return {
      ...state,
      currentHand: {
        ...state.currentHand,
        viewerPlayerId: null,
        playerOneHand: state.currentHand.playerOneHand.map(() => 'HIDDEN'),
        playerTwoHand: state.currentHand.playerTwoHand.map(() => 'HIDDEN'),
      },
    };
  }

  private async emitPublicMatchState(matchId: string): Promise<ViewMatchStateResponseDto> {
    const authoritativeState = await this.getAuthoritativeMatchState(matchId);
    const publicState = this.toPublicMatchState(authoritativeState);

    this.server.to(matchId).emit('match-state', publicState);

    return authoritativeState;
  }

  private async emitPrivateMatchState(matchId: string): Promise<void> {
    const humanSessions = this.roomManager.getHumanSessions(matchId);

    await Promise.all(
      humanSessions.map(async (session) => {
        const privateState = await this.viewMatchStateUseCase.execute({
          matchId,
          viewerPlayerId: session.domainPlayerId,
        });

        this.server.to(session.socketId).emit('match-state:private', privateState);
      }),
    );
  }

  private emitRoomState(matchId: string): void {
    this.server
      .to(matchId)
      .emit(
        'room-state',
        this.withBotDecisionTelemetry(matchId, this.roomManager.getState(matchId)),
      );
  }

  private withBotDecisionTelemetry<T extends object>(
    matchId: string,
    roomState: T,
  ): T & { lastBotDecision: BotDecisionTelemetry | null } {
    return {
      ...roomState,
      lastBotDecision: this.lastBotDecisionByMatch.get(matchId) ?? null,
    };
  }

  private clearBotDecisionTelemetry(matchId: string): void {
    this.lastBotDecisionByMatch.delete(matchId);
  }

  private resolveDecisionSource(
    metadata?: BotDecisionMetadata,
  ): 'heuristic' | 'python-remote' | 'heuristic-fallback' | 'unknown' {
    return metadata?.source ?? 'unknown';
  }

  private buildFallbackMaoDeOnzeDecision(metadata: BotDecisionMetadata | undefined): BotDecision {
    if (!metadata) {
      return { action: 'accept-mao-de-onze' };
    }

    return {
      action: 'accept-mao-de-onze',
      metadata,
    };
  }

  private rememberBotDecision(
    matchId: string,
    botTurnContext: BotTurnDecisionContext,
    decision: BotDecision,
  ): void {
    const metadata = decision.metadata;

    this.lastBotDecisionByMatch.set(matchId, {
      seatId: botTurnContext.seatId,
      teamId: botTurnContext.teamId,
      playerId: botTurnContext.playerId,
      profile: botTurnContext.context.profile,
      action: decision.action,
      source: this.resolveDecisionSource(metadata),
      ...(metadata?.rationale?.strategy ? { strategy: metadata.rationale.strategy } : {}),
      ...(metadata?.rationale?.handStrength !== undefined
        ? { handStrength: metadata.rationale.handStrength }
        : {}),
      ...(decision.action === 'pass' ? { reason: decision.reason } : {}),
      occurredAt: new Date().toISOString(),
    });
  }

  private async emitSyncedMatchState(matchId: string): Promise<ViewMatchStateResponseDto> {
    const state = await this.emitPublicMatchState(matchId);
    await this.emitPrivateMatchState(matchId);

    return state;
  }

  private async continueAutomaticGameFlow(
    matchId: string,
    botFollowUpDelayMs?: number,
  ): Promise<ViewMatchStateResponseDto> {
    this.emitRoomState(matchId);

    const state = await this.emitSyncedMatchState(matchId);
    await this.finalizeMatchIfFinished(matchId, state);

    if (state.state !== 'in_progress') {
      return state;
    }

    const hasPendingBotAction = Boolean(await this.buildBotDecisionContext(matchId, state));

    if (!hasPendingBotAction) {
      return state;
    }

    this.clearScheduledBotTurn(matchId);
    this.scheduleDeferredBotTurn(matchId, botFollowUpDelayMs);

    return this.getAuthoritativeMatchState(matchId);
  }

  private acquireStartHandLock(matchId: string): boolean {
    if (this.pendingStartHands.has(matchId)) {
      return false;
    }

    this.pendingStartHands.add(matchId);

    return true;
  }

  private releaseStartHandLock(matchId: string): void {
    this.pendingStartHands.delete(matchId);
  }

  private isHandCurrentlyInProgress(state: ViewMatchStateResponseDto): boolean {
    return (
      state.state === 'in_progress' && Boolean(state.currentHand) && !state.currentHand?.finished
    );
  }

  private didOpenNewRound(
    previousState: ViewMatchStateResponseDto,
    updatedState: ViewMatchStateResponseDto,
  ): boolean {
    const previousRounds = previousState.currentHand?.rounds ?? [];
    const updatedRounds = updatedState.currentHand?.rounds ?? [];

    return updatedRounds.length > previousRounds.length;
  }

  private clearScheduledBotTurn(matchId: string): void {
    const timeout = this.scheduledBotTurns.get(matchId);

    if (!timeout) {
      return;
    }

    clearTimeout(timeout);
    this.scheduledBotTurns.delete(matchId);
  }

  private scheduleDeferredBotTurn(matchId: string, delayMs?: number): void {
    if (this.scheduledBotTurns.has(matchId)) {
      return;
    }

    const resolvedDelay = delayMs ?? BOT_CHAINED_TURN_DELAY_MS;

    const timeout = setTimeout(() => {
      this.scheduledBotTurns.delete(matchId);

      void this.processBotTurns(matchId).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'Unknown deferred bot turn error';

        this.logGateway('warn', {
          layer: 'gateway',
          event: 'play_card_rejected',
          status: 'rejected',
          matchId,
          errorType: 'unexpected_error',
          errorMessage: message,
        });
      });
    }, resolvedDelay);

    this.scheduledBotTurns.set(matchId, timeout);
  }

  private resolveBetPacingDelay(kind: BotBetPacingKind): number {
    return BOT_BET_RESPONSE_DELAY_MS[kind];
  }

  private fillBotsAndBroadcast(matchId: string): void {
    this.roomManager.fillMissingSeatsWithBots(matchId);
    this.emitRoomState(matchId);
  }

  private emitQueueState(snapshot: QueueSnapshot): void {
    this.server.emit('queue-state', snapshot);
  }

  private emitQueueTimeout(mode: MatchmakingMode, socketId: string): void {
    this.server.to(socketId).emit('queue-timeout', {
      mode,
      reason: 'timeout',
      availableActions: ['continue-queue', 'start-bot-match', 'decline-fallback'],
    });
  }

  private expireQueueEntries(mode: MatchmakingMode): QueueSnapshot {
    const result = this.gatewayMatchmakingService.getQueueState(mode);

    if (result.timedOutFallbacks.length === 0) {
      return result.snapshot;
    }

    for (const fallback of result.timedOutFallbacks) {
      this.emitQueueTimeout(mode, fallback.socketId);

      this.logGateway('log', {
        layer: 'gateway',
        event: 'queue_timeout',
        status: 'succeeded',
        socketId: fallback.socketId,
        playerTokenSuffix: this.maskPlayerToken(fallback.playerToken),
        mode,
        queueSize: result.snapshot.size,
      });
    }

    this.emitQueueState(result.snapshot);

    return result.snapshot;
  }

  private removeFromQueueBySocketId(socketId: string): QueueSnapshot | null {
    const result = this.gatewayMatchmakingService.leaveQueue(socketId);

    if (!result.removed || !result.snapshot) {
      return null;
    }

    this.emitQueueState(result.snapshot);

    return result.snapshot;
  }

  private getSocketById(socketId: string): Socket | null {
    const socketRegistry = (
      this.server as unknown as {
        sockets?: {
          sockets?: Map<string, Socket>;
        };
      }
    )?.sockets?.sockets;

    if (!socketRegistry) {
      return null;
    }

    return socketRegistry.get(socketId) ?? null;
  }

  private getFallbackStateResponse(socketId: string): FallbackStateResponseDto {
    const fallback = this.gatewayMatchmakingService.getFallbackState(socketId);

    if (!fallback) {
      return { hasPendingFallback: false };
    }

    return {
      hasPendingFallback: true,
      fallback: {
        mode: fallback.mode,
        rating: fallback.rating,
        timedOutAt: fallback.timedOutAt,
        availableActions: ['continue-queue', 'start-bot-match', 'decline-fallback'],
      },
    };
  }

  private async assignSocketToMatch(
    matchId: string,
    socket: Socket,
    identity: ResolvedHandshakeIdentity,
  ): Promise<void> {
    await socket.join(matchId);

    const profileResult = await this.getOrCreatePlayerProfileUseCase.execute({
      userId: identity.userId,
    });

    const session = this.roomManager.join(matchId, socket.id, identity);

    socket.emit('player-assigned', {
      matchId,
      seatId: session.seatId,
      teamId: session.teamId,
      playerId: session.domainPlayerId,
      playerToken: identity.playerToken,
      profileId: profileResult.profile.id,
    });
  }

  private async assignQueuedPlayersToMatch(matchId: string, pair: MatchmakingPair): Promise<void> {
    for (const player of pair.players) {
      const socket = this.getSocketById(player.socketId);

      if (!socket) {
        continue;
      }

      const identity: ResolvedHandshakeIdentity = {
        userId: player.userId,
        playerToken: player.playerToken,
      };

      await this.assignSocketToMatch(matchId, socket, identity);
    }
  }

  private async createBotFallbackMatch(
    socket: Socket,
    fallback: PendingFallbackState,
  ): Promise<BotMatchCreatedResponseDto> {
    const result = await this.createMatchUseCase.execute({
      mode: fallback.mode,
    });

    const matchId = result.matchId;

    this.roomManager.ensureRoom(matchId, fallback.mode);

    await this.assignSocketToMatch(matchId, socket, {
      userId: fallback.userId,
      playerToken: fallback.playerToken,
    });

    this.fillBotsAndBroadcast(matchId);
    await this.emitPublicMatchState(matchId);
    await this.emitPrivateMatchState(matchId);

    return {
      matchId,
      mode: fallback.mode,
    };
  }

  private async tryCreateMatchFromQueue(
    mode: MatchmakingMode,
  ): Promise<MatchFoundResponseDto | null> {
    const result = this.gatewayMatchmakingService.tryResolvePair(mode);

    if (result.timedOutFallbacks.length > 0) {
      for (const fallback of result.timedOutFallbacks) {
        this.emitQueueTimeout(mode, fallback.socketId);

        this.logGateway('log', {
          layer: 'gateway',
          event: 'queue_timeout',
          status: 'succeeded',
          socketId: fallback.socketId,
          playerTokenSuffix: this.maskPlayerToken(fallback.playerToken),
          mode,
          queueSize: result.snapshot.size,
        });
      }

      this.emitQueueState(result.snapshot);
    }

    if (!result.pair) {
      return null;
    }

    return this.createQueuedMatch(result.pair);
  }

  private async createQueuedMatch(pair: MatchmakingPair): Promise<MatchFoundResponseDto> {
    const result = await this.createMatchUseCase.execute({
      mode: pair.mode,
    });

    const matchId = result.matchId;
    this.roomManager.ensureRoom(matchId, pair.mode);

    const queueSnapshot = this.gatewayMatchmakingService.completeMatchedPair(pair);
    this.emitQueueState(queueSnapshot);

    await this.assignQueuedPlayersToMatch(matchId, pair);
    this.emitRoomState(matchId);
    await this.emitPublicMatchState(matchId);
    await this.emitPrivateMatchState(matchId);

    const matchFoundPayload: MatchFoundResponseDto = {
      matchId,
      mode: pair.mode,
      players: pair.players.map((player) => ({
        userId: player.userId,
        playerToken: player.playerToken,
        rating: player.rating,
      })),
    };

    for (const player of pair.players) {
      this.server.to(player.socketId).emit('match-found', matchFoundPayload);
    }

    this.logGateway('log', {
      layer: 'gateway',
      event: 'match_found',
      status: 'succeeded',
      matchId,
      mode: pair.mode,
      queueSize: queueSnapshot.size,
    });

    return matchFoundPayload;
  }

  private resolveBotProfile(matchId: string, seatId: string | null): BotProfile {
    if (!seatId) {
      return 'balanced';
    }

    return this.roomManager.getBotProfile(matchId, seatId as never) ?? 'balanced';
  }

  private getCurrentBotRoundView(state: ViewMatchStateResponseDto): BotRoundView | null {
    const rounds = state.currentHand?.rounds;

    if (!rounds || rounds.length === 0) {
      return null;
    }

    const currentRound = rounds[rounds.length - 1];

    if (!currentRound) {
      return null;
    }

    return {
      playerOneCard: currentRound.playerOneCard,
      playerTwoCard: currentRound.playerTwoCard,
      finished: currentRound.finished,
      result: currentRound.result,
    };
  }

  private buildBotBetView(currentHand: ViewMatchStateResponseDto['currentHand']) {
    if (!currentHand) {
      return undefined;
    }

    const hasBetContext =
      currentHand.currentValue !== undefined ||
      currentHand.betState !== undefined ||
      currentHand.pendingValue !== undefined ||
      currentHand.requestedBy !== undefined ||
      currentHand.specialState !== undefined ||
      currentHand.specialDecisionPending !== undefined ||
      Object.keys(currentHand.availableActions ?? {}).length > 0;

    if (!hasBetContext) {
      return undefined;
    }

    return {
      currentValue: currentHand.currentValue,
      betState: currentHand.betState,
      pendingValue: currentHand.pendingValue,
      requestedBy: currentHand.requestedBy,
      specialState: currentHand.specialState,
      specialDecisionPending: currentHand.specialDecisionPending,
      availableActions: {
        ...currentHand.availableActions,
      },
    };
  }

  private resolveBetResponderPlayerId(requestedBy: 'P1' | 'P2' | null): 'P1' | 'P2' | null {
    if (requestedBy === 'P1') {
      return 'P2';
    }

    if (requestedBy === 'P2') {
      return 'P1';
    }

    return null;
  }

  private resolveBotTurnDecisionActor(
    matchId: string,
    state: ViewMatchStateResponseDto,
  ): BotTurnDecisionActor | null {
    const roomState = this.roomManager.getState(matchId);
    const currentHand = state.currentHand;

    if (!currentHand) {
      return null;
    }

    if (
      currentHand.specialState === 'mao_de_onze' &&
      currentHand.specialDecisionPending &&
      currentHand.specialDecisionBy
    ) {
      const decisionTeamId = currentHand.specialDecisionBy === 'P1' ? 'T1' : 'T2';
      const decisionSeat = roomState.players.find(
        (player) => player.teamId === decisionTeamId && player.isBot,
      );

      if (!decisionSeat) {
        return null;
      }

      return {
        seatId: decisionSeat.seatId,
        teamId: decisionSeat.teamId,
        playerId: currentHand.specialDecisionBy,
      };
    }

    if (currentHand.betState === 'awaiting_response' && currentHand.requestedBy !== null) {
      const responderPlayerId = this.resolveBetResponderPlayerId(currentHand.requestedBy);

      if (!responderPlayerId) {
        return null;
      }

      const responderTeamId = responderPlayerId === 'P1' ? 'T1' : 'T2';
      const responderSeat = roomState.players.find(
        (player) => player.teamId === responderTeamId && player.isBot,
      );

      if (!responderSeat) {
        return null;
      }

      return {
        seatId: responderSeat.seatId,
        teamId: responderSeat.teamId,
        playerId: responderPlayerId,
      };
    }

    const currentTurnSeatId = roomState.currentTurnSeatId;

    if (!currentTurnSeatId) {
      return null;
    }

    const currentSeat = roomState.players.find((player) => player.seatId === currentTurnSeatId);

    if (!currentSeat || !currentSeat.isBot) {
      return null;
    }

    return {
      seatId: currentSeat.seatId,
      teamId: currentSeat.teamId,
      playerId: currentSeat.teamId === 'T1' ? 'P1' : 'P2',
    };
  }

  private async buildBotDecisionContext(
    matchId: string,
    state: ViewMatchStateResponseDto,
  ): Promise<BotTurnDecisionContext | null> {
    const actor = this.resolveBotTurnDecisionActor(matchId, state);

    if (!actor) {
      return null;
    }

    const viewerState = await this.viewMatchStateUseCase.execute({
      matchId,
      viewerPlayerId: actor.playerId,
    });
    const currentHand = viewerState.currentHand;

    if (!currentHand) {
      return null;
    }

    const hand = actor.playerId === 'P1' ? currentHand.playerOneHand : currentHand.playerTwoHand;

    const betView = this.buildBotBetView(currentHand);
    const handProgress = this.buildBotHandProgressView(viewerState, actor.playerId);
    const pointsToWin = this.resolvePointsToWin(viewerState);

    return {
      ...actor,
      context: {
        matchId,
        profile: this.resolveBotProfile(matchId, actor.seatId),
        viraRank: currentHand.viraRank,
        currentRound: this.getCurrentBotRoundView(viewerState),
        player: {
          playerId: actor.playerId,
          hand,
        },
        ...(betView ? { bet: betView } : {}),
        score: {
          playerOne: viewerState.score.playerOne,
          playerTwo: viewerState.score.playerTwo,
          pointsToWin,
        },
        handProgress,
      },
    };
  }

  private buildBotHandProgressView(
    state: ViewMatchStateResponseDto,
    playerId: 'P1' | 'P2',
  ): BotHandProgressView {
    const rounds = state.currentHand?.rounds ?? [];
    let roundsWonByMe = 0;
    let roundsWonByOpponent = 0;
    let roundsTied = 0;

    for (const round of rounds) {
      if (!round.finished) {
        continue;
      }

      if (round.result === 'TIE') {
        roundsTied += 1;
      } else if (round.result === playerId) {
        roundsWonByMe += 1;
      } else if (round.result !== null) {
        roundsWonByOpponent += 1;
      }
    }

    return {
      roundsWonByMe,
      roundsWonByOpponent,
      roundsTied,
      currentRoundIndex: Math.max(0, rounds.length - 1),
    };
  }

  private getLatestRoundResult(state: ViewMatchStateResponseDto): 'P1' | 'P2' | 'TIE' | null {
    const rounds = state.currentHand?.rounds;

    if (!rounds || rounds.length === 0) {
      return null;
    }

    const latestRound = rounds[rounds.length - 1];

    return latestRound?.finished ? latestRound.result : null;
  }

  private getFinishedRoundResultThatOpenedANewRound(
    previousState: ViewMatchStateResponseDto,
    updatedState: ViewMatchStateResponseDto,
  ): 'P1' | 'P2' | 'TIE' | null {
    const previousRounds = previousState.currentHand?.rounds ?? [];
    const updatedRounds = updatedState.currentHand?.rounds ?? [];

    if (updatedRounds.length <= previousRounds.length) {
      return null;
    }

    const finishedRound = updatedRounds[updatedRounds.length - 2];

    return finishedRound?.finished ? finishedRound.result : null;
  }

  private getOneVsOneOpponentSeat(matchId: string, seatId: SeatId): SeatId | null {
    const roomState = this.roomManager.getState(matchId);

    if (roomState.mode !== '1v1') {
      return null;
    }

    const opponent = roomState.players.find((player) => player.seatId !== seatId);

    return (opponent?.seatId as SeatId | undefined) ?? null;
  }

  private resolveOneVsOneRoundOpeningSeat(
    matchId: string,
    roundResult: 'P1' | 'P2' | 'TIE' | null,
    actingSeatId: SeatId,
  ): SeatId | null {
    if (roundResult === 'P1') {
      return 'T1A';
    }

    if (roundResult === 'P2') {
      return 'T2A';
    }

    if (roundResult === 'TIE') {
      return this.getOneVsOneOpponentSeat(matchId, actingSeatId);
    }

    return null;
  }

  private resolveNextTurnRoomStateAfterCardPlay(
    matchId: string,
    previousState: ViewMatchStateResponseDto,
    updatedState: ViewMatchStateResponseDto,
    actingSeatId: SeatId,
  ) {
    const roomState = this.roomManager.getState(matchId);

    if (updatedState.state !== 'in_progress' || !updatedState.currentHand) {
      return this.roomManager.clearTurn(matchId);
    }

    const finishedRoundResult = this.getFinishedRoundResultThatOpenedANewRound(
      previousState,
      updatedState,
    );

    if (roomState.mode === '1v1' && finishedRoundResult) {
      const openingSeatId = this.resolveOneVsOneRoundOpeningSeat(
        matchId,
        finishedRoundResult,
        actingSeatId,
      );

      if (openingSeatId) {
        return this.roomManager.beginRound(matchId, openingSeatId);
      }
    }

    return this.roomManager.advanceTurn(matchId);
  }

  private getFinishedRoundsCount(state: ViewMatchStateResponseDto): number {
    const rounds = state.currentHand?.rounds ?? [];

    return rounds.filter((round) => round.finished).length;
  }

  private getTotalRoundsCount(state: ViewMatchStateResponseDto): number {
    return state.currentHand?.rounds.length ?? 0;
  }

  private buildRoundResolvedTransitionPayload(
    matchId: string,
    updatedState: ViewMatchStateResponseDto,
    roomState: ReturnType<RoomManager['getState']>,
    roundWinner: 'P1' | 'P2' | 'TIE' | null,
    actor: CardPlayedActor,
  ): RoundTransitionPayload | null {
    if (!roundWinner) {
      return null;
    }

    const currentHand = updatedState.currentHand;

    if (!currentHand) {
      return null;
    }

    return {
      matchId,
      phase: 'round-resolved',
      roundWinner,
      finishedRoundsCount: this.getFinishedRoundsCount(updatedState),
      totalRoundsCount: this.getTotalRoundsCount(updatedState),
      handContinues: updatedState.state === 'in_progress' && !currentHand.finished,
      openingSeatId: null,
      currentTurnSeatId: roomState.currentTurnSeatId ?? null,
      triggeredBy: actor,
    };
  }

  private buildNextRoundOpenedTransitionPayload(
    matchId: string,
    updatedState: ViewMatchStateResponseDto,
    roomState: ReturnType<RoomManager['getState']>,
    roundWinner: 'P1' | 'P2' | 'TIE' | null,
    actor: CardPlayedActor,
  ): RoundTransitionPayload | null {
    if (
      updatedState.state !== 'in_progress' ||
      !updatedState.currentHand ||
      updatedState.currentHand.finished
    ) {
      return null;
    }

    return {
      matchId,
      phase: 'next-round-opened',
      roundWinner,
      finishedRoundsCount: this.getFinishedRoundsCount(updatedState),
      totalRoundsCount: this.getTotalRoundsCount(updatedState),
      handContinues: true,
      openingSeatId: roomState.currentTurnSeatId ?? null,
      currentTurnSeatId: roomState.currentTurnSeatId ?? null,
      triggeredBy: actor,
    };
  }

  private emitRoundTransition(payload: RoundTransitionPayload): void {
    this.server.to(payload.matchId).emit('round-transition', payload);
  }

  private buildRoundTransitionsAfterCardPlay(
    matchId: string,
    previousState: ViewMatchStateResponseDto,
    updatedState: ViewMatchStateResponseDto,
    roomState: ReturnType<RoomManager['getState']>,
    actor: CardPlayedActor,
  ): {
    resolvedPayload: RoundTransitionPayload | null;
    nextRoundPayload: RoundTransitionPayload | null;
  } {
    const openedNewRound = this.didOpenNewRound(previousState, updatedState);
    const roundWinner = openedNewRound
      ? this.getFinishedRoundResultThatOpenedANewRound(previousState, updatedState)
      : this.getLatestRoundResult(updatedState);

    const resolvedPayload = this.buildRoundResolvedTransitionPayload(
      matchId,
      updatedState,
      roomState,
      roundWinner,
      actor,
    );

    const nextRoundPayload = openedNewRound
      ? this.buildNextRoundOpenedTransitionPayload(
          matchId,
          updatedState,
          roomState,
          roundWinner,
          actor,
        )
      : null;

    return { resolvedPayload, nextRoundPayload };
  }

  private async emitPostCardPlayStateWithPacing(
    matchId: string,
    previousState: ViewMatchStateResponseDto,
    updatedState: ViewMatchStateResponseDto,
    roomState: ReturnType<RoomManager['getState']>,
    actor: CardPlayedActor,
  ): Promise<void> {
    const { resolvedPayload, nextRoundPayload } = this.buildRoundTransitionsAfterCardPlay(
      matchId,
      previousState,
      updatedState,
      roomState,
      actor,
    );

    if (!resolvedPayload) {
      this.server.to(matchId).emit('room-state', this.withBotDecisionTelemetry(matchId, roomState));
      this.server.to(matchId).emit('match-state', this.toPublicMatchState(updatedState));
      await this.emitPrivateMatchState(matchId);
      return;
    }

    this.emitRoundTransition(resolvedPayload);
    await this.delay(ROUND_RESOLUTION_STATE_SYNC_DELAY_MS);

    this.server.to(matchId).emit('match-state', this.toPublicMatchState(updatedState));
    await this.emitPrivateMatchState(matchId);
    this.server.to(matchId).emit('room-state', this.withBotDecisionTelemetry(matchId, roomState));

    if (nextRoundPayload) {
      this.emitRoundTransition(nextRoundPayload);
    }
  }

  private resolveHistoricalMode(matchId: string): HistoricalMatchMode {
    const roomState = this.roomManager.getState(matchId);

    return roomState.mode === '2v2' ? '2v2' : '1v1';
  }

  private resolvePointsToWin(state: ViewMatchStateResponseDto): number {
    const candidate = (state as { pointsToWin?: unknown }).pointsToWin;

    if (typeof candidate === 'number' && Number.isInteger(candidate) && candidate > 0) {
      return candidate;
    }

    // NOTE: The current gateway projection does not expose pointsToWin
    // consistently yet. We persist the current product default until that
    // field becomes explicit in the authoritative DTO.
    return 12;
  }

  private resolveHistoricalWinnerPlayerId(
    state: ViewMatchStateResponseDto,
  ): HistoricalPlayerId | null {
    if (state.score.playerOne > state.score.playerTwo) {
      return 'P1';
    }

    if (state.score.playerTwo > state.score.playerOne) {
      return 'P2';
    }

    return null;
  }

  private buildHistoricalParticipants(matchId: string): CreateMatchRecordInputDto['participants'] {
    const roomState = this.roomManager.getState(matchId);

    return roomState.players.map((player) => ({
      seatId: player.seatId,
      userId: player.userId ?? null,
      displayName: player.botIdentity?.displayName ?? (player.isBot ? 'Bot' : null),
      isBot: player.isBot,
      botProfile: player.botProfile ?? null,
    }));
  }

  private buildHistoricalReplayEvents(
    state: ViewMatchStateResponseDto,
    finishedAt: string,
  ): MatchReplayEventDto[] {
    const winnerPlayerId = this.resolveHistoricalWinnerPlayerId(state);
    const mode = this.resolveHistoricalMode(state.matchId);
    const pointsToWin = this.resolvePointsToWin(state);

    return [
      {
        sequence: 0,
        occurredAt: finishedAt,
        payload: {
          type: 'match-created',
          pointsToWin,
          mode,
        },
      },
      {
        sequence: 1,
        occurredAt: finishedAt,
        payload: {
          type: 'match-finished',
          winnerPlayerId,
          score: {
            playerOne: state.score.playerOne,
            playerTwo: state.score.playerTwo,
          },
          finalState: state.state,
        },
      },
    ];
  }

  private buildHistoricalMatchRecordInput(
    matchId: string,
    state: ViewMatchStateResponseDto,
  ): CreateMatchRecordInputDto {
    const finishedAt = new Date().toISOString();

    return {
      matchId,
      mode: this.resolveHistoricalMode(matchId),
      status: 'completed',
      pointsToWin: this.resolvePointsToWin(state),
      startedAt: null,
      finishedAt,
      participants: this.buildHistoricalParticipants(matchId),
      finalState: {
        state: state.state,
        viraRank: state.currentHand?.viraRank ?? null,
        score: {
          playerOne: state.score.playerOne,
          playerTwo: state.score.playerTwo,
        },
        roundsPlayed: state.currentHand?.rounds.length ?? 0,
        winnerPlayerId: this.resolveHistoricalWinnerPlayerId(state),
      },
      replayEvents: this.buildHistoricalReplayEvents(state, finishedAt),
    };
  }

  private async finalizeMatchIfFinished(
    matchId: string,
    state: ViewMatchStateResponseDto,
  ): Promise<void> {
    if (state.state !== 'finished' || !this.roomManager.tryMarkRatingApplied(matchId)) {
      return;
    }

    const matchRecord = this.buildHistoricalMatchRecordInput(matchId, state);

    try {
      await this.saveMatchRecordUseCase.execute(matchRecord);

      this.logGateway('log', {
        layer: 'gateway',
        event: 'save_match_record_succeeded',
        status: 'succeeded',
        matchId,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown error while saving match record';

      this.logGateway('warn', {
        layer: 'gateway',
        event: 'save_match_record_rejected',
        status: 'rejected',
        matchId,
        errorType: 'unexpected_error',
        errorMessage: message,
      });
    }

    const score = state.score;

    if (score.playerOne !== score.playerTwo) {
      const winnerTeamId = score.playerOne > score.playerTwo ? 'T1' : 'T2';
      const teamUserIds = this.roomManager.getTeamUserIds(matchId);

      const winnerUserIds = (winnerTeamId === 'T1' ? teamUserIds.T1 : teamUserIds.T2).filter(
        Boolean,
      );
      const loserUserIds = (winnerTeamId === 'T1' ? teamUserIds.T2 : teamUserIds.T1).filter(
        Boolean,
      );

      // NOTE: Human vs bot matches still need to update the human profile history
      // (wins/losses/matchesPlayed), even when only one side has human userIds.
      if (winnerUserIds.length > 0 || loserUserIds.length > 0) {
        await this.updateRatingUseCase.execute({
          winnerUserIds,
          loserUserIds,
        });

        const ranking = await this.getRankingUseCase.execute({ limit: 20 });
        this.server.to(matchId).emit('rating-updated', { ranking: ranking.ranking });
      }

      this.logGateway('log', {
        layer: 'gateway',
        event: 'match_finished',
        status: 'succeeded',
        matchId,
        teamId: winnerTeamId,
      });

      return;
    }

    this.logGateway('log', {
      layer: 'gateway',
      event: 'match_finished',
      status: 'succeeded',
      matchId,
    });
  }

  private async processBotTurns(matchId: string): Promise<boolean> {
    this.clearScheduledBotTurn(matchId);

    const state = await this.getAuthoritativeMatchState(matchId);
    const botTurnContext = await this.buildBotDecisionContext(matchId, state);

    if (!botTurnContext) {
      return false;
    }

    const nextPacing = this.inferNextBotPacing(state, botTurnContext);
    const shouldScheduleFollowUp = await this.executeBotTurn(matchId, botTurnContext);

    if (shouldScheduleFollowUp) {
      this.scheduleDeferredBotTurn(matchId, nextPacing);
    }

    return true;
  }

  private inferNextBotPacing(
    state: ViewMatchStateResponseDto,
    botTurnContext: BotTurnDecisionContext,
  ): number {
    const currentHand = state.currentHand;

    if (!currentHand) {
      return BOT_CHAINED_TURN_DELAY_MS;
    }

    const isRespondingToBet =
      currentHand.betState === 'awaiting_response' &&
      currentHand.requestedBy !== null &&
      currentHand.requestedBy !== botTurnContext.playerId;

    if (isRespondingToBet) {
      const strongestRaiseAvailable =
        currentHand.availableActions.canRaiseToSix ||
        currentHand.availableActions.canRaiseToNine ||
        currentHand.availableActions.canRaiseToTwelve;

      return this.resolveBetPacingDelay(strongestRaiseAvailable ? 'raise' : 'accept');
    }

    const canOpenBet =
      currentHand.betState === 'idle' &&
      currentHand.specialState === 'normal' &&
      !currentHand.specialDecisionPending &&
      (currentHand.availableActions.canRequestTruco ||
        currentHand.availableActions.canRaiseToSix ||
        currentHand.availableActions.canRaiseToNine ||
        currentHand.availableActions.canRaiseToTwelve);

    if (canOpenBet) {
      return this.resolveBetPacingDelay('initiative');
    }

    return BOT_CHAINED_TURN_DELAY_MS;
  }

  private async executeBotBetDecision(
    matchId: string,
    botTurnContext: BotTurnDecisionContext,
    decision: BotDecision,
  ): Promise<boolean> {
    this.rememberBotDecision(matchId, botTurnContext, decision);

    const action: BotBetAction =
      decision.action === 'accept-bet' ||
      decision.action === 'decline-bet' ||
      decision.action === 'request-truco' ||
      decision.action === 'raise-to-six' ||
      decision.action === 'raise-to-nine' ||
      decision.action === 'raise-to-twelve'
        ? decision.action
        : 'accept-bet';

    if (action === 'accept-bet') {
      const dto: AcceptBetRequestDto = {
        matchId,
        playerId: botTurnContext.playerId,
      };

      await this.acceptBetUseCase.execute(dto);
    } else if (action === 'decline-bet') {
      const dto: DeclineBetRequestDto = {
        matchId,
        playerId: botTurnContext.playerId,
      };

      await this.declineBetUseCase.execute(dto);
    } else if (action === 'request-truco') {
      const dto: RequestTrucoRequestDto = {
        matchId,
        playerId: botTurnContext.playerId,
      };

      await this.requestTrucoUseCase.execute(dto);
    } else if (action === 'raise-to-six') {
      const dto: RaiseToSixRequestDto = {
        matchId,
        playerId: botTurnContext.playerId,
      };

      await this.raiseToSixUseCase.execute(dto);
    } else if (action === 'raise-to-nine') {
      const dto: RaiseToNineRequestDto = {
        matchId,
        playerId: botTurnContext.playerId,
      };

      await this.raiseToNineUseCase.execute(dto);
    } else if (action === 'raise-to-twelve') {
      const dto: RaiseToTwelveRequestDto = {
        matchId,
        playerId: botTurnContext.playerId,
      };

      await this.raiseToTwelveUseCase.execute(dto);
    }

    this.emitRoomState(matchId);

    const updatedState = await this.emitSyncedMatchState(matchId);
    await this.finalizeMatchIfFinished(matchId, updatedState);

    const eventByAction = {
      'accept-bet': 'accept_bet_succeeded',
      'decline-bet': 'decline_bet_succeeded',
      'request-truco': 'request_truco_succeeded',
      'raise-to-six': 'raise_to_six_succeeded',
      'raise-to-nine': 'raise_to_nine_succeeded',
      'raise-to-twelve': 'raise_to_twelve_succeeded',
    } as const;

    this.logGateway('log', {
      layer: 'gateway',
      event: eventByAction[action],
      status: 'succeeded',
      matchId,
      seatId: botTurnContext.seatId,
      teamId: botTurnContext.teamId,
      playerId: botTurnContext.playerId,
    });

    if (updatedState.state !== 'in_progress' || !updatedState.currentHand) {
      return false;
    }

    if (updatedState.currentHand.finished) {
      return false;
    }

    const nextBotTurnContext = await this.buildBotDecisionContext(matchId, updatedState);

    return Boolean(nextBotTurnContext);
  }

  private async executeBotTurn(
    matchId: string,
    botTurnContext: BotTurnDecisionContext,
  ): Promise<boolean> {
    const currentState = await this.getAuthoritativeMatchState(matchId);
    const currentHand = currentState.currentHand;

    if (!currentHand) {
      return false;
    }

    const decision = this.botDecisionPort.decide(botTurnContext.context);

    if (
      currentHand.specialState === 'mao_de_onze' &&
      currentHand.specialDecisionPending &&
      currentHand.specialDecisionBy === botTurnContext.playerId
    ) {
      const maoDeOnzeDecision: BotDecision =
        decision.action === 'accept-mao-de-onze' || decision.action === 'decline-mao-de-onze'
          ? decision
          : this.buildFallbackMaoDeOnzeDecision(decision.metadata);

      this.rememberBotDecision(matchId, botTurnContext, maoDeOnzeDecision);

      if (maoDeOnzeDecision.action === 'decline-mao-de-onze') {
        const dto: DeclineMaoDeOnzeRequestDto = {
          matchId,
          playerId: botTurnContext.playerId,
        };

        await this.declineMaoDeOnzeUseCase.execute(dto);
        await this.continueAutomaticGameFlow(matchId);

        this.logGateway('log', {
          layer: 'gateway',
          event: 'decline_mao_de_onze_succeeded',
          status: 'succeeded',
          matchId,
          seatId: botTurnContext.seatId,
          teamId: botTurnContext.teamId,
          playerId: botTurnContext.playerId,
        });

        return false;
      }

      const dto: AcceptMaoDeOnzeRequestDto = {
        matchId,
        playerId: botTurnContext.playerId,
      };

      await this.acceptMaoDeOnzeUseCase.execute(dto);

      // NOTE: Bot-owned mao de onze is a two-step automatic flow. Accepting the
      // special decision only unlocks play-card; the same bot may still own the
      // opening turn and must be allowed to continue through the scheduled bot
      // loop instead of stopping the chain here.
      const resumedRoomState = this.roomManager.setCurrentTurnSeat(
        matchId,
        botTurnContext.seatId as SeatId,
      );
      this.server
        .to(matchId)
        .emit('room-state', this.withBotDecisionTelemetry(matchId, resumedRoomState));

      const updatedState = await this.emitSyncedMatchState(matchId);
      await this.finalizeMatchIfFinished(matchId, updatedState);

      this.logGateway('log', {
        layer: 'gateway',
        event: 'accept_mao_de_onze_succeeded',
        status: 'succeeded',
        matchId,
        seatId: botTurnContext.seatId,
        teamId: botTurnContext.teamId,
        playerId: botTurnContext.playerId,
      });

      if (updatedState.state !== 'in_progress' || !updatedState.currentHand) {
        return false;
      }

      if (
        updatedState.currentHand.finished ||
        updatedState.currentHand.nextDecisionType !== 'play-card'
      ) {
        return false;
      }

      const nextBotTurnContext = await this.buildBotDecisionContext(matchId, updatedState);

      return Boolean(nextBotTurnContext);
    }

    this.rememberBotDecision(matchId, botTurnContext, decision);

    const isRespondingToBet =
      currentHand.betState === 'awaiting_response' &&
      currentHand.requestedBy !== null &&
      currentHand.requestedBy !== botTurnContext.playerId;

    if (isRespondingToBet) {
      return this.executeBotBetDecision(matchId, botTurnContext, decision);
    }

    const isInitiativeBet =
      decision.action === 'request-truco' ||
      decision.action === 'raise-to-six' ||
      decision.action === 'raise-to-nine' ||
      decision.action === 'raise-to-twelve';

    if (isInitiativeBet) {
      return this.executeBotBetDecision(matchId, botTurnContext, decision);
    }

    const fallbackCard = botTurnContext.context.player.hand[0] ?? null;
    const resolvedCard =
      decision.action === 'play-card' && decision.card ? decision.card : fallbackCard;

    if (!resolvedCard) {
      this.logGateway('warn', {
        layer: 'gateway',
        event: 'play_card_rejected',
        status: 'rejected',
        matchId,
        seatId: botTurnContext.seatId,
        teamId: botTurnContext.teamId,
        playerId: botTurnContext.playerId,
        errorType: 'unexpected_error',
        errorMessage: `Bot could not resolve a playable card. decision=${decision.action}`,
      });

      return false;
    }

    const previousState = currentState;

    const dto: PlayCardRequestDto = {
      matchId,
      playerId: botTurnContext.playerId,
      card: resolvedCard,
    };

    await this.playCardUseCase.execute(dto);

    const updatedState = await this.getAuthoritativeMatchState(matchId);
    const nextRoomState = this.resolveNextTurnRoomStateAfterCardPlay(
      matchId,
      previousState,
      updatedState,
      botTurnContext.seatId as SeatId,
    );

    const botCardActor: CardPlayedActor = {
      seatId: botTurnContext.seatId,
      teamId: botTurnContext.teamId,
      playerId: botTurnContext.playerId,
      isBot: true,
    };

    this.server.to(matchId).emit('card-played', {
      matchId,
      playerId: botTurnContext.playerId,
      seatId: botTurnContext.seatId,
      teamId: botTurnContext.teamId,
      card: resolvedCard,
      currentTurnSeatId: nextRoomState.currentTurnSeatId,
      isBot: true,
    });

    await this.emitPostCardPlayStateWithPacing(
      matchId,
      previousState,
      updatedState,
      nextRoomState,
      botCardActor,
    );

    this.logGateway('log', {
      layer: 'gateway',
      event: 'play_card_succeeded',
      status: 'succeeded',
      matchId,
      seatId: botTurnContext.seatId,
      teamId: botTurnContext.teamId,
      playerId: botTurnContext.playerId,
      card: resolvedCard,
    });

    await this.finalizeMatchIfFinished(matchId, updatedState);

    if (updatedState.state !== 'in_progress' || !updatedState.currentHand) {
      return false;
    }

    if (
      updatedState.currentHand.finished ||
      updatedState.currentHand.nextDecisionType !== 'play-card'
    ) {
      return false;
    }

    const nextBotTurnContext = await this.buildBotDecisionContext(matchId, updatedState);

    if (!nextBotTurnContext) {
      return false;
    }

    return true;
  }

  handleConnection(socket: Socket): void {
    try {
      const authToken = this.readHandshakeAuthValue(socket, 'authToken');
      const legacyToken = this.readHandshakeAuthValue(socket, 'token');

      if (!authToken && !legacyToken) {
        throw new Error(
          'Missing socket credentials. Provide auth.authToken or auth.token in the Socket.IO handshake.',
        );
      }

      const tokenForLog = authToken ?? legacyToken ?? 'unknown';

      this.logGateway('log', {
        layer: 'gateway',
        event: 'socket_connected',
        status: 'connected',
        socketId: socket.id,
        playerTokenSuffix: this.maskPlayerToken(tokenForLog),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid socket handshake';

      this.logGateway('warn', {
        layer: 'gateway',
        event: 'socket_connected',
        status: 'rejected',
        socketId: socket.id,
        errorType: 'transport_error',
        errorMessage: message,
      });

      socket.emit('error', {
        code: 'transport_error',
        message,
      });
      socket.disconnect(true);
    }
  }

  handleDisconnect(socket: Socket): void {
    this.removeFromQueueBySocketId(socket.id);

    const existingSession = this.roomManager.getSessionBySocketId(socket.id);
    const result = this.roomManager.leave(socket.id);

    if (!result) {
      this.logGateway('debug', {
        layer: 'gateway',
        event: 'socket_disconnected_without_match',
        status: 'disconnected',
        socketId: socket.id,
      });
      return;
    }

    const logContext: GatewayLogContext = {
      layer: 'gateway',
      event: 'socket_disconnected',
      status: 'disconnected',
      socketId: socket.id,
      matchId: result.matchId,
    };

    if (existingSession) {
      logContext.seatId = existingSession.seatId;
      logContext.teamId = existingSession.teamId;
      logContext.playerId = existingSession.domainPlayerId;
      logContext.playerTokenSuffix = this.maskPlayerToken(existingSession.playerToken);
    }

    this.logGateway('log', logContext);
    this.clearScheduledBotTurn(result.matchId);
    this.emitRoomState(result.matchId);
  }

  @SubscribeMessage('create-match')
  async handleCreateMatch(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: CreateMatchPayload,
  ): Promise<WsResponse<CreateMatchResponseDto> | WsResponse<ErrorResponseDto>> {
    this.logGateway('debug', {
      layer: 'gateway',
      event: 'create_match_requested',
      status: 'started',
      socketId: socket.id,
    });

    try {
      const identity = await this.resolveHandshakeIdentity(socket);
      const profileResult = await this.getOrCreatePlayerProfileUseCase.execute({
        userId: identity.userId,
      });

      const pointsToWinRaw = payload?.pointsToWin;
      const pointsToWin = typeof pointsToWinRaw === 'number' ? pointsToWinRaw : undefined;

      if (pointsToWin !== undefined && !Number.isInteger(pointsToWin)) {
        return this.reject(
          'create_match_rejected',
          'Invalid payload: pointsToWin must be an integer.',
          {
            socketId: socket.id,
            playerTokenSuffix: this.maskPlayerToken(identity.playerToken),
          },
          'validation_error',
        );
      }

      const modeRaw = payload?.mode;
      const mode = this.normalizeMode(modeRaw);

      if (modeRaw !== undefined && mode !== '1v1' && mode !== '2v2') {
        return this.reject(
          'create_match_rejected',
          'Invalid payload: mode must be either "1v1" or "2v2".',
          {
            socketId: socket.id,
            playerTokenSuffix: this.maskPlayerToken(identity.playerToken),
          },
          'validation_error',
        );
      }

      const dto: CreateMatchRequestDto = {
        ...(pointsToWin === undefined ? {} : { pointsToWin }),
        ...(mode === undefined ? {} : { mode }),
      };

      const result = await this.createMatchUseCase.execute(dto);
      const matchId = result.matchId;

      this.roomManager.ensureRoom(matchId, dto.mode ?? '2v2');

      await this.assignSocketToMatch(matchId, socket, identity);

      this.removeFromQueueBySocketId(socket.id);

      this.fillBotsAndBroadcast(matchId);
      await this.emitPublicMatchState(matchId);
      await this.emitPrivateMatchState(matchId);

      const successLog: GatewayLogContext = {
        layer: 'gateway',
        event: 'create_match_succeeded',
        status: 'succeeded',
        socketId: socket.id,
        matchId,
        playerTokenSuffix: this.maskPlayerToken(identity.playerToken),
      };

      if (pointsToWin !== undefined) {
        successLog.pointsToWin = pointsToWin;
      }

      if (dto.mode !== undefined) {
        successLog.mode = dto.mode;
      }

      this.logGateway('log', successLog);
      return { event: 'created', data: result };
    } catch (error) {
      return this.rejectFromError('create_match_rejected', error, {
        socketId: socket.id,
      });
    }
  }

  @SubscribeMessage('join-match')
  async handleJoinMatch(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: JoinMatchPayload,
  ): Promise<WsResponse<{ matchId: string }> | WsResponse<ErrorResponseDto>> {
    this.logGateway('debug', {
      layer: 'gateway',
      event: 'join_match_requested',
      status: 'started',
      socketId: socket.id,
    });

    try {
      const identity = await this.resolveHandshakeIdentity(socket);
      const matchIdRaw = payload?.matchId;
      const matchId = typeof matchIdRaw === 'string' ? matchIdRaw.trim() : '';

      if (!matchId) {
        return this.reject(
          'join_match_rejected',
          'Invalid payload: matchId is required.',
          {
            socketId: socket.id,
            playerTokenSuffix: this.maskPlayerToken(identity.playerToken),
          },
          'validation_error',
        );
      }

      await this.assignSocketToMatch(matchId, socket, identity);

      this.removeFromQueueBySocketId(socket.id);

      this.fillBotsAndBroadcast(matchId);
      await this.emitPublicMatchState(matchId);
      await this.emitPrivateMatchState(matchId);

      this.logGateway('log', {
        layer: 'gateway',
        event: 'join_match_succeeded',
        status: 'succeeded',
        socketId: socket.id,
        matchId,
        playerTokenSuffix: this.maskPlayerToken(identity.playerToken),
      });

      return { event: 'joined', data: { matchId } };
    } catch (error) {
      return this.rejectFromError('join_match_rejected', error, {
        socketId: socket.id,
      });
    }
  }

  @SubscribeMessage('join-queue')
  async handleJoinQueue(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: JoinQueuePayload,
  ): Promise<WsResponse<QueueSnapshot | MatchFoundResponseDto> | WsResponse<ErrorResponseDto>> {
    this.logGateway('debug', {
      layer: 'gateway',
      event: 'join_queue_requested',
      status: 'started',
      socketId: socket.id,
    });

    try {
      const existingSession = this.roomManager.getSessionBySocketId(socket.id);

      if (existingSession) {
        return this.reject(
          'join_queue_rejected',
          'Player is already assigned to a room.',
          {
            socketId: socket.id,
            matchId: existingSession.matchId,
            seatId: existingSession.seatId,
            teamId: existingSession.teamId,
            playerId: existingSession.domainPlayerId,
          },
          'transport_error',
        );
      }

      const mode = this.normalizeRequiredQueueMode(payload?.mode);

      if (!mode) {
        return this.reject(
          'join_queue_rejected',
          'Invalid payload: mode must be either "1v1" or "2v2".',
          { socketId: socket.id },
          'validation_error',
        );
      }

      this.expireQueueEntries(mode);

      const identity = await this.resolveHandshakeIdentity(socket);
      const profileResult = await this.getOrCreatePlayerProfileUseCase.execute({
        userId: identity.userId,
      });

      const snapshot = this.gatewayMatchmakingService.joinQueue({
        socketId: socket.id,
        userId: identity.userId,
        playerToken: identity.playerToken,
        mode,
        rating: profileResult.profile.rating,
      });

      socket.emit('queue-joined', snapshot);
      this.emitQueueState(snapshot);

      this.logGateway('log', {
        layer: 'gateway',
        event: 'join_queue_succeeded',
        status: 'succeeded',
        socketId: socket.id,
        playerTokenSuffix: this.maskPlayerToken(identity.playerToken),
        mode,
        rating: profileResult.profile.rating,
        queueSize: snapshot.size,
      });

      const matchFound = await this.tryCreateMatchFromQueue(mode);

      if (matchFound) {
        return { event: 'match-found', data: matchFound };
      }

      return { event: 'queue-joined', data: snapshot };
    } catch (error) {
      return this.rejectFromError('join_queue_rejected', error, {
        socketId: socket.id,
      });
    }
  }

  @SubscribeMessage('get-matchmaking-snapshot')
  handleGetMatchmakingSnapshot(
    @ConnectedSocket() socket: Socket,
  ): WsResponse<MatchmakingSnapshotResponseDto> {
    this.logGateway('debug', {
      layer: 'gateway',
      event: 'get_matchmaking_snapshot_requested',
      status: 'started',
      socketId: socket.id,
    });

    const snapshot = this.gatewayMatchmakingService.getObservabilitySnapshot();
    const totalWaiting = snapshot.queues['1v1'].waiting + snapshot.queues['2v2'].waiting;

    this.logGateway('debug', {
      layer: 'gateway',
      event: 'get_matchmaking_snapshot_succeeded',
      status: 'succeeded',
      socketId: socket.id,
      queueSize: totalWaiting,
    });

    return {
      event: 'matchmaking-snapshot',
      data: {
        snapshot,
      },
    };
  }

  @SubscribeMessage('get-fallback-state')
  handleGetFallbackState(@ConnectedSocket() socket: Socket): WsResponse<FallbackStateResponseDto> {
    this.logGateway('debug', {
      layer: 'gateway',
      event: 'get_fallback_state_requested',
      status: 'started',
      socketId: socket.id,
    });

    const response = this.getFallbackStateResponse(socket.id);

    this.logGateway('debug', {
      layer: 'gateway',
      event: 'get_fallback_state_succeeded',
      status: 'succeeded',
      socketId: socket.id,
      ...(response.fallback
        ? { mode: response.fallback.mode, rating: response.fallback.rating }
        : {}),
    });

    return {
      event: 'fallback-state',
      data: response,
    };
  }

  @SubscribeMessage('continue-queue')
  async handleContinueQueue(
    @ConnectedSocket() socket: Socket,
  ): Promise<WsResponse<ContinueQueueResponseDto> | WsResponse<ErrorResponseDto>> {
    this.logGateway('debug', {
      layer: 'gateway',
      event: 'continue_queue_requested',
      status: 'started',
      socketId: socket.id,
    });

    try {
      const result = this.gatewayMatchmakingService.continueQueue(socket.id);

      if (!result) {
        return this.reject(
          'continue_queue_rejected',
          'No pending fallback found for this socket.',
          { socketId: socket.id },
          'transport_error',
        );
      }

      const { fallback, snapshot } = result;

      socket.emit('queue-resumed', snapshot);
      this.emitQueueState(snapshot);

      this.logGateway('log', {
        layer: 'gateway',
        event: 'continue_queue_succeeded',
        status: 'succeeded',
        socketId: socket.id,
        playerTokenSuffix: this.maskPlayerToken(fallback.playerToken),
        mode: fallback.mode,
        rating: fallback.rating,
        queueSize: snapshot.size,
      });

      const matchFound = await this.tryCreateMatchFromQueue(fallback.mode);

      if (matchFound) {
        return {
          event: 'queue-resumed',
          data: {
            resumed: true,
            matchFound,
          },
        };
      }

      return {
        event: 'queue-resumed',
        data: {
          resumed: true,
          snapshot,
        },
      };
    } catch (error) {
      return this.rejectFromError('continue_queue_rejected', error, {
        socketId: socket.id,
      });
    }
  }

  @SubscribeMessage('start-bot-match')
  async handleStartBotMatch(
    @ConnectedSocket() socket: Socket,
  ): Promise<WsResponse<BotMatchCreatedResponseDto> | WsResponse<ErrorResponseDto>> {
    this.logGateway('debug', {
      layer: 'gateway',
      event: 'start_bot_match_requested',
      status: 'started',
      socketId: socket.id,
    });

    try {
      const fallback = this.gatewayMatchmakingService.takeFallback(socket.id);

      if (!fallback) {
        return this.reject(
          'start_bot_match_rejected',
          'No pending fallback found for this socket.',
          { socketId: socket.id },
          'transport_error',
        );
      }

      const botMatch = await this.createBotFallbackMatch(socket, fallback);

      this.logGateway('log', {
        layer: 'gateway',
        event: 'start_bot_match_succeeded',
        status: 'succeeded',
        socketId: socket.id,
        matchId: botMatch.matchId,
        mode: botMatch.mode,
        playerTokenSuffix: this.maskPlayerToken(fallback.playerToken),
      });

      return {
        event: 'bot-match-created',
        data: botMatch,
      };
    } catch (error) {
      return this.rejectFromError('start_bot_match_rejected', error, {
        socketId: socket.id,
      });
    }
  }

  @SubscribeMessage('decline-fallback')
  handleDeclineFallback(
    @ConnectedSocket() socket: Socket,
  ): WsResponse<DeclineFallbackResponseDto> | WsResponse<ErrorResponseDto> {
    this.logGateway('debug', {
      layer: 'gateway',
      event: 'decline_fallback_requested',
      status: 'started',
      socketId: socket.id,
    });

    try {
      const fallback = this.gatewayMatchmakingService.takeFallback(socket.id);

      if (!fallback) {
        return this.reject(
          'decline_fallback_rejected',
          'No pending fallback found for this socket.',
          { socketId: socket.id },
          'transport_error',
        );
      }

      this.logGateway('log', {
        layer: 'gateway',
        event: 'decline_fallback_succeeded',
        status: 'succeeded',
        socketId: socket.id,
        mode: fallback.mode,
        playerTokenSuffix: this.maskPlayerToken(fallback.playerToken),
      });

      return {
        event: 'fallback-declined',
        data: {
          declined: true,
        },
      };
    } catch (error) {
      return this.rejectFromError('decline_fallback_rejected', error, {
        socketId: socket.id,
      });
    }
  }

  @SubscribeMessage('leave-queue')
  handleLeaveQueue(
    @ConnectedSocket() socket: Socket,
  ): WsResponse<QueueLeftResponseDto> | WsResponse<ErrorResponseDto> {
    this.logGateway('debug', {
      layer: 'gateway',
      event: 'leave_queue_requested',
      status: 'started',
      socketId: socket.id,
    });

    try {
      const result = this.gatewayMatchmakingService.leaveQueue(socket.id);

      if (!result.removed || !result.snapshot) {
        this.logGateway('debug', {
          layer: 'gateway',
          event: 'leave_queue_succeeded',
          status: 'succeeded',
          socketId: socket.id,
          queueSize: 0,
        });

        return {
          event: 'queue-left',
          data: { left: false },
        };
      }

      this.emitQueueState(result.snapshot);

      this.logGateway('log', {
        layer: 'gateway',
        event: 'leave_queue_succeeded',
        status: 'succeeded',
        socketId: socket.id,
        playerTokenSuffix: this.maskPlayerToken(result.removed.playerToken),
        mode: result.removed.mode,
        queueSize: result.snapshot.size,
      });

      return {
        event: 'queue-left',
        data: {
          left: true,
          mode: result.removed.mode,
          snapshot: result.snapshot,
        },
      };
    } catch (error) {
      return this.rejectFromError('leave_queue_rejected', error, {
        socketId: socket.id,
      });
    }
  }

  @SubscribeMessage('get-queue-state')
  handleGetQueueState(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: GetQueueStatePayload,
  ): WsResponse<QueueSnapshot> | WsResponse<ErrorResponseDto> {
    this.logGateway('debug', {
      layer: 'gateway',
      event: 'get_queue_state_requested',
      status: 'started',
      socketId: socket.id,
    });

    try {
      const mode = this.normalizeRequiredQueueMode(payload?.mode);

      if (!mode) {
        return this.reject(
          'get_queue_state_rejected',
          'Invalid payload: mode must be either "1v1" or "2v2".',
          { socketId: socket.id },
          'validation_error',
        );
      }

      const snapshot = this.expireQueueEntries(mode);

      this.logGateway('debug', {
        layer: 'gateway',
        event: 'get_queue_state_succeeded',
        status: 'succeeded',
        socketId: socket.id,
        mode,
        queueSize: snapshot.size,
      });

      return {
        event: 'queue-state',
        data: snapshot,
      };
    } catch (error) {
      return this.rejectFromError('get_queue_state_rejected', error, {
        socketId: socket.id,
      });
    }
  }

  @SubscribeMessage('set-ready')
  handleSetReady(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: SetReadyPayload,
  ): WsResponse<{ ready: boolean }> | WsResponse<ErrorResponseDto> {
    this.logGateway('debug', {
      layer: 'gateway',
      event: 'set_ready_requested',
      status: 'started',
      socketId: socket.id,
    });

    try {
      const readyRaw = payload?.ready;

      if (typeof readyRaw !== 'boolean') {
        return this.reject(
          'set_ready_rejected',
          'Invalid payload: ready must be a boolean.',
          { socketId: socket.id },
          'validation_error',
        );
      }

      const session = this.roomManager.getSessionBySocketId(socket.id);
      if (!session) {
        return this.reject(
          'set_ready_rejected',
          'Player is not assigned to any room.',
          { socketId: socket.id },
          'transport_error',
        );
      }

      const roomState = this.roomManager.setReady(socket.id, readyRaw);

      this.server
        .to(session.matchId)
        .emit('room-state', this.withBotDecisionTelemetry(session.matchId, roomState));
      socket.emit('ready-updated', { ready: readyRaw });

      this.logGateway('debug', {
        layer: 'gateway',
        event: 'set_ready_succeeded',
        status: 'succeeded',
        socketId: socket.id,
        matchId: session.matchId,
        seatId: session.seatId,
        teamId: session.teamId,
        playerId: session.domainPlayerId,
      });

      return { event: 'ready-updated', data: { ready: readyRaw } };
    } catch (error) {
      return this.rejectFromError('set_ready_rejected', error, {
        socketId: socket.id,
      });
    }
  }

  @SubscribeMessage('start-hand')
  async handleStartHand(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: StartHandPayload,
  ): Promise<WsResponse<{ matchId: string }> | WsResponse<ErrorResponseDto>> {
    this.logGateway('debug', {
      layer: 'gateway',
      event: 'start_hand_requested',
      status: 'started',
      socketId: socket.id,
    });

    try {
      const session = this.roomManager.getSessionBySocketId(socket.id);

      if (!session) {
        return this.reject(
          'start_hand_rejected',
          'Player is not assigned to any room.',
          { socketId: socket.id },
          'transport_error',
        );
      }

      const authoritativeState = await this.getAuthoritativeMatchState(session.matchId);

      const matchIdRaw = payload?.matchId;

      const matchId = typeof matchIdRaw === 'string' ? matchIdRaw.trim() : '';

      if (!matchId) {
        return this.reject(
          'start_hand_rejected',
          'Invalid payload: matchId is required.',
          {
            socketId: socket.id,
            matchId: session.matchId,
          },
          'validation_error',
        );
      }

      if (matchId !== session.matchId) {
        return this.reject(
          'start_hand_rejected',
          'Invalid payload: matchId does not match the active room.',
          {
            socketId: socket.id,
            matchId: session.matchId,
          },
          'transport_error',
        );
      }

      if (authoritativeState.state === 'finished') {
        return this.reject(
          'start_hand_rejected',
          'Cannot start a new hand because the match is already finished.',
          {
            socketId: socket.id,
            matchId,
          },
          'transport_error',
        );
      }

      if (this.isHandCurrentlyInProgress(authoritativeState)) {
        return this.reject(
          'start_hand_rejected',
          'A hand is already in progress for this match.',
          {
            socketId: socket.id,
            matchId,
          },
          'transport_error',
        );
      }

      const isStartingNextHand = this.canStartSubsequentHand(authoritativeState);

      if (!isStartingNextHand && !this.roomManager.canStart(session.matchId)) {
        return this.reject(
          'start_hand_rejected',
          'All players must be ready before starting the hand.',
          {
            socketId: socket.id,
            matchId: session.matchId,
          },
          'transport_error',
        );
      }

      if (!this.acquireStartHandLock(matchId)) {
        return this.reject(
          'start_hand_rejected',
          'A start-hand request is already being processed for this match.',
          {
            socketId: socket.id,
            matchId,
          },
          'transport_error',
        );
      }

      try {
        const dto: StartHandRequestDto = { matchId };
        const result = await this.startHandUseCase.execute(dto);

        this.clearBotDecisionTelemetry(matchId);

        // CHANGE: The product rule is now winner-opens-next-hand. The first hand
        // still randomizes, but once a hand has a winner, that same player/team
        // receives the opener for the next hand. This matches the visible game
        // expectation: if P1 won the previous hand, the following hand starts at
        // T1; if P2 won, it starts at T2.
        const previousHandWinner = authoritativeState.currentHand?.winner ?? null;
        const previousHandFinished = authoritativeState.currentHand?.finished === true;
        const nextHandOpenerPlayerId =
          previousHandFinished && previousHandWinner === 'P1'
            ? 'P1'
            : previousHandFinished && previousHandWinner === 'P2'
              ? 'P2'
              : null;

        const roomState = this.roomManager.beginHand(matchId, {
          // NOTE: The RoomManager hint name is historical. It resolves the
          // provided player/team as the opener; passing the previous winner here
          // keeps this patch surgical without changing the RoomManager API.
          lastLoserPlayerId: nextHandOpenerPlayerId,
          random: nextHandOpenerPlayerId === null,
        });
        this.server
          .to(matchId)
          .emit('room-state', this.withBotDecisionTelemetry(matchId, roomState));

        const startedMatchState = await this.getAuthoritativeMatchState(matchId);
        const startedViraRank = startedMatchState.currentHand?.viraRank ?? null;

        this.server.to(matchId).emit('hand-started', {
          matchId,
          viraRank: startedViraRank,
          currentTurnSeatId: roomState.currentTurnSeatId,
        });

        this.clearScheduledBotTurn(matchId);
        await this.continueAutomaticGameFlow(matchId);

        this.logGateway('log', {
          layer: 'gateway',
          event: 'start_hand_succeeded',
          status: 'succeeded',
          socketId: socket.id,
          matchId,
          ...(startedViraRank !== null ? { viraRank: startedViraRank } : {}),
        });
        return { event: 'start-hand:ack', data: result };
      } finally {
        this.releaseStartHandLock(matchId);
      }
    } catch (error) {
      return this.rejectFromError('start_hand_rejected', error, {
        socketId: socket.id,
      });
    }
  }

  @SubscribeMessage('play-card')
  async handlePlayCard(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: PlayCardPayload,
  ): Promise<WsResponse<{ matchId: string }> | WsResponse<ErrorResponseDto>> {
    this.logGateway('debug', {
      layer: 'gateway',
      event: 'play_card_requested',
      status: 'started',
      socketId: socket.id,
    });

    try {
      const session = this.roomManager.getSessionBySocketId(socket.id);

      if (!session) {
        return this.reject(
          'play_card_rejected',
          'Player is not assigned to any room.',
          { socketId: socket.id },
          'transport_error',
        );
      }

      const matchIdRaw = payload?.matchId;
      const rankRaw = payload?.card?.rank;
      const suitRaw = payload?.card?.suit;

      const matchId = typeof matchIdRaw === 'string' ? matchIdRaw.trim() : '';
      const rank = typeof rankRaw === 'string' ? rankRaw.trim() : '';
      const suit = typeof suitRaw === 'string' ? suitRaw.trim() : '';

      if (!matchId || !rank || !suit) {
        return this.reject(
          'play_card_rejected',
          'Invalid payload: matchId, card.rank and card.suit are required.',
          {
            socketId: socket.id,
            matchId: session.matchId,
          },
          'validation_error',
        );
      }

      if (!this.roomManager.isPlayersTurn(socket.id, matchId)) {
        return this.reject(
          'play_card_rejected',
          'It is not this player turn.',
          {
            socketId: socket.id,
            matchId,
            seatId: session.seatId,
            teamId: session.teamId,
            playerId: session.domainPlayerId,
          },
          'transport_error',
        );
      }

      const card = `${rank}${suit}`;

      const previousState = await this.getAuthoritativeMatchState(matchId);

      const dto: PlayCardRequestDto = {
        matchId,
        playerId: session.domainPlayerId,
        card,
      };

      const result = await this.playCardUseCase.execute(dto);

      const state = await this.getAuthoritativeMatchState(matchId);
      const roomState = this.resolveNextTurnRoomStateAfterCardPlay(
        matchId,
        previousState,
        state,
        session.seatId,
      );

      const humanCardActor: CardPlayedActor = {
        seatId: session.seatId,
        teamId: session.teamId,
        playerId: session.domainPlayerId,
        isBot: false,
      };

      this.server.to(matchId).emit('card-played', {
        matchId,
        playerId: session.domainPlayerId,
        seatId: session.seatId,
        teamId: session.teamId,
        card,
        currentTurnSeatId: roomState.currentTurnSeatId,
      });

      await this.emitPostCardPlayStateWithPacing(
        matchId,
        previousState,
        state,
        roomState,
        humanCardActor,
      );

      this.logGateway('log', {
        layer: 'gateway',
        event: 'play_card_succeeded',
        status: 'succeeded',
        socketId: socket.id,
        matchId,
        seatId: session.seatId,
        teamId: session.teamId,
        playerId: session.domainPlayerId,
        card,
      });

      await this.finalizeMatchIfFinished(matchId, state);

      const postFinalizeState = await this.getAuthoritativeMatchState(matchId);
      const hasBotContinuation = Boolean(
        await this.buildBotDecisionContext(matchId, postFinalizeState),
      );

      // NOTE: Only schedule the chained bot turn when the authoritative
      // post-play state still has a real pending bot action. This avoids
      // relying on stale pre-finalization state and guarantees that the bot
      // follow-up is armed exactly when the next actor is a bot.
      if (hasBotContinuation) {
        this.clearScheduledBotTurn(matchId);
        this.scheduleDeferredBotTurn(matchId);
      }

      return { event: 'play-card:ack', data: { matchId: result.matchId } };
    } catch (error) {
      return this.rejectFromError('play_card_rejected', error, {
        socketId: socket.id,
      });
    }
  }

  @SubscribeMessage('get-ranking')
  async handleGetRanking(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: GetRankingPayload,
  ): Promise<WsResponse<{ ok: true }> | WsResponse<ErrorResponseDto>> {
    this.logGateway('debug', {
      layer: 'gateway',
      event: 'get_ranking_requested',
      status: 'started',
      socketId: socket.id,
    });

    try {
      const raw = payload?.limit;
      const limit = typeof raw === 'number' && Number.isInteger(raw) && raw > 0 ? raw : 20;

      const ranking = await this.getRankingUseCase.execute({ limit });

      socket.emit('ranking', { ranking: ranking.ranking });

      this.logGateway('debug', {
        layer: 'gateway',
        event: 'get_ranking_succeeded',
        status: 'succeeded',
        socketId: socket.id,
        limit,
      });

      // NOTE: The ranking payload is already delivered explicitly through
      // socket.emit('ranking', ...). The ack must use a different event name
      // to avoid overwriting the frontend ranking state with an incompatible
      // payload shape like { ok: true }.
      return { event: 'ranking-ack', data: { ok: true } };
    } catch (error) {
      return this.rejectFromError('get_ranking_rejected', error, {
        socketId: socket.id,
      });
    }
  }
  @SubscribeMessage('get-match-history')
  async handleGetMatchHistory(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: GetMatchHistoryPayload,
  ): Promise<WsResponse<{ ok: true }> | WsResponse<ErrorResponseDto>> {
    this.logGateway('debug', {
      layer: 'gateway',
      event: 'get_match_history_requested',
      status: 'started',
      socketId: socket.id,
    });

    try {
      const userIdRaw = payload?.userId;
      const userId = typeof userIdRaw === 'string' ? userIdRaw.trim() : '';

      if (!userId) {
        return this.reject(
          'get_match_history_rejected',
          'Invalid payload: userId is required.',
          { socketId: socket.id },
          'validation_error',
        );
      }

      const rawLimit = payload?.limit;
      const limit =
        typeof rawLimit === 'number' && Number.isInteger(rawLimit) && rawLimit > 0 ? rawLimit : 20;

      const history = await this.getMatchHistoryUseCase.execute({
        userId,
        limit,
      });

      socket.emit('match-history', history);

      this.logGateway('debug', {
        layer: 'gateway',
        event: 'get_match_history_succeeded',
        status: 'succeeded',
        socketId: socket.id,
        userId,
        limit,
      });

      return { event: 'match-history-ack', data: { ok: true } };
    } catch (error) {
      return this.rejectFromError('get_match_history_rejected', error, {
        socketId: socket.id,
      });
    }
  }

  @SubscribeMessage('get-match-replay')
  async handleGetMatchReplay(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: GetMatchReplayPayload,
  ): Promise<WsResponse<{ ok: true }> | WsResponse<ErrorResponseDto>> {
    this.logGateway('debug', {
      layer: 'gateway',
      event: 'get_match_replay_requested',
      status: 'started',
      socketId: socket.id,
    });

    try {
      const matchIdRaw = payload?.matchId;
      const matchId = typeof matchIdRaw === 'string' ? matchIdRaw.trim() : '';

      if (!matchId) {
        return this.reject(
          'get_match_replay_rejected',
          'Invalid payload: matchId is required.',
          { socketId: socket.id },
          'validation_error',
        );
      }

      const replay = await this.getMatchReplayUseCase.execute({ matchId });

      socket.emit('match-replay', replay);

      this.logGateway('debug', {
        layer: 'gateway',
        event: 'get_match_replay_succeeded',
        status: 'succeeded',
        socketId: socket.id,
        matchId,
      });

      return { event: 'match-replay', data: { ok: true } };
    } catch (error) {
      const rejectContext: {
        socketId: string;
        matchId?: string;
      } = {
        socketId: socket.id,
      };

      if (typeof payload?.matchId === 'string') {
        const normalizedMatchId = payload.matchId.trim();

        if (normalizedMatchId) {
          rejectContext.matchId = normalizedMatchId;
        }
      }

      return this.rejectFromError('get_match_replay_rejected', error, rejectContext);
    }
  }

  @SubscribeMessage('request-truco')
  async handleRequestTruco(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: GetStatePayload,
  ): Promise<WsResponse<{ matchId: string }> | WsResponse<ErrorResponseDto>> {
    this.logGateway('debug', {
      layer: 'gateway',
      event: 'request_truco_requested',
      status: 'started',
      socketId: socket.id,
    });

    try {
      const session = this.roomManager.getSessionBySocketId(socket.id);

      if (!session) {
        return this.reject(
          'request_truco_rejected',
          'Player is not assigned to any room.',
          { socketId: socket.id },
          'transport_error',
        );
      }

      const matchIdRaw = payload?.matchId;
      const matchId = typeof matchIdRaw === 'string' ? matchIdRaw.trim() : '';

      if (!matchId) {
        return this.reject(
          'request_truco_rejected',
          'Invalid payload: matchId is required.',
          {
            socketId: socket.id,
            matchId: session.matchId,
          },
          'validation_error',
        );
      }

      const dto: RequestTrucoRequestDto = {
        matchId,
        playerId: session.domainPlayerId,
      };

      const result = await this.requestTrucoUseCase.execute(dto);

      await this.continueAutomaticGameFlow(matchId, this.resolveBetPacingDelay('raise'));

      this.logGateway('log', {
        layer: 'gateway',
        event: 'request_truco_succeeded',
        status: 'succeeded',
        socketId: socket.id,
        matchId,
        seatId: session.seatId,
        teamId: session.teamId,
        playerId: session.domainPlayerId,
      });

      return {
        event: 'truco-requested',
        data: {
          matchId: result.matchId,
        },
      };
    } catch (error) {
      return this.rejectFromError('request_truco_rejected', error, {
        socketId: socket.id,
      });
    }
  }

  @SubscribeMessage('accept-bet')
  async handleAcceptBet(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: GetStatePayload,
  ): Promise<WsResponse<{ matchId: string }> | WsResponse<ErrorResponseDto>> {
    this.logGateway('debug', {
      layer: 'gateway',
      event: 'accept_bet_requested',
      status: 'started',
      socketId: socket.id,
    });

    try {
      const session = this.roomManager.getSessionBySocketId(socket.id);

      if (!session) {
        return this.reject(
          'accept_bet_rejected',
          'Player is not assigned to any room.',
          { socketId: socket.id },
          'transport_error',
        );
      }

      const matchIdRaw = payload?.matchId;
      const matchId = typeof matchIdRaw === 'string' ? matchIdRaw.trim() : '';

      if (!matchId) {
        return this.reject(
          'accept_bet_rejected',
          'Invalid payload: matchId is required.',
          {
            socketId: socket.id,
            matchId: session.matchId,
          },
          'validation_error',
        );
      }

      const dto: AcceptBetRequestDto = {
        matchId,
        playerId: session.domainPlayerId,
      };

      const result = await this.acceptBetUseCase.execute(dto);

      await this.continueAutomaticGameFlow(matchId, this.resolveBetPacingDelay('accept'));

      this.logGateway('log', {
        layer: 'gateway',
        event: 'accept_bet_succeeded',
        status: 'succeeded',
        socketId: socket.id,
        matchId,
        seatId: session.seatId,
        teamId: session.teamId,
        playerId: session.domainPlayerId,
      });

      return {
        event: 'bet-accepted',
        data: {
          matchId: result.matchId,
        },
      };
    } catch (error) {
      return this.rejectFromError('accept_bet_rejected', error, {
        socketId: socket.id,
      });
    }
  }

  @SubscribeMessage('decline-bet')
  async handleDeclineBet(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: GetStatePayload,
  ): Promise<WsResponse<{ matchId: string }> | WsResponse<ErrorResponseDto>> {
    this.logGateway('debug', {
      layer: 'gateway',
      event: 'decline_bet_requested',
      status: 'started',
      socketId: socket.id,
    });

    try {
      const session = this.roomManager.getSessionBySocketId(socket.id);

      if (!session) {
        return this.reject(
          'decline_bet_rejected',
          'Player is not assigned to any room.',
          { socketId: socket.id },
          'transport_error',
        );
      }

      const matchIdRaw = payload?.matchId;
      const matchId = typeof matchIdRaw === 'string' ? matchIdRaw.trim() : '';

      if (!matchId) {
        return this.reject(
          'decline_bet_rejected',
          'Invalid payload: matchId is required.',
          {
            socketId: socket.id,
            matchId: session.matchId,
          },
          'validation_error',
        );
      }

      const dto: DeclineBetRequestDto = {
        matchId,
        playerId: session.domainPlayerId,
      };

      const result = await this.declineBetUseCase.execute(dto);

      await this.continueAutomaticGameFlow(matchId, this.resolveBetPacingDelay('decline'));

      this.logGateway('log', {
        layer: 'gateway',
        event: 'decline_bet_succeeded',
        status: 'succeeded',
        socketId: socket.id,
        matchId,
        seatId: session.seatId,
        teamId: session.teamId,
        playerId: session.domainPlayerId,
      });

      return {
        event: 'bet-declined',
        data: {
          matchId: result.matchId,
        },
      };
    } catch (error) {
      return this.rejectFromError('decline_bet_rejected', error, {
        socketId: socket.id,
      });
    }
  }

  @SubscribeMessage('raise-to-six')
  async handleRaiseToSix(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: GetStatePayload,
  ): Promise<WsResponse<{ matchId: string }> | WsResponse<ErrorResponseDto>> {
    this.logGateway('debug', {
      layer: 'gateway',
      event: 'raise_to_six_requested',
      status: 'started',
      socketId: socket.id,
    });

    try {
      const session = this.roomManager.getSessionBySocketId(socket.id);

      if (!session) {
        return this.reject(
          'raise_to_six_rejected',
          'Player is not assigned to any room.',
          { socketId: socket.id },
          'transport_error',
        );
      }

      const matchIdRaw = payload?.matchId;
      const matchId = typeof matchIdRaw === 'string' ? matchIdRaw.trim() : '';

      if (!matchId) {
        return this.reject(
          'raise_to_six_rejected',
          'Invalid payload: matchId is required.',
          {
            socketId: socket.id,
            matchId: session.matchId,
          },
          'validation_error',
        );
      }

      const dto: RaiseToSixRequestDto = {
        matchId,
        playerId: session.domainPlayerId,
      };

      const result = await this.raiseToSixUseCase.execute(dto);

      await this.continueAutomaticGameFlow(matchId, this.resolveBetPacingDelay('raise'));

      this.logGateway('log', {
        layer: 'gateway',
        event: 'raise_to_six_succeeded',
        status: 'succeeded',
        socketId: socket.id,
        matchId,
        seatId: session.seatId,
        teamId: session.teamId,
        playerId: session.domainPlayerId,
      });

      return {
        event: 'bet-raised-to-six',
        data: {
          matchId: result.matchId,
        },
      };
    } catch (error) {
      return this.rejectFromError('raise_to_six_rejected', error, {
        socketId: socket.id,
      });
    }
  }

  @SubscribeMessage('raise-to-nine')
  async handleRaiseToNine(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: GetStatePayload,
  ): Promise<WsResponse<{ matchId: string }> | WsResponse<ErrorResponseDto>> {
    this.logGateway('debug', {
      layer: 'gateway',
      event: 'raise_to_nine_requested',
      status: 'started',
      socketId: socket.id,
    });

    try {
      const session = this.roomManager.getSessionBySocketId(socket.id);

      if (!session) {
        return this.reject(
          'raise_to_nine_rejected',
          'Player is not assigned to any room.',
          { socketId: socket.id },
          'transport_error',
        );
      }

      const matchIdRaw = payload?.matchId;
      const matchId = typeof matchIdRaw === 'string' ? matchIdRaw.trim() : '';

      if (!matchId) {
        return this.reject(
          'raise_to_nine_rejected',
          'Invalid payload: matchId is required.',
          {
            socketId: socket.id,
            matchId: session.matchId,
          },
          'validation_error',
        );
      }

      const dto: RaiseToNineRequestDto = {
        matchId,
        playerId: session.domainPlayerId,
      };

      const result = await this.raiseToNineUseCase.execute(dto);

      await this.continueAutomaticGameFlow(matchId, this.resolveBetPacingDelay('raise'));

      this.logGateway('log', {
        layer: 'gateway',
        event: 'raise_to_nine_succeeded',
        status: 'succeeded',
        socketId: socket.id,
        matchId,
        seatId: session.seatId,
        teamId: session.teamId,
        playerId: session.domainPlayerId,
      });

      return {
        event: 'bet-raised-to-nine',
        data: {
          matchId: result.matchId,
        },
      };
    } catch (error) {
      return this.rejectFromError('raise_to_nine_rejected', error, {
        socketId: socket.id,
      });
    }
  }

  @SubscribeMessage('raise-to-twelve')
  async handleRaiseToTwelve(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: GetStatePayload,
  ): Promise<WsResponse<{ matchId: string }> | WsResponse<ErrorResponseDto>> {
    this.logGateway('debug', {
      layer: 'gateway',
      event: 'raise_to_twelve_requested',
      status: 'started',
      socketId: socket.id,
    });

    try {
      const session = this.roomManager.getSessionBySocketId(socket.id);

      if (!session) {
        return this.reject(
          'raise_to_twelve_rejected',
          'Player is not assigned to any room.',
          { socketId: socket.id },
          'transport_error',
        );
      }

      const matchIdRaw = payload?.matchId;
      const matchId = typeof matchIdRaw === 'string' ? matchIdRaw.trim() : '';

      if (!matchId) {
        return this.reject(
          'raise_to_twelve_rejected',
          'Invalid payload: matchId is required.',
          {
            socketId: socket.id,
            matchId: session.matchId,
          },
          'validation_error',
        );
      }

      const dto: RaiseToTwelveRequestDto = {
        matchId,
        playerId: session.domainPlayerId,
      };

      const result = await this.raiseToTwelveUseCase.execute(dto);

      await this.continueAutomaticGameFlow(matchId, this.resolveBetPacingDelay('raise'));

      this.logGateway('log', {
        layer: 'gateway',
        event: 'raise_to_twelve_succeeded',
        status: 'succeeded',
        socketId: socket.id,
        matchId,
        seatId: session.seatId,
        teamId: session.teamId,
        playerId: session.domainPlayerId,
      });

      return {
        event: 'bet-raised-to-twelve',
        data: {
          matchId: result.matchId,
        },
      };
    } catch (error) {
      return this.rejectFromError('raise_to_twelve_rejected', error, {
        socketId: socket.id,
      });
    }
  }

  @SubscribeMessage('accept-mao-de-onze')
  async handleAcceptMaoDeOnze(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: GetStatePayload,
  ): Promise<WsResponse<{ matchId: string }> | WsResponse<ErrorResponseDto>> {
    this.logGateway('debug', {
      layer: 'gateway',
      event: 'accept_mao_de_onze_requested',
      status: 'started',
      socketId: socket.id,
    });

    try {
      const session = this.roomManager.getSessionBySocketId(socket.id);

      if (!session) {
        return this.reject(
          'accept_mao_de_onze_rejected',
          'Player is not assigned to any room.',
          { socketId: socket.id },
          'transport_error',
        );
      }

      const matchIdRaw = payload?.matchId;
      const matchId = typeof matchIdRaw === 'string' ? matchIdRaw.trim() : '';

      if (!matchId) {
        return this.reject(
          'accept_mao_de_onze_rejected',
          'Invalid payload: matchId is required.',
          {
            socketId: socket.id,
            matchId: session.matchId,
          },
          'validation_error',
        );
      }

      const dto: AcceptMaoDeOnzeRequestDto = {
        matchId,
        playerId: session.domainPlayerId,
      };

      const result = await this.acceptMaoDeOnzeUseCase.execute(dto);

      // NOTE: After accepting mao de onze, the hand returns to normal play flow.
      // The frontend only re-enables card interaction when room-state carries a
      // coherent currentTurnSeatId for the resumed play phase. Without restoring
      // and emitting the turn pointer here, the table can remain visually stuck
      // in a non-playable state even though match-state already says play-card.
      const resumedRoomState = this.roomManager.setCurrentTurnSeat(matchId, session.seatId);
      this.server
        .to(matchId)
        .emit('room-state', this.withBotDecisionTelemetry(matchId, resumedRoomState));

      const state = await this.emitSyncedMatchState(matchId);
      await this.finalizeMatchIfFinished(matchId, state);

      if (state.state === 'in_progress' && state.currentHand?.nextDecisionType === 'play-card') {
        await this.processBotTurns(matchId);
      }

      this.logGateway('log', {
        layer: 'gateway',
        event: 'accept_mao_de_onze_succeeded',
        status: 'succeeded',
        socketId: socket.id,
        matchId,
        seatId: session.seatId,
        teamId: session.teamId,
        playerId: session.domainPlayerId,
      });

      return {
        event: 'mao-de-onze-accepted',
        data: {
          matchId: result.matchId,
        },
      };
    } catch (error) {
      return this.rejectFromError('accept_mao_de_onze_rejected', error, {
        socketId: socket.id,
      });
    }
  }

  @SubscribeMessage('decline-mao-de-onze')
  async handleDeclineMaoDeOnze(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: GetStatePayload,
  ): Promise<WsResponse<{ matchId: string }> | WsResponse<ErrorResponseDto>> {
    this.logGateway('debug', {
      layer: 'gateway',
      event: 'decline_mao_de_onze_requested',
      status: 'started',
      socketId: socket.id,
    });

    try {
      const session = this.roomManager.getSessionBySocketId(socket.id);

      if (!session) {
        return this.reject(
          'decline_mao_de_onze_rejected',
          'Player is not assigned to any room.',
          { socketId: socket.id },
          'transport_error',
        );
      }

      const matchIdRaw = payload?.matchId;
      const matchId = typeof matchIdRaw === 'string' ? matchIdRaw.trim() : '';

      if (!matchId) {
        return this.reject(
          'decline_mao_de_onze_rejected',
          'Invalid payload: matchId is required.',
          {
            socketId: socket.id,
            matchId: session.matchId,
          },
          'validation_error',
        );
      }

      const dto: DeclineMaoDeOnzeRequestDto = {
        matchId,
        playerId: session.domainPlayerId,
      };

      const result = await this.declineMaoDeOnzeUseCase.execute(dto);

      await this.continueAutomaticGameFlow(matchId);

      this.logGateway('log', {
        layer: 'gateway',
        event: 'decline_mao_de_onze_succeeded',
        status: 'succeeded',
        socketId: socket.id,
        matchId,
        seatId: session.seatId,
        teamId: session.teamId,
        playerId: session.domainPlayerId,
      });

      return {
        event: 'mao-de-onze-declined',
        data: {
          matchId: result.matchId,
        },
      };
    } catch (error) {
      return this.rejectFromError('decline_mao_de_onze_rejected', error, {
        socketId: socket.id,
      });
    }
  }

  @SubscribeMessage('get-state')
  async handleGetState(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: GetStatePayload,
  ): Promise<WsResponse<{ ok: true }> | WsResponse<ErrorResponseDto>> {
    this.logGateway('debug', {
      layer: 'gateway',
      event: 'get_state_requested',
      status: 'started',
      socketId: socket.id,
    });

    try {
      const matchIdRaw = payload?.matchId;
      const matchId = typeof matchIdRaw === 'string' ? matchIdRaw.trim() : '';

      if (!matchId) {
        return this.reject(
          'get_state_rejected',
          'Invalid payload: matchId is required.',
          { socketId: socket.id },
          'validation_error',
        );
      }

      const roomState = this.roomManager.getState(matchId);
      const viewerPlayerId = this.resolveViewerPlayerId(socket.id, matchId);
      const publicState = await this.viewMatchStateUseCase.execute({ matchId });
      const privateState = viewerPlayerId
        ? await this.viewMatchStateUseCase.execute({ matchId, viewerPlayerId })
        : null;

      socket.emit('room-state', this.withBotDecisionTelemetry(matchId, roomState));
      socket.emit('match-state', this.toPublicMatchState(publicState));

      if (privateState) {
        socket.emit('match-state:private', privateState);
      }

      this.logGateway('debug', {
        layer: 'gateway',
        event: 'get_state_succeeded',
        status: 'succeeded',
        socketId: socket.id,
        matchId,
      });

      return { event: 'state-synced', data: { ok: true } };
    } catch (error) {
      return this.rejectFromError('get_state_rejected', error, {
        socketId: socket.id,
      });
    }
  }
}
