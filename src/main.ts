import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';

type BootstrapLogContext = {
  layer: 'bootstrap';
  event: 'application_starting' | 'application_started' | 'application_start_failed';
  status: 'started' | 'succeeded' | 'failed';
  port?: number;
  url?: string;
  errorName?: string;
  errorMessage?: string;
};

function formatBootstrapLog(context: BootstrapLogContext): string {
  return JSON.stringify({
    timestamp: new Date().toISOString(),
    ...context,
  });
}

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const port = process.env['PORT'] ? Number(process.env['PORT']) : 3000;

  logger.log(
    formatBootstrapLog({
      layer: 'bootstrap',
      event: 'application_starting',
      status: 'started',
      port,
    }),
  );

  const app = await NestFactory.create(AppModule);
  await app.listen(port);

  logger.log(
    formatBootstrapLog({
      layer: 'bootstrap',
      event: 'application_started',
      status: 'succeeded',
      port,
      url: await app.getUrl(),
    }),
  );
}

bootstrap().catch((error: unknown) => {
  const logger = new Logger('Bootstrap');

  logger.error(
    formatBootstrapLog({
      layer: 'bootstrap',
      event: 'application_start_failed',
      status: 'failed',
      errorName: error instanceof Error ? error.name : 'UnknownError',
      errorMessage:
        error instanceof Error ? error.message : 'Bootstrap failed with a non-Error value',
    }),
  );

  process.exit(1);
});
