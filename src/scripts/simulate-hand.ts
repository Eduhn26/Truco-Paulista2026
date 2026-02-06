import { Card } from '../domain/value-objects/card';
import type { Rank } from '../domain/value-objects/rank';
import type { Suit } from '../domain/value-objects/suit';

import { manilhaRankFromVira } from '../domain/services/truco-rules';
import { Match } from '../domain/entities/match';

const SUIT_LABEL: Record<Suit, { name: string; symbol: string }> = {
  P: { name: 'Paus', symbol: '♣' },
  C: { name: 'Copas', symbol: '♥' },
  E: { name: 'Espadas', symbol: '♠' },
  O: { name: 'Ouros', symbol: '♦' },
};

function cardPretty(card: Card): string {
  const s = card.getSuit();
  const suit = SUIT_LABEL[s];
  return `${card.getRank()}${suit.symbol} (${suit.name})`;
}

function makeDeck(): Card[] {
  const ranks: Rank[] = ['4', '5', '6', '7', 'Q', 'J', 'K', 'A', '2', '3'];
  const suits: Suit[] = ['P', 'C', 'E', 'O'];

  const deck: Card[] = [];
  for (const r of ranks) {
    for (const s of suits) {
      deck.push(Card.from(`${r}${s}`));
    }
  }
  return deck;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = a[i]!;
    a[i] = a[j]!;
    a[j] = tmp;
  }
  return a;
}

function draw(deck: Card[]): Card {
  const c = deck.shift();
  if (!c) throw new Error('Deck is empty');
  return c;
}

function simulateMatch(): void {
  const match = new Match(3);

  console.log('==============================');
  console.log('INICIANDO PARTIDA');
  console.log('==============================');

  while (match.getState() !== 'finished') {
    const deck = shuffle(makeDeck());

    const vira = draw(deck);
    const viraRank = vira.getRank();
    const manilha = manilhaRankFromVira(viraRank);

    console.log('------------------------------');
    console.log('Nova mão');
    console.log(`Vira: ${cardPretty(vira)} → Manilha: ${manilha}`);

    match.start(viraRank);

    // joga até a mão terminar (o Match vai voltar pra "waiting" ou "finished")
    while (match.getState() === 'in_progress') {
      const c1 = draw(deck);
      console.log(`P1 joga: ${cardPretty(c1)}`);
      match.play('P1', c1);

      if (match.getState() !== 'in_progress') break;

      const c2 = draw(deck);
      console.log(`P2 joga: ${cardPretty(c2)}`);
      match.play('P2', c2);
    }

    const score = match.getScore();
    console.log(`Placar: P1: ${score.playerOne} | P2: ${score.playerTwo}`);
  }

  const final = match.getScore();
  console.log('==============================');
  console.log('PARTIDA FINALIZADA');
  console.log(`Placar final: P1: ${final.playerOne} | P2: ${final.playerTwo}`);
  console.log('==============================');
}

simulateMatch();
