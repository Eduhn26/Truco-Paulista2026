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

    const scriptedHand = currentHand!;
    const handAsSnapshot = scriptedHand.toSnapshot();

    handAsSnapshot.playerOneHand = ['5P', '5C', 'AO'];
    handAsSnapshot.playerTwoHand = ['7O', '5O', 'KO'];

    const controlledMatch = Match.fromSnapshot({
      ...match.toSnapshot(),
      currentHand: handAsSnapshot,
    });

    controlledMatch.play('P1', Card.from('5P'));
    controlledMatch.play('P2', Card.from('7O'));

    controlledMatch.play('P1', Card.from('5C'));
    controlledMatch.play('P2', Card.from('5O'));

    expect(controlledMatch.getState()).toBe('finished');
    expect(controlledMatch.getScore().playerOne).toBe(1);
    expect(controlledMatch.getScore().playerTwo).toBe(0);
  });
});