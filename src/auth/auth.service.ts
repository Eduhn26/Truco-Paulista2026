import { Injectable } from '@nestjs/common';

import {
  GetOrCreateUserUseCase,
  type GetOrCreateUserRequestDto,
  type GetOrCreateUserResponseDto,
} from '@game/application/use-cases/get-or-create-user.use-case';

@Injectable()
export class AuthService {
  constructor(private readonly getOrCreateUserUseCase: GetOrCreateUserUseCase) {}

  async bootstrapUser(
    request: GetOrCreateUserRequestDto,
  ): Promise<GetOrCreateUserResponseDto> {
    return this.getOrCreateUserUseCase.execute(request);
  }
}