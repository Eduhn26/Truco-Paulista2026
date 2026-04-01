import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, type Profile, type VerifyCallback } from 'passport-google-oauth20';

import { AuthService, type AuthenticatedUserDto } from '@game/auth/auth.service';

@Injectable()
export class GoogleAuthStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(private readonly authService: AuthService) {
    super({
      clientID: GoogleAuthStrategy.readEnv(
        'GOOGLE_CLIENT_ID',
        'dummy-google-client-id',
        'Google OAuth',
      ),
      clientSecret: GoogleAuthStrategy.readEnv(
        'GOOGLE_CLIENT_SECRET',
        'dummy-google-client-secret',
        'Google OAuth',
      ),
      callbackURL: GoogleAuthStrategy.readEnv(
        'GOOGLE_CALLBACK_URL',
        'http://localhost:3000/auth/google/callback',
        'Google OAuth',
      ),
      scope: ['email', 'profile'],
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ): Promise<void> {
    try {
      void accessToken;
      void refreshToken;

      const primaryEmail = profile.emails?.[0]?.value ?? null;
      const avatarUrl = profile.photos?.[0]?.value ?? null;
      const displayName = profile.displayName?.trim() || null;

      const user: AuthenticatedUserDto = await this.authService.validateOrCreateGoogleUser({
        providerUserId: profile.id,
        email: primaryEmail,
        displayName,
        avatarUrl,
      });

      done(null, user);
    } catch (error) {
      done(error as Error, false);
    }
  }

  private static readEnv(name: string, fallback: string, context: string): string {
    const value = process.env[name]?.trim();

    if (value) {
      return value;
    }

    if (process.env['NODE_ENV'] === 'production') {
      throw new Error(`${name} is required for ${context}`);
    }

    return fallback;
  }
}
