import { AuthTokenService } from '@game/auth/auth-token.service';
import type { AuthenticatedUserDto } from '@game/auth/auth.service';

describe('AuthTokenService', () => {
  const originalSecret = process.env['AUTH_TOKEN_SECRET'];
  const originalExpiresIn = process.env['AUTH_TOKEN_EXPIRES_IN'];

  const user: AuthenticatedUserDto = {
    id: 'user-123',
    provider: 'github',
    providerUserId: 'provider-user-456',
    email: 'eduardo@example.com',
    displayName: 'Eduardo Henrique',
    avatarUrl: 'https://example.com/avatar.png',
  };

  beforeEach(() => {
    process.env['AUTH_TOKEN_SECRET'] = 'test-auth-token-secret';
    process.env['AUTH_TOKEN_EXPIRES_IN'] = '7d';
  });

  afterAll(() => {
    if (originalSecret === undefined) {
      delete process.env['AUTH_TOKEN_SECRET'];
    } else {
      process.env['AUTH_TOKEN_SECRET'] = originalSecret;
    }

    if (originalExpiresIn === undefined) {
      delete process.env['AUTH_TOKEN_EXPIRES_IN'];
    } else {
      process.env['AUTH_TOKEN_EXPIRES_IN'] = originalExpiresIn;
    }
  });

  it('issues a token with the expected auth payload', () => {
    const service = new AuthTokenService();

    const session = service.issueToken(user);
    const payload = service.verifyToken(session.authToken);

    expect(session.authToken).toEqual(expect.any(String));
    expect(session.expiresIn).toBe('7d');

    expect(payload).toMatchObject({
      sub: 'user-123',
      provider: 'github',
      providerUserId: 'provider-user-456',
    });
  });

  it('uses the fallback expiration when AUTH_TOKEN_EXPIRES_IN is missing', () => {
    delete process.env['AUTH_TOKEN_EXPIRES_IN'];

    const service = new AuthTokenService();
    const session = service.issueToken(user);

    expect(session.expiresIn).toBe('7d');
  });

  it('throws when AUTH_TOKEN_SECRET is missing while issuing a token', () => {
    delete process.env['AUTH_TOKEN_SECRET'];

    const service = new AuthTokenService();

    expect(() => service.issueToken(user)).toThrow(
      'AUTH_TOKEN_SECRET is required for auth token issuance',
    );
  });

  it('throws when AUTH_TOKEN_SECRET is missing while verifying a token', () => {
    const service = new AuthTokenService();
    const session = service.issueToken(user);

    delete process.env['AUTH_TOKEN_SECRET'];

    expect(() => service.verifyToken(session.authToken)).toThrow(
      'AUTH_TOKEN_SECRET is required for auth token issuance',
    );
  });

  it('rejects a malformed token', () => {
    const service = new AuthTokenService();

    expect(() => service.verifyToken('not-a-real-jwt')).toThrow();
  });
});
