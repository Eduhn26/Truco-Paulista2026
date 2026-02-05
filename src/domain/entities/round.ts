import type { PlayerId } from '../value-objects/player-id';
import type { RoundResult } from '../value-objects/round-result';
import type { Rank } from '../value-objects/rank';

import { InvalidMoveError } from '../exceptions/invalid-move-error';
import { compareCards } from '../services/truco-rules';
import type { Card } from '../value-objects/card';

export class Round {
  private readonly plays = new Map<PlayerId, Card>();
  private finished = false;

  constructor(private readonly viraRank: Rank) {}

  play(player: PlayerId, card: Card): void {
    if (this.finished) throw new InvalidMoveError('Round is already finished.');
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
    if (!this.finished) throw new InvalidMoveError('Round is not finished yet.');

    const c1 = this.plays.get('P1');
    const c2 = this.plays.get('P2');
    if (!c1 || !c2) throw new InvalidMoveError('Round missing plays.');

    const r = compareCards(c1, c2, this.viraRank);
    if (r === 'TIE') return 'TIE';
    return r === 'A' ? 'P1' : 'P2';
  }
}
