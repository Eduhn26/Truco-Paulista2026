import type {
  MatchStatePayload,
  PlayerAssignedPayload,
  RoomStatePayload,
} from '../../services/socket/socketTypes';

export type MatchSnapshot = {
  roomState: RoomStatePayload | null;
  matchState: MatchStatePayload | null;
  playerAssigned: PlayerAssignedPayload | null;
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

    const parsed = JSON.parse(raw) as Partial<MatchSnapshot>;

    return {
      roomState: parsed.roomState ?? null,
      matchState: parsed.matchState ?? null,
      playerAssigned: parsed.playerAssigned ?? null,
    };
  } catch {
    return null;
  }
}

export function getLastActiveMatchId(): string | null {
  const value = window.sessionStorage.getItem(ACTIVE_MATCH_KEY);

  return value && value.trim() ? value : null;
}

function storageKey(matchId: string): string {
  return `${STORAGE_PREFIX}:${matchId}`;
}