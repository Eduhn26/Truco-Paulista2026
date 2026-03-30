import { Injectable } from '@nestjs/common';
import jwt, { type Secret } from 'jsonwebtoken';
import type { StringValue } from 'ms';

import type { AuthenticatedUserDto } from '@game/auth/auth.service';

export type AuthTokenPayload = {
  sub: string;
  provider: string;
  providerUserId: string;
};

export type AuthSessionDto = {
  authToken: string;
  expiresIn: string;
};

@Injectable()
export class AuthTokenService {
  private readonly defaultExpiresIn = this.resolveExpiresIn();

  issueToken(user: AuthenticatedUserDto): AuthSessionDto {
    const secret: Secret = this.requireEnv('AUTH_TOKEN_SECRET');

    const payload: AuthTokenPayload = {
      sub: user.id,
      provider: user.provider,
      providerUserId: user.providerUserId,
    };

    const authToken = jwt.sign(payload, secret, {
      expiresIn: this.defaultExpiresIn,
    });

    return {
      authToken,
      expiresIn: this.defaultExpiresIn,
    };
  }

  verifyToken(token: string): AuthTokenPayload {
    const secret: Secret = this.requireEnv('AUTH_TOKEN_SECRET');

    return jwt.verify(token, secret) as AuthTokenPayload;
  }

  private resolveExpiresIn(): StringValue {
    const rawValue = process.env['AUTH_TOKEN_EXPIRES_IN']?.trim();

    if (!rawValue) {
      return '7d';
    }

    return rawValue as StringValue;
  }

  private requireEnv(name: string): string {
    const value = process.env[name]?.trim();

    if (!value) {
      throw new Error(`${name} is required for auth token issuance`);
    }

    return value;
  }
}
