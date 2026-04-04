import { Match } from '../../../src/domain/entities/match';
import { RaiseToSixUseCase } from '../../../src/application/use-cases/raise-to-six.use-case';
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

describe('RaiseToSixUseCase (Application)', () => {
  it('throws when matchId is missing', async () => {
    const { repo } = makeRepo(null);
    const useCase = new RaiseToSixUseCase(repo);

    await expect(useCase.execute({ matchId: '   ', playerId: 'P1' })).rejects.toThrow(
      'matchId is required',
    );
  });

  it('throws when playerId is invalid', async () => {
    const { repo, mocks } = makeRepo(null);
    const useCase = new RaiseToSixUseCase(repo);

    await expect(useCase.execute({ matchId: 'm1', playerId: 'X' })).rejects.toThrow(
      'invalid playerId',
    );

    expect(mocks.getById).not.toHaveBeenCalled();
  });

  it('raises accepted truco to six and persists match', async () => {
    const match = new Match(12);
    match.start('4');
    match.requestTruco('P1');
    match.acceptBet('P2');

    const { repo, mocks } = makeRepo(match);
    const useCase = new RaiseToSixUseCase(repo);

    const result = await useCase.execute({
      matchId: 'm1',
      playerId: 'P1',
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
