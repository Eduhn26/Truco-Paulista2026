import type { BotProfile } from './bot-decision.port';

// Bot identity is presentation-only. Decisions remain driven by BotProfile,
// while the session identity avoids deriving the visible character from seatId.
export type BotIdentity = {
  id: string;
  displayName: string;
  // Opaque visual key resolved by the frontend without depending on remote assets.
  avatarKey: string;
  profile: BotProfile;
};

// Keep the catalog intentionally small; each avatarKey must be renderable by
// the frontend or fall back safely.
const BOT_IDENTITY_CATALOG: readonly BotIdentity[] = [
  { id: 'bal-01', displayName: 'Zé da Mesa', avatarKey: 'spade', profile: 'balanced' },
  { id: 'bal-02', displayName: 'Dona Cida', avatarKey: 'club', profile: 'balanced' },
  { id: 'bal-03', displayName: 'Seu Nico', avatarKey: 'hat', profile: 'balanced' },

  { id: 'agr-01', displayName: 'Tico Brabo', avatarKey: 'fire', profile: 'aggressive' },
  { id: 'agr-02', displayName: 'Vanda Fera', avatarKey: 'bolt', profile: 'aggressive' },
  { id: 'agr-03', displayName: 'Beto Fogo', avatarKey: 'skull', profile: 'aggressive' },

  { id: 'cau-01', displayName: 'Tio Lauro', avatarKey: 'owl', profile: 'cautious' },
  { id: 'cau-02', displayName: 'Dona Olga', avatarKey: 'moon', profile: 'cautious' },
  { id: 'cau-03', displayName: 'Seu Matias', avatarKey: 'leaf', profile: 'cautious' },
] as const;

export function listBotIdentities(): readonly BotIdentity[] {
  return BOT_IDENTITY_CATALOG;
}

// Identity sampling is cosmetic and intentionally unseeded; the fallback keeps
// callers from handling undefined if the catalog is edited incorrectly.
export function pickRandomBotIdentity(profile: BotProfile): BotIdentity {
  const candidates = BOT_IDENTITY_CATALOG.filter((entry) => entry.profile === profile);

  if (candidates.length === 0) {
    return {
      id: `fallback-${profile}`,
      displayName: 'Bot',
      avatarKey: 'unknown',
      profile,
    };
  }

  const index = Math.floor(Math.random() * candidates.length);
  return candidates[index] as BotIdentity;
}

// Room seating samples across the full catalog so profile variety is not tied
// to a fixed bot seat. The sampled identity becomes the session's profile.
export function pickRandomBotIdentityAny(): BotIdentity {
  if (BOT_IDENTITY_CATALOG.length === 0) {
    return {
      id: 'fallback-any',
      displayName: 'Bot',
      avatarKey: 'unknown',
      profile: 'balanced',
    };
  }

  const index = Math.floor(Math.random() * BOT_IDENTITY_CATALOG.length);
  return BOT_IDENTITY_CATALOG[index] as BotIdentity;
}
