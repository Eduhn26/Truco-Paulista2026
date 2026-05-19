import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';

import { AuthTokenService, type AuthTokenPayload } from '@game/auth/auth-token.service';

export type AuthenticatedHttpRequest = Request & {
  auth?: AuthTokenPayload;
};

@Injectable()
export class AuthTokenGuard implements CanActivate {
  constructor(private readonly authTokenService: AuthTokenService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedHttpRequest>();
    const token = this.extractBearerToken(request);

    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    try {
      request.auth = this.authTokenService.verifyToken(token);
      return true;
    } catch {
      throw new UnauthorizedException('Invalid bearer token');
    }
  }

  private extractBearerToken(request: Request): string | null {
    const rawAuthorization = request.header('authorization')?.trim();

    if (!rawAuthorization) {
      return null;
    }

    const [scheme, token] = rawAuthorization.split(/\s+/);

    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      return null;
    }

    return token;
  }
}
