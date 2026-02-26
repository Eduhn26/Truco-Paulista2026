import { Module } from '@nestjs/common';
import { GameGateway } from '@game/gateway/game.gateway';
import { CreateMatchUseCase } from '@game/application/use-cases/create-match.use-case';
import { StartHandUseCase } from '@game/application/use-cases/start-hand.use-case';
import { PlayCardUseCase } from '@game/application/use-cases/play-card.use-case';
import { ViewMatchStateUseCase } from '@game/application/use-cases/view-match-state.use-case';
import { GetOrCreatePlayerProfileUseCase } from '@game/application/use-cases/get-or-create-player-profile.use-case';
import { UpdateRatingUseCase } from '@game/application/use-cases/update-rating.use-case';
import { GetRankingUseCase } from '@game/application/use-cases/get-ranking.use-case';

import { PrismaMatchRepository } from '@game/infrastructure/persistence/prisma/prisma-match.repository';
import { PrismaPlayerProfileRepository } from '@game/infrastructure/persistence/prisma-player-profile.repository';
import { RoomManager } from '@game/gateway/multiplayer/room-manager';
import { MATCH_REPOSITORY, PLAYER_PROFILE_REPOSITORY } from './game.tokens';

@Module({
  providers: [
    GameGateway,
    RoomManager,
    // Repositories
    PrismaMatchRepository,
    PrismaPlayerProfileRepository,
    { provide: MATCH_REPOSITORY, useClass: PrismaMatchRepository },
    { provide: PLAYER_PROFILE_REPOSITORY, useClass: PrismaPlayerProfileRepository },
    // Use Cases
    {
      provide: CreateMatchUseCase,
      useFactory: (repo: PrismaMatchRepository) => new CreateMatchUseCase(repo),
      inject: [PrismaMatchRepository],
    },
    {
      provide: StartHandUseCase,
      useFactory: (repo: PrismaMatchRepository) => new StartHandUseCase(repo),
      inject: [PrismaMatchRepository],
    },
    {
      provide: PlayCardUseCase,
      useFactory: (repo: PrismaMatchRepository) => new PlayCardUseCase(repo),
      inject: [PrismaMatchRepository],
    },
    {
      provide: ViewMatchStateUseCase,
      useFactory: (repo: PrismaMatchRepository) => new ViewMatchStateUseCase(repo),
      inject: [PrismaMatchRepository],
    },
    {
      provide: GetOrCreatePlayerProfileUseCase,
      useFactory: (repo: PrismaPlayerProfileRepository) => new GetOrCreatePlayerProfileUseCase(repo),
      inject: [PrismaPlayerProfileRepository],
    },
    {
      provide: UpdateRatingUseCase,
      useFactory: (repo: PrismaPlayerProfileRepository) => new UpdateRatingUseCase(repo),
      inject: [PrismaPlayerProfileRepository],
    },
    {
      provide: GetRankingUseCase,
      useFactory: (repo: PrismaPlayerProfileRepository) => new GetRankingUseCase(repo),
      inject: [PrismaPlayerProfileRepository],
    },
  ],
})
export class GameModule {}