import { PrismaClient } from '@/generated/prisma';
import type {
  PlayerProfileRepository,
  PlayerProfileSnapshot,
} from '@/application/ports/player-profile.repository';

// NOTE: Implementação concreta da porta PlayerProfileRepository.
// Infra conhece Prisma. Application não conhece.
export class PrismaPlayerProfileRepository implements PlayerProfileRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByToken(playerToken: string): Promise<PlayerProfileSnapshot | null> {
    const profile = await this.prisma.playerProfile.findUnique({
      where: { playerToken },
    });

    if (!profile) return null;

    return profile;
  }

  async create(playerToken: string): Promise<PlayerProfileSnapshot> {
    // NOTE: rating inicia 1000 por regra de negócio simplificada (ELO base).
    const created = await this.prisma.playerProfile.create({
      data: { playerToken },
    });

    return created;
  }

  async save(profile: PlayerProfileSnapshot): Promise<void> {
    // NOTE: save é usado quando já temos snapshot modificado (ex: update de ranking).
    await this.prisma.playerProfile.update({
      where: { id: profile.id },
      data: {
        rating: profile.rating,
        wins: profile.wins,
        losses: profile.losses,
        matchesPlayed: profile.matchesPlayed,
      },
    });
  }
}