import { Injectable } from '@nestjs/common';

import {
  GetOrCreateUserUseCase,
  type GetOrCreateUserRequestDto,
  type GetOrCreateUserResponseDto,
} from '@game/application/use-cases/get-or-create-user.use-case';
import { AuthTokenService, type AuthSessionDto } from './auth-token.service';

export type AuthenticatedUserDto = {
  id: string;
  provider: string;
  providerUserId: string;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  createdAt?: Date;
  updatedAt?: Date;
};

export type DevIdentityInput = {
  providerUserId: string;
  email?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
};

export type GoogleIdentityInput = {
  providerUserId: string;
  email?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
};

export type GitHubIdentityInput = {
  providerUserId: string;
  email?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
};

export type AuthenticatedSessionResponseDto = {
  user: AuthenticatedUserDto;
  authToken: string;
  expiresIn: string;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly getOrCreateUserUseCase: GetOrCreateUserUseCase,
    private readonly authTokenService: AuthTokenService,
  ) {}

  async bootstrapUser(request: GetOrCreateUserRequestDto): Promise<GetOrCreateUserResponseDto> {
    return this.getOrCreateUserUseCase.execute(request);
  }

  async validateOrCreateDevUser(input: DevIdentityInput): Promise<AuthenticatedUserDto> {
    const request: GetOrCreateUserRequestDto = {
      provider: 'dev',
      providerUserId: input.providerUserId,
    };

    if (input.email !== undefined) {
      request.email = input.email;
    }

    if (input.displayName !== undefined) {
      request.displayName = input.displayName;
    }

    if (input.avatarUrl !== undefined) {
      request.avatarUrl = input.avatarUrl;
    }

    const result = await this.getOrCreateUserUseCase.execute(request);

    return result.user;
  }

  async validateOrCreateGoogleUser(input: GoogleIdentityInput): Promise<AuthenticatedUserDto> {
    const request: GetOrCreateUserRequestDto = {
      provider: 'google',
      providerUserId: input.providerUserId,
    };

    if (input.email !== undefined) {
      request.email = input.email;
    }

    if (input.displayName !== undefined) {
      request.displayName = input.displayName;
    }

    if (input.avatarUrl !== undefined) {
      request.avatarUrl = input.avatarUrl;
    }

    const result = await this.getOrCreateUserUseCase.execute(request);

    return result.user;
  }

  async validateOrCreateGitHubUser(input: GitHubIdentityInput): Promise<AuthenticatedUserDto> {
    const request: GetOrCreateUserRequestDto = {
      provider: 'github',
      providerUserId: input.providerUserId,
    };

    if (input.email !== undefined) {
      request.email = input.email;
    }

    if (input.displayName !== undefined) {
      request.displayName = input.displayName;
    }

    if (input.avatarUrl !== undefined) {
      request.avatarUrl = input.avatarUrl;
    }

    const result = await this.getOrCreateUserUseCase.execute(request);

    return result.user;
  }

  createSession(user: AuthenticatedUserDto): AuthenticatedSessionResponseDto {
    const session: AuthSessionDto = this.authTokenService.issueToken(user);

    return {
      user,
      authToken: session.authToken,
      expiresIn: session.expiresIn,
    };
  }
}
