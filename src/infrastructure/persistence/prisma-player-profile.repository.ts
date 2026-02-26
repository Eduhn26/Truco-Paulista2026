import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import type { 
  PlayerProfileRepository, 
  PlayerProfileSnapshot 
} from '@game/application/ports/player-profile.repository';

@Injectable()
export class PrismaPlayerProfileRepository implements PlayerProfileRepository {
  private readonly prisma = new PrismaClient();

  async findByToken(playerToken: string): Promise<PlayerProfileSnapshot | null> {
    return this.prisma.playerProfile.findUnique({ where: { playerToken } });
  }

  async create(playerToken: string): Promise<PlayerProfileSnapshot> {
    return this.prisma.playerProfile.create({ data: { playerToken } });
  }

  async save(profile: PlayerProfileSnapshot): Promise<void> {
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

  async listTop(limit: number): Promise<PlayerProfileSnapshot[]> {
    return this.prisma.playerProfile.findMany({
      orderBy: { rating: 'desc' },
      take: limit,
    });
  }
}