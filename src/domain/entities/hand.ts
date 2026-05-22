import type { PlayerId } from '../value-objects/player-id';
import { RANKS, type Rank } from '../value-objects/rank';
import { SUITS } from '../value-objects/suit';
import { Card } from '../value-objects/card';

import { Round, type RoundSnapshot, type SeatId } from './round';
import { InvalidMoveError } from '../exceptions/invalid-move-error';
import { dealHandsFromViraRank, dealRandomHand } from '../services/deck';

export type HandValue = 1 | 3 | 6 | 9 | 12;
export type HandBetState = 'idle' | 'awaiting_response';
export type HandSpecialState = 'normal' | 'mao_de_onze' | 'mao_de_ferro';
export type HandMode = '1v1' | '2v2';
export type HandSeatHandsSnapshot = Partial<Record<SeatId, string[]>>;

export type HandSnapshot = {
  viraRank: Rank;
  viraCard?: string;
  mode?: HandMode;
  rounds: RoundSnapshot[];
  finished: boolean;
  playerOneHand: string[];
  playerTwoHand: string[];
  seatHands?: HandSeatHandsSnapshot;
  currentValue: HandValue;
  betState: HandBetState;
  pendingValue: HandValue | null;
  requestedBy: PlayerId | null;
  raiseAuthority: PlayerId | null;
  specialState: HandSpecialState;
  specialDecisionPending: boolean;
  specialDecisionBy: PlayerId | null;
  winner: PlayerId | null;
  awardedPoints: HandValue | null;
};

type HandStateConfig = {
  mode?: HandMode;
  seatHands?: HandSeatHandsSnapshot;
  viraCard?: string;
  currentValue?: HandValue;
  betState?: HandBetState;
  pendingValue?: HandValue | null;
  requestedBy?: PlayerId | null;
  raiseAuthority?: PlayerId | null;
  specialState?: HandSpecialState;
  specialDecisionPending?: boolean;
  specialDecisionBy?: PlayerId | null;
  winner?: PlayerId | null;
  awardedPoints?: HandValue | null;
  finished?: boolean;
};

type PlayOptions = {
  seatId?: SeatId;
};

type TwoVsTwoDeal = {
  viraCard: Card;
  viraRank: Rank;
  seatHands: Record<SeatId, Card[]>;
};

const SEAT_IDS = ['T1A', 'T1B', 'T2A', 'T2B'] as const;

function buildDeck(): Card[] {
  const deck: Card[] = [];

  for (const rank of RANKS) {
    for (const suit of SUITS) {
      deck.push(Card.from(`${rank}${suit}`));
    }
  }

  return deck;
}

function shuffle(cards: Card[]): Card[] {
  const deck = [...cards];

  for (let index = deck.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    const current = deck[index]!;
    deck[index] = deck[swapIndex]!;
    deck[swapIndex] = current;
  }

  return deck;
}

function dealTwoVersusTwoFromDeck(viraCard: Card, cards: Card[]): TwoVsTwoDeal {
  const viraRank = viraCard.getRank();
  const seatHands = {
    T1A: cards.splice(0, 3),
    T2A: cards.splice(0, 3),
    T1B: cards.splice(0, 3),
    T2B: cards.splice(0, 3),
  };

  for (const seatId of SEAT_IDS) {
    if (seatHands[seatId].length !== 3) {
      throw new Error('Failed to deal three cards to all 2v2 seats.');
    }
  }

  return { viraCard, viraRank, seatHands };
}

function dealTwoVersusTwoHandsFromViraRank(viraRank: Rank): TwoVsTwoDeal {
  const shuffledDeck = shuffle(buildDeck());
  const viraIndex = shuffledDeck.findIndex((card) => card.getRank() === viraRank);

  if (viraIndex < 0) {
    throw new Error(`Could not find a vira card for rank ${viraRank}.`);
  }

  const [viraCard] = shuffledDeck.splice(viraIndex, 1);

  if (!viraCard) {
    throw new Error('Failed to extract a 2v2 vira card from deck.');
  }

  return dealTwoVersusTwoFromDeck(viraCard, shuffledDeck);
}

