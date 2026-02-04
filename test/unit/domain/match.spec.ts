import { Match } from '../../../src/domain/entities/match';

describe('Match (Domain)', () => {
  it('starts waiting and goes to in_progress', () => {
    const match = Match.create();

    match.start();

    expect(match.getState()).toBe('in_progress');
  });

  it('finishes when a player reaches 12 points', () => {
    const match = Match.create();
    match.start();

    match.addPointsToPlayerOne(12);

    expect(match.getState()).toBe('finished');
    expect(match.getScore().playerOne).toBe(12);
  });
});
