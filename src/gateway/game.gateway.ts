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
import { Logger } from '@nestjs/common';
import type { Server, Socket } from 'socket.io';

import { CreateMatchUseCase } from '@game/application/use-cases/create-match.use-case';
import { PlayCardUseCase } from '@game/application/use-cases/play-card.use-case';
import { StartHandUseCase } from '@game/application/use-cases/start-hand.use-case';
import { ViewMatchStateUseCase } from '@game/application/use-cases/view-match-state.use-case';
import { GetOrCreatePlayerProfileUseCase } from '@game/application/use-cases/get-or-create-player-profile.use-case';
import { UpdateRatingUseCase } from '@game/application/use-cases/update-rating.use-case';
import { GetRankingUseCase } from '@game/application/use-cases/get-ranking.use-case';

import type { ViewMatchStateResponseDto } from '@game/application/dtos/responses/view-match-state.response.dto';
import type { CreateMatchRequestDto } from '@game/application/dtos/requests/create-match.request.dto';
import type { CreateMatchResponseDto } from '@game/application/dtos/responses/create-match.response.dto';
import type { StartHandRequestDto } from '@game/application/dtos/requests/start-hand.request.dto';
import type { PlayCardRequestDto } from '@game/application/dtos/requests/play-card.request.dto';

import { RoomManager } from './multiplayer/room-manager';

type ErrorResponseDto = { message: string };