function dealRandomTwoVersusTwoHand(): TwoVsTwoDeal {
  const shuffledDeck = shuffle(buildDeck());
  const [viraCard] = shuffledDeck.splice(0, 1);

  if (!viraCard) {
    throw new Error('Failed to draw a random vira card from deck.');
  }

  return dealTwoVersusTwoFromDeck(viraCard, shuffledDeck);
}

function getTeamFromSeat(seatId: SeatId): PlayerId {
  return seatId.startsWith('T1') ? 'P1' : 'P2';
}

export class Hand {
  private readonly rounds: Round[];
  private readonly playerOneHand: Card[];
  private readonly playerTwoHand: Card[];
  private readonly seatHands = new Map<SeatId, Card[]>();
  private readonly mode: HandMode;
  private readonly viraCard: Card;
  private finished = false;
  private currentValue: HandValue;
  private betState: HandBetState;
  private pendingValue: HandValue | null;
  private requestedBy: PlayerId | null;
  private raiseAuthority: PlayerId | null;
  private specialState: HandSpecialState;
  private specialDecisionPending: boolean;
  private specialDecisionBy: PlayerId | null;
  private winner: PlayerId | null;
  private awardedPoints: HandValue | null;

  constructor(
    private readonly viraRank: Rank,
    playerOneHand: Card[] = [],
    playerTwoHand: Card[] = [],
    state: HandStateConfig = {},
  ) {
    this.mode = state.mode ?? (state.seatHands ? '2v2' : '1v1');
    this.viraCard = Card.from(state.viraCard ?? `${this.viraRank}C`);
    this.rounds = [new Round(this.viraRank, this.getExpectedRoundPlayCount())];
    this.playerOneHand = [...playerOneHand];
    this.playerTwoHand = [...playerTwoHand];
    this.restoreSeatHands(state.seatHands);
    this.ensurePrimarySeatHands();
    this.finished = state.finished ?? false;
    this.currentValue = state.currentValue ?? 1;
    this.betState = state.betState ?? 'idle';
    this.pendingValue = state.pendingValue ?? null;
    this.requestedBy = state.requestedBy ?? null;
    this.raiseAuthority = state.raiseAuthority ?? null;
    this.specialState = state.specialState ?? 'normal';
    this.specialDecisionPending = state.specialDecisionPending ?? false;
    this.specialDecisionBy = state.specialDecisionBy ?? null;
    this.winner = state.winner ?? null;
    this.awardedPoints = state.awardedPoints ?? null;

    this.syncPrimaryHandsFromSeatHands();
    this.assertStateInvariants();
  }

  static start(viraRank: Rank, state: HandStateConfig = {}, mode: HandMode = '1v1'): Hand {
    if (mode === '2v2') {
      const dealtHands = dealTwoVersusTwoHandsFromViraRank(viraRank);

      return new Hand(viraRank, dealtHands.seatHands.T1A, dealtHands.seatHands.T2A, {
        ...state,
        mode,
        viraCard: dealtHands.viraCard.toString(),
        seatHands: Hand.cardSeatHandsToSnapshot(dealtHands.seatHands),
      });
    }

    const dealtHands = dealHandsFromViraRank(viraRank);

    return new Hand(viraRank, dealtHands.playerOneHand, dealtHands.playerTwoHand, {
      ...state,
      viraCard: dealtHands.viraCard.toString(),
    });
  }

