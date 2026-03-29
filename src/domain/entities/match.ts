import type { Card } from '../value-objects/card';
import type { MatchState } from '../value-objects/match-state';
import type { PlayerId } from '../value-objects/player-id';
import type { Rank } from '../value-objects/rank';

import { InvalidMoveError } from '../exceptions/invalid-move-error';
import { Score } from '../value-objects/score';
import { Hand, type HandSnapshot } from './hand';

export type MatchSnapshot = {
  pointsToWin: number;
  state: MatchState;
  score: {
    playerOne: number;
    playerTwo: number;
  };
  currentHand: HandSnapshot | null;
};

export class Match {
  private state: MatchState = 'waiting';
  private score: Score = Score.zero();
  private currentHand: Hand | null = null;

  constructor(private readonly pointsToWin: number) {}

  static fromSnapshot(snapshot: MatchSnapshot): Match {
    const match = new Match(snapshot.pointsToWin);

    let restoredScore = Score.zero();

    for (let index = 0; index < snapshot.score.playerOne; index += 1) {
      restoredScore = restoredScore.addPoint('P1');
    }

    for (let index = 0; index < snapshot.score.playerTwo; index += 1) {
      restoredScore = restoredScore.addPoint('P2');
    }

    match.state = snapshot.state;
    match.score = restoredScore;
    match.currentHand = snapshot.currentHand ? Hand.fromSnapshot(snapshot.currentHand) : null;

    return match;
  }

  getState(): MatchState {
    return this.state;
  }

  getScore(): Score {
    return this.score;
  }

  getCurrentHand(): Hand | null {
    return this.currentHand;
  }

  start(viraRank: Rank): void {
    if (this.state === 'finished') {
      throw new InvalidMoveError('Match is already finished.');
    }

    if (this.state !== 'waiting') return;

    this.currentHand = Hand.start(viraRank);
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

  toSnapshot(): MatchSnapshot {
    const score = this.getScore();

    return {
      pointsToWin: this.pointsToWin,
      state: this.state,
      score: {
        playerOne: score.playerOne,
        playerTwo: score.playerTwo,
      },
      currentHand: this.currentHand ? this.currentHand.toSnapshot() : null,
    };
  }
}