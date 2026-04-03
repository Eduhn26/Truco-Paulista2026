import type { PlayerId } from '../value-objects/player-id';
import type { RoundResult } from '../value-objects/round-result';
import type { Rank } from '../value-objects/rank';
import { Card } from '../value-objects/card';

import { Round, type RoundSnapshot } from './round';
import { InvalidMoveError } from '../exceptions/invalid-move-error';
import { dealHandsFromViraRank } from '../services/deck';

export type HandValue = 1 | 3 | 6 | 9 | 12;
export type HandBetState = 'idle' | 'awaiting_response';
export type HandSpecialState = 'normal' | 'mao_de_onze' | 'mao_de_ferro';

export type HandSnapshot = {
  viraRank: Rank;
  rounds: RoundSnapshot[];
  finished: boolean;
  playerOneHand: string[];
  playerTwoHand: string[];
  currentValue: HandValue;
  betState: HandBetState;
  pendingValue: HandValue | null;
  requestedBy: PlayerId | null;
  specialState: HandSpecialState;
};

type HandStateConfig = {
  currentValue?: HandValue;
  betState?: HandBetState;
  pendingValue?: HandValue | null;
  requestedBy?: PlayerId | null;
  specialState?: HandSpecialState;
};

export class Hand {
  private readonly rounds: Round[];
  private readonly playerOneHand: Card[];
  private readonly playerTwoHand: Card[];
  private finished = false;
  private currentValue: HandValue;
  private betState: HandBetState;
  private pendingValue: HandValue | null;
  private requestedBy: PlayerId | null;
  private specialState: HandSpecialState;

  constructor(
    private readonly viraRank: Rank,
    playerOneHand: Card[] = [],
    playerTwoHand: Card[] = [],
    state: HandStateConfig = {},
  ) {
    this.rounds = [new Round(this.viraRank)];
    this.playerOneHand = [...playerOneHand];
    this.playerTwoHand = [...playerTwoHand];
    this.currentValue = state.currentValue ?? 1;
    this.betState = state.betState ?? 'idle';
    this.pendingValue = state.pendingValue ?? null;
    this.requestedBy = state.requestedBy ?? null;
    this.specialState = state.specialState ?? 'normal';

    this.assertStateInvariants();
  }

  static start(viraRank: Rank, state: HandStateConfig = {}): Hand {
    const dealtHands = dealHandsFromViraRank(viraRank);

    return new Hand(viraRank, dealtHands.playerOneHand, dealtHands.playerTwoHand, state);
  }

  static fromSnapshot(snapshot: HandSnapshot): Hand {
    const hand = new Hand(
      snapshot.viraRank,
      snapshot.playerOneHand.map((card) => Card.from(card)),
      snapshot.playerTwoHand.map((card) => Card.from(card)),
      {
        currentValue: snapshot.currentValue ?? 1,
        betState: snapshot.betState ?? 'idle',
        pendingValue: snapshot.pendingValue ?? null,
        requestedBy: snapshot.requestedBy ?? null,
        specialState: snapshot.specialState ?? 'normal',
      },
    );

    const restoredRounds = snapshot.rounds.map((round) => Round.fromSnapshot(round));
    hand.rounds.splice(
      0,
      hand.rounds.length,
      ...(restoredRounds.length > 0 ? restoredRounds : [new Round(snapshot.viraRank)]),
    );
    hand.finished = snapshot.finished;
    hand.assertStateInvariants();

    return hand;
  }

  play(player: PlayerId, card: Card): void {
    if (this.finished) {
      throw new InvalidMoveError('Hand is already finished.');
    }

    if (this.betState === 'awaiting_response') {
      throw new InvalidMoveError('Cannot play cards while a bet response is pending.');
    }

    this.removeCardFromHand(player, card);

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

  getPlayerHand(player: PlayerId): Card[] {
    return [...this.getCardsByPlayer(player)];
  }

  getCurrentValue(): HandValue {
    return this.currentValue;
  }

  getBetState(): HandBetState {
    return this.betState;
  }

  getPendingValue(): HandValue | null {
    return this.pendingValue;
  }

  getRequestedBy(): PlayerId | null {
    return this.requestedBy;
  }

  getSpecialState(): HandSpecialState {
    return this.specialState;
  }

  hasPendingBetResponse(): boolean {
    return this.betState === 'awaiting_response';
  }

  isSpecialHand(): boolean {
    return this.specialState !== 'normal';
  }

  toSnapshot(): HandSnapshot {
    return {
      viraRank: this.viraRank,
      rounds: this.rounds.map((round) => round.toSnapshot()),
      finished: this.finished,
      playerOneHand: this.playerOneHand.map((card) => card.toString()),
      playerTwoHand: this.playerTwoHand.map((card) => card.toString()),
      currentValue: this.currentValue,
      betState: this.betState,
      pendingValue: this.pendingValue,
      requestedBy: this.requestedBy,
      specialState: this.specialState,
    };
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

    if (r1 !== 'TIE' && r2 === 'TIE') return r1;
    if (r1 === 'TIE' && r2 !== 'TIE') return r2;

    if (r1 === 'TIE' && r2 === 'TIE') {
      if (r3 && r3 !== 'TIE') return r3;
      return null;
    }

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

  private getCardsByPlayer(player: PlayerId): Card[] {
    return player === 'P1' ? this.playerOneHand : this.playerTwoHand;
  }

  private removeCardFromHand(player: PlayerId, card: Card): void {
    const hand = this.getCardsByPlayer(player);
    const cardIndex = hand.findIndex((currentCard) => currentCard.equals(card));

    if (cardIndex < 0) {
      throw new InvalidMoveError(`Player ${player} does not have card ${card.toString()}.`);
    }

    hand.splice(cardIndex, 1);
  }

  private assertStateInvariants(): void {
    if (this.betState === 'idle') {
      if (this.pendingValue !== null) {
        throw new InvalidMoveError('Idle hand cannot have a pending bet value.');
      }

      if (this.requestedBy !== null) {
        throw new InvalidMoveError('Idle hand cannot have a requesting player.');
      }

      return;
    }

    if (this.pendingValue === null) {
      throw new InvalidMoveError('Pending bet state requires a pending bet value.');
    }

    if (this.requestedBy === null) {
      throw new InvalidMoveError('Pending bet state requires a requesting player.');
    }

    if (this.pendingValue <= this.currentValue) {
      throw new InvalidMoveError('Pending bet value must be greater than current hand value.');
    }
  }
}
