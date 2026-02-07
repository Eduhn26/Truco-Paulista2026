import type { Match } from '@game/domain/entities/match';
import type { MatchRepository } from '@game/application/ports/match.repository';

// In-memory adapter for MatchRepository (Phase 2). Replaced by a DB-backed implementation later.
export class InMemoryMatchRepository implements MatchRepository {
  private readonly store = new Map<string, Match>();
  private seq = 0;

  create(match: Match): Promise<string> {
    const id = this.nextId();
    this.store.set(id, match);
    return Promise.resolve(id);
  }

  getById(id: string): Promise<Match | null> {
    return Promise.resolve(this.store.get(id) ?? null);
  }

  save(id: string, match: Match): Promise<void> {
    if (!this.store.has(id)) {
      throw new Error(`Match not found for save(): ${id}`);
    }
    this.store.set(id, match);
    return Promise.resolve();
  }

  private nextId(): string {
    this.seq += 1;
    return `match_${this.seq}`;
  }
}
