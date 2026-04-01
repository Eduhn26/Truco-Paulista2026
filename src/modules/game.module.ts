import { Module } from '@nestjs/common';

import { CreateMatchUseCase } from '@game/application/use-cases/create-match.use-case';
import { GetMatchHistoryUseCase } from '@game/application/use-cases/get-match-history.use-case';
import { GetMatchReplayUseCase } from '@game/application/use-cases/get-match-replay.use-case';
import { GetOrCreatePlayerProfileUseCase } from '@game/application/use-cases/get-or-create-player-profile.use-case';
import { GetRankingUseCase } from '@game/application/use-cases/get-ranking.use-case';
import { PlayCardUseCase } from '@game/application/use-cases/play-card.use-case';
import { SaveMatchRecordUseCase } from '@game/application/use-cases/save-match-record.use-case';
import { StartHandUseCase } from '@game/application/use-cases/start-hand.use-case';
import { UpdateRatingUseCase } from '@game/application/use-cases/update-rating.use-case';
import { ViewMatchStateUseCase } from '@game/application/use-cases/view-match-state.use-case';
import { BOT_DECISION_PORT, type BotDecisionPort } from '@game/application/ports/bot-decision.port';
import type { MatchRecordRepository } from '@game/application/ports/match-record.repository';
import type { MatchRepository } from '@game/application/ports/match.repository';
import type { PlayerProfileRepository } from '@game/application/ports/player-profile.repository';
import { AuthModule } from '@game/auth/auth.module';
import { GameGateway } from '@game/gateway/game.gateway';
import { RoomManager } from '@game/gateway/multiplayer/room-manager';
import { HeuristicBotAdapter } from '@game/infrastructure/bots/heuristic-bot.adapter';
import {
  PYTHON_BOT_CONFIG,
  PythonBotConfigService,
  type PythonBotConfig,
} from '@game/infrastructure/bots/python-bot.config';
import { PrismaMatchRecordRepository } from '@game/infrastructure/persistence/prisma-match-record.repository';
import { PrismaPlayerProfileRepository } from '@game/infrastructure/persistence/prisma-player-profile.repository';
import { PrismaMatchRepository } from '@game/infrastructure/persistence/prisma/prisma-match.repository';
import { PrismaModule } from '@game/infrastructure/persistence/prisma/prisma.module';

import {
  MATCH_RECORD_REPOSITORY,
  MATCH_REPOSITORY,
  PLAYER_PROFILE_REPOSITORY,
} from './game.tokens';

const DEFAULT_BOT_DECISION_ADAPTER = HeuristicBotAdapter;

@Module({
  imports: [PrismaModule, AuthModule],
  providers: [
    GameGateway,
    RoomManager,
    PrismaMatchRepository,
    PrismaPlayerProfileRepository,
    PrismaMatchRecordRepository,
    HeuristicBotAdapter,
    PythonBotConfigService,
    {
      provide: PYTHON_BOT_CONFIG,
      useFactory: (configService: PythonBotConfigService): PythonBotConfig =>
        configService.getConfig(),
      inject: [PythonBotConfigService],
    },
    { provide: MATCH_REPOSITORY, useClass: PrismaMatchRepository },
    { provide: PLAYER_PROFILE_REPOSITORY, useClass: PrismaPlayerProfileRepository },
    { provide: MATCH_RECORD_REPOSITORY, useClass: PrismaMatchRecordRepository },
    {
      provide: BOT_DECISION_PORT,
      useFactory: (adapter: BotDecisionPort) => adapter,
      inject: [DEFAULT_BOT_DECISION_ADAPTER],
    },
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
    {
      provide: SaveMatchRecordUseCase,
      useFactory: (repo: MatchRecordRepository) => new SaveMatchRecordUseCase(repo),
      inject: [MATCH_RECORD_REPOSITORY],
    },
    {
      provide: GetMatchHistoryUseCase,
      useFactory: (repo: MatchRecordRepository) => new GetMatchHistoryUseCase(repo),
      inject: [MATCH_RECORD_REPOSITORY],
    },
    {
      provide: GetMatchReplayUseCase,
      useFactory: (repo: MatchRecordRepository) => new GetMatchReplayUseCase(repo),
      inject: [MATCH_RECORD_REPOSITORY],
    },
    {
      provide: GetOrCreatePlayerProfileUseCase,
      useFactory: (repo: PlayerProfileRepository) => new GetOrCreatePlayerProfileUseCase(repo),
      inject: [PLAYER_PROFILE_REPOSITORY],
    },
    {
      provide: UpdateRatingUseCase,
      useFactory: (repo: PlayerProfileRepository) => new UpdateRatingUseCase(repo),
      inject: [PLAYER_PROFILE_REPOSITORY],
    },
    {
      provide: GetRankingUseCase,
      useFactory: (repo: PlayerProfileRepository) => new GetRankingUseCase(repo),
      inject: [PLAYER_PROFILE_REPOSITORY],
    },
  ],
})
export class GameModule {}
