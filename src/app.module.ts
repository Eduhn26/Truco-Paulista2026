import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { AppController } from './app.controller';
import { AppService } from './app.service';

import { AuthModule } from '@game/auth/auth.module';
import { GameModule } from '@game/modules/game.module';
import { HealthModule } from './health/health.module';
import { SocketRateLimitGuard } from './gateway/security/socket-rate-limit.guard';

@Module({
  imports: [GameModule, HealthModule, AuthModule],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: SocketRateLimitGuard,
    },
  ],
})
export class AppModule {}
