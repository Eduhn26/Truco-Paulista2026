import { Match } from '../../../src/domain/entities/match';
import { Card } from '../../../src/domain/value-objects/card';

describe('Match (Domain)', () => {
  it('starts in waiting state', () => {
    const match = new Match(1);

    expect(match.getState()).toBe('waiting');
  });

  it('finishes when someone reaches pointsToWin', () => {
    const match = new Match(1);

    match.start('4');

    const currentHand = match.getCurrentHand();
    expect(currentHand).not.toBeNull();

    const scriptedHand = currentHand!.toSnapshot();

    scriptedHand.playerOneHand = ['5P', '5C', 'AO'];
    scriptedHand.playerTwoHand = ['7O', '5O', 'KO'];

    const controlledMatch = Match.fromSnapshot({
      ...match.toSnapshot(),
      currentHand: scriptedHand,
    });

    controlledMatch.play('P1', Card.from('5P'));
    controlledMatch.play('P2', Card.from('7O'));

    controlledMatch.play('P1', Card.from('5C'));
    controlledMatch.play('P2', Card.from('5O'));

    expect(controlledMatch.getState()).toBe('finished');
    expect(controlledMatch.getScore().playerOne).toBe(1);
    expect(controlledMatch.getScore().playerTwo).toBe(0);
  });

  it('starts the next hand as mao de onze when player one has 11 points', () => {
    const match = Match.fromSnapshot({
      pointsToWin: 12,
      state: 'waiting',
      score: {
        playerOne: 11,
        playerTwo: 9,
      },
      currentHand: null,
    });

    match.start('4');

    const currentHand = match.getCurrentHand();

    expect(currentHand).not.toBeNull();
    expect(currentHand!.getSpecialState()).toBe('mao_de_onze');
    expect(currentHand!.isSpecialDecisionPending()).toBe(true);
    expect(currentHand!.getSpecialDecisionBy()).toBe('P1');
    expect(currentHand!.getCurrentValue()).toBe(1);
  });

  it('awards 1 point to the opponent when mao de onze is declined', () => {
    const match = Match.fromSnapshot({
      pointsToWin: 12,
      state: 'waiting',
      score: {
        playerOne: 11,
        playerTwo: 10,
      },
      currentHand: null,
    });

    match.start('4');
    match.declineMaoDeOnze('P1');

    expect(match.getState()).toBe('waiting');
    expect(match.getScore().playerOne).toBe(11);
    expect(match.getScore().playerTwo).toBe(11);
  });

  it('accepts mao de onze and keeps the match in progress with a 3-point hand', () => {
    const match = Match.fromSnapshot({
      pointsToWin: 12,
      state: 'waiting',
      score: {
        playerOne: 11,
        playerTwo: 8,
      },
      currentHand: null,
    });

    match.start('4');
    match.acceptMaoDeOnze('P1');

    const currentHand = match.getCurrentHand();

    expect(match.getState()).toBe('in_progress');
    expect(currentHand).not.toBeNull();
    expect(currentHand!.isSpecialDecisionPending()).toBe(false);
    expect(currentHand!.getCurrentValue()).toBe(3);
  });
});
