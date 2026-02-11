import { DomainError } from '../exceptions/domain-error';
import { assertRank, type Rank } from './rank';
import { assertSuit, type Suit } from './suit';

export class InvalidCardError extends DomainError {
  constructor(card: string) {
    super(`Invalid card: ${card}`);
  }
}

export class Card {
  private readonly value: string;

  private constructor(value: string) {
    const normalized = value.trim().toUpperCase();

    if (!/^(4|5|6|7|Q|J|K|A|2|3)(P|C|E|O)$/.test(normalized)) {
      throw new InvalidCardError(value);
    }

    const rank = normalized.slice(0, 1) as Rank;
    const suit = normalized.slice(1, 2) as Suit;

    assertRank(rank);
    assertSuit(suit);

    this.value = normalized;
  }

  static from(card: string): Card {
    return new Card(card);
  }

  get rank(): Rank {
    return this.value.slice(0, 1) as Rank;
  }

  get suit(): Suit {
    return this.value.slice(1, 2) as Suit;
  }

  getRank(): Rank {
    return this.rank;
  }

  getSuit(): Suit {
    return this.suit;
  }

  toString(): string {
    return this.value;
  }

  equals(other: Card): boolean {
    return this.value === other.value;
  }
}