  static startRandom(state: HandStateConfig = {}, mode: HandMode = '1v1'): Hand {
    if (mode === '2v2') {
      const dealtHands = dealRandomTwoVersusTwoHand();

      return new Hand(dealtHands.viraRank, dealtHands.seatHands.T1A, dealtHands.seatHands.T2A, {
        ...state,
        mode,
        viraCard: dealtHands.viraCard.toString(),
        seatHands: Hand.cardSeatHandsToSnapshot(dealtHands.seatHands),
      });
    }

    const dealtHands = dealRandomHand();
    const viraRank = dealtHands.viraCard.getRank();

    return new Hand(viraRank, dealtHands.playerOneHand, dealtHands.playerTwoHand, {
      ...state,
      viraCard: dealtHands.viraCard.toString(),
    });
  }

  static fromSnapshot(snapshot: HandSnapshot): Hand {
    const mode = snapshot.mode ?? (snapshot.seatHands ? '2v2' : '1v1');
    const handState: HandStateConfig = {
      mode,
      currentValue: snapshot.currentValue ?? 1,
      betState: snapshot.betState ?? 'idle',
      pendingValue: snapshot.pendingValue ?? null,
      requestedBy: snapshot.requestedBy ?? null,
      raiseAuthority: snapshot.raiseAuthority ?? null,
      specialState: snapshot.specialState ?? 'normal',
      specialDecisionPending: snapshot.specialDecisionPending ?? false,
      specialDecisionBy: snapshot.specialDecisionBy ?? null,
      winner: snapshot.winner ?? null,
      awardedPoints: snapshot.awardedPoints ?? null,
      finished: snapshot.finished,
      viraCard: snapshot.viraCard ?? `${snapshot.viraRank}C`,
    };

    if (snapshot.seatHands) {
      handState.seatHands = snapshot.seatHands;
    }

    const hand = new Hand(
      snapshot.viraRank,
      snapshot.playerOneHand.map((card) => Card.from(card)),
      snapshot.playerTwoHand.map((card) => Card.from(card)),
      handState,
    );

    const expectedPlayCount = hand.getExpectedRoundPlayCount();
    const restoredRounds = snapshot.rounds.map((round) =>
      Round.fromSnapshot(round, expectedPlayCount),
    );
    hand.rounds.splice(
      0,
      hand.rounds.length,
      ...(restoredRounds.length > 0
        ? restoredRounds
        : [new Round(snapshot.viraRank, expectedPlayCount)]),
    );

    hand.assertStateInvariants();

    return hand;
  }

  play(player: PlayerId, card: Card, options: PlayOptions = {}): void {
    if (this.finished) {
      throw new InvalidMoveError('Hand is already finished.');
    }

    if (this.specialDecisionPending) {
      throw new InvalidMoveError('Cannot play cards while mao de onze decision is pending.');
    }

    if (this.betState === 'awaiting_response') {
      throw new InvalidMoveError('Cannot play cards while a bet response is pending.');
    }

    this.removeCardFromHand(player, card, options.seatId);

    const currentRound = this.getCurrentRound();
    currentRound.play(player, card, {
      ownerId: options.seatId ?? player,
      expectedPlayCount: this.getExpectedRoundPlayCount(),
    });

    if (currentRound.isFinished()) {
      this.evaluateFinished();

      if (!this.finished && this.rounds.length < 3) {
        this.rounds.push(new Round(this.viraRank, this.getExpectedRoundPlayCount()));
      }
    }
  }

  requestTruco(player: PlayerId): void {
    this.requestBet(player, 3);
  }

  raiseToSix(player: PlayerId): void {
    this.requestBet(player, 6);
  }

  raiseToNine(player: PlayerId): void {
    this.requestBet(player, 9);
  }

  raiseToTwelve(player: PlayerId): void {
    this.requestBet(player, 12);
  }

  acceptBet(player: PlayerId): void {
    this.ensureHandCanChangeBet();
    this.ensurePendingBetExists();

    if (this.requestedBy === player) {
      throw new InvalidMoveError('Requesting player cannot accept their own bet.');
    }

    this.currentValue = this.pendingValue!;
    this.raiseAuthority = player;
    this.betState = 'idle';
    this.pendingValue = null;
    this.requestedBy = null;
    this.assertStateInvariants();
  }

