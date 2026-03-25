import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@game/generated/prisma';

type DatabaseLogContext = {
  layer: 'infrastructure';
  dependency: 'database';
  event:
    | 'database_connecting'
    | 'database_connected'
    | 'database_connection_retry'
    | 'database_connection_failed'
    | 'database_readiness_failed';
  status: 'started' | 'succeeded' | 'retrying' | 'failed';
  attempt?: number;
  maxRetries?: number;
  delayMs?: number;
  errorName?: string;
  errorMessage?: string;
};

function formatDatabaseLog(context: DatabaseLogContext): string {
  return JSON.stringify({
    timestamp: new Date().toISOString(),
    ...context,
  });
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    const maxRetries = 10;
    const delayMs = 3000;

    this.logger.log(
      formatDatabaseLog({
        layer: 'infrastructure',
        dependency: 'database',
        event: 'database_connecting',
        status: 'started',
        maxRetries,
        delayMs,
      }),
    );

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.$connect();

        this.logger.log(
          formatDatabaseLog({
            layer: 'infrastructure',
            dependency: 'database',
            event: 'database_connected',
            status: 'succeeded',
            attempt,
            maxRetries,
          }),
        );

        return;
      } catch (error) {
        if (attempt === maxRetries) {
          this.logger.error(
            formatDatabaseLog({
              layer: 'infrastructure',
              dependency: 'database',
              event: 'database_connection_failed',
              status: 'failed',
              attempt,
              maxRetries,
              errorName: error instanceof Error ? error.name : 'UnknownError',
              errorMessage:
                error instanceof Error
                  ? error.message
                  : 'Database connection failed with a non-Error value',
            }),
          );

          throw error;
        }

        this.logger.warn(
          formatDatabaseLog({
            layer: 'infrastructure',
            dependency: 'database',
            event: 'database_connection_retry',
            status: 'retrying',
            attempt,
            maxRetries,
            delayMs,
            errorName: error instanceof Error ? error.name : 'UnknownError',
            errorMessage:
              error instanceof Error
                ? error.message
                : 'Database connection retry triggered by a non-Error value',
          }),
        );

        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  async isDatabaseReady(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      this.logger.warn(
        formatDatabaseLog({
          layer: 'infrastructure',
          dependency: 'database',
          event: 'database_readiness_failed',
          status: 'failed',
          errorName: error instanceof Error ? error.name : 'UnknownError',
          errorMessage:
            error instanceof Error
              ? error.message
              : 'Database readiness failed with a non-Error value',
        }),
      );

      return false;
    }
  }
}