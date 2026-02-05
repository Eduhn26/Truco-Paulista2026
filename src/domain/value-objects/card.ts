import { DomainError } from '../exceptions/domain-error';

export class InvalidCardError extends DomainError {
  constructor(card: string) {
    super(`Invalid card: ${card}`);
  }
}

/**
 * Card format (minimal): "AS", "2S", "KH", "7D"
 * Rank: A,2,3,4,5,6,7,Q,J,K
 * Suit: S,H,D,C
 */
export class Card {
  private readonly value: string;

  private constructor(value: string) {
    if (!Card.isValid(value)) {
      throw new InvalidCardError(value);
    }
    this.value = value;
  }

  static from(value: string): Card {
    return new Card(value);
  }

  toString(): string {
    return this.value;
  }

  private static isValid(value: string): boolean {
    return /^[A234567QJK][SHDC]$/.test(value);
  }
}
