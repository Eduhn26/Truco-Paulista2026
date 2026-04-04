import { Match } from '../../../src/domain/entities/match';
import { DeclineMaoDeOnzeUseCase } from '../../../src/application/use-cases/decline-mao-de-onze.use-case';
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

describe('DeclineMaoDeOnzeUseCase (Application)', () => {
  it('throws when playerId is invalid', async () => {
    const { repo, mocks } = makeRepo(null);
    const useCase = new DeclineMaoDeOnzeUseCase(repo);

    await expect(useCase.execute({ matchId: 'm1', playerId: 'wrong' })).rejects.toThrow(
      'invalid playerId',
    );

    expect(mocks.getById).not.toHaveBeenCalled();
  });

  it('declines mao de onze, awards 1 point to the opponent and persists match', async () => {
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

    const { repo, mocks } = makeRepo(match);
    const useCase = new DeclineMaoDeOnzeUseCase(repo);

    const result = await useCase.execute({
      matchId: 'm1',
      playerId: 'P1',
    });

    expect(mocks.save).toHaveBeenCalledWith('m1', match);
    expect(result).toEqual({
      matchId: 'm1',
      state: 'waiting',
      score: {
        playerOne: 11,
        playerTwo: 11,
      },
    });
  });
});
