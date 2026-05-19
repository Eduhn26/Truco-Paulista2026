import { Injectable } from '@nestjs/common';
import type {
  PlayerProfileRepository,
  PlayerProfileSnapshot,
} from '@game/application/ports/player-profile.repository';
import { PrismaService } from './prisma/prisma.service';

type PlayerProfileRowWithUser = {
  id: string;
  userId: string;
  publicName: string | null;
  publicSlug: string | null;
  rating: number;
  wins: number;
  losses: number;
  matchesPlayed: number;
  user: {
    displayName: string | null;
  };
};

const MAX_PUBLIC_NAME_LENGTH = 32;

function normalizePublicName(displayName: string | null | undefined): string | null {
  const normalized = displayName?.trim().replace(/\s+/g, ' ') ?? '';

  if (!normalized) {
    return null;
  }

  return normalized.slice(0, MAX_PUBLIC_NAME_LENGTH);
}

function buildPublicSlug(publicName: string, userId: string): string {
  const base = publicName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  const safeBase = base || 'jogador';

  return `${safeBase}-${userId.slice(0, 8)}`;
}

function toSnapshot(row: PlayerProfileRowWithUser): PlayerProfileSnapshot {
  const effectiveDisplayName = row.publicName ?? row.user.displayName;

  return {
    id: row.id,
    userId: row.userId,
    displayName: effectiveDisplayName,
    publicName: row.publicName,
    publicSlug: row.publicSlug,
    rating: row.rating,
    wins: row.wins,
    losses: row.losses,
    matchesPlayed: row.matchesPlayed,
  };
}

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

    return toSnapshot(row);
  }

  async createForUser(userId: string): Promise<PlayerProfileSnapshot> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { displayName: true },
    });

    const publicName = normalizePublicName(user?.displayName);
    const publicSlug = publicName ? buildPublicSlug(publicName, userId) : null;

    const row = await this.prisma.playerProfile.create({
      data: {
        userId,
        ...(publicName ? { publicName } : {}),
        ...(publicSlug ? { publicSlug } : {}),
      },
      include: {
        user: {
          select: {
            displayName: true,
          },
        },
      },
    });

    return toSnapshot(row);
  }

  async updatePublicNameForUser(
    userId: string,
    publicName: string,
  ): Promise<PlayerProfileSnapshot> {
    const normalizedPublicName = normalizePublicName(publicName);

    if (!normalizedPublicName) {
      throw new Error('publicName is required');
    }

    const publicSlug = buildPublicSlug(normalizedPublicName, userId);

    const row = await this.prisma.playerProfile.upsert({
      where: { userId },
      create: {
        userId,
        publicName: normalizedPublicName,
        publicSlug,
      },
      update: {
        publicName: normalizedPublicName,
        publicSlug,
      },
      include: {
        user: {
          select: {
            displayName: true,
          },
        },
      },
    });

    return toSnapshot(row);
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

    return rows.map(toSnapshot);
  }
}
