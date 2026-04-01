import type { MatchReplayDto } from '@game/application/dtos/match-record.dto';
import type { MatchRecordRepository } from '@game/application/ports/match-record.repository';

export type GetMatchReplayRequestDto = {
  matchId: string;
};

export type GetMatchReplayResponseDto = MatchReplayDto;

export class GetMatchReplayUseCase {
  constructor(private readonly matchRecordRepository: MatchRecordRepository) {}

  async execute(request: GetMatchReplayRequestDto): Promise<GetMatchReplayResponseDto | null> {
    const matchId = this.requireNonEmptyString(request.matchId, 'matchId');

    return this.matchRecordRepository.getReplayByMatchId(matchId);
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
