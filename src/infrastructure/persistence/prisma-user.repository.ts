import { Injectable } from '@nestjs/common';

import type {
  CreateUserInput,
  UserRepository,
  UserSnapshot,
} from '@game/application/ports/user.repository';
import { PrismaService } from '@game/infrastructure/persistence/prisma/prisma.service';

@Injectable()
export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(userId: string): Promise<UserSnapshot | null> {
    return this.prisma.user.findUnique({
      where: { id: userId },
    });
  }

  async findByProviderIdentity(
    provider: string,
    providerUserId: string,
  ): Promise<UserSnapshot | null> {
    return this.prisma.user.findUnique({
      where: {
        provider_providerUserId: {
          provider,
          providerUserId,
        },
      },
    });
  }

  async create(input: CreateUserInput): Promise<UserSnapshot> {
    return this.prisma.user.create({
      data: {
        provider: input.provider,
        providerUserId: input.providerUserId,
        email: input.email ?? null,
        displayName: input.displayName ?? null,
        avatarUrl: input.avatarUrl ?? null,
      },
    });
  }
}
