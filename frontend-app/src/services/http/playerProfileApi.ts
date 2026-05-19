import type { FrontendSession } from '../../features/auth/authStorage';

export type PlayerProfileDto = {
  id: string;
  userId: string;
  displayName: string | null;
  publicName: string | null;
  publicSlug: string | null;
  rating: number;
  wins: number;
  losses: number;
  matchesPlayed: number;
};

export type PlayerProfileResponseDto = {
  profile: PlayerProfileDto;
};

function normalizeBackendUrl(backendUrl: string): string {
  return backendUrl.trim().replace(/\/+$/, '');
}

function asObject(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function asNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function normalizePlayerProfileResponse(payload: unknown): PlayerProfileResponseDto {
  const input = asObject(payload);
  const profile = asObject(input.profile);

  return {
    profile: {
      id: asString(profile.id),
      userId: asString(profile.userId),
      displayName: asNullableString(profile.displayName),
      publicName: asNullableString(profile.publicName),
      publicSlug: asNullableString(profile.publicSlug),
      rating: asNumber(profile.rating),
      wins: asNumber(profile.wins),
      losses: asNumber(profile.losses),
      matchesPlayed: asNumber(profile.matchesPlayed),
    },
  };
}

function extractErrorMessage(payload: unknown, fallback: string): string {
  const input = asObject(payload);
  const message = input.message;

  if (typeof message === 'string' && message.trim()) {
    return message;
  }

  if (Array.isArray(message)) {
    const normalizedMessages = message
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean);

    if (normalizedMessages.length > 0) {
      return normalizedMessages.join(', ');
    }
  }

  return fallback;
}

async function readJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

async function requestPlayerProfile(
  session: FrontendSession,
  path: string,
  init?: RequestInit,
): Promise<PlayerProfileResponseDto> {
  const response = await fetch(`${normalizeBackendUrl(session.backendUrl)}${path}`, {
    ...init,
    headers: {
      ...init?.headers,
      Authorization: `Bearer ${session.authToken}`,
    },
  });

  const payload = await readJsonResponse(response);

  if (!response.ok) {
    throw new Error(extractErrorMessage(payload, 'Não foi possível carregar o perfil.'));
  }

  return normalizePlayerProfileResponse(payload);
}

export function getMyPlayerProfile(session: FrontendSession): Promise<PlayerProfileResponseDto> {
  return requestPlayerProfile(session, '/player-profile/me');
}

export function updateMyPlayerPublicName(
  session: FrontendSession,
  publicName: string,
): Promise<PlayerProfileResponseDto> {
  return requestPlayerProfile(session, '/player-profile/me', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ publicName }),
  });
}
