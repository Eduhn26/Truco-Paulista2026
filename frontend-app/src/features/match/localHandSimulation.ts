import type { CardPayload, Rank, SeatId } from '../../services/socket/socketTypes';

export type PlayedCardEntry =
  | {
      kind: 'card';
      card: CardPayload;
    }
  | {
      kind: 'back';
    }
  | null;

export type LocalHandState = {
  matchId: string;
  handNo: number;
  vira: CardPayload;
  viraRankChosen: Rank;
  hands: Record<string, CardPayload[]>;
  played: Record<string, PlayedCardEntry>;
};

const SEATS: SeatId[] = ['T1A', 'T2A', 'T1B', 'T2B'];
const SUITS: CardPayload['suit'][] = ['C', 'O', 'P', 'E'];
const RANKS: Rank[] = ['4', '5', '6', '7', 'Q', 'J', 'K', 'A', '2', '3'];

const LS = {
  keyCurrentHand(matchId: string) {
    return `tp:currentHand:${matchId}`;
  },
  keyHand(matchId: string, handNo: number) {
    return `tp:hand:${matchId}:${handNo}`;
  },
};

export function loadLocalHand(matchId: string): LocalHandState | null {
  const handNo = getCurrentHandNo(matchId);
  if (!handNo) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(LS.keyHand(matchId, handNo));
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as LocalHandState;

    if (!parsed.matchId || !parsed.vira || !parsed.hands) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function startLocalHand(matchId: string, viraRankChosen: Rank): LocalHandState {
  const existing = loadLocalHand(matchId);

  if (existing && existing.viraRankChosen === viraRankChosen) {
    return existing;
  }

  const handNo = (getCurrentHandNo(matchId) ?? 0) + 1;
  const seed = hashStringToU32(`${matchId}:${handNo}:${viraRankChosen}`);
  const rand = mulberry32(seed);

  const deck = buildDeck();
  shuffleInPlace(deck, rand);

  const hands: Record<string, CardPayload[]> = {
    T1A: [],
    T2A: [],
    T1B: [],
    T2B: [],
  };

  for (let i = 0; i < 3; i += 1) {
    for (const seatId of SEATS) {
      const nextCard = deck.pop();
      if (nextCard) {
        (hands[seatId] ??= []).push(nextCard);
      }
    }
  }

  const suit = SUITS[Math.floor(rand() * SUITS.length)] ?? 'C';

  const localHand: LocalHandState = {
    matchId,
    handNo,
    vira: {
      rank: viraRankChosen,
      suit,
    },
    viraRankChosen,
    hands,
    played: {
      T1A: null,
      T2A: null,
      T1B: null,
      T2B: null,
    },
  };

  persistLocalHand(localHand);

  return localHand;
}

export function playCardFromLocalHand(
  hand: LocalHandState,
  seatId: SeatId,
  card: CardPayload,
): LocalHandState {
  const cards = Array.isArray(hand.hands[seatId]) ? [...hand.hands[seatId]] : [];
  const cardKey = toCardKey(card);
  const cardIndex = cards.findIndex((entry) => toCardKey(entry) === cardKey);

  if (cardIndex < 0) {
    return hand;
  }

  cards.splice(cardIndex, 1);

  const nextHand: LocalHandState = {
    ...hand,
    hands: {
      ...hand.hands,
      [seatId]: cards,
    },
    played: {
      ...hand.played,
      [seatId]: {
        kind: 'card',
        card,
      },
    },
  };

  persistLocalHand(nextHand);

  return nextHand;
}

export function markSeatAsBackCard(hand: LocalHandState, seatId: SeatId): LocalHandState {
  const nextHand: LocalHandState = {
    ...hand,
    played: {
      ...hand.played,
      [seatId]: {
        kind: 'back',
      },
    },
  };

  persistLocalHand(nextHand);

  return nextHand;
}

export function clearPlayedCards(hand: LocalHandState): LocalHandState {
  const nextHand: LocalHandState = {
    ...hand,
    played: {
      T1A: null,
      T2A: null,
      T1B: null,
      T2B: null,
    },
  };

  persistLocalHand(nextHand);

  return nextHand;
}

function persistLocalHand(hand: LocalHandState): void {
  try {
    window.localStorage.setItem(LS.keyCurrentHand(hand.matchId), JSON.stringify({ handNo: hand.handNo }));
    window.localStorage.setItem(LS.keyHand(hand.matchId, hand.handNo), JSON.stringify(hand));
  } catch {
    // NOTE: Local simulation is a progressive enhancement for the UI.
  }
}

function getCurrentHandNo(matchId: string): number | null {
  try {
    const raw = window.localStorage.getItem(LS.keyCurrentHand(matchId));
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as { handNo?: number };
    return Number.isFinite(parsed.handNo) ? parsed.handNo! : null;
  } catch {
    return null;
  }
}

function buildDeck(): CardPayload[] {
  const deck: CardPayload[] = [];

  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit });
    }
  }

  return deck;
}

function shuffleInPlace(deck: CardPayload[], rand: () => number): void {
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const temp = deck[i];
    deck[i] = deck[j]!;
    deck[j] = temp!;
  }
}

function hashStringToU32(value: string): number {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;

  return function nextRandom(): number {
    state += 0x6d2b79f5;

    let temp = state;
    temp = Math.imul(temp ^ (temp >>> 15), temp | 1);
    temp ^= temp + Math.imul(temp ^ (temp >>> 7), temp | 61);

    return ((temp ^ (temp >>> 14)) >>> 0) / 4294967296;
  };
}

function toCardKey(card: CardPayload): string {
  return `${card.rank}|${card.suit}`;
}