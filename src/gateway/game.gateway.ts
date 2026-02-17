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
import type { StartHandResponseDto } from '@game/application/dtos/responses/start-hand.response.dto';

import type { PlayCardRequestDto } from '@game/application/dtos/requests/play-card.request.dto';
import type { PlayCardResponseDto } from '@game/application/dtos/responses/play-card.response.dto';

type ErrorResponseDto = { message: string };

type PlayerSession = {
  matchId: string;
  playerId: 'P1' | 'P2';
};

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

@WebSocketGateway({
  cors: { origin: '*' },
})
export class GameGateway {
  @WebSocketServer()
  private readonly server!: Server;

  private readonly sessionsBySocketId = new Map<string, PlayerSession>();

  constructor(
    private readonly createMatchUseCase: CreateMatchUseCase,
    private readonly startHandUseCase: StartHandUseCase,
    private readonly playCardUseCase: PlayCardUseCase,
    private readonly viewMatchStateUseCase: ViewMatchStateUseCase,
  ) {}

  @SubscribeMessage('create-match')
  async handleCreateMatch(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: CreateMatchPayload,
  ): Promise<WsResponse<CreateMatchResponseDto> | WsResponse<ErrorResponseDto>> {
    try {
      const pointsToWinRaw = payload?.pointsToWin;
      const pointsToWin = typeof pointsToWinRaw === 'number' ? pointsToWinRaw : undefined;

      if (pointsToWin !== undefined && !Number.isInteger(pointsToWin)) {
        return {
          event: 'error',
          data: { message: 'Invalid payload: pointsToWin must be an integer.' },
        };
      }

      // ✅ exactOptionalPropertyTypes: não pode setar { pointsToWin: undefined }
      const dto: CreateMatchRequestDto = pointsToWin === undefined ? {} : { pointsToWin };
      const result = await this.createMatchUseCase.execute(dto);

      await socket.join(result.matchId);

      // registra como P1
      this.sessionsBySocketId.set(socket.id, {
        matchId: result.matchId,
        playerId: 'P1',
      });

      socket.emit('player-assigned', {
        matchId: result.matchId,
        playerId: 'P1',
      });

      const state = await this.viewMatchStateUseCase.execute({
        matchId: result.matchId,
      });

      this.server.to(result.matchId).emit('match-state', state);

      return { event: 'match-created', data: result };
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
      const matchIdRaw = payload?.matchId;
      const matchId = typeof matchIdRaw === 'string' ? matchIdRaw.trim() : '';

      if (!matchId) {
        return {
          event: 'error',
          data: { message: 'Invalid payload: matchId is required.' },
        };
      }

      await socket.join(matchId);

      // assign P2 se ainda não tem sessão
      this.sessionsBySocketId.set(socket.id, {
        matchId,
        playerId: 'P2',
      });

      socket.emit('player-assigned', {
        matchId,
        playerId: 'P2',
      });

      const state: ViewMatchStateResponseDto = await this.viewMatchStateUseCase.execute({
        matchId,
      });
      this.server.to(matchId).emit('match-state', state);

      return { event: 'joined', data: { ok: true } };
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
      const matchIdRaw = payload?.matchId;
      const viraRankRaw = payload?.viraRank;

      const matchId = typeof matchIdRaw === 'string' ? matchIdRaw.trim() : '';
      const viraRank = typeof viraRankRaw === 'string' ? viraRankRaw.trim().toUpperCase() : '';

      if (!matchId) {
        return {
          event: 'error',
          data: { message: 'Invalid payload: matchId is required.' },
        };
      }

      if (!viraRank) {
        return {
          event: 'error',
          data: { message: 'Invalid payload: viraRank is required.' },
        };
      }

      const dto: StartHandRequestDto = { matchId, viraRank };
      const result = await this.startHandUseCase.execute(dto);

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
      const session = this.sessionsBySocketId.get(socket.id);
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
        return {
          event: 'error',
          data: { message: 'Invalid payload: matchId is required.' },
        };
      }

      if (!rank || !suit) {
        return {
          event: 'error',
          data: {
            message: 'Invalid payload: card.rank and card.suit are required.',
          },
        };
      }

      const dto: PlayCardRequestDto = {
        matchId,
        playerId: session.playerId,
        card: `${rank}${suit}`,
      };

      const result = await this.playCardUseCase.execute(dto);

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
        return {
          event: 'error',
          data: { message: 'Invalid payload: matchId is required.' },
        };
      }

      const state = await this.viewMatchStateUseCase.execute({ matchId });
      return { event: 'match-state', data: state };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return { event: 'error', data: { message } };
    }
  }
}
