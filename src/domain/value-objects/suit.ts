export const SUITS = ['C', 'H', 'S', 'D'] as const;
export type Suit = (typeof SUITS)[number];

export function assertSuit(value: string): asserts value is Suit {
  if (!SUITS.includes(value as Suit)) {
    throw new Error(`Invalid suit: ${value}`);
  }
}
