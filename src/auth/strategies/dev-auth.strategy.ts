import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-custom';
import type { Request } from 'express';

import {
  AuthService,
  type AuthenticatedUserDto,
  type DevIdentityInput,
} from '@game/auth/auth.service';

@Injectable()
export class DevAuthStrategy extends PassportStrategy(Strategy, 'dev-auth') {
  constructor(private readonly authService: AuthService) {
    super();
  }

  async validate(request: Request): Promise<AuthenticatedUserDto> {
    const providerUserId = this.readRequiredHeader(request, 'x-dev-user-id');
    const email = this.readOptionalHeader(request, 'x-dev-user-email');
    const displayName = this.readOptionalHeader(request, 'x-dev-user-name');
    const avatarUrl = this.readOptionalHeader(request, 'x-dev-user-avatar');

    const input: DevIdentityInput = {
      providerUserId,
    };

    if (email !== undefined) {
      input.email = email;
    }

    if (displayName !== undefined) {
      input.displayName = displayName;
    }

    if (avatarUrl !== undefined) {
      input.avatarUrl = avatarUrl;
    }

    return this.authService.validateOrCreateDevUser(input);
  }

  private readRequiredHeader(request: Request, headerName: string): string {
    const rawValue = request.header(headerName);

    if (typeof rawValue !== 'string') {
      throw new Error(`${headerName} header is required`);
    }

    const normalizedValue = rawValue.trim();

    if (!normalizedValue) {
      throw new Error(`${headerName} header is required`);
    }

    return normalizedValue;
  }

  private readOptionalHeader(request: Request, headerName: string): string | null | undefined {
    const rawValue = request.header(headerName);

    if (rawValue === undefined) {
      return undefined;
    }

    const normalizedValue = rawValue.trim();

    return normalizedValue ? normalizedValue : null;
  }
}
