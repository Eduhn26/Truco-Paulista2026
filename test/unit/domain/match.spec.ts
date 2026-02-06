import { Match } from '../../../src/domain/entities/match';
import { Card } from '../../../src/domain/value-objects/card';

describe('Match (Domain)', () => {
  it('starts in waiting state', () => {
    const match = new Match(1);
    expect(match.getState()).toBe('waiting');
  });

  it('finishes when someone reaches pointsToWin', () => {
    const match = new Match(1);

    // vira = 4 => manilha = 5
    match.start('4');

    // Round 1: P1 manilha (5P) vs P2 não-manilha (7O) => P1 ganha
    match.play('P1', Card.from('5P'));
    match.play('P2', Card.from('7O'));

    // Round 2: P1 manilha (5P) vs P2 manilha fraca (5O) => P1 ganha (Paus > Ouros)
    match.play('P1', Card.from('5P'));
    match.play('P2', Card.from('5O'));

    expect(match.getState()).toBe('finished');
    expect(match.getScore().playerOne).toBe(1);
  });
});
