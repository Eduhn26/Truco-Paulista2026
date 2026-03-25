import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';

import type { GetOrCreateUserRequestDto } from '@game/application/use-cases/get-or-create-user.use-case';
import {
  AuthService,
  type AuthenticatedSessionResponseDto,
  type AuthenticatedUserDto,
} from './auth.service';
import { DevAuthGuard } from './guards/dev-auth.guard';
import { GitHubAuthGuard } from './guards/github-auth.guard';
import { GoogleAuthGuard } from './guards/google-auth.guard';

type BootstrapUserBodyDto = {
  provider?: unknown;
  providerUserId?: unknown;
  email?: unknown;
  displayName?: unknown;
  avatarUrl?: unknown;
};

type BootstrapUserResponseDto = {
  user: {
    id: string;
    provider: string;
    providerUserId: string;
    email: string | null;
    displayName: string | null;
    avatarUrl: string | null;
  };
  created: boolean;
};

type MeResponseDto = {
  user: AuthenticatedUserDto;
};

type RequestWithUser = Request & {
  user: AuthenticatedUserDto;
};

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('bootstrap-user')
  async bootstrapUser(
    @Body() body: BootstrapUserBodyDto,
  ): Promise<BootstrapUserResponseDto> {
    const email = this.toOptionalString(body.email, 'email');
    const displayName = this.toOptionalString(body.displayName, 'displayName');
    const avatarUrl = this.toOptionalString(body.avatarUrl, 'avatarUrl');

    const request: GetOrCreateUserRequestDto = {
      provider: this.toRequiredString(body.provider, 'provider'),
      providerUserId: this.toRequiredString(body.providerUserId, 'providerUserId'),
    };

    if (email !== undefined) {
      request.email = email;
    }

    if (displayName !== undefined) {
      request.displayName = displayName;
    }

    if (avatarUrl !== undefined) {
      request.avatarUrl = avatarUrl;
    }

    return this.authService.bootstrapUser(request);
  }

  @UseGuards(DevAuthGuard)
  @Get('me')
  async getMe(@Req() request: RequestWithUser): Promise<MeResponseDto> {
    return {
      user: request.user,
    };
  }

  @UseGuards(GoogleAuthGuard)
  @Get('google')
  async googleLogin(): Promise<void> {
    // NOTE: Passport handles the redirect to Google.
  }

  @UseGuards(GoogleAuthGuard)
  @Get('google/callback')
  async googleCallback(
    @Req() request: RequestWithUser,
  ): Promise<AuthenticatedSessionResponseDto> {
    return this.authService.createSession(request.user);
  }

  @UseGuards(GitHubAuthGuard)
  @Get('github')
  async githubLogin(): Promise<void> {
    // NOTE: Passport handles the redirect to GitHub.
  }

  @UseGuards(GitHubAuthGuard)
  @Get('github/callback')
  async githubCallback(
    @Req() request: RequestWithUser,
  ): Promise<AuthenticatedSessionResponseDto> {
    return this.authService.createSession(request.user);
  }

  private toRequiredString(value: unknown, fieldName: string): string {
    if (typeof value !== 'string') {
      throw new Error(`${fieldName} is required`);
    }

    const normalizedValue = value.trim();

    if (!normalizedValue) {
      throw new Error(`${fieldName} is required`);
    }

    return normalizedValue;
  }

  private toOptionalString(value: unknown, fieldName: string): string | null | undefined {
    if (value === undefined) {
      return undefined;
    }

    if (value === null) {
      return null;
    }

    if (typeof value !== 'string') {
      throw new Error(`${fieldName} must be a string`);
    }

    const normalizedValue = value.trim();

    return normalizedValue ? normalizedValue : null;
  }
}