  declineBet(player: PlayerId): void {
    this.ensureHandCanChangeBet();
    this.ensurePendingBetExists();

    if (this.requestedBy === player) {
      throw new InvalidMoveError('Requesting player cannot decline their own bet.');
    }

    this.finishWithWinner(this.requestedBy!, this.currentValue);
  }

  acceptMaoDeOnze(player: PlayerId): void {
    this.ensurePendingSpecialDecision('mao_de_onze');

    if (this.specialDecisionBy !== player) {
      throw new InvalidMoveError('Only the mao de onze team can accept the special hand.');
    }

    // Accepted mão de 11 scores 3 points without becoming a truco escalation.
    this.currentValue = 3;
    this.betState = 'idle';
    this.pendingValue = null;
    this.requestedBy = null;
    this.raiseAuthority = null;
    this.specialDecisionPending = false;
    this.assertStateInvariants();
  }

  declineMaoDeOnze(player: PlayerId): void {
    this.ensurePendingSpecialDecision('mao_de_onze');

    if (this.specialDecisionBy !== player) {
      throw new InvalidMoveError('Only the mao de onze team can decline the special hand.');
    }

    this.finishWithWinner(this.getOpponent(player), 1);
  }

  isFinished(): boolean {
    return this.finished;
  }

  getRoundsCount(): number {
    return this.rounds.length;
  }

  getWinner(): PlayerId | null {
    if (!this.finished) {
      return null;
    }

    return this.winner;
  }

  getAwardedPoints(): HandValue | null {
    if (!this.finished) {
      return null;
    }

    return this.awardedPoints;
  }

  getPlayerHand(player: PlayerId): Card[] {
    return [...this.getCardsByPlayer(player)];
  }

  getSeatHand(seatId: SeatId): Card[] {
    return [...(this.seatHands.get(seatId) ?? [])];
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

  getRaiseAuthority(): PlayerId | null {
    return this.raiseAuthority;
  }

  getSpecialState(): HandSpecialState {
    return this.specialState;
  }

  isSpecialDecisionPending(): boolean {
    return this.specialDecisionPending;
  }

  getSpecialDecisionBy(): PlayerId | null {
    return this.specialDecisionBy;
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
      viraCard: this.viraCard.toString(),
      mode: this.mode,
      rounds: this.rounds.map((round) => round.toSnapshot()),
      finished: this.finished,
      playerOneHand: this.playerOneHand.map((card) => card.toString()),
      playerTwoHand: this.playerTwoHand.map((card) => card.toString()),
      ...(this.mode === '2v2' ? { seatHands: this.seatHandsToSnapshot() } : {}),
      currentValue: this.currentValue,
      betState: this.betState,
      pendingValue: this.pendingValue,
      requestedBy: this.requestedBy,
      raiseAuthority: this.raiseAuthority,
      specialState: this.specialState,
      specialDecisionPending: this.specialDecisionPending,
      specialDecisionBy: this.specialDecisionBy,
      winner: this.winner,
      awardedPoints: this.awardedPoints,
    };
  }

  private requestBet(player: PlayerId, requestedValue: HandValue): void {
    this.ensureHandCanChangeBet();

    if (this.specialState === 'mao_de_onze') {
      throw new InvalidMoveError('Cannot request truco during mao_de_onze.');
    }

    if (!this.canRequestValue(player, requestedValue)) {
      throw new InvalidMoveError('Player cannot request this bet value now.');
    }

    if (this.betState === 'awaiting_response') {
      this.currentValue = this.pendingValue!;
      this.raiseAuthority = player;
    }

    this.betState = 'awaiting_response';
    this.pendingValue = requestedValue;
    this.requestedBy = player;
    this.assertStateInvariants();
  }

  private ensureHandCanChangeBet(): void {
    if (this.finished) {
      throw new InvalidMoveError('Hand is already finished.');
    }

    if (this.specialDecisionPending) {
      throw new InvalidMoveError('Cannot change bet while special hand decision is pending.');
    }
  }