type CreateMatchPayload = {
  pointsToWin?: unknown;
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
    private readonly roomManager: RoomManager,
  ) {}

  private extractPlayerToken(socket: Socket): string {
    const raw = (socket.handshake as unknown as { auth?: { token?: unknown } })?.auth?.token;
    if (typeof raw !== 'string' || raw.trim().length === 0) {
      throw new Error('Missing player token. Provide it via Socket.IO handshake auth.token.');
    }
    return raw.trim();
  }

  handleConnection(socket: Socket): void {
    this.logger.debug(`[Connection] Socket conectado: ${socket.id}`);
  }

  // NOTE: Sem cleanup, seat/ready/turn “vaza” e a sala fica travada como se ainda estivesse ocupada.
  handleDisconnect(socket: Socket): void {
    const left = this.roomManager.leave(socket.id);
    if (!left) {
      this.logger.debug(`[Disconnect] Socket desconectado: ${socket.id} (sem partida ativa)`);
      return;
    }

    this.logger.log(
      `[Disconnect] Socket desconectado: ${socket.id} (saiu da partida ${left.matchId})`,
    );
    this.server.to(left.matchId).emit('room-state', this.roomManager.getRoomState(left.matchId));
  }

  @SubscribeMessage('create-match')
  async handleCreateMatch(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: CreateMatchPayload,
  ): Promise<WsResponse<CreateMatchResponseDto> | WsResponse<ErrorResponseDto>> {
    this.logger.debug(`[create-match] Acionado por socket=${socket.id}`);
    try {
      const playerToken = this.extractPlayerToken(socket);
      const profile = await this.getOrCreatePlayerProfileUseCase.execute({ playerToken });

      const pointsToWinRaw = payload?.pointsToWin;
      const pointsToWin = typeof pointsToWinRaw === 'number' ? pointsToWinRaw : undefined;

      if (pointsToWin !== undefined && !Number.isInteger(pointsToWin)) {
        return {
          event: 'error',
          data: { message: 'Invalid payload: pointsToWin must be an integer.' },
        };
      }

      // NOTE: exactOptionalPropertyTypes: evitar { pointsToWin: undefined }
      const dto: CreateMatchRequestDto = pointsToWin === undefined ? {} : { pointsToWin };

      const result = await this.createMatchUseCase.execute(dto);
      const matchId = result.matchId;

      await socket.join(matchId);
      const session = this.roomManager.join(matchId, socket.id, playerToken);

      socket.emit('player-assigned', {
        matchId,
        seatId: session.seatId,
        teamId: session.teamId,
        playerId: session.domainPlayerId,
        playerToken,
        profileId: profile.id,
      });

      this.server.to(matchId).emit('room-state', this.roomManager.getRoomState(matchId));

      const state: ViewMatchStateResponseDto = await this.viewMatchStateUseCase.execute({
        matchId,
      });
      this.server.to(matchId).emit('match-state', state);

      this.logger.log(`[create-match] Partida criada: ${matchId} (Player: ${playerToken})`);
      return { event: 'created', data: result };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.logger.warn(`[create-match] Recusado: ${message}`);
      return { event: 'error', data: { message } };
    }
  }

  @SubscribeMessage('join-match')
  async handleJoinMatch(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: JoinMatchPayload,
  ): Promise<WsResponse<{ ok: true }> | WsResponse<ErrorResponseDto>> {
    this.logger.debug(`[join-match] Acionado por socket=${socket.id}`);
    try {
      const playerToken = this.extractPlayerToken(socket);
      const profile = await this.getOrCreatePlayerProfileUseCase.execute({ playerToken });

      const matchIdRaw = payload?.matchId;
      const matchId = typeof matchIdRaw === 'string' ? matchIdRaw.trim() : '';

      if (!matchId) {
        return { event: 'error', data: { message: 'Invalid payload: matchId is required.' } };
      }

      await socket.join(matchId);

      const session = this.roomManager.join(matchId, socket.id, playerToken);

      socket.emit('player-assigned', {
        matchId,
        seatId: session.seatId,
        teamId: session.teamId,
        playerId: session.domainPlayerId,
        playerToken,
        profileId: profile.id,
      });

      this.server.to(matchId).emit('room-state', this.roomManager.getRoomState(matchId));

      const state: ViewMatchStateResponseDto = await this.viewMatchStateUseCase.execute({
        matchId,
      });
      this.server.to(matchId).emit('match-state', state);

      this.logger.log(
        `[join-match] Jogador ${playerToken} entrou na partida ${matchId} (Seat: ${session.seatId})`,
      );
      return { event: 'joined', data: { ok: true } };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.logger.warn(`[join-match] Recusado: ${message}`);
      return { event: 'error', data: { message } };
    }
  }

  @SubscribeMessage('set-ready')
  handleSetReady(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: SetReadyPayload,
  ): WsResponse<{ ok: true }> | WsResponse<ErrorResponseDto> {
    try {
      const readyRaw = payload?.ready;
      if (typeof readyRaw !== 'boolean') {
        return { event: 'error', data: { message: 'Invalid payload: ready must be boolean.' } };
      }

      const session = this.roomManager.getSessionBySocketId(socket.id);
      if (!session) {
        return { event: 'error', data: { message: 'You must join a match first.' } };
      }

      const roomState = this.roomManager.setReady(socket.id, readyRaw);

      this.server.to(session.matchId).emit('room-state', roomState);
      socket.emit('ready-updated', { ok: true, ready: readyRaw });

      this.logger.debug(
        `[set-ready] Match ${session.matchId} | Seat ${session.seatId} status ready=${readyRaw}`,
      );
      return { event: 'ready-updated', data: { ok: true } };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.logger.warn(`[set-ready] Recusado: ${message}`);
      return { event: 'error', data: { message } };
    }
  }

  @SubscribeMessage('start-hand')
  async handleStartHand(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: StartHandPayload,
  ): Promise<void | WsResponse<ErrorResponseDto>> {
    this.logger.debug(`[start-hand] Acionado por socket=${socket.id}`);
    try {
      const session = this.roomManager.getSessionBySocketId(socket.id);
      if (!session) {
        return { event: 'error', data: { message: 'You must join a match first.' } };
      }

      const matchId =
        typeof payload?.matchId === 'string' ? payload.matchId.trim() : session.matchId;
      const viraRankRaw = payload?.viraRank;
      const viraRank = typeof viraRankRaw === 'string' ? viraRankRaw.trim().toUpperCase() : '';

      if (!matchId) {
        return { event: 'error', data: { message: 'Invalid payload: matchId is required.' } };
      }

      if (!viraRank) {
        return { event: 'error', data: { message: 'Invalid payload: viraRank is required.' } };
      }

      if (!this.roomManager.canStart(matchId)) {
        return {
          event: 'error',
          data: { message: 'Match cannot start: need 4 players and all ready.' },
        };
      }

      const dto: StartHandRequestDto = { matchId, viraRank };
      const result = await this.startHandUseCase.execute(dto);

      // NOTE: Turn-order é regra multiplayer (transport). Domain continua 1v1 por time (P1/P2).
      const roomState = this.roomManager.beginHand(matchId);
      this.server.to(matchId).emit('room-state', roomState);

      const state = await this.viewMatchStateUseCase.execute({ matchId });
      this.server.to(matchId).emit('match-state', state);

      this.logger.log(`[start-hand] Match ${matchId} | Mão iniciada (Vira: ${viraRank})`);

      // 🔥 CORREÇÃO: Broadcast para toda a sala para gerar as mãos e incluir o viraRank para sincronia de seeds
      this.server.to(matchId).emit('hand-started', { ...result, matchId, viraRank });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.logger.warn(`[start-hand] Recusado: ${message}`);
      return { event: 'error', data: { message } };
    }
  }

  @SubscribeMessage('play-card')
  async handlePlayCard(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: PlayCardPayload,
  ): Promise<void | WsResponse<ErrorResponseDto>> {
    try {
      const session = this.roomManager.getSessionBySocketId(socket.id);
      if (!session) {
        return { event: 'error', data: { message: 'You must join a match first.' } };
      }

      const matchId =
        typeof payload?.matchId === 'string' ? payload.matchId.trim() : session.matchId;
      const rankRaw = payload?.card?.rank;
      const suitRaw = payload?.card?.suit;

      const rank = typeof rankRaw === 'string' ? rankRaw.trim().toUpperCase() : '';
      const suit = typeof suitRaw === 'string' ? suitRaw.trim().toUpperCase() : '';

      if (!matchId) {
        return { event: 'error', data: { message: 'Invalid payload: matchId is required.' } };
      }

      if (!rank || !suit) {
        return {
          event: 'error',
          data: { message: 'Invalid payload: card.rank and card.suit are required.' },
        };
      }

      if (!this.roomManager.isPlayersTurn(socket.id, matchId)) {
        return { event: 'error', data: { message: 'Not your turn.' } };
      }

      const dto: PlayCardRequestDto = {
        matchId,
        playerId: session.domainPlayerId,
        card: `${rank}${suit}`,
      };

      const result = await this.playCardUseCase.execute(dto);

      const roomState = this.roomManager.advanceTurn(matchId);
      this.server.to(matchId).emit('room-state', roomState);

      const state = await this.viewMatchStateUseCase.execute({ matchId });
      this.server.to(matchId).emit('match-state', state);

      this.logger.log(`[play-card] Match ${matchId} | Seat ${session.seatId} jogou ${rank}${suit}`);

      if (state.state === 'finished' && this.roomManager.tryMarkRatingApplied(matchId)) {
        const score = state.score;
        if (score.playerOne !== score.playerTwo) {
          const winnerTeamId = score.playerOne > score.playerTwo ? 'T1' : 'T2';
          const tokens = this.roomManager.getTeamTokens(matchId);

          const winnerTokens = winnerTeamId === 'T1' ? tokens.T1 : tokens.T2;
          const loserTokens = winnerTeamId === 'T1' ? tokens.T2 : tokens.T1;

          // NOTE: Ranking é BC separado: o game não “vira” ranking; só dispara atualização após o resultado.
          await this.updateRatingUseCase.execute({ winnerTokens, loserTokens });

          this.logger.log(
            `[match-finished] Match ${matchId} | Vitória do Time ${winnerTeamId}. Ranking atualizado.`,
          );
          this.server.to(matchId).emit('rating-updated', { ok: true });
        }
      }

      // 🔥 CORREÇÃO: Broadcast para toda a sala saber que a carta foi jogada (logs uniformes)
      this.server.to(matchId).emit('card-played', result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.logger.warn(`[play-card] Recusado: ${message}`);
      return { event: 'error', data: { message } };
    }
  }

  @SubscribeMessage('get-ranking')
  async handleGetRanking(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: GetRankingPayload,
  ): Promise<WsResponse<{ ok: true }> | WsResponse<ErrorResponseDto>> {
    try {
      const raw = payload?.limit;
      const limit = typeof raw === 'number' && Number.isInteger(raw) && raw > 0 ? raw : 20;

      const ranking = await this.getRankingUseCase.execute({ limit });

      socket.emit('ranking', { ranking });
      this.logger.debug(`[get-ranking] Socket ${socket.id} requisitou ranking`);
      return { event: 'ranking', data: { ok: true } };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.logger.warn(`[get-ranking] Erro: ${message}`);
      return { event: 'error', data: { message } };
    }
  }

  @SubscribeMessage('get-state')
  async handleGetState(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: GetStatePayload,
  ): Promise<WsResponse<ViewMatchStateResponseDto> | WsResponse<ErrorResponseDto>> {
    try {
      const matchIdRaw = payload?.matchId;
      const matchId = typeof matchIdRaw === 'string' ? matchIdRaw.trim() : '';

      if (!matchId) {
        return { event: 'error', data: { message: 'Invalid payload: matchId is required.' } };
      }

      const state = await this.viewMatchStateUseCase.execute({ matchId });
      socket.emit('match-state', state);

      this.logger.debug(`[get-state] Socket ${socket.id} requisitou estado da match ${matchId}`);
      return { event: 'state', data: state };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.logger.warn(`[get-state] Erro: ${message}`);
      return { event: 'error', data: { message } };
    }
  }
}
