export type PlayerProfileSnapshot = {
  id: string;
  userId: string;
  rating: number;
  wins: number;
  losses: number;
  matchesPlayed: number;
};

export interface PlayerProfileRepository {
  findByUserId(userId: string): Promise<PlayerProfileSnapshot | null>;
  createForUser(userId: string): Promise<PlayerProfileSnapshot>;
  save(profile: PlayerProfileSnapshot): Promise<void>;
  listTop(limit: number): Promise<PlayerProfileSnapshot[]>;
}
