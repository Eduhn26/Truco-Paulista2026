import { Match } from '../../../src/domain/entities/match';
import { PlayCardUseCase } from '../../../src/application/use-cases/play-card.use-case';
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

describe('PlayCardUseCase (Application)', () => {
  it('throws when matchId is missing', async () => {
    const { repo } = makeRepo(null);
    const useCase = new PlayCardUseCase(repo);

    await expect(useCase.execute({ matchId: '   ', playerId: 'P1', card: '5P' })).rejects.toThrow(
      'matchId is required',
    );
  });

  it('throws when match is not found', async () => {
    const { repo } = makeRepo(null);
    const useCase = new PlayCardUseCase(repo);

    await expect(
      useCase.execute({ matchId: 'missing', playerId: 'P1', card: '5P' }),
    ).rejects.toThrow('match not found');
  });

  it('throws when playerId is invalid (and does not hit repository)', async () => {
    const { repo, mocks } = makeRepo(null);
    const useCase = new PlayCardUseCase(repo);

    await expect(useCase.execute({ matchId: 'm1', playerId: 'P3', card: '5P' })).rejects.toThrow(
      'invalid playerId',
    );

    expect(mocks.getById).not.toHaveBeenCalled();
  });

  it('plays a card and persists match', async () => {
    const match = new Match(1);
    match.start('4');

    const { repo, mocks } = makeRepo(match);
    const useCase = new PlayCardUseCase(repo);

    const result = await useCase.execute({
      matchId: 'm1',
      playerId: 'P1',
      card: '5P',
    });

    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(mocks.save).toHaveBeenCalledWith('m1', match);
    expect(result.state).toBe('in_progress');
    expect(result.score.playerOne).toBe(0);
    expect(result.score.playerTwo).toBe(0);
  });

  it('finishes match when pointsToWin is reached (1 point)', async () => {
    const match = new Match(1);
    match.start('4');

    const { repo } = makeRepo(match);
    const useCase = new PlayCardUseCase(repo);

    await useCase.execute({ matchId: 'm1', playerId: 'P1', card: '5P' });
    await useCase.execute({ matchId: 'm1', playerId: 'P2', card: '7O' });

    await useCase.execute({ matchId: 'm1', playerId: 'P1', card: '5P' });
    const final = await useCase.execute({
      matchId: 'm1',
      playerId: 'P2',
      card: '5O',
    });

    expect(final.state).toBe('finished');
    expect(final.score.playerOne).toBe(1);
    expect(final.score.playerTwo).toBe(0);
  });
});
