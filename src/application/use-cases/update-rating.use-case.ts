import type {
  PlayerProfileRepository,
  PlayerProfileSnapshot,
} from '@game/application/ports/player-profile.repository';

type UpdateRatingRequestDto = {
  winnerTokens: string[];
  loserTokens: string[];
};

function applyWin(profile: PlayerProfileSnapshot): PlayerProfileSnapshot {
  return {
    ...profile,
    rating: profile.rating + 25,
    wins: profile.wins + 1,
    matchesPlayed: profile.matchesPlayed + 1,
  };
}

function applyLoss(profile: PlayerProfileSnapshot): PlayerProfileSnapshot {
  return {
    ...profile,
    rating: Math.max(100, profile.rating - 25),
    losses: profile.losses + 1,
    matchesPlayed: profile.matchesPlayed + 1,
  };
}

export class UpdateRatingUseCase {
  constructor(private readonly repo: PlayerProfileRepository) {}

  async execute(dto: UpdateRatingRequestDto): Promise<{ ok: true }> {
    const { winnerTokens, loserTokens } = dto;

    // NOTE: ELO simplificado de propósito: fechamos a fase com regra clara antes de calibrar fórmula.
    const winners = await Promise.all(winnerTokens.map((t) => this.repo.findByToken(t)));
    const losers = await Promise.all(loserTokens.map((t) => this.repo.findByToken(t)));

    if (winners.some((p) => !p) || losers.some((p) => !p)) {
      throw new Error('Player profile not found');
    }

    const toSave: PlayerProfileSnapshot[] = [];

    for (const p of winners as PlayerProfileSnapshot[]) toSave.push(applyWin(p));
    for (const p of losers as PlayerProfileSnapshot[]) toSave.push(applyLoss(p));

    await Promise.all(toSave.map((p) => this.repo.save(p)));

    return { ok: true };
  }
}
