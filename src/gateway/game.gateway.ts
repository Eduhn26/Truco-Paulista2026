import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsResponse,
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

      const dto: CreateMatchRequestDto = { pointsToWin };
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
    } catch (err: unknown) {
      return { event: 'error', data: { message: this.toSafeMessage(err) } };
    }
  }

  @SubscribeMessage('join-match')
  async handleJoinMatch(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: JoinMatchPayload,
  ): Promise<WsResponse<{ matchId: string; playerId: 'P2' }> | WsResponse<ErrorResponseDto>> {
    try {
      const matchIdRaw = payload?.matchId;

      if (typeof matchIdRaw !== 'string' || matchIdRaw.trim().length === 0) {
        return {
          event: 'error',
          data: { message: 'Invalid payload: matchId must be a non-empty string.' },
        };
      }

      const matchId = matchIdRaw.trim();

      await socket.join(matchId);

      this.sessionsBySocketId.set(socket.id, {
        matchId,
        playerId: 'P2',
      });

      socket.emit('player-assigned', { matchId, playerId: 'P2' });

      const state = await this.viewMatchStateUseCase.execute({ matchId });
      this.server.to(matchId).emit('match-state', state);

      return { event: 'match-joined', data: { matchId, playerId: 'P2' } };
    } catch (err: unknown) {
      return { event: 'error', data: { message: this.toSafeMessage(err) } };
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

      if (typeof matchIdRaw !== 'string' || matchIdRaw.trim().length === 0) {
        return {
          event: 'error',
          data: { message: 'Invalid payload: matchId must be a non-empty string.' },
        };
      }

      if (typeof viraRankRaw !== 'string' || viraRankRaw.trim().length === 0) {
        return {
          event: 'error',
          data: { message: 'Invalid payload: viraRank must be a non-empty string.' },
        };
      }

      const matchId = matchIdRaw.trim();
      const viraRank = viraRankRaw.trim();

      await socket.join(matchId);

      const dto: StartHandRequestDto = { matchId, viraRank };
      const result = await this.startHandUseCase.execute(dto);

      const state = await this.viewMatchStateUseCase.execute({ matchId });
      this.server.to(matchId).emit('match-state', state);

      return { event: 'hand-started', data: result };
    } catch (err: unknown) {
      return { event: 'error', data: { message: this.toSafeMessage(err) } };
    }
  }

  @SubscribeMessage('get-state')
  async handleGetState(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: GetStatePayload,
  ): Promise<WsResponse<ViewMatchStateResponseDto> | WsResponse<ErrorResponseDto>> {
    try {
      const matchIdRaw = payload?.matchId;

      if (typeof matchIdRaw !== 'string' || matchIdRaw.trim().length === 0) {
        return {
          event: 'error',
          data: { message: 'Invalid payload: matchId must be a non-empty string.' },
        };
      }

      const matchId = matchIdRaw.trim();

      await socket.join(matchId);

      const state = await this.viewMatchStateUseCase.execute({ matchId });

      return { event: 'match-state', data: state };
    } catch (err: unknown) {
      return { event: 'error', data: { message: this.toSafeMessage(err) } };
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
        return {
          event: 'error',
          data: { message: 'You are not assigned to a player. Join a match first.' },
        };
      }

      const matchIdRaw = payload?.matchId;
      const rankRaw = payload?.card?.rank;
      const suitRaw = payload?.card?.suit;

      if (typeof matchIdRaw !== 'string' || matchIdRaw.trim().length === 0) {
        return {
          event: 'error',
          data: { message: 'Invalid payload: matchId must be a non-empty string.' },
        };
      }

      if (typeof rankRaw !== 'string' || rankRaw.trim().length === 0) {
        return {
          event: 'error',
          data: { message: 'Invalid payload: card.rank must be a non-empty string.' },
        };
      }

      if (typeof suitRaw !== 'string' || suitRaw.trim().length === 0) {
        return {
          event: 'error',
          data: { message: 'Invalid payload: card.suit must be a non-empty string.' },
        };
      }

      const matchId = matchIdRaw.trim();

      if (session.matchId !== matchId) {
        return {
          event: 'error',
          data: { message: 'Socket is not joined to this match.' },
        };
      }

      const playerId = session.playerId;

      const rank = rankRaw.trim().toUpperCase();
      const suit = this.normalizeSuit(suitRaw.trim());
      const cardValue = `${rank}${suit}`;

      const dto: PlayCardRequestDto = {
        matchId,
        playerId,
        card: cardValue,
      };

      const result = await this.playCardUseCase.execute(dto);

      const state = await this.viewMatchStateUseCase.execute({ matchId });
      this.server.to(matchId).emit('match-state', state);

      return { event: 'card-played', data: result };
    } catch (err: unknown) {
      return { event: 'error', data: { message: this.toSafeMessage(err) } };
    }
  }

  private normalizeSuit(value: string): string {
    const v = value.trim().toUpperCase();

    if (v === 'C' || v === 'CLUBS' || v === '♣') return 'C';
    if (v === 'D' || v === 'DIAMONDS' || v === '♦') return 'D';
    if (v === 'H' || v === 'HEARTS' || v === '♥') return 'H';
    if (v === 'S' || v === 'SPADES' || v === '♠') return 'S';

    return v;
  }

  private toSafeMessage(err: unknown): string {
    if (err instanceof Error) return err.message;
    return 'Unexpected error.';
  }
}
