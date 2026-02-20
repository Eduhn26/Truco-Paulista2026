import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  type WsResponse,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';

import { CreateMatchUseCase } from '@game/application/use-cases/create-match.use-case';
import { PlayCardUseCase } from '@game/application/use-cases/play-card.use-case';
import { StartHandUseCase } from '@game/application/use-cases/start-hand.use-case';
import { ViewMatchStateUseCase } from '@game/application/use-cases/view-match-state.use-case';
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

function getPlayerTokenFromHandshake(socket: Socket): string {
  const raw = (socket.handshake as any)?.auth?.token;
  const token = typeof raw === 'string' ? raw.trim() : '';

  // NOTE: Token é identidade estável (reconnect/ranking). Sem token, socketId vira identidade e quebra o objetivo da fase.
  if (!token) throw new Error('Missing playerToken: provide it in Socket.IO handshake auth.token');

  return token;
}

@WebSocketGateway({
  cors: { origin: '*' },
})
export class GameGateway {
  @WebSocketServer()
  private readonly server!: Server;

  constructor(
    private readonly createMatchUseCase: CreateMatchUseCase,
    private readonly startHandUseCase: StartHandUseCase,
    private readonly playCardUseCase: PlayCardUseCase,
    private readonly viewMatchStateUseCase: ViewMatchStateUseCase,
    private readonly roomManager: RoomManager,
  ) {}

  // NOTE: Sem cleanup, seat/ready/turn “vaza” e a sala fica travada como se ainda estivesse ocupada.
  handleDisconnect(socket: Socket): void {
    const left = this.roomManager.leave(socket.id);
    if (!left) return;

    this.server.to(left.matchId).emit('room-state', this.roomManager.getRoomState(left.matchId));
  }

  @SubscribeMessage('create-match')
  async handleCreateMatch(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: CreateMatchPayload,
  ): Promise<WsResponse<CreateMatchResponseDto> | WsResponse<ErrorResponseDto>> {
    try {
      const playerToken = getPlayerTokenFromHandshake(socket);

      const pointsToWinRaw = payload?.pointsToWin;
      const pointsToWin = typeof pointsToWinRaw === 'number' ? pointsToWinRaw : undefined;

      if (pointsToWin !== undefined && !Number.isInteger(pointsToWin)) {
        return { event: 'error', data: { message: 'Invalid payload: pointsToWin must be an integer.' } };
      }

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
        playerToken: session.playerToken,
      });

      this.server.to(matchId).emit('room-state', this.roomManager.getRoomState(matchId));

      const state: ViewMatchStateResponseDto = await this.viewMatchStateUseCase.execute({ matchId });
      this.server.to(matchId).emit('match-state', state);

      return { event: 'created', data: result };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return { event: 'error', data: { message } };
    }
  }

  @SubscribeMessage('join-match')
  async handleJoinMatch(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: JoinMatchPayload,
  ): Promise<WsResponse<{ ok: true }> | WsResponse<ErrorResponseDto>> {
    try {
      const playerToken = getPlayerTokenFromHandshake(socket);

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
        playerToken: session.playerToken,
      });

      this.server.to(matchId).emit('room-state', this.roomManager.getRoomState(matchId));

      const state: ViewMatchStateResponseDto = await this.viewMatchStateUseCase.execute({ matchId });
      this.server.to(matchId).emit('match-state', state);

      return { event: 'joined', data: { ok: true } };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return { event: 'error', data: { message } };
    }
  }

  @SubscribeMessage('set-ready')
  async handleSetReady(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: SetReadyPayload,
  ): Promise<WsResponse<{ ok: true }> | WsResponse<ErrorResponseDto>> {
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
      this.server.to(session.matchId).emit('ready-updated', {
        matchId: session.matchId,
        seatId: session.seatId,
        ready: readyRaw,
      });

      return { event: 'ok', data: { ok: true } };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return { event: 'error', data: { message } };
    }
  }

  @SubscribeMessage('start-hand')
  async handleStartHand(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: StartHandPayload,
  ): Promise<WsResponse<{ ok: true }> | WsResponse<ErrorResponseDto>> {
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
        return { event: 'error', data: { message: 'Match cannot start: need 4 players and all ready.' } };
      }

      const dto: StartHandRequestDto = { matchId, viraRank };
      await this.startHandUseCase.execute(dto);

      // NOTE: Turn-order é regra multiplayer (transport). Domain continua 1v1 por time (P1/P2).
      const roomState = this.roomManager.beginHand(matchId);
      this.server.to(matchId).emit('room-state', roomState);

      this.server.to(matchId).emit('hand-started', { matchId, viraRank });

      const state = await this.viewMatchStateUseCase.execute({ matchId });
      this.server.to(matchId).emit('match-state', state);

      return { event: 'ok', data: { ok: true } };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return { event: 'error', data: { message } };
    }
  }

  @SubscribeMessage('play-card')
  async handlePlayCard(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: PlayCardPayload,
  ): Promise<WsResponse<{ ok: true }> | WsResponse<ErrorResponseDto>> {
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
        return { event: 'error', data: { message: 'Invalid payload: card.rank and card.suit are required.' } };
      }

      if (!this.roomManager.isPlayersTurn(socket.id, matchId)) {
        return { event: 'error', data: { message: 'Not your turn.' } };
      }

      const dto: PlayCardRequestDto = {
        matchId,
        playerId: session.domainPlayerId,
        card: `${rank}${suit}`,
      };

      await this.playCardUseCase.execute(dto);

      this.server.to(matchId).emit('card-played', {
        matchId,
        seatId: session.seatId,
        teamId: session.teamId,
        card: `${rank}${suit}`,
      });

      const roomState = this.roomManager.advanceTurn(matchId);
      this.server.to(matchId).emit('room-state', roomState);

      const state = await this.viewMatchStateUseCase.execute({ matchId });
      this.server.to(matchId).emit('match-state', state);

      return { event: 'ok', data: { ok: true } };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
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

      return { event: 'state', data: state };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return { event: 'error', data: { message } };
    }
  }
}