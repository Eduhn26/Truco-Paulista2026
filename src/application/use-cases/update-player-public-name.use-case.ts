import type {
  PlayerProfileRepository,
  PlayerProfileSnapshot,
} from '@game/application/ports/player-profile.repository';

type UpdatePlayerPublicNameRepository = Pick<
  PlayerProfileRepository,
  'findByUserId' | 'createForUser'
> & {
  updatePublicNameForUser(userId: string, publicName: string): Promise<PlayerProfileSnapshot>;
};

export type UpdatePlayerPublicNameRequestDto = {
  userId: string;
  publicName: string;
};

export type UpdatePlayerPublicNameResponseDto = {
  profile: PlayerProfileSnapshot;
};

const MIN_PUBLIC_NAME_LENGTH = 3;
const MAX_PUBLIC_NAME_LENGTH = 32;
const PUBLIC_NAME_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} ._'-]*$/u;

export class UpdatePlayerPublicNameUseCase {
  constructor(private readonly playerProfileRepository: UpdatePlayerPublicNameRepository) {}

  async execute(
    request: UpdatePlayerPublicNameRequestDto,
  ): Promise<UpdatePlayerPublicNameResponseDto> {
    const userId = this.normalizeUserId(request.userId);
    const publicName = this.normalizePublicName(request.publicName);

    const existingProfile = await this.playerProfileRepository.findByUserId(userId);

    if (!existingProfile) {
      await this.playerProfileRepository.createForUser(userId);
    }

    const updatedProfile = await this.playerProfileRepository.updatePublicNameForUser(
      userId,
      publicName,
    );

    return {
      profile: updatedProfile,
    };
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

  private normalizePublicName(publicName: string): string {
    if (typeof publicName !== 'string') {
      throw new Error('publicName is required');
    }

    const normalizedPublicName = publicName.trim().replace(/\s+/g, ' ');

    if (
      normalizedPublicName.length < MIN_PUBLIC_NAME_LENGTH ||
      normalizedPublicName.length > MAX_PUBLIC_NAME_LENGTH
    ) {
      throw new Error(
        `publicName must have between ${MIN_PUBLIC_NAME_LENGTH} and ${MAX_PUBLIC_NAME_LENGTH} characters`,
      );
    }

    if (!PUBLIC_NAME_PATTERN.test(normalizedPublicName)) {
      throw new Error(
        'publicName can only contain letters, numbers, spaces, dots, underscores, apostrophes and hyphens',
      );
    }

    return normalizedPublicName;
  }
}
