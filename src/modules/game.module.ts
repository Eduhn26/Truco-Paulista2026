import { Module, Logger } from '@nestjs/common';

import { BOT_DECISION_PORT, type BotDecisionPort } from '@game/application/ports/bot-decision.port';
import type { MatchRecordRepository } from '@game/application/ports/match-record.repository';
import type { MatchRepository } from '@game/application/ports/match.repository';
import type { PlayerProfileRepository } from '@game/application/ports/player-profile.repository';
import type { UserRepository } from '@game/application/ports/user.repository';
import { AcceptBetUseCase } from '@game/application/use-cases/accept-bet.use-case';
import { CreateMatchUseCase } from '@game/application/use-cases/create-match.use-case';
import { DeclineBetUseCase } from '@game/application/use-cases/decline-bet.use-case';
import { GetMatchHistoryUseCase } from '@game/application/use-cases/get-match-history.use-case';
import { GetMatchReplayUseCase } from '@game/application/use-cases/get-match-replay.use-case';
import { GetOrCreatePlayerProfileUseCase } from '@game/application/use-cases/get-or-create-player-profile.use-case';
import { GetOrCreateUserUseCase } from '@game/application/use-cases/get-or-create-user.use-case';
import { GetRankingUseCase } from '@game/application/use-cases/get-ranking.use-case';
import { PlayCardUseCase } from '@game/application/use-cases/play-card.use-case';
import { RaiseToNineUseCase } from '@game/application/use-cases/raise-to-nine.use-case';
import { RaiseToSixUseCase } from '@game/application/use-cases/raise-to-six.use-case';
import { RaiseToTwelveUseCase } from '@game/application/use-cases/raise-to-twelve.use-case';
import { RequestTrucoUseCase } from '@game/application/use-cases/request-truco.use-case';
import { SaveMatchRecordUseCase } from '@game/application/use-cases/save-match-record.use-case';
import { StartHandUseCase } from '@game/application/use-cases/start-hand.use-case';
import { UpdateRatingUseCase } from '@game/application/use-cases/update-rating.use-case';
import { ViewMatchStateUseCase } from '@game/application/use-cases/view-match-state.use-case';
import { AuthModule } from '@game/auth/auth.module';
import { GameGateway } from '@game/gateway/game.gateway';
import { GatewayMatchmakingService } from '@game/gateway/matchmaking/gateway-matchmaking.service';
import { MatchmakingPairingPolicy } from '@game/gateway/matchmaking/matchmaking-pairing-policy';
import { MatchmakingQueueManager } from '@game/gateway/matchmaking/matchmaking-queue-manager';
import { RoomManager } from '@game/gateway/multiplayer/room-manager';
import { HeuristicBotAdapter } from '@game/infrastructure/bots/heuristic-bot.adapter';
import { PythonBotAdapter } from '@game/infrastructure/bots/python-bot.adapter';
import {
  PYTHON_BOT_CONFIG,
  PythonBotConfigService,
  type PythonBotConfig,
} from '@game/infrastructure/bots/python-bot.config';
import { PrismaMatchRecordRepository } from '@game/infrastructure/persistence/prisma-match-record.repository';
import { PrismaPlayerProfileRepository } from '@game/infrastructure/persistence/prisma-player-profile.repository';
import { PrismaUserRepository } from '@game/infrastructure/persistence/prisma-user.repository';
import { PrismaMatchRepository } from '@game/infrastructure/persistence/prisma/prisma-match.repository';
import { PrismaModule } from '@game/infrastructure/persistence/prisma/prisma.module';

import {
  MATCH_RECORD_REPOSITORY,
  MATCH_REPOSITORY,
  PLAYER_PROFILE_REPOSITORY,
} from './game.tokens';

const gameModuleLogger = new Logger('GameModule');

@Module({
  imports: [PrismaModule, AuthModule],
  providers: [
    GameGateway,
    RoomManager,
    MatchmakingQueueManager,
    MatchmakingPairingPolicy,
    GatewayMatchmakingService,
    PrismaMatchRepository,
    PrismaPlayerProfileRepository,
    PrismaMatchRecordRepository,
    PrismaUserRepository,
    HeuristicBotAdapter,
    PythonBotAdapter,
    PythonBotConfigService,
    {
      provide: PYTHON_BOT_CONFIG,
      useFactory: (configService: PythonBotConfigService): PythonBotConfig =>
        configService.getConfig(),
      inject: [PythonBotConfigService],
    },
    { provide: MATCH_REPOSITORY, useClass: PrismaMatchRepository },
    {
      provide: PLAYER_PROFILE_REPOSITORY,
      useClass: PrismaPlayerProfileRepository,
    },
    { provide: MATCH_RECORD_REPOSITORY, useClass: PrismaMatchRecordRepository },
    {
      provide: BOT_DECISION_PORT,
      useFactory: (
        config: PythonBotConfig,
        heuristicBotAdapter: HeuristicBotAdapter,
        pythonBotAdapter: PythonBotAdapter,
      ): BotDecisionPort => {
        const selectedAdapter = config.enabled ? 'python' : 'heuristic';

        // NOTE: Keep adapter selection observable at module wiring time so runtime
        // diagnosis can prove which boundary implementation was actually injected.
        gameModuleLogger.log(
          JSON.stringify({
            timestamp: new Date().toISOString(),
            layer: 'infrastructure',
            component: 'game_module',
            event: 'bot_adapter_selected',
            status: 'selected',
            selectedAdapter,
            pythonBotEnabled: config.enabled,
          }),
        );

        if (config.enabled) {
          return pythonBotAdapter;
        }

        return heuristicBotAdapter;
      },
      inject: [PYTHON_BOT_CONFIG, HeuristicBotAdapter, PythonBotAdapter],
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
      provide: RequestTrucoUseCase,
      useFactory: (repo: MatchRepository) => new RequestTrucoUseCase(repo),
      inject: [MATCH_REPOSITORY],
    },
    {
      provide: AcceptBetUseCase,
      useFactory: (repo: MatchRepository) => new AcceptBetUseCase(repo),
      inject: [MATCH_REPOSITORY],
    },
    {
      provide: DeclineBetUseCase,
      useFactory: (repo: MatchRepository) => new DeclineBetUseCase(repo),
      inject: [MATCH_REPOSITORY],
    },
    {
      provide: RaiseToSixUseCase,
      useFactory: (repo: MatchRepository) => new RaiseToSixUseCase(repo),
      inject: [MATCH_REPOSITORY],
    },
    {
      provide: RaiseToNineUseCase,
      useFactory: (repo: MatchRepository) => new RaiseToNineUseCase(repo),
      inject: [MATCH_REPOSITORY],
    },
    {
      provide: RaiseToTwelveUseCase,
      useFactory: (repo: MatchRepository) => new RaiseToTwelveUseCase(repo),
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
    {
      provide: GetOrCreateUserUseCase,
      useFactory: (repo: UserRepository) => new GetOrCreateUserUseCase(repo),
      inject: [PrismaUserRepository],
    },
  ],
})
export class GameModule {}
