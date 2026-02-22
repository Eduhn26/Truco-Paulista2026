export type PlayerProfileSnapshot = {
  id: string;
  playerToken: string;
  rating: number;
  wins: number;
  losses: number;
  matchesPlayed: number;
  createdAt: Date;
  updatedAt: Date;
};

export interface PlayerProfileRepository {
  findByToken(playerToken: string): Promise<PlayerProfileSnapshot | null>;
  create(playerToken: string): Promise<PlayerProfileSnapshot>;
  save(profile: PlayerProfileSnapshot): Promise<void>;
}