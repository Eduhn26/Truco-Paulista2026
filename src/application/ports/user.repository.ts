export type UserSnapshot = {
  id: string;
  provider: string;
  providerUserId: string;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
};

export type CreateUserInput = {
  provider: string;
  providerUserId: string;
  email?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
};

export interface UserRepository {
  findById(userId: string): Promise<UserSnapshot | null>;

  findByProviderIdentity(provider: string, providerUserId: string): Promise<UserSnapshot | null>;

  create(input: CreateUserInput): Promise<UserSnapshot>;
}
