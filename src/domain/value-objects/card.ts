import { DomainError } from '../exceptions/domain-error';
import type { Rank } from './rank';
import type { Suit } from './suit';
import { assertRank } from './rank';
import { assertSuit } from './suit';

export class InvalidCardError extends DomainError {
  constructor(card: string) {
    super(`Invalid card: ${card}`);
  }
}

/**
 * Card format: "AS", "2S", "KH", "7D"
 * Rank: A,2,3,4,5,6,7,Q,J,K
 * Suit: S,H,D,C
 */
export class Card {
  private readonly value: string;

  private constructor(value: string) {
    const normalized = value.trim().toUpperCase();

    if (!Card.isValid(normalized)) {
      throw new InvalidCardError(value);
    }

    // valida tipagem dos chars
    assertRank(normalized[0]!);
    assertSuit(normalized[1]!);

    this.value = normalized;
  }

  static from(value: string): Card {
    return new Card(value);
  }

  toString(): string {
    return this.value;
  }

  getRank(): Rank {
    return this.value[0] as Rank;
  }

  getSuit(): Suit {
    return this.value[1] as Suit;
  }

  private static isValid(value: string): boolean {
    return /^[A234567QJK][SHDC]$/.test(value);
  }
}
