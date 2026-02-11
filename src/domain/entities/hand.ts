import type { PlayerId } from '../value-objects/player-id';
import type { RoundResult } from '../value-objects/round-result';
import type { Rank } from '../value-objects/rank';
import type { Card } from '../value-objects/card';

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
      this.evaluateFinished();

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
    return this.resolveWinner();
  }

  private getCurrentRound(): Round {
    return this.rounds[this.rounds.length - 1]!;
  }

  private evaluateFinished(): void {
    const winner = this.resolveWinner();
    if (winner) {
      this.finished = true;
      return;
    }

    if (this.rounds.length === 3 && this.getCurrentRound().isFinished()) {
      this.finished = true;
    }
  }

  private resolveWinner(): PlayerId | null {
    const wins = this.countWins();
    if (wins.P1 >= 2) return 'P1';
    if (wins.P2 >= 2) return 'P2';

    const r1 = this.getRoundResultAt(0);
    const r2 = this.getRoundResultAt(1);
    const r3 = this.getRoundResultAt(2);

    if (!r1 || !r2) return null;

    // Truco Paulista (tie-break):
    // 1) Se a 2ª rodada empata, vence quem ganhou a 1ª.
    if (r1 !== 'TIE' && r2 === 'TIE') return r1;

    // 2) Se a 1ª empata, vence quem ganhar a 2ª.
    if (r1 === 'TIE' && r2 !== 'TIE') return r2;

    // 3) Se as duas primeiras empatarem, a 3ª decide.
    if (r1 === 'TIE' && r2 === 'TIE') {
      if (r3 && r3 !== 'TIE') return r3;
      return null;
    }

    // 4) Se 1ª e 2ª tiverem vencedores diferentes, a 3ª decide.
    if (r1 !== 'TIE' && r2 !== 'TIE' && r1 !== r2) {
      if (r3 && r3 !== 'TIE') return r3;
      return null;
    }

    return null;
  }

  private getRoundResultAt(index: number): RoundResult | null {
    const round = this.rounds[index];
    if (!round) return null;
    if (!round.isFinished()) return null;
    return round.getResult();
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
