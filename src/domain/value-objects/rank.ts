export const RANKS = ['4', '5', '6', '7', 'Q', 'J', 'K', 'A', '2', '3'] as const;
export type Rank = (typeof RANKS)[number];

export function assertRank(value: string): asserts value is Rank {
  if (!RANKS.includes(value as Rank)) {
    throw new Error(`Invalid rank: ${value}`);
  }
}

export function nextRank(rank: Rank): Rank {
  const idx = RANKS.indexOf(rank);
  if (idx < 0) throw new Error(`Invalid rank: ${rank}`);

  return RANKS[(idx + 1) % RANKS.length]!;
}

export function rankStrength(rank: Rank): number {
  return RANKS.indexOf(rank);
}
