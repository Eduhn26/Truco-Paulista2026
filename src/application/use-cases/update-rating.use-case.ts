import type {
  PlayerProfileRepository,
  PlayerProfileSnapshot,
} from '@game/application/ports/player-profile.repository';

type UpdateRatingRequestDto = {
  winnerUserIds: string[];
  loserUserIds: string[];
};

type UpdateRatingResponseDto = {
  ok: true;
};

const RATING_DELTA = 25;
const RATING_FLOOR = 100;

function applyWin(profile: PlayerProfileSnapshot): PlayerProfileSnapshot {
  return {
    ...profile,
    rating: profile.rating + RATING_DELTA,
    wins: profile.wins + 1,
    matchesPlayed: profile.matchesPlayed + 1,
  };
}

function applyLoss(profile: PlayerProfileSnapshot): PlayerProfileSnapshot {
  return {
    ...profile,
    rating: Math.max(RATING_FLOOR, profile.rating - RATING_DELTA),
    losses: profile.losses + 1,
    matchesPlayed: profile.matchesPlayed + 1,
  };
}

export class UpdateRatingUseCase {
  constructor(private readonly repo: PlayerProfileRepository) {}

  async execute(request: UpdateRatingRequestDto): Promise<UpdateRatingResponseDto> {
    const winnerUserIds = this.normalizeUserIds(request.winnerUserIds, 'winnerUserIds');
    const loserUserIds = this.normalizeUserIds(request.loserUserIds, 'loserUserIds');

    const winners = await Promise.all(
      winnerUserIds.map((userId) => this.repo.findByUserId(userId)),
    );
    const losers = await Promise.all(loserUserIds.map((userId) => this.repo.findByUserId(userId)));

    if (winners.some((profile) => !profile) || losers.some((profile) => !profile)) {
      throw new Error('Player profile not found');
    }

    const profilesToSave: PlayerProfileSnapshot[] = [];

    for (const profile of winners as PlayerProfileSnapshot[]) {
      profilesToSave.push(applyWin(profile));
    }

    for (const profile of losers as PlayerProfileSnapshot[]) {
      profilesToSave.push(applyLoss(profile));
    }

    await Promise.all(profilesToSave.map((profile) => this.repo.save(profile)));

    return { ok: true };
  }

  private normalizeUserIds(userIds: string[], fieldName: string): string[] {
    if (!Array.isArray(userIds) || userIds.length === 0) {
      throw new Error(`${fieldName} must contain at least one userId`);
    }

    const normalizedUserIds = userIds.map((userId) => {
      if (typeof userId !== 'string') {
        throw new Error(`${fieldName} must contain only strings`);
      }

      const normalizedUserId = userId.trim();

      if (!normalizedUserId) {
        throw new Error(`${fieldName} must not contain empty userIds`);
      }

      return normalizedUserId;
    });

    return normalizedUserIds;
  }
}
