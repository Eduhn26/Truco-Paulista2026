import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';

import { AuthController } from '@game/auth/auth.controller';
import { AuthService } from '@game/auth/auth.service';
import { DevAuthGuard } from '@game/auth/guards/dev-auth.guard';
import { GoogleAuthGuard } from '@game/auth/guards/google-auth.guard';
import { DevAuthStrategy } from '@game/auth/strategies/dev-auth.strategy';
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
    AuthService,
    DevAuthStrategy,
    GoogleAuthStrategy,
    DevAuthGuard,
    GoogleAuthGuard,
    {
      provide: GetOrCreateUserUseCase,
      useFactory: (userRepository: UserRepository) =>
        new GetOrCreateUserUseCase(userRepository),
      inject: [USER_REPOSITORY],
    },
  ],
  exports: [AuthService, PassportModule],
})
export class AuthModule {}