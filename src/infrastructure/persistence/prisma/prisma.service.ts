import 'dotenv/config';
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '../../../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    const connectionString = process.env['DATABASE_URL'];

    if (typeof connectionString !== 'string' || connectionString.trim().length === 0) {
      throw new Error(
        'DATABASE_URL is missing. Add it to backend/.env (example: postgresql://postgres:postgres@localhost:51214/postgres?schema=public)',
      );
    }

    const adapter = new PrismaPg({ connectionString });

    // Prisma 7 client engine: precisa de adapter OU accelerateUrl.
    super({ adapter } as unknown as ConstructorParameters<typeof PrismaClient>[0]);
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
