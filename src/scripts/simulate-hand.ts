import { Card } from '../domain/value-objects/card';
import { RANKS, type Rank, nextRank } from '../domain/value-objects/rank';
import { SUITS, type Suit } from '../domain/value-objects/suit';
import { Hand } from '../domain/entities/hand';

const SUIT_LABEL: Record<Suit, { name: string; symbol: string }> = {
  P: { name: 'Paus', symbol: '♣' },
  C: { name: 'Copas', symbol: '♥' },
  E: { name: 'Espadas', symbol: '♠' },
  O: { name: 'Ouros', symbol: '♦' },
};

function pretty(card: Card): string {
  const suit = card.getSuit();
  const rank = card.getRank();
  const meta = SUIT_LABEL[suit];
  return `${rank}${meta.symbol} (${meta.name})`;
}

function makeDeck(): Card[] {
  const deck: Card[] = [];
  for (const r of RANKS) {
    for (const s of SUITS) {
      deck.push(Card.from(`${r}${s}`));
    }
  }
  return deck;
}

function shuffle<T>(arr: readonly T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = a[i]!;
    a[i] = a[j]!;
    a[j] = tmp;
  }
  return a;
}

function simulateHand(): void {
  const deck = shuffle(makeDeck());

  const vira = deck.pop()!;
  const viraRank: Rank = vira.getRank();
  const manilha = nextRank(viraRank);

  console.log('==============================');
  console.log(`Vira: ${pretty(vira)}  → Manilha: ${manilha}`);
  console.log('==============================');

  const hand = new Hand(viraRank);

  while (!hand.isFinished()) {
    const c1 = deck.pop()!;
    const c2 = deck.pop()!;

    console.log(`P1 joga: ${pretty(c1)}`);
    console.log(`P2 joga: ${pretty(c2)}`);

    hand.play('P1', c1);
    hand.play('P2', c2);

    console.log('---');
  }

  console.log(`Rounds: ${hand.getRoundsCount()}`);
  console.log(`Winner: ${hand.getWinner() ?? 'TIE/None'}`);
  console.log('==============================');
}

simulateHand();
