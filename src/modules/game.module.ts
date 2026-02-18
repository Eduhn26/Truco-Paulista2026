import { Module } from '@nestjs/common';

import { GameGateway } from '@game/gateway/game.gateway';

import type { MatchRepository } from '@game/application/ports/match.repository';
import { CreateMatchUseCase } from '@game/application/use-cases/create-match.use-case';
import { StartHandUseCase } from '@game/application/use-cases/start-hand.use-case';
import { PlayCardUseCase } from '@game/application/use-cases/play-card.use-case';
import { ViewMatchStateUseCase } from '@game/application/use-cases/view-match-state.use-case';

import { PrismaModule } from '@game/infrastructure/persistence/prisma/prisma.module';
import { PrismaMatchRepository } from '@game/infrastructure/persistence/prisma/prisma-match.repository';

import { MATCH_REPOSITORY } from './game.tokens';

@Module({
  imports: [PrismaModule],
  providers: [
    // Gateway (Transport)
    GameGateway,

    // Port binding (Application Port -> Infrastructure Adapter)
    {
      provide: MATCH_REPOSITORY,
      useClass: PrismaMatchRepository,
    },

    // Use Cases (Application)
    {
      provide: CreateMatchUseCase,
      useFactory: (repo: MatchRepository) => new CreateMatchUseCase(repo),
      inject: [MATCH_REPOSITORY],
    },
    {
      provide: StartHandUseCase,
      useFactory: (repo: MatchRepository) => new StartHandUseCase(repo),
      inject: [MATCH_REPOSITORY],
    },
    {
      provide: PlayCardUseCase,
      useFactory: (repo: MatchRepository) => new PlayCardUseCase(repo),
      inject: [MATCH_REPOSITORY],
    },
    {
      provide: ViewMatchStateUseCase,
      useFactory: (repo: MatchRepository) => new ViewMatchStateUseCase(repo),
      inject: [MATCH_REPOSITORY],
    },
  ],
  exports: [CreateMatchUseCase, StartHandUseCase, PlayCardUseCase, ViewMatchStateUseCase],
})
export class GameModule {}
