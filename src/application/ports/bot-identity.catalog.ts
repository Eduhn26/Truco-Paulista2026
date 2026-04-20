import type { BotProfile } from './bot-decision.port';

// Identity is a presentation/room-session attribute of a bot. It does NOT
// influence game decisions — those remain driven solely by BotProfile through
// the heuristic adapter. This catalog exists so the identity the user sees on
// the table is not implicitly derived from seatId. The backend owns id,
// displayName, avatarKey and profile. The frontend owns only the avatarKey ->
// visual mapping and the profile -> localized label mapping.
export type BotIdentity = {
  id: string;
  displayName: string;
  // Short opaque key the frontend resolves to a small visual (emoji, initials,
  // icon). Intentionally not a URL: this is meant to stay cheap and offline.
  avatarKey: string;
  profile: BotProfile;
};

// Closed catalog. Additions must stay small and intentional. Keep 3–5 entries
// per profile; more than that turns identity into content work. Every entry
// must reference an avatarKey that the frontend can render (or the frontend
// must fall back safely).
const BOT_IDENTITY_CATALOG: readonly BotIdentity[] = [
  // Balanced — steady, even-tempered personas.
  { id: 'bal-01', displayName: 'Zé da Mesa', avatarKey: 'spade', profile: 'balanced' },
  { id: 'bal-02', displayName: 'Dona Cida', avatarKey: 'club', profile: 'balanced' },
  { id: 'bal-03', displayName: 'Seu Nico', avatarKey: 'hat', profile: 'balanced' },

  // Aggressive — bold, forward personas.
  { id: 'agr-01', displayName: 'Tico Brabo', avatarKey: 'fire', profile: 'aggressive' },
  { id: 'agr-02', displayName: 'Vanda Fera', avatarKey: 'bolt', profile: 'aggressive' },
  { id: 'agr-03', displayName: 'Beto Fogo', avatarKey: 'skull', profile: 'aggressive' },

  // Cautious — measured, defensive personas.
  { id: 'cau-01', displayName: 'Tio Lauro', avatarKey: 'owl', profile: 'cautious' },
  { id: 'cau-02', displayName: 'Dona Olga', avatarKey: 'moon', profile: 'cautious' },
  { id: 'cau-03', displayName: 'Seu Matias', avatarKey: 'leaf', profile: 'cautious' },
] as const;

export function listBotIdentities(): readonly BotIdentity[] {
  return BOT_IDENTITY_CATALOG;
}

// Picks a random identity whose profile matches. Uses Math.random(): no seed,
// no fairness guarantees — identity is cosmetic. If, for any reason, the
// catalog has no entry for the given profile, we return a deterministic
// fallback so the caller never receives undefined. Callers must still treat
// identity as non-null once chosen.
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
  // Non-null: index is in [0, candidates.length).
  return candidates[index] as BotIdentity;
}

// Picks a random identity across the ENTIRE catalog, ignoring profile. This is
// the entry point used by the room-manager when seating a bot: the bot's
// profile is derived from the sampled identity, not from the seatId. That way
// a 1v1 match does not always end up with the same profile just because the
// bot always takes the same seat. The caller must then use
// identity.profile as the session's BotProfile. Uses Math.random(); returns a
// deterministic fallback only if the catalog is empty (guard for future
// edits).
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
