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
import { Inject, Logger } from '@nestjs/common';
import type { Server, Socket } from 'socket.io';

import { CreateMatchUseCase } from '@game/application/use-cases/create-match.use-case';
import { PlayCardUseCase } from '@game/application/use-cases/play-card.use-case';
import { StartHandUseCase } from '@game/application/use-cases/start-hand.use-case';
import { ViewMatchStateUseCase } from '@game/application/use-cases/view-match-state.use-case';
import { GetOrCreatePlayerProfileUseCase } from '@game/application/use-cases/get-or-create-player-profile.use-case';
import { UpdateRatingUseCase } from '@game/application/use-cases/update-rating.use-case';
import { GetRankingUseCase } from '@game/application/use-cases/get-ranking.use-case';
import { GetOrCreateUserUseCase } from '@game/application/use-cases/get-or-create-user.use-case';

import type { ViewMatchStateResponseDto } from '@game/application/dtos/responses/view-match-state.response.dto';
import type {
  CreateMatchRequestDto,
  MatchMode,
} from '@game/application/dtos/requests/create-match.request.dto';
import type { CreateMatchResponseDto } from '@game/application/dtos/responses/create-match.response.dto';
import type { StartHandRequestDto } from '@game/application/dtos/requests/start-hand.request.dto';
import type { PlayCardRequestDto } from '@game/application/dtos/requests/play-card.request.dto';
import {
  BOT_DECISION_PORT,
  type BotDecisionContext,
  type BotDecisionPort,
  type BotProfile,
  type BotRoundView,
} from '@game/application/ports/bot-decision.port';
import { AuthTokenService } from '@game/auth/auth-token.service';
import { DomainError } from '@game/domain/exceptions/domain-error';

import { RoomManager } from './multiplayer/room-manager';

type ErrorResponseDto = { message: string };

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

type GatewayErrorType =
  | 'validation_error'
  | 'transport_error'
  | 'domain_error'
  | 'unexpected_error';

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
    | 'set_ready_requested'
    | 'set_ready_succeeded'
    | 'set_ready_rejected'
    | 'start_hand_requested'
    | 'start_hand_succeeded'
    | 'start_hand_rejected'
    | 'play_card_requested'
    | 'play_card_succeeded'
    | 'play_card_rejected'
    | 'match_finished'
    | 'get_ranking_requested'
    | 'get_ranking_succeeded'
    | 'get_ranking_rejected'
    | 'get_state_requested'
    | 'get_state_succeeded'
    | 'get_state_rejected';
  status: 'started' | 'succeeded' | 'rejected' | 'connected' | 'disconnected';
  socketId?: string;
  matchId?: string;
  seatId?: string;
  teamId?: string;
  playerId?: string;
  playerTokenSuffix?: string;
  pointsToWin?: number;
  viraRank?: string;
  card?: string;
  limit?: number;
  errorType?: GatewayErrorType;
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

type BotTurnDecisionContext = {
  seatId: string;
  teamId: 'T1' | 'T2';
  playerId: 'P1' | 'P2';
  context: BotDecisionContext;
};

