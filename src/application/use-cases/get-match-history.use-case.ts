import type { MatchHistoryListItemDto } from '@game/application/dtos/match-record.dto';
import type { MatchRecordRepository } from '@game/application/ports/match-record.repository';

export type GetMatchHistoryRequestDto = {
  userId: string;
  limit?: number;
};

export type GetMatchHistoryResponseDto = {
  items: MatchHistoryListItemDto[];
};

const DEFAULT_HISTORY_LIMIT = 20;
const MAX_HISTORY_LIMIT = 100;

export class GetMatchHistoryUseCase {
  constructor(private readonly matchRecordRepository: MatchRecordRepository) {}

  async execute(request: GetMatchHistoryRequestDto): Promise<GetMatchHistoryResponseDto> {
    const userId = this.requireNonEmptyString(request.userId, 'userId');
    const limit = this.normalizeLimit(request.limit);

    const items = await this.matchRecordRepository.listByUserId(userId, limit);

    return {
      items,
    };
  }

  private normalizeLimit(limit: number | undefined): number {
    if (limit === undefined) {
      return DEFAULT_HISTORY_LIMIT;
    }

    if (!Number.isInteger(limit) || limit <= 0) {
      throw new Error('limit must be a positive integer');
    }

    return Math.min(limit, MAX_HISTORY_LIMIT);
  }

  private requireNonEmptyString(value: string, fieldName: string): string {
    if (typeof value !== 'string') {
      throw new Error(`${fieldName} is required`);
    }

    const normalizedValue = value.trim();

    if (!normalizedValue) {
      throw new Error(`${fieldName} is required`);
    }

    return normalizedValue;
  }
}
