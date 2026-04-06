import type {
  MatchStatePayload,
  PlayerAssignedPayload,
  RoomStatePayload,
} from '../../services/socket/socketTypes';

export type MatchSnapshot = {
  roomState: RoomStatePayload | null;
  publicMatchState: MatchStatePayload | null;
  privateMatchState: MatchStatePayload | null;
  playerAssigned: PlayerAssignedPayload | null;
};

type LegacyMatchSnapshot = {
  roomState?: RoomStatePayload | null;
  matchState?: MatchStatePayload | null;
  publicMatchState?: MatchStatePayload | null;
  privateMatchState?: MatchStatePayload | null;
  playerAssigned?: PlayerAssignedPayload | null;
};

const STORAGE_PREFIX = 'truco-paulista:match-snapshot';
const ACTIVE_MATCH_KEY = 'truco-paulista:active-match-id';

export function saveMatchSnapshot(matchId: string, snapshot: MatchSnapshot): void {
  if (!matchId) {
    return;
  }

  window.sessionStorage.setItem(storageKey(matchId), JSON.stringify(snapshot));
  window.sessionStorage.setItem(ACTIVE_MATCH_KEY, matchId);
}

export function loadMatchSnapshot(matchId: string): MatchSnapshot | null {
  if (!matchId) {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(storageKey(matchId));

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as LegacyMatchSnapshot;
    const fallbackPublicMatchState = parsed.publicMatchState ?? parsed.matchState ?? null;
    const fallbackPrivateMatchState = parsed.privateMatchState ?? null;

    return {
      roomState: parsed.roomState ?? null,
      publicMatchState: fallbackPublicMatchState,
      privateMatchState: fallbackPrivateMatchState,
      playerAssigned: parsed.playerAssigned ?? null,
    };
  } catch {
    return null;
  }
}

export function clearMatchSnapshot(matchId: string): void {
  if (!matchId) {
    return;
  }

  window.sessionStorage.removeItem(storageKey(matchId));

  const activeMatchId = getLastActiveMatchId();
  if (activeMatchId === matchId) {
    window.sessionStorage.removeItem(ACTIVE_MATCH_KEY);
  }
}

export function getLastActiveMatchId(): string | null {
  return window.sessionStorage.getItem(ACTIVE_MATCH_KEY);
}

function storageKey(matchId: string): string {
  return `${STORAGE_PREFIX}:${matchId}`;
}
