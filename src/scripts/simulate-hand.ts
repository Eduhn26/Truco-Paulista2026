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

const POINTS_TO_WIN = Number(process.env['POINTS_TO_WIN'] ?? '12');
const PLAY_DELAY_MS = Number(process.env['PLAY_DELAY_MS'] ?? '350');
const HAND_DELAY_MS = Number(process.env['HAND_DELAY_MS'] ?? '900');
const SHOW_TS = (process.env['SHOW_TS'] ?? '0') === '1';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ts(): string {
  return new Date().toISOString().slice(11, 19);
}

function prefix(): string {
  return SHOW_TS ? `${ts()}  ` : '';
}

function hr(char = '-', width = 58): void {
  console.log(char.repeat(width));
}

function banner(title: string): void {
  hr('=');

  console.log(`${prefix()}${title}`);
  hr('=');
}

function arch(message: string): void {
  console.log(`${prefix()}[ARCH] ${message}`);
}

function out(message: string): void {
  console.log(`${prefix()}${message}`);
}

function indented(message: string): void {
  console.log(`          ${message}`);
}

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

function rankFromCard(code: string): Rank {
  return code.slice(0, 1) as Rank;
}

function prettyCard(code: string): string {
  const rank = code.slice(0, 1) as Rank;
  const suit = code.slice(1, 2) as Suit;
  const meta = SUIT_LABEL[suit];
  return `${rank}${meta.symbol}`;
}

type Score = { playerOne: number; playerTwo: number };

function handOutcome(before: Score, after: Score): 'P1' | 'P2' | 'TIE' {
  if (after.playerOne > before.playerOne) return 'P1';
  if (after.playerTwo > before.playerTwo) return 'P2';
  return 'TIE';
}

function scoreLine(score: Score): string {
  return `TENTOS: P1 ${score.playerOne}/${POINTS_TO_WIN}  |  P2 ${score.playerTwo}/${POINTS_TO_WIN}`;
}

function winnerFromScore(score: Score): 'P1' | 'P2' | 'TIE' {
  if (score.playerOne > score.playerTwo) return 'P1';
  if (score.playerTwo > score.playerOne) return 'P2';
  return 'TIE';
}

async function simulateMatch(): Promise<void> {
  const repo = new InMemoryMatchRepository();
  const createMatch = new CreateMatchUseCase(repo);
  const startHand = new StartHandUseCase(repo);
  const playCard = new PlayCardUseCase(repo);
  const viewState = new ViewMatchStateUseCase(repo);

  banner('TRUCO PAULISTA — SIMULAÇÃO (FASE 2: APPLICATION LAYER)');
  out('Modo jogo + rastreio arquitetural (Use Cases visíveis)');
  out(
    `Config: pointsToWin=${POINTS_TO_WIN} | playDelayMs=${PLAY_DELAY_MS} | handDelayMs=${HAND_DELAY_MS}`,
  );
  hr();

  arch('CreateMatchUseCase.execute()');
  const created = await createMatch.execute({ pointsToWin: POINTS_TO_WIN });
  const matchId = created.matchId;

  out(`matchId=${matchId}`);
  await sleep(HAND_DELAY_MS);

  let hands = 0;
  let totalTurns = 0;

  for (;;) {
    const state = await viewState.execute({ matchId });
    if (state.state === 'finished') break;

    hands += 1;

    const before = await viewState.execute({ matchId });
    const beforeScore = before.score;

    const deck = shuffle(makeDeck());
    const vira = draw(deck);
    const viraRank = rankFromCard(vira);

    hr();
    out(`🂠 MÃO #${hands}  (vale 1 tento)`);
    out(`Vira: ${prettyCard(vira)}  →  Manilha: (depende do domínio)`);
    arch('StartHandUseCase.execute()');
    await startHand.execute({ matchId, viraRank });

    await sleep(HAND_DELAY_MS);

    arch('PlayCardUseCase.execute() (rodando jogadas via Application)');
    hr();

    let turn = 0;

    for (;;) {
      const current = await viewState.execute({ matchId });
      if (current.state !== 'in_progress') break;

      turn += 1;
      totalTurns += 1;

      const player: PlayerId = turn % 2 === 1 ? 'P1' : 'P2';
      const card = draw(deck);

      out(`${player} joga: ${prettyCard(card)}`);
      indented(`(turno ${turn})`);

      await playCard.execute({
        matchId,
        playerId: player,
        card,
      });

      await sleep(PLAY_DELAY_MS);
    }

    const after = await viewState.execute({ matchId });
    const afterScore = after.score;
    const outcome = handOutcome(beforeScore, afterScore);

    hr();
    if (outcome === 'TIE') {
      out('🤝 Resultado da mão: EMPATE (sem tento)');
    } else {
      out(`🏆 Resultado da mão: ${outcome} ganhou 1 tento`);
    }
    out(scoreLine(afterScore));

    await sleep(HAND_DELAY_MS);
  }

  const final = await viewState.execute({ matchId });
  const finalWinner = winnerFromScore(final.score);

  hr();
  banner('PARTIDA FINALIZADA');
  out(`matchId=${matchId}`);
  out(`PLACAR FINAL: P1 ${final.score.playerOne} x ${final.score.playerTwo} P2`);
  out(`VENCEDOR: ${finalWinner === 'TIE' ? 'EMPATE' : finalWinner}`);
  out(`RESUMO: mãos=${hands} | jogadas=${totalTurns}`);
  hr('=');
}

simulateMatch().catch((err) => {
  console.error(err);
  process.exit(1);
});