  private ensurePendingBetExists(): void {
    if (this.betState !== 'awaiting_response' || !this.pendingValue || !this.requestedBy) {
      throw new InvalidMoveError('No pending bet to respond.');
    }
  }

  private canRequestValue(player: PlayerId, requestedValue: HandValue): boolean {
    if (this.specialState === 'mao_de_onze') return false;

    if (this.betState === 'awaiting_response') {
      if (!this.pendingValue || this.requestedBy === player) {
        return false;
      }

      if (requestedValue === 6) {
        return this.pendingValue === 3;
      }

      if (requestedValue === 9) {
        return this.pendingValue === 6;
      }

      if (requestedValue === 12) {
        return this.pendingValue === 9;
      }

      return false;
    }

    if (requestedValue === 3) {
      return this.currentValue === 1 && this.raiseAuthority === null;
    }

    if (requestedValue === 6) {
      return this.currentValue === 3 && this.raiseAuthority === player;
    }

    if (requestedValue === 9) {
      return this.currentValue === 6 && this.raiseAuthority === player;
    }

    if (requestedValue === 12) {
      return this.currentValue === 9 && this.raiseAuthority === player;
    }

    return false;
  }

  private ensurePendingSpecialDecision(expectedState: HandSpecialState): void {
    if (
      this.specialState !== expectedState ||
      !this.specialDecisionPending ||
      this.specialDecisionBy === null
    ) {
      throw new InvalidMoveError('No pending special hand decision.');
    }
  }

  private getOpponent(player: PlayerId): PlayerId {
    return player === 'P1' ? 'P2' : 'P1';
  }

  private getCurrentRound(): Round {
    const currentRound = this.rounds[this.rounds.length - 1];
    if (!currentRound) {
      throw new InvalidMoveError('No current round available.');
    }

    return currentRound;
  }

  private getCardsByPlayer(player: PlayerId): Card[] {
    return player === 'P1' ? this.playerOneHand : this.playerTwoHand;
  }

  private removeCardFromHand(player: PlayerId, card: Card, seatId?: SeatId): void {
    if (this.mode === '2v2' && seatId) {
      if (getTeamFromSeat(seatId) !== player) {
        throw new InvalidMoveError('Seat does not belong to this player team.');
      }

      const seatCards = this.seatHands.get(seatId);

      if (!seatCards) {
        throw new InvalidMoveError(`Seat ${seatId} has no hand.`);
      }

      this.removeCardFromCards(seatCards, card);
      this.syncPrimaryHandsFromSeatHands();
      return;
    }

    const cards = this.getCardsByPlayer(player);
    this.removeCardFromCards(cards, card);
  }

  private removeCardFromCards(cards: Card[], card: Card): void {
    const index = cards.findIndex((candidate) => candidate.equals(card));

    if (index < 0) {
      throw new InvalidMoveError('Card is not in player hand.');
    }

    cards.splice(index, 1);
  }

  private evaluateFinished(): void {
    const finishedResults = this.rounds
      .filter((round) => round.isFinished())
      .map((round) => round.getResult());

    const firstRoundResult = finishedResults[0];
    const secondRoundResult = finishedResults[1];
    const thirdRoundResult = finishedResults[2];

    if (firstRoundResult && secondRoundResult) {
      if (firstRoundResult !== 'TIE' && secondRoundResult === firstRoundResult) {
        this.finishWithWinner(firstRoundResult, this.currentValue);
        return;
      }

      if (firstRoundResult !== 'TIE' && secondRoundResult === 'TIE') {
        this.finishWithWinner(firstRoundResult, this.currentValue);
        return;
      }

      if (firstRoundResult === 'TIE' && secondRoundResult !== 'TIE') {
        this.finishWithWinner(secondRoundResult, this.currentValue);
        return;
      }
    }

    if (firstRoundResult && secondRoundResult && thirdRoundResult) {
      if (firstRoundResult !== 'TIE' && secondRoundResult !== firstRoundResult) {
        this.finishWithWinner(
          thirdRoundResult === 'TIE' ? firstRoundResult : thirdRoundResult,
          this.currentValue,
        );
        return;
      }

      if (thirdRoundResult !== 'TIE') {
        this.finishWithWinner(thirdRoundResult, this.currentValue);
        return;
      }

      this.finishWithWinner('P1', this.currentValue);
    }
  }

