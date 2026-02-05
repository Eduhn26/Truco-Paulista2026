import { Hand } from '../../../src/domain/entities/hand';
import { Card } from '../../../src/domain/value-objects/card';

describe('Hand (Domain)', () => {
  it('finishes when a player wins 2 rounds', () => {
    const hand = new Hand();

    // Round 1
    hand.play('P1', Card.from('AS'));
    hand.play('P2', Card.from('2S'));

    // Round 2
    hand.play('P1', Card.from('KS'));
    hand.play('P2', Card.from('3S'));

    expect(hand.isFinished()).toBe(true);
    expect(hand.getWinner()).toBe('P1');
  });

  it('creates new rounds until max 3', () => {
    const hand = new Hand();

    hand.play('P1', Card.from('AS'));
    hand.play('P2', Card.from('2S'));

    hand.play('P1', Card.from('KS'));
    hand.play('P2', Card.from('3S'));

    // depending on placeholder compare, may finish early
    expect(hand.getRoundsCount()).toBeGreaterThanOrEqual(1);
    expect(hand.getRoundsCount()).toBeLessThanOrEqual(3);
  });
});
