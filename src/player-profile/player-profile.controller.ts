import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Patch,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';

import type { PlayerProfileSnapshot } from '@game/application/ports/player-profile.repository';
import { GetOrCreatePlayerProfileUseCase } from '@game/application/use-cases/get-or-create-player-profile.use-case';
import { UpdatePlayerPublicNameUseCase } from '@game/application/use-cases/update-player-public-name.use-case';
import { AuthTokenGuard, type AuthenticatedHttpRequest } from '@game/auth/guards/auth-token.guard';

type PlayerProfileResponseDto = {
  profile: {
    id: string;
    userId: string;
    displayName: string | null;
    publicName: string | null;
    publicSlug: string | null;
    rating: number;
    wins: number;
    losses: number;
    matchesPlayed: number;
  };
};

type UpdatePublicNameBodyDto = {
  publicName?: unknown;
};

@Controller('player-profile')
@UseGuards(AuthTokenGuard)
export class PlayerProfileController {
  constructor(
    private readonly getOrCreatePlayerProfileUseCase: GetOrCreatePlayerProfileUseCase,
    private readonly updatePlayerPublicNameUseCase: UpdatePlayerPublicNameUseCase,
  ) {}

  @Get('me')
  async getMe(@Req() request: AuthenticatedHttpRequest): Promise<PlayerProfileResponseDto> {
    const userId = this.readAuthenticatedUserId(request);

    try {
      const result = await this.getOrCreatePlayerProfileUseCase.execute({ userId });

      return this.toResponse(result.profile);
    } catch (error) {
      throw this.toBadRequest(error);
    }
  }

  @Patch('me')
  async updateMe(
    @Req() request: AuthenticatedHttpRequest,
    @Body() body: UpdatePublicNameBodyDto,
  ): Promise<PlayerProfileResponseDto> {
    const userId = this.readAuthenticatedUserId(request);
    const publicName = this.readPublicName(body);

    try {
      const result = await this.updatePlayerPublicNameUseCase.execute({
        userId,
        publicName,
      });

      return this.toResponse(result.profile);
    } catch (error) {
      throw this.toBadRequest(error);
    }
  }

  private readAuthenticatedUserId(request: AuthenticatedHttpRequest): string {
    const userId = request.auth?.sub;

    if (!userId) {
      throw new UnauthorizedException('Authenticated user not found');
    }

    return userId;
  }

  private readPublicName(body: UpdatePublicNameBodyDto): string {
    if (typeof body?.publicName !== 'string') {
      throw new BadRequestException('publicName must be a string');
    }

    return body.publicName;
  }

  private toResponse(profile: PlayerProfileSnapshot): PlayerProfileResponseDto {
    return {
      profile: {
        id: profile.id,
        userId: profile.userId,
        displayName: profile.displayName ?? null,
        publicName: profile.publicName ?? null,
        publicSlug: profile.publicSlug ?? null,
        rating: profile.rating,
        wins: profile.wins,
        losses: profile.losses,
        matchesPlayed: profile.matchesPlayed,
      },
    };
  }

  private toBadRequest(error: unknown): BadRequestException {
    const message =
      error instanceof Error ? error.message : 'Could not process the player profile request';

    return new BadRequestException(message);
  }
}
