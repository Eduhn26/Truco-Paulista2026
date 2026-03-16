import { Module } from '@nestjs/common';

import { AppController } from './app.controller';
import { AppService } from './app.service';

import { GameModule } from '@game/modules/game.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [GameModule, HealthModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
