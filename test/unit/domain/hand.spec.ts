import { Hand } from '../../../src/domain/entities/hand';
import { Card } from '../../../src/domain/value-objects/card';

describe('Hand (Domain)', () => {
  it('removes the played card from the correct player hand', () => {
    const hand = new Hand(
      '7',
      [Card.from('3E'), Card.from('2C'), Card.from('AO')],
      [Card.from('4E'), Card.from('AC'), Card.from('KO')],
    );

    const initialP1Hand = hand.getPlayerHand('P1');
    expect(initialP1Hand.map((card) => card.toString())).toEqual(['3E', '2C', 'AO']);

    hand.play('P1', Card.from('3E'));

    expect(hand.getPlayerHand('P1').map((card) => card.toString())).toEqual(['2C', 'AO']);
    expect(hand.getPlayerHand('P2').map((card) => card.toString())).toEqual(['4E', 'AC', 'KO']);
  });

  it('finishes when a player wins 2 rounds', () => {
    const hand = new Hand(
      '7',
      [Card.from('3E'), Card.from('2C'), Card.from('AO')],
      [Card.from('4E'), Card.from('AC'), Card.from('KO')],
    );

    hand.play('P1', Card.from('3E'));
    hand.play('P2', Card.from('4E'));

    hand.play('P1', Card.from('2C'));
    hand.play('P2', Card.from('AC'));

    expect(hand.isFinished()).toBe(true);
    expect(hand.getWinner()).toBe('P1');
  });

  it('creates new rounds until max 3 when the hand is still unresolved', () => {
    const hand = new Hand(
      '7',
      [Card.from('7E'), Card.from('4O'), Card.from('3C')],
      [Card.from('7C'), Card.from('4P'), Card.from('2E')],
    );

    hand.play('P1', Card.from('7E'));
    hand.play('P2', Card.from('7C'));

    expect(hand.getRoundsCount()).toBe(2);
    expect(hand.isFinished()).toBe(false);

    hand.play('P1', Card.from('4O'));
    hand.play('P2', Card.from('4P'));

    expect(hand.getRoundsCount()).toBe(3);
    expect(hand.isFinished()).toBe(false);

    hand.play('P1', Card.from('3C'));
    hand.play('P2', Card.from('2E'));

    expect(hand.getRoundsCount()).toBeLessThanOrEqual(3);
    expect(hand.isFinished()).toBe(true);
  });

  it('throws when a player tries to play a card that is not in hand', () => {
    const hand = new Hand(
      '7',
      [Card.from('3E'), Card.from('2C'), Card.from('AO')],
      [Card.from('4E'), Card.from('AC'), Card.from('KO')],
    );

    expect(() => hand.play('P1', Card.from('5P'))).toThrow('Player P1 does not have card 5P.');
  });
});
