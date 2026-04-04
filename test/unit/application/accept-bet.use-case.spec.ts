import { Match } from '../../../src/domain/entities/match';
import { AcceptBetUseCase } from '../../../src/application/use-cases/accept-bet.use-case';
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

describe('AcceptBetUseCase (Application)', () => {
  it('throws when matchId is missing', async () => {
    const { repo } = makeRepo(null);
    const useCase = new AcceptBetUseCase(repo);

    await expect(useCase.execute({ matchId: '   ', playerId: 'P2' })).rejects.toThrow(
      'matchId is required',
    );
  });

  it('accepts a pending bet and persists match', async () => {
    const match = new Match(12);
    match.start('4');
    match.requestTruco('P1');

    const { repo, mocks } = makeRepo(match);
    const useCase = new AcceptBetUseCase(repo);

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
