import type {
  CreateMatchRecordInputDto,
  MatchHistoryListItemDto,
  MatchRecordDto,
  MatchReplayDto,
} from '@game/application/dtos/match-record.dto';

export interface MatchRecordRepository {
  save(record: CreateMatchRecordInputDto): Promise<{ id: string }>;

  getByMatchId(matchId: string): Promise<MatchRecordDto | null>;

  listByUserId(userId: string, limit: number): Promise<MatchHistoryListItemDto[]>;

  getReplayByMatchId(matchId: string): Promise<MatchReplayDto | null>;
}
