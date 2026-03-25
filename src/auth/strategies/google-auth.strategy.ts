import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import {
  Strategy,
  type Profile,
  type VerifyCallback,
} from 'passport-google-oauth20';

import { AuthService, type AuthenticatedUserDto } from '@game/auth/auth.service';

@Injectable()
export class GoogleAuthStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(private readonly authService: AuthService) {
    super({
      clientID: GoogleAuthStrategy.requireEnv('GOOGLE_CLIENT_ID'),
      clientSecret: GoogleAuthStrategy.requireEnv('GOOGLE_CLIENT_SECRET'),
      callbackURL: GoogleAuthStrategy.requireEnv('GOOGLE_CALLBACK_URL'),
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

      const user = await this.authService.validateOrCreateGoogleUser({
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

  private static requireEnv(name: string): string {
    const value = process.env[name]?.trim();

    if (!value) {
      throw new Error(`${name} is required for Google OAuth`);
    }

    return value;
  }
}