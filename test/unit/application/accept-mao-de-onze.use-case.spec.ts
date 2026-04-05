import { Match } from '../../../src/domain/entities/match';
import { AcceptMaoDeOnzeUseCase } from '../../../src/application/use-cases/accept-mao-de-onze.use-case';
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

describe('AcceptMaoDeOnzeUseCase (Application)', () => {
  it('throws when match is not found', async () => {
    const { repo } = makeRepo(null);
    const useCase = new AcceptMaoDeOnzeUseCase(repo);

    await expect(useCase.execute({ matchId: 'm1', playerId: 'P1' })).rejects.toThrow(
      'match not found',
    );
  });

  it('accepts mao de onze and persists match', async () => {
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

    const { repo, mocks } = makeRepo(match);
    const useCase = new AcceptMaoDeOnzeUseCase(repo);

    const result = await useCase.execute({
      matchId: 'm1',
      playerId: 'P1',
    });

    expect(mocks.save).toHaveBeenCalledWith('m1', match);
    expect(result).toEqual({
      matchId: 'm1',
      state: 'in_progress',
      score: {
        playerOne: 11,
        playerTwo: 8,
      },
    });
  });
});
