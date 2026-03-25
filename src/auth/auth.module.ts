import { Module } from '@nestjs/common';

import { AuthController } from '@game/auth/auth.controller';
import { AuthService } from '@game/auth/auth.service';
import { PrismaModule } from '@game/infrastructure/persistence/prisma/prisma.module';
import { PrismaUserRepository } from '@game/infrastructure/persistence/prisma-user.repository';
import type { UserRepository } from '@game/application/ports/user.repository';
import { GetOrCreateUserUseCase } from '@game/application/use-cases/get-or-create-user.use-case';

export const USER_REPOSITORY = Symbol('USER_REPOSITORY');

@Module({
  imports: [PrismaModule],
  controllers: [AuthController],
  providers: [
    PrismaUserRepository,
    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
    AuthService,
    {
      provide: GetOrCreateUserUseCase,
      useFactory: (userRepository: UserRepository) =>
        new GetOrCreateUserUseCase(userRepository),
      inject: [USER_REPOSITORY],
    },
  ],
  exports: [AuthService],
})
export class AuthModule {}