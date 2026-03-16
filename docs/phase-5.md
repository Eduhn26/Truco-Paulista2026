# Phase 5 — Real 2v2 Multiplayer + Multiplayer Base Stabilization

> **Status:** ✅ Complete (core scope)
> **Branch:** `feat/fase-5-multiplayer-ranking`

---

## Objective

Transform the multiplayer base from a functional 1v1 hack into a real structure for 2v2 matches, without violating the architecture defined in Phases 0–4.

The goal was not just "put four players in a room." It was to **consolidate the entire multiplayer base**, ensuring:

- The Domain remains untouched (except a justified serialization extension)
- The Gateway owns only ephemeral room/presence/turn state
- Persistence remains responsible only for durable state
- The evolution to 2v2 did not break the Phase 1 design

---

## What was delivered

### Real 2v2 multiplayer

- 4 real seats per room: `T1A`, `T2A`, `T1B`, `T2B`
- `canStart()` requires 4 players ready
- Full turn order: `T1A → T2A → T1B → T2B`
- Token-based reconnection preserving seat
- 5th player rejected
- Gateway aligned with `RoomManager`
- Debug frontend coherent with 4 players

### Ranking as a separate Bounded Context

- `PlayerProfile` persisted in Postgres: `rating`, `wins`, `losses`, `matchesPlayed`
- Simplified ELO: +25 win, -25 loss, floor 100
- `ratingApplied` flag prevents duplicate updates on reconnection
- Use Cases: `GetOrCreatePlayerProfile`, `UpdateRating`, `GetRanking`
- Port: `PlayerProfileRepository`

### Robust Match aggregate persistence

- `Match.toSnapshot()` / `Match.fromSnapshot()`
- `Hand.toSnapshot()` / `Hand.fromSnapshot()`
- `Round.toSnapshot()` / `Round.fromSnapshot()`
- `PrismaMatchRepository` with no fragile casts or access to Domain private internals

### Test coverage

- `RoomManager`: join, leave, reconnect, setReady, canStart, advanceTurn, turnOrder
- `GetOrCreatePlayerProfileUseCase`
- `UpdateRatingUseCase`
- `GetRankingUseCase`

### Stabilized local runtime

- Coherent Docker context
- `docker-compose.yml` with Postgres healthcheck
- `PrismaService` with connection retry
- Migrations applied, schema aligned

---

## Architectural decisions

### D1 — `PlayerId` in the Domain remains `'P1' | 'P2'`

`PlayerId` represents **teams**, not individual players. The Domain does not know how many players are on each team.

The Gateway handles the `SeatId → PlayerId` mapping:
- `T1A`, `T1B` → `'P1'`
- `T2A`, `T2B` → `'P2'`

**Result:** Domain untouched for the 1v1 → 2v2 transition. ✅

### D2 — `SeatId` and `TeamId` live in the Gateway

```ts
type SeatId  = 'T1A' | 'T1B' | 'T2A' | 'T2B'
type TeamId  = 'T1'  | 'T2'
```

These are not Domain Value Objects. They are transport-level types — they exist only in the communication layer.

### D3 — Turn order in the Gateway is an acceptable transitional adaptation

`RoomManager` controls turn order in memory. This is a pragmatic concession: the Domain does not need to know about seats, and the Application does not need to orchestrate turns yet.

In a more mature system, the Application would orchestrate this. For Phase 5, this is documented as an accepted limitation.

### D4 — Ranking is a separate Bounded Context

`Match` never updates `PlayerProfile` directly. The flow is:

1. Match ends → Gateway detects via Domain state
2. Gateway calls `UpdateRatingUseCase`
3. Use Case updates `PlayerProfile` via port
4. Gateway emits `rating-updated` to clients

### D5 — `toSnapshot/fromSnapshot` is a serialization extension, not a business rule change

The only change to the Domain was adding explicit serialization capability. This is justified because:

- It removes the dependency on fragile casts in the Infrastructure
- Infrastructure no longer needs to know Domain internals
- The change does not alter any invariant or game rule

---

## Files added / modified

```
src/
├── domain/
│   ├── entities/
│   │   ├── match.ts              ← toSnapshot / fromSnapshot
│   │   ├── hand.ts               ← toSnapshot / fromSnapshot
│   │   └── round.ts              ← toSnapshot / fromSnapshot
├── application/
│   ├── ports/
│   │   └── player-profile.repository.ts        ← new
│   └── use-cases/
│       ├── get-or-create-player-profile.use-case.ts  ← new
│       ├── update-rating.use-case.ts                  ← new
│       └── get-ranking.use-case.ts                    ← new
├── gateway/
│   ├── game.gateway.ts           ← updated (getState, 2v2 handlers)
│   └── multiplayer/
│       ├── room-manager.ts       ← expanded to 4 seats
│       └── seat-id.ts            ← new (SeatId, TeamId, teamFromSeat)
├── infrastructure/
│   └── persistence/
│       ├── prisma/
│       │   └── prisma-match.repository.ts       ← refactored (no casts)
│       └── prisma-player-profile.repository.ts  ← new
frontend/
├── index.html                    ← 4 seats visible
├── styles.css
└── app.js                        ← SEATS expanded, 4 players
prisma/
├── schema.prisma                 ← PlayerProfile added
└── migrations/
    ├── 20260215135546_init_match_snapshot/
    └── 20260221171933_add_player_profile/
test/
└── unit/
    ├── gateway/
    │   └── room-manager.spec.ts                          ← new
    └── application/
        ├── get-or-create-player-profile.use-case.spec.ts ← new
        ├── update-rating.use-case.spec.ts                ← new
        └── get-ranking.use-case.spec.ts                  ← new
```

---

## Technical debt

### Closed this phase

| ID | Description |
|---|---|
| DT-1 | Fragile casts in `PrismaMatchRepository` — resolved via `toSnapshot/fromSnapshot` |
| DT-2 | Prisma schema diverging from migration — resolved with alignment migration |
| DT-3 | `Hand.finished` inaccessible externally — resolved via snapshot |

### Still open

| ID | Description | Impact |
|---|---|---|
| DT-4 | Turn order in Gateway as transitional rule | Low for now; revisit in Phase 6+ |

---

## Extended backlog

| ID | Item | Priority |
|---|---|---|
| 5.F | Match history (`MatchRecord` + paginated use case) | Medium |
| 5.G | `ws-client.ts` for 4 simultaneous players | Medium |
| 5.H | Basic rating-based matchmaking | Low (Phase 9) |

---

## Success criteria — final assessment

| Criterion | Status |
|---|---|
| 4 players connected and identified | ✅ |
| Teams formed correctly | ✅ |
| Full 2v2 match playable via WebSocket | ✅ |
| Ranking persisted and queryable | ✅ |
| Domain untouched (or justified extension) | ✅ |
| `build` + `lint` + `test` passing | ✅ |
| Semantic commits per micro-step | ✅ |

---

## Next phase

**Phase 6 — Observability**

- Structured logger (NestJS Logger or Pino)
- Basic metrics (matches, connections, latency)
- Healthcheck (`@nestjs/terminus`)
- Correlation ID per request/event

See `docs/phases/phase-6.md` when started.