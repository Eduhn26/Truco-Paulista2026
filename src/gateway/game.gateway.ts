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
import { GetOrCreatePlayerProfileUseCase } from '@game/application/use-cases/get-or-create-player-profile.use-case';

import type { ViewMatchStateResponseDto } from '@game/application/dtos/responses/view-match-state.response.dto';
import type { CreateMatchRequestDto } from '@game/application/dtos/requests/create-match.request.dto';
import type { CreateMatchResponseDto } from '@game/application/dtos/responses/create-match.response.dto';
import type { StartHandRequestDto } from '@game/application/dtos/requests/start-hand.request.dto';
import type { StartHandResponseDto } from '@game/application/dtos/responses/start-hand.response.dto';
import type { PlayCardRequestDto } from '@game/application/dtos/requests/play-card.request.dto';
import type { PlayCardResponseDto } from '@game/application/dtos/responses/play-card.response.dto';

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
    private readonly getOrCreatePlayerProfileUseCase: GetOrCreatePlayerProfileUseCase,
    private readonly roomManager: RoomManager,
  ) {}

  private extractPlayerToken(socket: Socket): string {
    const raw = (socket.handshake as unknown as { auth?: { token?: unknown } })?.auth?.token;

    if (typeof raw !== 'string' || raw.trim().length === 0) {
      throw new Error('Missing player token. Provide it via Socket.IO handshake auth.token.');
    }

    return raw.trim();
  }

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
      const playerToken = this.extractPlayerToken(socket);
      const profile = await this.getOrCreatePlayerProfileUseCase.execute({ playerToken });

      const pointsToWinRaw = payload?.pointsToWin;
      const pointsToWin = typeof pointsToWinRaw === 'number' ? pointsToWinRaw : undefined;

      if (pointsToWin !== undefined && !Number.isInteger(pointsToWin)) {
        return { event: 'error', data: { message: 'Invalid payload: pointsToWin must be an integer.' } };
      }

      // NOTE: exactOptionalPropertyTypes: evitar { pointsToWin: undefined }
      const dto: CreateMatchRequestDto = pointsToWin === undefined ? {} : { pointsToWin };

      const result = await this.createMatchUseCase.execute(dto);
      const matchId = result.matchId;

      await socket.join(matchId);

      const session = this.roomManager.join(matchId, socket.id);

      socket.emit('player-assigned', {
        matchId,
        seatId: session.seatId,
        teamId: session.teamId,
        playerId: session.domainPlayerId,
        playerToken,
        profileId: profile.id,
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
      const playerToken = this.extractPlayerToken(socket);
      const profile = await this.getOrCreatePlayerProfileUseCase.execute({ playerToken });

      const matchIdRaw = payload?.matchId;
      const matchId = typeof matchIdRaw === 'string' ? matchIdRaw.trim() : '';

      if (!matchId) {
        return { event: 'error', data: { message: 'Invalid payload: matchId is required.' } };
      }

      await socket.join(matchId);

      const session = this.roomManager.join(matchId, socket.id);

      socket.emit('player-assigned', {
        matchId,
        seatId: session.seatId,
        teamId: session.teamId,
        playerId: session.domainPlayerId,
        playerToken,
        profileId: profile.id,
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

      const session = this.roomManager.getSession(socket.id);
      if (!session) {
        return { event: 'error', data: { message: 'You must join a match first.' } };
      }

      const roomState = this.roomManager.setReady(socket.id, readyRaw);

      this.server.to(session.matchId).emit('room-state', roomState);
      socket.emit('ready-updated', { ok: true, ready: readyRaw });

      return { event: 'ready-updated', data: { ok: true } };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return { event: 'error', data: { message } };
    }
  }

  @SubscribeMessage('start-hand')
  async handleStartHand(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: StartHandPayload,
  ): Promise<WsResponse<StartHandResponseDto> | WsResponse<ErrorResponseDto>> {
    try {
      const session = this.roomManager.getSession(socket.id);
      if (!session) {
        return { event: 'error', data: { message: 'You must join a match first.' } };
      }

      const matchId = typeof payload?.matchId === 'string' ? payload.matchId.trim() : session.matchId;

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
      const result = await this.startHandUseCase.execute(dto);

      // NOTE: Turn-order é regra multiplayer (transport). Domain continua 1v1 por time (P1/P2).
      const roomState = this.roomManager.beginHand(matchId);
      this.server.to(matchId).emit('room-state', roomState);

      const state = await this.viewMatchStateUseCase.execute({ matchId });
      this.server.to(matchId).emit('match-state', state);

      return { event: 'hand-started', data: result };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return { event: 'error', data: { message } };
    }
  }

  @SubscribeMessage('play-card')
  async handlePlayCard(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: PlayCardPayload,
  ): Promise<WsResponse<PlayCardResponseDto> | WsResponse<ErrorResponseDto>> {
    try {
      const session = this.roomManager.getSession(socket.id);
      if (!session) {
        return { event: 'error', data: { message: 'You must join a match first.' } };
      }

      const matchId = typeof payload?.matchId === 'string' ? payload.matchId.trim() : session.matchId;

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

      const result = await this.playCardUseCase.execute(dto);

      const roomState = this.roomManager.advanceTurn(matchId);
      this.server.to(matchId).emit('room-state', roomState);

      const state = await this.viewMatchStateUseCase.execute({ matchId });
      this.server.to(matchId).emit('match-state', state);

      return { event: 'card-played', data: result };
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