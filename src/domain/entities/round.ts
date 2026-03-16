import type { PlayerId } from '../value-objects/player-id';
import type { RoundResult } from '../value-objects/round-result';
import type { Rank } from '../value-objects/rank';

import { InvalidMoveError } from '../exceptions/invalid-move-error';
import { compareCards } from '../services/truco-rules';
import { Card } from '../value-objects/card';

export type RoundSnapshot = {
  viraRank: Rank;
  plays: Partial<Record<PlayerId, string>>;
  finished: boolean;
};

export class Round {
  private readonly plays = new Map<PlayerId, Card>();
  private finished = false;

  constructor(private readonly viraRank: Rank) {}

  static fromSnapshot(snapshot: RoundSnapshot): Round {
    const round = new Round(snapshot.viraRank);

    const p1 = snapshot.plays.P1;
    if (typeof p1 === 'string' && p1.length > 0) {
      round.plays.set('P1', Card.from(p1));
    }

    const p2 = snapshot.plays.P2;
    if (typeof p2 === 'string' && p2.length > 0) {
      round.plays.set('P2', Card.from(p2));
    }

    round.finished = snapshot.finished;

    return round;
  }

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

    const result = compareCards(c1, c2, this.viraRank);
    if (result === 'TIE') return 'TIE';

    return result === 'A' ? 'P1' : 'P2';
  }

  toSnapshot(): RoundSnapshot {
    const plays: Partial<Record<PlayerId, string>> = {};

    const p1 = this.plays.get('P1');
    if (p1) {
      plays.P1 = p1.toString();
    }

    const p2 = this.plays.get('P2');
    if (p2) {
      plays.P2 = p2.toString();
    }

    return {
      viraRank: this.viraRank,
      plays,
      finished: this.finished,
    };
  }
}