  private finishWithWinner(winner: PlayerId, awardedPoints: HandValue): void {
    this.finished = true;
    this.winner = winner;
    this.awardedPoints = awardedPoints;
    this.betState = 'idle';
    this.pendingValue = null;
    this.requestedBy = null;
    this.specialDecisionPending = false;
    this.assertStateInvariants();
  }

  private assertStateInvariants(): void {
    const isMaoDeOnzeBaseValue = this.specialState === 'mao_de_onze' && this.currentValue === 3;

    if (this.currentValue !== 1 && this.raiseAuthority === null && !isMaoDeOnzeBaseValue) {
      throw new InvalidMoveError('Raised hand is missing raise authority.');
    }

    if (this.betState === 'awaiting_response') {
      if (!this.pendingValue || !this.requestedBy) {
        throw new InvalidMoveError('Pending bet state is incomplete.');
      }
    }

    if (this.finished) {
      if (!this.winner || !this.awardedPoints) {
        throw new InvalidMoveError('Finished hand is missing result data.');
      }
    }
  }

  private getExpectedRoundPlayCount(): number {
    return this.mode === '2v2' ? 4 : 2;
  }

  private restoreSeatHands(seatHands?: HandSeatHandsSnapshot): void {
    if (!seatHands) {
      return;
    }

    for (const seatId of SEAT_IDS) {
      const cards = seatHands[seatId];

      if (Array.isArray(cards)) {
        this.seatHands.set(
          seatId,
          cards.map((card) => Card.from(card)),
        );
      }
    }
  }

  private ensurePrimarySeatHands(): void {
    if (this.mode !== '2v2') {
      return;
    }

    if (!this.seatHands.has('T1A')) {
      this.seatHands.set('T1A', [...this.playerOneHand]);
    }

    if (!this.seatHands.has('T2A')) {
      this.seatHands.set('T2A', [...this.playerTwoHand]);
    }

    if (!this.seatHands.has('T1B')) {
      this.seatHands.set('T1B', []);
    }

    if (!this.seatHands.has('T2B')) {
      this.seatHands.set('T2B', []);
    }
  }

  private syncPrimaryHandsFromSeatHands(): void {
    if (this.mode !== '2v2') {
      return;
    }

    const t1aCards = this.seatHands.get('T1A');
    const t2aCards = this.seatHands.get('T2A');

    if (t1aCards) {
      this.replaceCards(this.playerOneHand, t1aCards);
    }

    if (t2aCards) {
      this.replaceCards(this.playerTwoHand, t2aCards);
    }
  }

  private replaceCards(target: Card[], source: Card[]): void {
    target.splice(0, target.length, ...source);
  }

  private seatHandsToSnapshot(): HandSeatHandsSnapshot {
    const seatHands: HandSeatHandsSnapshot = {};

    for (const seatId of SEAT_IDS) {
      const cards = this.seatHands.get(seatId);

      if (cards) {
        seatHands[seatId] = cards.map((card) => card.toString());
      }
    }

    return seatHands;
  }

  private static cardSeatHandsToSnapshot(seatHands: Record<SeatId, Card[]>): HandSeatHandsSnapshot {
    return {
      T1A: seatHands.T1A.map((card) => card.toString()),
      T1B: seatHands.T1B.map((card) => card.toString()),
      T2A: seatHands.T2A.map((card) => card.toString()),
      T2B: seatHands.T2B.map((card) => card.toString()),
    };
  }
}


