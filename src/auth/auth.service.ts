import { Injectable } from '@nestjs/common';

import {
  GetOrCreateUserUseCase,
  type GetOrCreateUserRequestDto,
  type GetOrCreateUserResponseDto,
} from '@game/application/use-cases/get-or-create-user.use-case';

export type AuthenticatedUserDto = {
  id: string;
  provider: string;
  providerUserId: string;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
};

export type DevIdentityInput = {
  providerUserId: string;
  email?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
};

@Injectable()
export class AuthService {
  constructor(private readonly getOrCreateUserUseCase: GetOrCreateUserUseCase) {}

  async bootstrapUser(
    request: GetOrCreateUserRequestDto,
  ): Promise<GetOrCreateUserResponseDto> {
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
}