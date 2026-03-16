// src/infrastructure/persistence/prisma/prisma.service.ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    const maxRetries = 10;
    const delayMs = 3000;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.$connect();
        this.logger.log('Connected to database successfully');
        return;
      } catch (err) {
        this.logger.warn(`DB connection attempt ${attempt}/${maxRetries} failed. Retrying in ${delayMs}ms...`);
        if (attempt === maxRetries) throw err;
        await new Promise((res) => setTimeout(res, delayMs));
      }
    }
  }
}