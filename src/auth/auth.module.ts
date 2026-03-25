import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';

import { AuthController } from '@game/auth/auth.controller';
import { AuthService } from '@game/auth/auth.service';
import { AuthTokenService } from '@game/auth/auth-token.service';
import { DevAuthGuard } from '@game/auth/guards/dev-auth.guard';
import { GitHubAuthGuard } from '@game/auth/guards/github-auth.guard';
import { GoogleAuthGuard } from '@game/auth/guards/google-auth.guard';
import { DevAuthStrategy } from '@game/auth/strategies/dev-auth.strategy';
import { GitHubAuthStrategy } from '@game/auth/strategies/github-auth.strategy';
import { GoogleAuthStrategy } from '@game/auth/strategies/google-auth.strategy';
import type { UserRepository } from '@game/application/ports/user.repository';
import { GetOrCreateUserUseCase } from '@game/application/use-cases/get-or-create-user.use-case';
import { PrismaUserRepository } from '@game/infrastructure/persistence/prisma-user.repository';
import { PrismaModule } from '@game/infrastructure/persistence/prisma/prisma.module';

export const USER_REPOSITORY = Symbol('USER_REPOSITORY');

@Module({
  imports: [
    PrismaModule,
    PassportModule.register({
      session: false,
    }),
  ],
  controllers: [AuthController],
  providers: [
    PrismaUserRepository,
    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
    AuthTokenService,
    AuthService,
    DevAuthStrategy,
    GoogleAuthStrategy,
    GitHubAuthStrategy,
    DevAuthGuard,
    GoogleAuthGuard,
    GitHubAuthGuard,
    {
      provide: GetOrCreateUserUseCase,
      useFactory: (userRepository: UserRepository) =>
        new GetOrCreateUserUseCase(userRepository),
      inject: [USER_REPOSITORY],
    },
  ],
  exports: [AuthService, AuthTokenService, PassportModule, GetOrCreateUserUseCase],
})
export class AuthModule {}