import type { PlayerId } from '../value-objects/player-id';
import type { Card } from '../value-objects/card';
import type { RoundResult } from '../value-objects/round-result';
import type { Rank } from '../value-objects/rank';

import { Round } from './round';
import { InvalidMoveError } from '../exceptions/invalid-move-error';

export class Hand {
  private readonly rounds: Round[];
  private finished = false;

  constructor(private readonly viraRank: Rank) {
    this.rounds = [new Round(this.viraRank)];
  }

  play(player: PlayerId, card: Card): void {
    if (this.finished) throw new InvalidMoveError('Hand is already finished.');

    const currentRound = this.getCurrentRound();
    currentRound.play(player, card);

    if (currentRound.isFinished()) {
      this.checkEnd();

      if (!this.finished && this.rounds.length < 3) {
        this.rounds.push(new Round(this.viraRank));
      }
    }
  }

  isFinished(): boolean {
    return this.finished;
  }

  getRoundsCount(): number {
    return this.rounds.length;
  }

  getWinner(): PlayerId | null {
    if (!this.finished) return null;

    const wins = this.countWins();
    if (wins.P1 >= 2) return 'P1';
    if (wins.P2 >= 2) return 'P2';
    return null;
  }

  private getCurrentRound(): Round {
    return this.rounds[this.rounds.length - 1]!;
  }

  private checkEnd(): void {
    const wins = this.countWins();

    if (wins.P1 >= 2 || wins.P2 >= 2) {
      this.finished = true;
      return;
    }

    if (this.rounds.length === 3 && this.getCurrentRound().isFinished()) {
      this.finished = true;
    }
  }

  private countWins(): Record<'P1' | 'P2', number> {
    const wins = { P1: 0, P2: 0 };

    for (const round of this.rounds) {
      if (!round.isFinished()) continue;

      const result: RoundResult = round.getResult();
      if (result === 'P1') wins.P1 += 1;
      if (result === 'P2') wins.P2 += 1;
    }

    return wins;
  }
}
