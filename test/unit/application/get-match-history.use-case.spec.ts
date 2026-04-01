import { GetMatchHistoryUseCase } from '@game/application/use-cases/get-match-history.use-case';
import type {
  CreateMatchRecordInputDto,
  MatchHistoryListItemDto,
  MatchRecordDto,
  MatchReplayDto,
} from '@game/application/dtos/match-record.dto';
import type { MatchRecordRepository } from '@game/application/ports/match-record.repository';

class FakeMatchRecordRepository implements MatchRecordRepository {
  public lastUserId: string | null = null;
  public lastLimit: number | null = null;

  save(_record: CreateMatchRecordInputDto): Promise<{ id: string }> {
    return Promise.resolve({ id: 'record-1' });
  }

  getByMatchId(_matchId: string): Promise<MatchRecordDto | null> {
    return Promise.resolve(null);
  }

  listByUserId(userId: string, limit: number): Promise<MatchHistoryListItemDto[]> {
    this.lastUserId = userId;
    this.lastLimit = limit;

    return Promise.resolve([
      {
        id: 'record-1',
        matchId: 'match-1',
        mode: '1v1',
        status: 'completed',
        startedAt: '2026-04-01T01:00:00.000Z',
        finishedAt: '2026-04-01T01:10:00.000Z',
        participants: [
          {
            seatId: 'T1A',
            userId: userId,
            displayName: 'Eduardo',
            isBot: false,
            botProfile: null,
          },
        ],
        finalScore: {
          playerOne: 12,
          playerTwo: 8,
        },
        winnerPlayerId: 'P1',
      },
    ]);
  }

  getReplayByMatchId(_matchId: string): Promise<MatchReplayDto | null> {
    return Promise.resolve(null);
  }
}

describe('GetMatchHistoryUseCase', () => {
  it('returns history items using the provided limit', async () => {
    const repo = new FakeMatchRecordRepository();
    const useCase = new GetMatchHistoryUseCase(repo);

    const result = await useCase.execute({
      userId: 'user-1',
      limit: 5,
    });

    expect(repo.lastUserId).toBe('user-1');
    expect(repo.lastLimit).toBe(5);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.matchId).toBe('match-1');
  });

  it('uses the default limit when one is not provided', async () => {
    const repo = new FakeMatchRecordRepository();
    const useCase = new GetMatchHistoryUseCase(repo);

    await useCase.execute({
      userId: 'user-1',
    });

    expect(repo.lastLimit).toBe(20);
  });

  it('caps the limit at 100', async () => {
    const repo = new FakeMatchRecordRepository();
    const useCase = new GetMatchHistoryUseCase(repo);

    await useCase.execute({
      userId: 'user-1',
      limit: 999,
    });

    expect(repo.lastLimit).toBe(100);
  });

  it('throws when userId is empty', async () => {
    const repo = new FakeMatchRecordRepository();
    const useCase = new GetMatchHistoryUseCase(repo);

    await expect(
      useCase.execute({
        userId: '   ',
      }),
    ).rejects.toThrow('userId is required');
  });
});
