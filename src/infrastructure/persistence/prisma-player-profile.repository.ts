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
    const row = await this.prisma.playerProfile.findUnique({
      where: { userId },
      include: {
        user: {
          select: {
            displayName: true,
          },
        },
      },
    });

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      userId: row.userId,
      displayName: row.user.displayName,
      rating: row.rating,
      wins: row.wins,
      losses: row.losses,
      matchesPlayed: row.matchesPlayed,
    };
  }

  async createForUser(userId: string): Promise<PlayerProfileSnapshot> {
    const row = await this.prisma.playerProfile.create({
      data: { userId },
      include: {
        user: {
          select: {
            displayName: true,
          },
        },
      },
    });

    return {
      id: row.id,
      userId: row.userId,
      displayName: row.user.displayName,
      rating: row.rating,
      wins: row.wins,
      losses: row.losses,
      matchesPlayed: row.matchesPlayed,
    };
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
    const rows = await this.prisma.playerProfile.findMany({
      orderBy: [{ rating: 'desc' }, { wins: 'desc' }, { matchesPlayed: 'desc' }],
      take: limit,
      include: {
        user: {
          select: {
            displayName: true,
          },
        },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      userId: row.userId,
      displayName: row.user.displayName,
      rating: row.rating,
      wins: row.wins,
      losses: row.losses,
      matchesPlayed: row.matchesPlayed,
    }));
  }
}
