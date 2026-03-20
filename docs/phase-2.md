# Phase 2 — Application Layer (Use Cases, DTOs, Ports)

> **Status:** ✅ Complete
> **Branch:** `feat/phase-2-application`

---

## Objective

Build the Application Layer that orchestrates the Domain without knowing about infrastructure or transport.

The goal was not to connect to a database or expose HTTP endpoints. It was to define the **contracts** — what the system can do, what it needs to do it, and what it returns — so that infrastructure and transport can be swapped freely without touching the game logic.

---

## What was delivered

### DTOs (Data Transfer Objects)

Contracts between the Application boundary and the outside world. Never entities.

**Requests:**
- `CreateMatchRequestDto` — `{ pointsToWin?: number }`
- `StartHandRequestDto` — `{ matchId: string; viraRank: string }`
- `PlayCardRequestDto` — `{ matchId: string; playerId: string; card: string }`
- `ViewMatchStateRequestDto` — `{ matchId: string }`

**Responses:**
- `CreateMatchResponseDto` — `{ matchId: string }`
- `StartHandResponseDto` — `{ matchId: string }`
- `PlayCardResponseDto` — `{ matchId: string; state: MatchState; score: { playerOne, playerTwo } }`
- `ViewMatchStateResponseDto` — `{ matchId: string; state: MatchState; score: { playerOne, playerTwo } }`

### Ports (Interfaces)

Contracts that Infrastructure must implement. Use Cases depend on these — never on concrete classes.

- **`MatchRepository`** — `create(match)`, `getById(id)`, `save(id, match)`
- **`PlayerProfileRepository`** *(added in Phase 5, defined here for context)* — `findByToken`, `create`, `save`, `listTop`

### Use Cases

Each Use Case receives a DTO, uses the Domain, and returns a DTO. Never returns entities.

- **`CreateMatchUseCase`** — instantiates a `Match`, persists via `MatchRepository`, returns `matchId`. Normalizes `pointsToWin` (defaults to 12, validates integer > 0).
- **`StartHandUseCase`** — loads match by id, calls `match.start(viraRank)`, persists updated state, returns `matchId`.
- **`PlayCardUseCase`** — loads match, normalizes `PlayerId`, calls `match.play(playerId, Card.from(card))`, persists, returns match state + score.
- **`ViewMatchStateUseCase`** — loads match, maps to DTO via mapper. Read-only — does not mutate state.

### Mapper

- **`mapMatchToViewMatchState(matchId, match)`** — translates `Match` entity to `ViewMatchStateResponseDto`. Centralizes the entity→DTO conversion so it's never duplicated.

---

## Architectural decisions

### D1 — Use Cases receive and return DTOs, never entities

The Domain entity `Match` never crosses the Application boundary. Callers receive a plain data object.

**Result:** the transport layer (Gateway, HTTP) never has access to domain methods — it cannot accidentally mutate state.

### D2 — Ports live in Application, implementations in Infrastructure

`MatchRepository` is an interface in `application/ports/`. The Use Case constructor receives it — it doesn't know or care whether it's backed by Postgres, in-memory, or anything else.

**Result:** Use Cases are testable with a fake repository. No database needed in unit tests.

### D3 — Input normalization happens in Use Cases, not in the Domain

`CreateMatchUseCase.normalizePointsToWin()` validates and defaults the `pointsToWin` field. The Domain's `Match` constructor receives a clean, validated integer.

**Result:** Domain invariants stay focused on game rules. Input noise is filtered at the Application boundary.

### D4 — Mapper is a standalone pure function

`mapMatchToViewMatchState` is not a class method — it's a module-level pure function. No state, no dependencies.

**Result:** trivially testable, easy to find, impossible to misuse.

---

## Files added

```
src/
├── application/
│   ├── dtos/
│   │   ├── requests/
│   │   │   ├── create-match.request.dto.ts
│   │   │   ├── play-card.request.dto.ts
│   │   │   ├── start-hand.request.dto.ts
│   │   │   └── view-match-state.request.dto.ts
│   │   └── responses/
│   │       ├── create-match.response.dto.ts
│   │       ├── play-card.response.dto.ts
│   │       ├── start-hand.response.dto.ts
│   │       └── view-match-state.response.dto.ts
│   ├── mappers/
│   │   └── match-to-view-match-state.mapper.ts
│   ├── ports/
│   │   └── match.repository.ts
│   └── use-cases/
│       ├── create-match.use-case.ts
│       ├── play-card.use-case.ts
│       ├── start-hand.use-case.ts
│       └── view-match-state.use-case.ts
test/
└── unit/
    └── application/
        ├── create-match.use-case.spec.ts
        ├── play-card.use-case.spec.ts
        ├── start-hand.use-case.spec.ts
        └── view-match-state.use-case.spec.ts
```

---

## Technical debt

None introduced in this phase.

`PlayerProfileRepository` and its related Use Cases (`GetOrCreatePlayerProfile`, `UpdateRating`, `GetRanking`) were added in Phase 5 following the same patterns established here — the Application Layer design proved extensible without modification.

---

## Success criteria — final assessment

| Criterion | Status |
|-----------|--------|
| All Use Cases receive and return DTOs only | ✅ |
| `MatchRepository` port defined in Application | ✅ |
| Use Cases depend on interface, never on concrete class | ✅ |
| Input normalization in Use Cases (not Domain) | ✅ |
| `mapMatchToViewMatchState` mapper as pure function | ✅ |
| Unit tests with fake repositories (no DB, no server) | ✅ |
| Domain layer not modified | ✅ |
| `build` + `lint` + `test` passing | ✅ |