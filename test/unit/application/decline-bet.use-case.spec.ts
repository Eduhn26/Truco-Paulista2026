import { Match } from '../../../src/domain/entities/match';
import { DeclineBetUseCase } from '../../../src/application/use-cases/decline-bet.use-case';
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

describe('DeclineBetUseCase (Application)', () => {
  it('throws when playerId is invalid', async () => {
    const { repo, mocks } = makeRepo(null);
    const useCase = new DeclineBetUseCase(repo);

    await expect(useCase.execute({ matchId: 'm1', playerId: 'team-1' })).rejects.toThrow(
      'invalid playerId',
    );

    expect(mocks.getById).not.toHaveBeenCalled();
  });

  it('declines a pending raise and persists finished hand state', async () => {
    const match = new Match(12);
    match.start('4');
    match.requestTruco('P1');

    const { repo, mocks } = makeRepo(match);
    const useCase = new DeclineBetUseCase(repo);

    const result = await useCase.execute({
      matchId: 'm1',
      playerId: 'P2',
    });

    expect(mocks.save).toHaveBeenCalledWith('m1', match);
    expect(result).toEqual({
      matchId: 'm1',
      state: 'waiting',
      score: {
        playerOne: 1,
        playerTwo: 0,
      },
    });
  });
});
