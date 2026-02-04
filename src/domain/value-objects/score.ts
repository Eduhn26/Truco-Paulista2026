import { DomainError } from '../exceptions/domain-error';

export class InvalidScoreError extends DomainError {
  constructor(score: number) {
    super(`Invalid score: ${score}. Score must be between 0 and 12.`);
  }
}

export class Score {
  private readonly value: number;

  private constructor(value: number) {
    if (value < 0 || value > 12) {
      throw new InvalidScoreError(value);
    }

    this.value = value;
  }

  static zero(): Score {
    return new Score(0);
  }

  add(points: number): Score {
    return new Score(this.value + points);
  }

  getValue(): number {
    return this.value;
  }

  isWinning(): boolean {
    return this.value >= 12;
  }
}
