import { Hand } from '../../../src/domain/entities/hand';
import { Card } from '../../../src/domain/value-objects/card';

describe('Hand (Domain)', () => {
  it('finishes when a player wins 2 rounds', () => {
    const hand = new Hand('7'); // vira 7 -> manilha Q

    // Round 1: P1 vence por manilha e naipe
    hand.play('P1', Card.from('QD')); // manilha mais forte
    hand.play('P2', Card.from('QC')); // manilha mais fraca

    // Round 2: P1 vence por ranking base
    hand.play('P1', Card.from('3D'));
    hand.play('P2', Card.from('AD'));

    expect(hand.isFinished()).toBe(true);
    expect(hand.getWinner()).toBe('P1');
  });
});