@WebSocketGateway({
  cors: { origin: '*' },
})
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  private readonly server!: Server;

  private readonly logger = new Logger(GameGateway.name);

  constructor(
    private readonly createMatchUseCase: CreateMatchUseCase,
    private readonly startHandUseCase: StartHandUseCase,
    private readonly playCardUseCase: PlayCardUseCase,
    private readonly viewMatchStateUseCase: ViewMatchStateUseCase,
    private readonly getOrCreatePlayerProfileUseCase: GetOrCreatePlayerProfileUseCase,
    private readonly updateRatingUseCase: UpdateRatingUseCase,
    private readonly getRankingUseCase: GetRankingUseCase,
    private readonly getOrCreateUserUseCase: GetOrCreateUserUseCase,
    private readonly authTokenService: AuthTokenService,
    private readonly roomManager: RoomManager,
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

  private maskPlayerToken(playerToken: string): string {
    return playerToken.length <= 6 ? playerToken : playerToken.slice(-6);
  }

  private reject(
    event: GatewayLogContext['event'],
    message: string,
    context: RejectContext,
    errorType: GatewayErrorType,
  ): WsResponse<ErrorResponseDto> {
    this.logGateway('warn', {
      layer: 'gateway',
      event,
      status: 'rejected',
      errorType,
      errorMessage: message,
      ...context,
    });

    return { event: 'error', data: { message } };
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
    this.server.to(matchId).emit('room-state', this.roomManager.getState(matchId));
  }

  private fillBotsAndBroadcast(matchId: string): void {
    this.roomManager.fillMissingSeatsWithBots(matchId);
    this.emitRoomState(matchId);
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

  private buildBotDecisionContext(
    matchId: string,
    state: ViewMatchStateResponseDto,
  ): BotTurnDecisionContext | null {
    const roomState = this.roomManager.getState(matchId);
    const currentTurnSeatId = roomState.currentTurnSeatId;
    const currentHand = state.currentHand;

    if (!currentTurnSeatId || !currentHand) {
      return null;
    }

    const currentSeat = roomState.players.find((player) => player.seatId === currentTurnSeatId);

    if (!currentSeat || !currentSeat.isBot) {
      return null;
    }

    const playerId: 'P1' | 'P2' = currentSeat.teamId === 'T1' ? 'P1' : 'P2';
    const hand = playerId === 'P1' ? currentHand.playerOneHand : currentHand.playerTwoHand;

    return {
      seatId: currentSeat.seatId,
      teamId: currentSeat.teamId,
      playerId,
      context: {
        matchId,
        profile: this.resolveBotProfile(matchId, currentSeat.seatId),
        viraRank: currentHand.viraRank,
        currentRound: this.getCurrentBotRoundView(state),
        player: {
          playerId,
          hand,
        },
      },
    };
  }

  private async finalizeMatchIfFinished(
    matchId: string,
    state: ViewMatchStateResponseDto,
  ): Promise<void> {
    if (state.state !== 'finished' || !this.roomManager.tryMarkRatingApplied(matchId)) {
      return;
    }

    const score = state.score;

    if (score.playerOne === score.playerTwo) {
      return;
    }

    const winnerTeamId = score.playerOne > score.playerTwo ? 'T1' : 'T2';
    const teamUserIds = this.roomManager.getTeamUserIds(matchId);

    const winnerUserIds = winnerTeamId === 'T1' ? teamUserIds.T1 : teamUserIds.T2;
    const loserUserIds = winnerTeamId === 'T1' ? teamUserIds.T2 : teamUserIds.T1;

    await this.updateRatingUseCase.execute({
      winnerUserIds,
      loserUserIds,
    });

    this.logGateway('log', {
      layer: 'gateway',
      event: 'match_finished',
      status: 'succeeded',
      matchId,
      teamId: winnerTeamId,
    });

    const ranking = await this.getRankingUseCase.execute({ limit: 20 });
    this.server.to(matchId).emit('rating-updated', { ranking: ranking.ranking });
  }

  private async processBotTurns(matchId: string): Promise<void> {
    while (true) {
      const state = await this.getAuthoritativeMatchState(matchId);
      const botTurnContext = this.buildBotDecisionContext(matchId, state);

      if (!botTurnContext) {
        return;
      }

      const shouldContinue = await this.executeBotTurn(matchId, botTurnContext);

      if (!shouldContinue) {
        return;
      }
    }
  }

  private async executeBotTurn(
    matchId: string,
    botTurnContext: BotTurnDecisionContext,
  ): Promise<boolean> {
    const decision = this.botDecisionPort.decide(botTurnContext.context);

    if (decision.action !== 'play-card') {
      return false;
    }

    const dto: PlayCardRequestDto = {
      matchId,
      playerId: botTurnContext.playerId,
      card: decision.card,
    };

    await this.playCardUseCase.execute(dto);

    const nextRoomState = this.roomManager.advanceTurn(matchId);
    this.server.to(matchId).emit('room-state', nextRoomState);

    this.server.to(matchId).emit('card-played', {
      matchId,
      playerId: botTurnContext.playerId,
      seatId: botTurnContext.seatId,
      teamId: botTurnContext.teamId,
      card: decision.card,
      currentTurnSeatId: nextRoomState.currentTurnSeatId,
      isBot: true,
    });

    const updatedState = await this.emitPublicMatchState(matchId);
    await this.emitPrivateMatchState(matchId);

    this.logGateway('log', {
      layer: 'gateway',
      event: 'play_card_succeeded',
      status: 'succeeded',
      matchId,
      seatId: botTurnContext.seatId,
      teamId: botTurnContext.teamId,
      playerId: botTurnContext.playerId,
      card: decision.card,
    });

    await this.finalizeMatchIfFinished(matchId, updatedState);

    return updatedState.state === 'in_progress';
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

      socket.emit('error', { message });
      socket.disconnect(true);
    }
  }

  handleDisconnect(socket: Socket): void {
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

      await socket.join(matchId);
      const session = this.roomManager.join(matchId, socket.id, identity);

      socket.emit('player-assigned', {
        matchId,
        seatId: session.seatId,
        teamId: session.teamId,
        playerId: session.domainPlayerId,
        playerToken: identity.playerToken,
        profileId: profileResult.profile.id,
      });

      this.fillBotsAndBroadcast(matchId);
      await this.emitPublicMatchState(matchId);
      await this.emitPrivateMatchState(matchId);

      const successLog: GatewayLogContext = {
        layer: 'gateway',
        event: 'create_match_succeeded',
        status: 'succeeded',
        socketId: socket.id,
        matchId,
        seatId: session.seatId,
        teamId: session.teamId,
        playerId: session.domainPlayerId,
        playerTokenSuffix: this.maskPlayerToken(identity.playerToken),
      };

      if (dto.pointsToWin !== undefined) {
        successLog.pointsToWin = dto.pointsToWin;
      }

      this.logGateway('log', successLog);

      return { event: 'created', data: result };
    } catch (error) {
      return this.rejectFromError('create_match_rejected', error, { socketId: socket.id });
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
      const profileResult = await this.getOrCreatePlayerProfileUseCase.execute({
        userId: identity.userId,
      });

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

      await socket.join(matchId);
      const session = this.roomManager.join(matchId, socket.id, identity);

      socket.emit('player-assigned', {
        matchId,
        seatId: session.seatId,
        teamId: session.teamId,
        playerId: session.domainPlayerId,
        playerToken: identity.playerToken,
        profileId: profileResult.profile.id,
      });

      this.fillBotsAndBroadcast(matchId);
      await this.emitPublicMatchState(matchId);
      await this.emitPrivateMatchState(matchId);

      this.logGateway('log', {
        layer: 'gateway',
        event: 'join_match_succeeded',
        status: 'succeeded',
        socketId: socket.id,
        matchId,
        seatId: session.seatId,
        teamId: session.teamId,
        playerId: session.domainPlayerId,
        playerTokenSuffix: this.maskPlayerToken(identity.playerToken),
      });

      return { event: 'joined', data: { matchId } };
    } catch (error) {
      return this.rejectFromError('join_match_rejected', error, { socketId: socket.id });
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

      this.server.to(session.matchId).emit('room-state', roomState);
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
      return this.rejectFromError('set_ready_rejected', error, { socketId: socket.id });
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

      if (!this.roomManager.canStart(session.matchId)) {
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

      const matchIdRaw = payload?.matchId;
      const viraRankRaw = payload?.viraRank;

      const matchId = typeof matchIdRaw === 'string' ? matchIdRaw.trim() : '';
      const viraRank = typeof viraRankRaw === 'string' ? viraRankRaw.trim() : '';

      if (!matchId || !viraRank) {
        return this.reject(
          'start_hand_rejected',
          'Invalid payload: matchId and viraRank are required.',
          {
            socketId: socket.id,
            matchId: session.matchId,
          },
          'validation_error',
        );
      }

      const dto: StartHandRequestDto = { matchId, viraRank };
      const result = await this.startHandUseCase.execute(dto);

      const roomState = this.roomManager.beginHand(matchId);
      this.server.to(matchId).emit('room-state', roomState);

      this.server.to(matchId).emit('hand-started', {
        matchId,
        viraRank,
        currentTurnSeatId: roomState.currentTurnSeatId,
      });

      await this.emitPublicMatchState(matchId);
      await this.emitPrivateMatchState(matchId);
      await this.processBotTurns(matchId);

      this.logGateway('log', {
        layer: 'gateway',
        event: 'start_hand_succeeded',
        status: 'succeeded',
        socketId: socket.id,
        matchId,
        viraRank,
      });

      return { event: 'hand-started', data: result };
    } catch (error) {
      return this.rejectFromError('start_hand_rejected', error, { socketId: socket.id });
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

      const dto: PlayCardRequestDto = {
        matchId,
        playerId: session.domainPlayerId,
        card,
      };

      const result = await this.playCardUseCase.execute(dto);

      const roomState = this.roomManager.advanceTurn(matchId);
      this.server.to(matchId).emit('room-state', roomState);

      this.server.to(matchId).emit('card-played', {
        matchId,
        playerId: session.domainPlayerId,
        seatId: session.seatId,
        teamId: session.teamId,
        card,
        currentTurnSeatId: roomState.currentTurnSeatId,
      });

      const state = await this.emitPublicMatchState(matchId);
      await this.emitPrivateMatchState(matchId);

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

      if (state.state === 'in_progress') {
        await this.processBotTurns(matchId);
      }

      return { event: 'card-played', data: { matchId: result.matchId } };
    } catch (error) {
      return this.rejectFromError('play_card_rejected', error, { socketId: socket.id });
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

      return { event: 'ranking', data: { ok: true } };
    } catch (error) {
      return this.rejectFromError('get_ranking_rejected', error, { socketId: socket.id });
    }
  }

  @SubscribeMessage('get-state')
  async handleGetState(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: GetStatePayload,
  ): Promise<WsResponse<ViewMatchStateResponseDto> | WsResponse<ErrorResponseDto>> {
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

      const viewerPlayerId = this.resolveViewerPlayerId(socket.id, matchId);

      const state = await this.viewMatchStateUseCase.execute(
        viewerPlayerId === undefined ? { matchId } : { matchId, viewerPlayerId },
      );

      socket.emit('match-state', state);

      this.logGateway('debug', {
        layer: 'gateway',
        event: 'get_state_succeeded',
        status: 'succeeded',
        socketId: socket.id,
        matchId,
      });

      return { event: 'state', data: state };
    } catch (error) {
      return this.rejectFromError('get_state_rejected', error, { socketId: socket.id });
    }
  }
}
