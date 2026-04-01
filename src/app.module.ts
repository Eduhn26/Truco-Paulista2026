import { MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';

import { AppController } from './app.controller';
import { AppService } from './app.service';

import { AuthModule } from '@game/auth/auth.module';
import { GameModule } from '@game/modules/game.module';
import { RequestLoggingInterceptor } from './application/http/interceptors/request-logging.interceptor';
import { RequestContextMiddleware } from './application/http/middleware/request-context.middleware';
import { SocketRateLimitGuard } from './gateway/security/socket-rate-limit.guard';
import { HealthModule } from './health/health.module';

@Module({
  imports: [GameModule, HealthModule, AuthModule],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: SocketRateLimitGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: RequestLoggingInterceptor,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
