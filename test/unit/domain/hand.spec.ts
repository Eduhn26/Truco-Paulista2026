import { Hand } from '@game/domain/entities/hand';
import { Card } from '@game/domain/value-objects/card';

describe('Hand (Domain)', () => {
  it('removes the played card from the correct player hand', () => {
    const hand = new Hand(
      '7',
      [Card.from('3E'), Card.from('2C'), Card.from('AO')],
      [Card.from('4E'), Card.from('AC'), Card.from('KO')],
    );

    expect(hand.getPlayerHand('P1').map((card) => card.toString())).toEqual(['3E', '2C', 'AO']);

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
    expect(hand.getAwardedPoints()).toBe(1);
  });

  it('awards the hand to the first round winner when the second round ties', () => {
    const hand = new Hand(
      '4',
      [Card.from('3P'), Card.from('7P'), Card.from('6P')],
      [Card.from('2O'), Card.from('7C'), Card.from('5C')],
    );

    hand.play('P1', Card.from('3P'));
    hand.play('P2', Card.from('2O'));

    hand.play('P1', Card.from('7P'));
    hand.play('P2', Card.from('7C'));

    expect(hand.isFinished()).toBe(true);
    expect(hand.getWinner()).toBe('P1');
    expect(hand.getAwardedPoints()).toBe(1);
  });

  it('awards the hand to the second round winner when the first round ties', () => {
    const hand = new Hand(
      '4',
      [Card.from('7P'), Card.from('3P'), Card.from('6P')],
      [Card.from('7C'), Card.from('2O'), Card.from('5C')],
    );

    hand.play('P1', Card.from('7P'));
    hand.play('P2', Card.from('7C'));

    hand.play('P1', Card.from('3P'));
    hand.play('P2', Card.from('2O'));

    expect(hand.isFinished()).toBe(true);
    expect(hand.getWinner()).toBe('P1');
    expect(hand.getAwardedPoints()).toBe(1);
  });

  it('awards the hand to the first round winner when rounds are split and the third round ties', () => {
    const hand = new Hand(
      '4',
      [Card.from('3P'), Card.from('6C'), Card.from('7P')],
      [Card.from('2O'), Card.from('3C'), Card.from('7C')],
    );

    hand.play('P1', Card.from('3P'));
    hand.play('P2', Card.from('2O'));

    hand.play('P1', Card.from('6C'));
    hand.play('P2', Card.from('3C'));

    hand.play('P1', Card.from('7P'));
    hand.play('P2', Card.from('7C'));

    expect(hand.isFinished()).toBe(true);
    expect(hand.getWinner()).toBe('P1');
    expect(hand.getAwardedPoints()).toBe(1);
  });

  it('awards the hand to the third round winner when rounds are split and the third round is decisive', () => {
    const hand = new Hand(
      '4',
      [Card.from('3P'), Card.from('6C'), Card.from('AO')],
      [Card.from('2O'), Card.from('3C'), Card.from('KO')],
    );

    hand.play('P1', Card.from('3P'));
    hand.play('P2', Card.from('2O'));

    hand.play('P1', Card.from('6C'));
    hand.play('P2', Card.from('3C'));

    hand.play('P1', Card.from('AO'));
    hand.play('P2', Card.from('KO'));

    expect(hand.isFinished()).toBe(true);
    expect(hand.getWinner()).toBe('P1');
    expect(hand.getAwardedPoints()).toBe(1);
  });

  it('blocks card play while a bet response is pending', () => {
    const hand = new Hand(
      '7',
      [Card.from('3E'), Card.from('2C'), Card.from('AO')],
      [Card.from('4E'), Card.from('AC'), Card.from('KO')],
    );

    hand.requestTruco('P1');

    expect(() => hand.play('P2', Card.from('4E'))).toThrow(
      'Cannot play cards while a bet response is pending.',
    );
  });

  it('awards the current hand value when the opponent declines the raise', () => {
    const hand = new Hand(
      '7',
      [Card.from('3E'), Card.from('2C'), Card.from('AO')],
      [Card.from('4E'), Card.from('AC'), Card.from('KO')],
    );

    hand.requestTruco('P1');
    hand.acceptBet('P2');

    hand.raiseToSix('P1');
    hand.declineBet('P2');

    expect(hand.isFinished()).toBe(true);
    expect(hand.getWinner()).toBe('P1');
    expect(hand.getAwardedPoints()).toBe(3);
  });

  it('marks mao de onze as pending for the deciding team', () => {
    const hand = new Hand(
      '7',
      [Card.from('3E'), Card.from('2C'), Card.from('AO')],
      [Card.from('4E'), Card.from('AC'), Card.from('KO')],
      {
        specialState: 'mao_de_onze',
        specialDecisionPending: true,
        specialDecisionBy: 'P1',
      },
    );

    expect(hand.getSpecialState()).toBe('mao_de_onze');
    expect(hand.isSpecialDecisionPending()).toBe(true);
    expect(hand.getSpecialDecisionBy()).toBe('P1');
    expect(hand.getCurrentValue()).toBe(1);
  });

  it('blocks card play while mao de onze decision is pending', () => {
    const hand = new Hand(
      '7',
      [Card.from('3E'), Card.from('2C'), Card.from('AO')],
      [Card.from('4E'), Card.from('AC'), Card.from('KO')],
      {
        specialState: 'mao_de_onze',
        specialDecisionPending: true,
        specialDecisionBy: 'P1',
      },
    );

    expect(() => hand.play('P1', Card.from('3E'))).toThrow(
      'Cannot play cards while mao de onze decision is pending.',
    );
  });

  it('accepts mao de onze and upgrades the hand value to 3', () => {
    const hand = new Hand(
      '7',
      [Card.from('3E'), Card.from('2C'), Card.from('AO')],
      [Card.from('4E'), Card.from('AC'), Card.from('KO')],
      {
        specialState: 'mao_de_onze',
        specialDecisionPending: true,
        specialDecisionBy: 'P1',
      },
    );

    hand.acceptMaoDeOnze('P1');

    expect(hand.isSpecialDecisionPending()).toBe(false);
    expect(hand.getCurrentValue()).toBe(3);
    expect(() => hand.requestTruco('P1')).toThrow('Cannot request truco during mao_de_onze.');
  });

  it('declines mao de onze and awards 1 point to the opponent', () => {
    const hand = new Hand(
      '7',
      [Card.from('3E'), Card.from('2C'), Card.from('AO')],
      [Card.from('4E'), Card.from('AC'), Card.from('KO')],
      {
        specialState: 'mao_de_onze',
        specialDecisionPending: true,
        specialDecisionBy: 'P1',
      },
    );

    hand.declineMaoDeOnze('P1');

    expect(hand.isFinished()).toBe(true);
    expect(hand.getWinner()).toBe('P2');
    expect(hand.getAwardedPoints()).toBe(1);
  });
});
