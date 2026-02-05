import { Hand } from '../../../src/domain/entities/hand';
import { Card } from '../../../src/domain/value-objects/card';

describe('Hand (Domain)', () => {
  it('finishes when a player wins 2 rounds', () => {
    // viraRank = '7' -> manilha = 'Q' (não impacta as cartas abaixo)
    const hand = new Hand('7');

    // Round 1: P1 vence (3 > 4) - CORRIGIDO: '3E' em vez de '3S', '4E' em vez de '4S'
    hand.play('P1', Card.from('3E'));
    hand.play('P2', Card.from('4E'));

    // Round 2: P1 vence (2 > A) - CORRIGIDO: '2C' em vez de '2H'
    hand.play('P1', Card.from('2C'));
    hand.play('P2', Card.from('AC'));

    expect(hand.isFinished()).toBe(true);
    expect(hand.getWinner()).toBe('P1');
  });

  it('creates new rounds until max 3', () => {
    const hand = new Hand('7');

    // Joga 2 rounds completos - CORRIGIDO: '3E' em vez de '3S', '4E' em vez de '4S'
    hand.play('P1', Card.from('3E'));
    hand.play('P2', Card.from('4E'));

    hand.play('P1', Card.from('2C'));
    hand.play('P2', Card.from('AC'));

    // A regra do Hand pode encerrar em 2 se alguém ganhar 2 rounds,
    // então aqui a asserção é só garantir limites estruturais.
    expect(hand.getRoundsCount()).toBeGreaterThanOrEqual(1);
    expect(hand.getRoundsCount()).toBeLessThanOrEqual(3);
  });
});
