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

import type { CreateMatchRequestDto } from '@game/application/dtos/requests/create-match.request.dto';
import type { CreateMatchResponseDto } from '@game/application/dtos/responses/create-match.response.dto';

import type { StartHandRequestDto } from '@game/application/dtos/requests/start-hand.request.dto';
import type { StartHandResponseDto } from '@game/application/dtos/responses/start-hand.response.dto';

import type { PlayCardRequestDto } from '@game/application/dtos/requests/play-card.request.dto';
import type { PlayCardResponseDto } from '@game/application/dtos/responses/play-card.response.dto';

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
  playerId?: unknown;
  card?: {
    rank?: unknown;
    suit?: unknown;
  };
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
  ) {}

  @SubscribeMessage('create-match')
  async handleCreateMatch(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: CreateMatchPayload,
  ): Promise<WsResponse<CreateMatchResponseDto> | WsResponse<ErrorResponseDto>> {
    try {
      const pointsToWinRaw = payload?.pointsToWin;

      if (pointsToWinRaw !== undefined) {
        const isValid =
          typeof pointsToWinRaw === 'number' &&
          Number.isInteger(pointsToWinRaw) &&
          pointsToWinRaw > 0;

        if (!isValid) {
          return {
            event: 'error',
            data: { message: 'Invalid payload: pointsToWin must be a positive integer.' },
          };
        }
      }

      const dto: CreateMatchRequestDto = {
        pointsToWin: typeof pointsToWinRaw === 'number' ? pointsToWinRaw : 12,
      };

      const result = await this.createMatchUseCase.execute(dto);

      await socket.join(result.matchId);

      return { event: 'match-created', data: result };
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

  @SubscribeMessage('play-card')
  async handlePlayCard(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: PlayCardPayload,
  ): Promise<WsResponse<PlayCardResponseDto> | WsResponse<ErrorResponseDto>> {
    try {
      const matchIdRaw = payload?.matchId;
      const playerIdRaw = payload?.playerId;
      const rankRaw = payload?.card?.rank;
      const suitRaw = payload?.card?.suit;

      if (typeof matchIdRaw !== 'string' || matchIdRaw.trim().length === 0) {
        return {
          event: 'error',
          data: { message: 'Invalid payload: matchId must be a non-empty string.' },
        };
      }

      if (typeof playerIdRaw !== 'string' || playerIdRaw.trim().length === 0) {
        return {
          event: 'error',
          data: { message: 'Invalid payload: playerId must be a non-empty string.' },
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
      const playerId = playerIdRaw.trim().toUpperCase();

      const rank = rankRaw.trim().toUpperCase();
      const suit = this.normalizeSuit(suitRaw.trim());

      // DTO da Application espera "card: string" no formato do Domain (ex: "5P", "QO", "AE")
      const cardValue = `${rank}${suit}`;

      await socket.join(matchId);

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

  private normalizeSuit(raw: string): 'P' | 'C' | 'E' | 'O' {
    const v = raw.trim().toUpperCase();

    // Já no padrão do domínio
    if (v === 'P' || v === 'C' || v === 'E' || v === 'O') return v;

    // Nomes PT
    if (v === 'PAUS') return 'P';
    if (v === 'COPAS') return 'C';
    if (v === 'ESPADAS') return 'E';
    if (v === 'OUROS') return 'O';

    // Nomes EN
    if (v === 'CLUBS') return 'P';
    if (v === 'HEARTS') return 'C';
    if (v === 'SPADES') return 'E';
    if (v === 'DIAMONDS') return 'O';

    // Símbolos
    if (v === '♣') return 'P';
    if (v === '♥') return 'C';
    if (v === '♠') return 'E';
    if (v === '♦') return 'O';

    throw new Error(`Invalid suit: ${raw}`);
  }

  private toSafeMessage(err: unknown): string {
    if (err instanceof Error && err.message) return err.message;
    return 'Unexpected error';
  }
}
