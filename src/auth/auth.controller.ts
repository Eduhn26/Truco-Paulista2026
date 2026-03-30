import { Body, Controller, Get, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';

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

type OAuthStateDto = {
  frontendUrl?: string;
};

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('bootstrap-user')
  async bootstrapUser(@Body() body: BootstrapUserBodyDto): Promise<BootstrapUserResponseDto> {
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
    @Query() query: OAuthStateDto,
    @Res({ passthrough: false }) response: Response,
  ): Promise<void> {
    const session = this.authService.createSession(request.user);
    this.redirectToFrontendCallback(response, request.user, session, query.frontendUrl);
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
    @Query() query: OAuthStateDto,
    @Res({ passthrough: false }) response: Response,
  ): Promise<void> {
    const session = this.authService.createSession(request.user);
    this.redirectToFrontendCallback(response, request.user, session, query.frontendUrl);
  }

  private redirectToFrontendCallback(
    response: Response,
    user: AuthenticatedUserDto,
    session: AuthenticatedSessionResponseDto,
    rawFrontendUrl?: string,
  ): void {
    const frontendUrl = this.resolveFrontendUrl(rawFrontendUrl);
    const callbackUrl = new URL('/auth/callback', frontendUrl);

    callbackUrl.searchParams.set('authToken', session.authToken);
    callbackUrl.searchParams.set('expiresIn', session.expiresIn);
    callbackUrl.searchParams.set('userId', user.id);
    callbackUrl.searchParams.set('provider', user.provider);

    if (user.email) {
      callbackUrl.searchParams.set('email', user.email);
    }

    if (user.displayName) {
      callbackUrl.searchParams.set('displayName', user.displayName);
    }

    if (user.avatarUrl) {
      callbackUrl.searchParams.set('avatarUrl', user.avatarUrl);
    }

    response.redirect(callbackUrl.toString());
  }

  private resolveFrontendUrl(rawFrontendUrl?: string): string {
    const normalizedQueryUrl = rawFrontendUrl?.trim();
    if (normalizedQueryUrl) {
      return normalizedQueryUrl.replace(/\/+$/, '');
    }

    const envFrontendUrl = process.env['FRONTEND_URL']?.trim();
    if (!envFrontendUrl) {
      throw new Error('FRONTEND_URL is required for OAuth callback redirect');
    }

    return envFrontendUrl.replace(/\/+$/, '');
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
