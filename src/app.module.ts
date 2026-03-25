import { Module } from '@nestjs/common';

import { AppController } from './app.controller';
import { AppService } from './app.service';

import { GameModule } from '@game/modules/game.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from '@game/auth/auth.module';

@Module({
  imports: [GameModule, HealthModule, AuthModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}