import { GetMatchReplayUseCase } from '@game/application/use-cases/get-match-replay.use-case';
import type {
  CreateMatchRecordInputDto,
  MatchHistoryListItemDto,
  MatchRecordDto,
  MatchReplayDto,
} from '@game/application/dtos/match-record.dto';
import type { MatchRecordRepository } from '@game/application/ports/match-record.repository';

class FakeMatchRecordRepository implements MatchRecordRepository {
  public lastMatchId: string | null = null;

  save(_record: CreateMatchRecordInputDto): Promise<{ id: string }> {
    return Promise.resolve({ id: 'record-1' });
  }

  getByMatchId(_matchId: string): Promise<MatchRecordDto | null> {
    return Promise.resolve(null);
  }

  listByUserId(_userId: string, _limit: number): Promise<MatchHistoryListItemDto[]> {
    return Promise.resolve([]);
  }

  getReplayByMatchId(matchId: string): Promise<MatchReplayDto | null> {
    this.lastMatchId = matchId;

    return Promise.resolve({
      matchId,
      events: [
        {
          sequence: 0,
          occurredAt: '2026-04-01T01:00:00.000Z',
          payload: {
            type: 'match-created',
            pointsToWin: 12,
            mode: '1v1',
          },
        },
      ],
    });
  }
}

describe('GetMatchReplayUseCase', () => {
  it('returns replay by matchId', async () => {
    const repo = new FakeMatchRecordRepository();
    const useCase = new GetMatchReplayUseCase(repo);

    const result = await useCase.execute({
      matchId: 'match-1',
    });

    expect(repo.lastMatchId).toBe('match-1');
    expect(result).not.toBeNull();
    expect(result?.events).toHaveLength(1);
    expect(result?.events[0]?.payload.type).toBe('match-created');
  });

  it('throws when matchId is empty', async () => {
    const repo = new FakeMatchRecordRepository();
    const useCase = new GetMatchReplayUseCase(repo);

    await expect(
      useCase.execute({
        matchId: '   ',
      }),
    ).rejects.toThrow('matchId is required');
  });
});
