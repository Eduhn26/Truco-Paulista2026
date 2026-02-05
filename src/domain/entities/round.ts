import type { PlayerId } from '../value-objects/player-id';
import type { RoundResult } from '../value-objects/round-result';
import type { Card } from '../value-objects/card';

import { InvalidMoveError } from '../exceptions/invalid-move-error';

export class Round {
  private readonly plays = new Map<PlayerId, Card>();
  private finished: boolean = false;

  play(player: PlayerId, card: Card): void {
    if (this.finished) {
      throw new InvalidMoveError('Round is already finished.');
    }

    if (this.plays.has(player)) {
      throw new InvalidMoveError(`Player ${player} already played this round.`);
    }

    this.plays.set(player, card);

    if (this.plays.size === 2) {
      this.finished = true;
    }
  }

  isFinished(): boolean {
    return this.finished;
  }

  getResult(): RoundResult {
    if (!this.finished) {
      throw new InvalidMoveError('Round is not finished yet.');
    }

    const c1 = this.plays.get('P1');
    const c2 = this.plays.get('P2');

    if (!c1 || !c2) {
      throw new InvalidMoveError('Round missing plays.');
    }

    const s1 = c1.toString();
    const s2 = c2.toString();

    if (s1 === s2) return 'TIE';
    return s1 > s2 ? 'P1' : 'P2';
  }
}
