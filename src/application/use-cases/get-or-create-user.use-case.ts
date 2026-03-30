import type {
  CreateUserInput,
  UserRepository,
  UserSnapshot,
} from '@game/application/ports/user.repository';

export type GetOrCreateUserRequestDto = {
  provider: string;
  providerUserId: string;
  email?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
};

export type GetOrCreateUserResponseDto = {
  user: UserSnapshot;
  created: boolean;
};

export class GetOrCreateUserUseCase {
  constructor(private readonly userRepository: UserRepository) {}

  async execute(request: GetOrCreateUserRequestDto): Promise<GetOrCreateUserResponseDto> {
    const input = this.normalizeInput(request);

    const existingUser = await this.userRepository.findByProviderIdentity(
      input.provider,
      input.providerUserId,
    );

    if (existingUser) {
      return {
        user: existingUser,
        created: false,
      };
    }

    const createdUser = await this.userRepository.create(input);

    return {
      user: createdUser,
      created: true,
    };
  }

  private normalizeInput(request: GetOrCreateUserRequestDto): CreateUserInput {
    const provider = this.requireNonEmptyString(request.provider, 'provider').toLowerCase();
    const providerUserId = this.requireNonEmptyString(request.providerUserId, 'providerUserId');

    return {
      provider,
      providerUserId,
      email: this.normalizeOptionalString(request.email),
      displayName: this.normalizeOptionalString(request.displayName),
      avatarUrl: this.normalizeOptionalString(request.avatarUrl),
    };
  }

  private requireNonEmptyString(value: string, fieldName: string): string {
    if (typeof value !== 'string') {
      throw new Error(`${fieldName} is required`);
    }

    const normalizedValue = value.trim();

    if (!normalizedValue) {
      throw new Error(`${fieldName} is required`);
    }

    return normalizedValue;
  }

  private normalizeOptionalString(value?: string | null): string | null {
    if (value === undefined || value === null) {
      return null;
    }

    if (typeof value !== 'string') {
      throw new Error('Optional string fields must be strings when provided');
    }

    const normalizedValue = value.trim();

    return normalizedValue ? normalizedValue : null;
  }
}
