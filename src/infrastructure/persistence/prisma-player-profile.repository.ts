import { Injectable } from '@nestjs/common';

import type {
  PlayerProfileRepository,
  PlayerProfileSnapshot,
} from '@game/application/ports/player-profile.repository';

import { PrismaService } from '@game/infrastructure/persistence/prisma/prisma.service';

@Injectable()
export class PrismaPlayerProfileRepository implements PlayerProfileRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByToken(playerToken: string): Promise<PlayerProfileSnapshot | null> {
    const profile = await this.prisma.playerProfile.findUnique({
      where: { playerToken },
    });

    return profile;
  }

  async create(playerToken: string): Promise<PlayerProfileSnapshot> {
    // NOTE: rating/wins/losses/matchesPlayed têm defaults no schema; aqui só garantimos a identidade.
    return this.prisma.playerProfile.create({
      data: { playerToken },
    });
  }

  async save(profile: PlayerProfileSnapshot): Promise<void> {
    // NOTE: Update explícito evita “salvar tudo” e reduzir risco de escrever campos que não mudaram.
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