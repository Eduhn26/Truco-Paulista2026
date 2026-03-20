# Phase 4 — Real Persistence (PostgreSQL + Prisma)

> **Status:** ✅ Complete
> **Branch:** `feat/phase-4-persistence`

---

## Objective

Replace the in-memory repository with a real PostgreSQL-backed implementation, without touching the Domain or Application layers.

The goal was to prove the architecture works: changing the persistence technology should be entirely contained in Infrastructure. If a Domain or Application file had to change, the design would be wrong.

---

## What was delivered

### Prisma schema

```prisma
model MatchSnapshot {
  id          String   @id @default(cuid())
  matchId     String   @unique
  pointsToWin Int
  state       String
  score       Json
  data        Json
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

The `data` field holds the full `Match` aggregate snapshot as JSON — including the current hand and all rounds.

### `PrismaService`

NestJS injectable service that wraps `PrismaClient`. Handles connection retry on startup (critical for Docker environments where Postgres may not be ready immediately). Provides an explicit `checkConnection()` method used by the readiness probe.

### `PrismaMatchRepository`

Implements `MatchRepository` port from the Application layer.

- **`create(match)`** — serializes via `match.toSnapshot()`, writes to `MatchSnapshot` table, returns generated `matchId`
- **`getById(id)`** — reads from DB, deserializes via `Match.fromSnapshot()` — no fragile casts, no `Object.create()` hacks
- **`save(id, match)`** — upserts the snapshot using Prisma's `update`

Reidratation relies on the public snapshot API added to the Domain in Phase 5 (`toSnapshot/fromSnapshot`). In Phase 4 the initial implementation used direct field access that was later identified as technical debt and resolved.

### `PrismaModule`

Global NestJS module that provides `PrismaService` to the entire application without re-importing per module.

### Database migration

```
prisma/migrations/
└── 20260215135546_init_match_snapshot/
    └── migration.sql
```

Creates the `MatchSnapshot` table.

### `docker-compose.yml`

```yaml
services:
  postgres:
    image: postgres:16-alpine
    container_name: truco-postgres
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: postgres
    ports:
      - "51214:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d postgres"]
      interval: 3s
      timeout: 3s
      retries: 20
      start_period: 15s
```

### npm scripts added

```json
"db:up":         "docker compose up -d",
"db:down":       "docker compose down",
"db:reset":      "docker compose down -v && docker compose up -d",
"prisma:status": "prisma migrate status",
"prisma:deploy": "prisma migrate deploy",
"prisma:dev":    "prisma migrate dev",
"prisma:generate": "prisma generate"
```

---

## Architectural decisions

### D1 — Infrastructure implements the port; the Application never changes

`PrismaMatchRepository` implements `MatchRepository`. The `GameModule` swaps the token from `InMemoryMatchRepository` to `PrismaMatchRepository`. Zero changes in Use Cases or Domain.

**Result:** the Ports & Adapters pattern proved itself — the entire persistence technology change was a 1-file swap in DI wiring.

### D2 — Aggregate serialized as JSON snapshot

The full `Match` state (including nested `Hand` and `Round`) is serialized to JSON and stored in a single `data` column. This avoids relational mapping of a rich domain model.

**Result:** the schema stays simple. Relational normalization of game state would add complexity without benefit for this use case.

### D3 — Deserialization through public Domain API only

`Match.fromSnapshot()` is the only entry point for rehydrating a match. Infrastructure never accesses private fields or uses `Object.create()` tricks.

**Result:** encapsulation is preserved. The Domain controls its own reconstruction.

> **Note:** The initial Phase 4 implementation used fragile casts that were identified as DT-1, DT-2, DT-3 and resolved in Phase 5 by adding the `toSnapshot/fromSnapshot` public API to `Match`, `Hand` and `Round`.

### D4 — PrismaService retries on startup

On first connection, `PrismaService` retries with a delay before failing. This handles the race condition in Docker where Postgres may not be ready when the backend starts.

**Result:** the local runtime becomes stable without requiring manual `wait-for-it` scripts.

### D5 — `InMemoryMatchRepository` is kept as a test artifact

The in-memory implementation is retained in `infrastructure/persistence/in-memory/` and continues to be used in unit tests. It is no longer the production implementation.

**Result:** unit tests remain fast and database-free.

---

## Files added / modified

```
src/
├── infrastructure/
│   └── persistence/
│       ├── in-memory/
│       │   └── in-memory-match.repository.ts   ← retained for tests
│       └── prisma/
│           ├── prisma-match.repository.ts       ← new
│           ├── prisma.module.ts                 ← new
│           └── prisma.service.ts                ← new
├── modules/
│   └── game.module.ts                           ← updated: swap to Prisma adapter
prisma/
├── schema.prisma                                ← new
└── migrations/
    └── 20260215135546_init_match_snapshot/
        └── migration.sql                        ← new
docker-compose.yml                               ← new
.env.example                                     ← updated: DATABASE_URL added
```

---

## Technical debt

| ID | Description | Resolution |
|----|-------------|------------|
| DT-1 | Fragile casts in `PrismaMatchRepository` (`as unknown as`) | ✅ Resolved in Phase 5 via `toSnapshot/fromSnapshot` |
| DT-2 | Schema drift between `MatchSnapshot` and migration history | ✅ Resolved in Phase 5 via alignment migration |
| DT-3 | `Hand` serialization requiring access to private internals | ✅ Resolved in Phase 5 via `Hand.toSnapshot()` |

---

## Success criteria — final assessment

| Criterion | Status |
|-----------|--------|
| `PrismaMatchRepository` implements `MatchRepository` port | ✅ |
| Use Cases unchanged | ✅ |
| Domain unchanged | ✅ |
| `MatchSnapshot` table created via Prisma migration | ✅ |
| `PrismaService` with startup retry | ✅ |
| `docker-compose.yml` with Postgres 16 + healthcheck | ✅ |
| `InMemoryMatchRepository` retained for unit tests | ✅ |
| `build` + `lint` + `test` passing | ✅ |