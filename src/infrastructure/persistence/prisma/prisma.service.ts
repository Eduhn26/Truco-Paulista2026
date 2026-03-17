import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    const maxRetries = 10;
    const delayMs = 3000;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.$connect();
        this.logger.log('Connected to database successfully');
        return;
      } catch (error) {
        this.logger.warn(
          `DB connection attempt ${attempt}/${maxRetries} failed. Retrying in ${delayMs}ms...`,
        );

        if (attempt === maxRetries) {
          throw error;
        }

        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  async isDatabaseReady(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch {
      this.logger.warn('Database readiness probe failed');
      return false;
    }
  }
}