import compression from 'compression';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';

import { AppModule } from './app.module';
import { loadRuntimeConfig } from './application/runtime/env/runtime-config';

type BootstrapLogContext = {
  layer: 'bootstrap';
  event:
    | 'application_starting'
    | 'runtime_configuration_loaded'
    | 'application_started'
    | 'application_start_failed';
  status: 'started' | 'succeeded' | 'failed';
  nodeEnv?: string;
  port?: number;
  url?: string;
  corsOrigin?: string;
  pythonBotEnabled?: boolean;
  helmetEnabled?: boolean;
  compressionEnabled?: boolean;
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
  const runtimeConfig = loadRuntimeConfig();

  logger.log(
    formatBootstrapLog({
      layer: 'bootstrap',
      event: 'application_starting',
      status: 'started',
      nodeEnv: runtimeConfig.nodeEnv,
      port: runtimeConfig.port,
    }),
  );

  const app = await NestFactory.create(AppModule);

  app.use(helmet());

  app.use(
    compression({
      threshold: 1024,
    }),
  );

  app.enableCors({
    origin: runtimeConfig.corsOrigin,
    credentials: true,
  });

  logger.log(
    formatBootstrapLog({
      layer: 'bootstrap',
      event: 'runtime_configuration_loaded',
      status: 'succeeded',
      nodeEnv: runtimeConfig.nodeEnv,
      port: runtimeConfig.port,
      corsOrigin: runtimeConfig.corsOrigin,
      pythonBotEnabled: runtimeConfig.pythonBotEnabled,
      helmetEnabled: true,
      compressionEnabled: true,
    }),
  );

  await app.listen(runtimeConfig.port);

  logger.log(
    formatBootstrapLog({
      layer: 'bootstrap',
      event: 'application_started',
      status: 'succeeded',
      nodeEnv: runtimeConfig.nodeEnv,
      port: runtimeConfig.port,
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
