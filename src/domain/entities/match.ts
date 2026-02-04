import { Score } from '../value-objects/score';
import type { MatchState } from '../value-objects/match-state';
import { DomainError } from '../exceptions/domain-error';

export class MatchAlreadyFinishedError extends DomainError {
  constructor() {
    super('Match is already finished.');
  }
}

export class MatchCannotBeStartedError extends DomainError {
  constructor() {
    super('Match cannot be started from current state.');
  }
}

export class Match {
  private state: MatchState;
  private scorePlayerOne: Score;
  private scorePlayerTwo: Score;

  private constructor() {
    this.state = 'waiting';
    this.scorePlayerOne = Score.zero();
    this.scorePlayerTwo = Score.zero();
  }

  static create(): Match {
    return new Match();
  }

  start(): void {
    if (this.state !== 'waiting') {
      throw new MatchCannotBeStartedError();
    }

    this.state = 'in_progress';
  }

  addPointsToPlayerOne(points: number): void {
    this.ensureInProgress();
    this.scorePlayerOne = this.scorePlayerOne.add(points);
    this.checkEnd();
  }

  addPointsToPlayerTwo(points: number): void {
    this.ensureInProgress();
    this.scorePlayerTwo = this.scorePlayerTwo.add(points);
    this.checkEnd();
  }

  getState(): MatchState {
    return this.state;
  }

  getScore(): { playerOne: number; playerTwo: number } {
    return {
      playerOne: this.scorePlayerOne.getValue(),
      playerTwo: this.scorePlayerTwo.getValue(),
    };
  }

  private ensureInProgress(): void {
    if (this.state !== 'in_progress') {
      throw new MatchAlreadyFinishedError();
    }
  }

  private checkEnd(): void {
    if (this.scorePlayerOne.isWinning() || this.scorePlayerTwo.isWinning()) {
      this.state = 'finished';
    }
  }
}
