import type { Rank } from '../value-objects/rank';
import { RANKS } from '../value-objects/rank';
import { SUITS } from '../value-objects/suit';
import { Card } from '../value-objects/card';

export type DealtHands = {
  viraCard: Card;
  playerOneHand: Card[];
  playerTwoHand: Card[];
};

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

export function dealHandsFromViraRank(viraRank: Rank): DealtHands {
  const shuffledDeck = shuffle(buildDeck());

  const viraIndex = shuffledDeck.findIndex((card) => card.getRank() === viraRank);
  if (viraIndex < 0) {
    throw new Error(`Could not find a vira card for rank ${viraRank}.`);
  }

  const [viraCard] = shuffledDeck.splice(viraIndex, 1);

  if (!viraCard) {
    throw new Error('Failed to extract vira card from deck.');
  }

  const playerOneHand = shuffledDeck.splice(0, 3);
  const playerTwoHand = shuffledDeck.splice(0, 3);

  if (playerOneHand.length !== 3 || playerTwoHand.length !== 3) {
    throw new Error('Failed to deal three cards to both players.');
  }

  return {
    viraCard,
    playerOneHand,
    playerTwoHand,
  };
}
