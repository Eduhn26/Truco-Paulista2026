import { Match } from '../../../src/domain/entities/match';
import { RequestTrucoUseCase } from '../../../src/application/use-cases/request-truco.use-case';
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

describe('RequestTrucoUseCase (Application)', () => {
  it('throws when matchId is missing', async () => {
    const { repo } = makeRepo(null);
    const useCase = new RequestTrucoUseCase(repo);

    await expect(useCase.execute({ matchId: '   ', playerId: 'P1' })).rejects.toThrow(
      'matchId is required',
    );
  });

  it('throws when playerId is missing', async () => {
    const { repo } = makeRepo(null);
    const useCase = new RequestTrucoUseCase(repo);

    await expect(useCase.execute({ matchId: 'm1', playerId: '   ' })).rejects.toThrow(
      'playerId is required',
    );
  });

  it('throws when playerId is invalid', async () => {
    const { repo, mocks } = makeRepo(null);
    const useCase = new RequestTrucoUseCase(repo);

    await expect(useCase.execute({ matchId: 'm1', playerId: 'P3' })).rejects.toThrow(
      'invalid playerId',
    );

    expect(mocks.getById).not.toHaveBeenCalled();
  });

  it('throws when match is not found', async () => {
    const { repo } = makeRepo(null);
    const useCase = new RequestTrucoUseCase(repo);

    await expect(useCase.execute({ matchId: 'missing', playerId: 'P1' })).rejects.toThrow(
      'match not found',
    );
  });

  it('requests truco and persists match', async () => {
    const match = new Match(12);
    match.start('4');

    const { repo, mocks } = makeRepo(match);
    const useCase = new RequestTrucoUseCase(repo);

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
