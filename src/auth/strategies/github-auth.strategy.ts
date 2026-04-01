import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, type Profile } from 'passport-github2';

import { AuthService } from '@game/auth/auth.service';

@Injectable()
export class GitHubAuthStrategy extends PassportStrategy(Strategy, 'github') {
  constructor(private readonly authService: AuthService) {
    super({
      clientID: GitHubAuthStrategy.readEnv(
        'GITHUB_CLIENT_ID',
        'dummy-github-client-id',
        'GitHub OAuth',
      ),
      clientSecret: GitHubAuthStrategy.readEnv(
        'GITHUB_CLIENT_SECRET',
        'dummy-github-client-secret',
        'GitHub OAuth',
      ),
      callbackURL: GitHubAuthStrategy.readEnv(
        'GITHUB_CALLBACK_URL',
        'http://localhost:3000/auth/github/callback',
        'GitHub OAuth',
      ),
      scope: ['user:email'],
    });
  }

  async validate(accessToken: string, refreshToken: string, profile: Profile) {
    void accessToken;
    void refreshToken;

    const primaryEmail = GitHubAuthStrategy.extractPrimaryEmail(profile);
    const avatarUrl = profile.photos?.[0]?.value ?? null;
    const displayName = profile.displayName?.trim() || profile.username?.trim() || null;

    return this.authService.validateOrCreateGitHubUser({
      providerUserId: profile.id,
      email: primaryEmail,
      displayName,
      avatarUrl,
    });
  }

  private static extractPrimaryEmail(profile: Profile): string | null {
    return profile.emails?.[0]?.value ?? null;
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
