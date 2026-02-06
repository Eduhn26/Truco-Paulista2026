import type { Card } from '../value-objects/card';
import type { MatchState } from '../value-objects/match-state';
import type { PlayerId } from '../value-objects/player-id';
import type { Rank } from '../value-objects/rank';

import { InvalidMoveError } from '../exceptions/invalid-move-error';
import { Score } from '../value-objects/score';
import { Hand } from './hand';

export class Match {
  private state: MatchState = 'waiting';
  private score: Score = Score.zero();
  private currentHand: Hand | null = null;

  constructor(private readonly pointsToWin: number) {}

  getState(): MatchState {
    return this.state;
  }

  getScore(): Score {
    return this.score;
  }

  start(viraRank: Rank): void {
    if (this.state === 'finished') {
      throw new InvalidMoveError('Match is already finished.');
    }

    // Só pode iniciar uma nova mão quando estiver aguardando
    if (this.state !== 'waiting') return;

    this.currentHand = new Hand(viraRank);
    this.state = 'in_progress';
  }

  play(player: PlayerId, card: Card): void {
    if (this.state !== 'in_progress' || !this.currentHand) {
      throw new InvalidMoveError('Match is not in progress.');
    }

    this.currentHand.play(player, card);

    if (!this.currentHand.isFinished()) return;

    const winner = this.currentHand.getWinner();
    if (winner) {
      this.score = this.score.addPoint(winner);
    }

    const matchWinner = this.score.hasWinner(this.pointsToWin);

    this.currentHand = null;

    if (matchWinner) {
      this.state = 'finished';
      return;
    }

    this.state = 'waiting';
  }
}
