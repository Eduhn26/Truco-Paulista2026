import { Body, Controller, Post } from '@nestjs/common';

import { AuthService } from './auth.service';
import type { GetOrCreateUserRequestDto } from '@game/application/use-cases/get-or-create-user.use-case';

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

    const result = await this.authService.bootstrapUser(request);

    return result;
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