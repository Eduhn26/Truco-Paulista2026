import { Module } from '@nestjs/common';

import type { MatchRepository } from '@game/application/ports/match.repository';
import { CreateMatchUseCase } from '@game/application/use-cases/create-match.use-case';
import { StartHandUseCase } from '@game/application/use-cases/start-hand.use-case';
import { PlayCardUseCase } from '@game/application/use-cases/play-card.use-case';
import { ViewMatchStateUseCase } from '@game/application/use-cases/view-match-state.use-case';

import { InMemoryMatchRepository } from '@game/infrastructure/persistence/in-memory/in-memory-match.repository';

import { MATCH_REPOSITORY } from './game.tokens';

@Module({
  providers: [
    // Port binding (Application Port -> Infrastructure Adapter)
    {
      provide: MATCH_REPOSITORY,
      useClass: InMemoryMatchRepository,
    },

    // Use Cases (Application) - instantiated via factory to keep Application framework-agnostic
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
