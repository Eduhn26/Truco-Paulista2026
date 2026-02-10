import { InMemoryMatchRepository } from '../infrastructure/persistence/in-memory/in-memory-match.repository';

import { CreateMatchUseCase } from '../application/use-cases/create-match.use-case';
import { StartHandUseCase } from '../application/use-cases/start-hand.use-case';
import { PlayCardUseCase } from '../application/use-cases/play-card.use-case';
import { ViewMatchStateUseCase } from '../application/use-cases/view-match-state.use-case';

type Rank = '4' | '5' | '6' | '7' | 'Q' | 'J' | 'K' | 'A' | '2' | '3';
type Suit = 'P' | 'C' | 'E' | 'O';
type PlayerId = 'P1' | 'P2';

const SUIT_LABEL: Record<Suit, { name: string; symbol: string }> = {
  P: { name: 'Paus', symbol: '♣' },
  C: { name: 'Copas', symbol: '♥' },
  E: { name: 'Espadas', symbol: '♠' },
  O: { name: 'Ouros', symbol: '♦' },
};

function makeDeck(): string[] {
  const ranks: Rank[] = ['4', '5', '6', '7', 'Q', 'J', 'K', 'A', '2', '3'];
  const suits: Suit[] = ['P', 'C', 'E', 'O'];

  const deck: string[] = [];
  for (const r of ranks) {
    for (const s of suits) {
      deck.push(`${r}${s}`);
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

function draw(deck: string[]): string {
  const c = deck.shift();
  if (!c) throw new Error('Deck is empty');
  return c;
}

function prettyCard(code: string): string {
  const rank = code.slice(0, 1) as Rank;
  const suit = code.slice(1, 2) as Suit;
  const meta = SUIT_LABEL[suit];
  return `${rank}${meta.symbol} (${meta.name})`;
}

function rankFromCard(code: string): Rank {
  return code.slice(0, 1) as Rank;
}

function nextPlayer(p: PlayerId): PlayerId {
  return p === 'P1' ? 'P2' : 'P1';
}

async function simulateMatch(): Promise<void> {
  const repo = new InMemoryMatchRepository();
  const createMatch = new CreateMatchUseCase(repo);
  const startHand = new StartHandUseCase(repo);
  const playCard = new PlayCardUseCase(repo);
  const viewState = new ViewMatchStateUseCase(repo);

  const created = await createMatch.execute({ pointsToWin: 3 });
  const matchId = created.matchId;

  console.log('==============================');
  console.log('INICIANDO PARTIDA (via Use Cases)');
  console.log('MatchId:', matchId);
  console.log('==============================');

  for (;;) {
    const state0 = await viewState.execute({ matchId });
    if (state0.state === 'finished') break;

    const deck = shuffle(makeDeck());
    const vira = draw(deck);
    const viraRank = rankFromCard(vira);

    console.log('------------------------------');
    console.log('Nova mão');
    console.log(`Vira: ${prettyCard(vira)}`);

    await startHand.execute({ matchId, viraRank });

    let currentPlayer: PlayerId = 'P1';

    for (;;) {
      const current = await viewState.execute({ matchId });
      if (current.state !== 'in_progress') break;

      const card = draw(deck);

      console.log(`${currentPlayer} joga: ${prettyCard(card)}`);

      await playCard.execute({
        matchId,
        playerId: currentPlayer,
        card,
      });

      currentPlayer = nextPlayer(currentPlayer);
    }

    const afterHand = await viewState.execute({ matchId });
    console.log(`Placar: P1: ${afterHand.score.playerOne} | P2: ${afterHand.score.playerTwo}`);
  }

  const final = await viewState.execute({ matchId });
  console.log('==============================');
  console.log('PARTIDA FINALIZADA');
  console.log(`Placar final: P1: ${final.score.playerOne} | P2: ${final.score.playerTwo}`);
  console.log('==============================');
}

simulateMatch().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
