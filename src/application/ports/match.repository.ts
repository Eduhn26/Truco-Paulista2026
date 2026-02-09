import type { Match } from '@game/domain/entities/match';

// Application port for match persistence (Infrastructure provides the implementation).
export interface MatchRepository {
  create(match: Match): Promise<string>;
  getById(id: string): Promise<Match | null>;
  save(id: string, match: Match): Promise<void>;
}
