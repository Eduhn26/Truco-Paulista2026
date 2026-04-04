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

    match.state = snapshot.state;
    match.score = Score.fromValues(snapshot.score.playerOne, snapshot.score.playerTwo);
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

    if (this.state !== 'waiting') {
      return;
    }

    this.currentHand = Hand.start(viraRank, this.buildInitialHandState());
    this.state = 'in_progress';
  }

  play(player: PlayerId, card: Card): void {
    const currentHand = this.ensureCurrentHandInProgress();

    currentHand.play(player, card);
    this.resolveFinishedHandIfNeeded();
  }

  requestTruco(player: PlayerId): void {
    const currentHand = this.ensureCurrentHandInProgress();

    currentHand.requestTruco(player);
  }

  raiseToSix(player: PlayerId): void {
    const currentHand = this.ensureCurrentHandInProgress();

    currentHand.raiseToSix(player);
  }

  raiseToNine(player: PlayerId): void {
    const currentHand = this.ensureCurrentHandInProgress();

    currentHand.raiseToNine(player);
  }

  raiseToTwelve(player: PlayerId): void {
    const currentHand = this.ensureCurrentHandInProgress();

    currentHand.raiseToTwelve(player);
  }

  acceptBet(player: PlayerId): void {
    const currentHand = this.ensureCurrentHandInProgress();

    currentHand.acceptBet(player);
  }

  declineBet(player: PlayerId): void {
    const currentHand = this.ensureCurrentHandInProgress();

    currentHand.declineBet(player);
    this.resolveFinishedHandIfNeeded();
  }

  acceptMaoDeOnze(player: PlayerId): void {
    const currentHand = this.ensureCurrentHandInProgress();

    currentHand.acceptMaoDeOnze(player);
  }

  declineMaoDeOnze(player: PlayerId): void {
    const currentHand = this.ensureCurrentHandInProgress();

    currentHand.declineMaoDeOnze(player);
    this.resolveFinishedHandIfNeeded();
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

  private buildInitialHandState() {
    if (this.score.playerOne === 11 && this.score.playerTwo < 11) {
      return {
        specialState: 'mao_de_onze' as const,
        specialDecisionPending: true,
        specialDecisionBy: 'P1' as const,
      };
    }

    if (this.score.playerTwo === 11 && this.score.playerOne < 11) {
      return {
        specialState: 'mao_de_onze' as const,
        specialDecisionPending: true,
        specialDecisionBy: 'P2' as const,
      };
    }

    return {};
  }

  private ensureCurrentHandInProgress(): Hand {
    if (this.state !== 'in_progress' || !this.currentHand) {
      throw new InvalidMoveError('Match is not in progress.');
    }

    return this.currentHand;
  }

  private resolveFinishedHandIfNeeded(): void {
    if (!this.currentHand || !this.currentHand.isFinished()) {
      return;
    }

    const winner = this.currentHand.getWinner();
    const awardedPoints = this.currentHand.getAwardedPoints();

    if (winner && awardedPoints) {
      this.score = this.score.addPoints(winner, awardedPoints);
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
