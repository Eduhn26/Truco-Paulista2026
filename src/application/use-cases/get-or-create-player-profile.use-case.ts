import type {
  PlayerProfileRepository,
  PlayerProfileSnapshot,
} from '@game/application/ports/player-profile.repository';

type GetOrCreatePlayerProfileForUserRequestDto = {
  userId: string;
};

type GetOrCreatePlayerProfileForUserResponseDto = {
  profile: PlayerProfileSnapshot;
};

export class GetOrCreatePlayerProfileUseCase {
  constructor(private readonly playerProfileRepository: PlayerProfileRepository) {}

  async execute(
    request: GetOrCreatePlayerProfileForUserRequestDto,
  ): Promise<GetOrCreatePlayerProfileForUserResponseDto> {
    const userId = this.normalizeUserId(request.userId);

    const existingProfile = await this.playerProfileRepository.findByUserId(userId);

    if (existingProfile) {
      return { profile: existingProfile };
    }

    const createdProfile = await this.playerProfileRepository.createForUser(userId);

    return { profile: createdProfile };
  }

  private normalizeUserId(userId: string): string {
    if (typeof userId !== 'string') {
      throw new Error('userId is required');
    }

    const normalizedUserId = userId.trim();

    if (!normalizedUserId) {
      throw new Error('userId is required');
    }

    return normalizedUserId;
  }
}