import { DomainError } from '../exceptions/domain-error';
import { assertRank, type Rank } from './rank';
import { assertSuit, type Suit } from './suit';

export class InvalidCardError extends DomainError {
  constructor(card: string) {
    super(`Invalid card: Invalid card: ${card}`);
  }
}

export class Card {
  private readonly value: string;

  private constructor(value: string) {
    const normalized = value.trim().toUpperCase();

    if (!Card.isValid(normalized)) {
      throw new InvalidCardError(value);
    }

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
    // Agora valida: P,C,E,O
    return /^[A234567QJK][PCEO]$/.test(value);
  }
}
