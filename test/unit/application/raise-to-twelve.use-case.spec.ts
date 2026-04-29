import { Match } from '../../../src/domain/entities/match';
import { RaiseToTwelveUseCase } from '../../../src/application/use-cases/raise-to-twelve.use-case';
import type { MatchRepository } from '../../../src/application/ports/match.repository';

type RepoBundle = {
  repo: MatchRepository;
  mocks: {
    create: jest.Mock;
    getById: jest.Mock;
    save: jest.Mock;
  };
};

function makeRepo(match: Match | null): RepoBundle {
  const create = jest.fn();
  const getById = jest.fn(() => Promise.resolve(match));
  const save = jest.fn(() => Promise.resolve());

  return {
    repo: {
      create,
      getById,
      save,
    },
    mocks: {
      create,
      getById,
      save,
    },
  };
}

describe('RaiseToTwelveUseCase (Application)', () => {
  it('throws when match is not found', async () => {
    const { repo } = makeRepo(null);
    const useCase = new RaiseToTwelveUseCase(repo);

    await expect(useCase.execute({ matchId: 'm1', playerId: 'P1' })).rejects.toThrow(
      'match not found',
    );
  });

  it('raises accepted nine to twelve and persists match', async () => {
    const match = new Match(12);
    match.start('4');
    match.requestTruco('P1');
    match.acceptBet('P2');
    match.raiseToSix('P2');
    match.acceptBet('P1');
    match.raiseToNine('P1');
    match.acceptBet('P2');

    const { repo, mocks } = makeRepo(match);
    const useCase = new RaiseToTwelveUseCase(repo);

    const result = await useCase.execute({
      matchId: 'm1',
      playerId: 'P2',
    });

    expect(mocks.save).toHaveBeenCalledWith('m1', match);
    expect(result).toEqual({
      matchId: 'm1',
      state: 'in_progress',
      score: {
        playerOne: 0,
        playerTwo: 0,
      },
    });
  });
});
