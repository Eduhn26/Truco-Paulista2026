import { Injectable } from '@nestjs/common';
import type {
  PlayerProfileRepository,
  PlayerProfileSnapshot,
} from '@game/application/ports/player-profile.repository';
import { PrismaService } from './prisma/prisma.service';

@Injectable()
export class PrismaPlayerProfileRepository implements PlayerProfileRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByUserId(userId: string): Promise<PlayerProfileSnapshot | null> {
    return this.prisma.playerProfile.findUnique({
      where: { userId },
    });
  }

  async createForUser(userId: string): Promise<PlayerProfileSnapshot> {
    return this.prisma.playerProfile.create({
      data: { userId },
    });
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
      orderBy: [{ rating: 'desc' }, { wins: 'desc' }, { matchesPlayed: 'desc' }],
      take: limit,
    });
  }
}