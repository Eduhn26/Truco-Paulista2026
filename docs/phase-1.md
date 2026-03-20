# Phase 1 — Pure Domain (DDD)

> **Status:** ✅ Complete
> **Branch:** `feat/phase-1-domain`

---

## Objective

Model the pure business rules of Truco Paulista using Domain-Driven Design, with zero dependency on any framework, database, or transport layer.

The goal was not to make something that runs. It was to make something that **thinks correctly** — a domain that enforces Truco rules as invariants, not as if-statements scattered across the codebase.

---

## What was delivered

### Value Objects

- **`Card`** — represents a single playing card. Validated on construction via `Card.from('3P')`. Encapsulates rank + suit. Throws `InvalidCardError` (a `DomainError`) for invalid input.
- **`Rank`** — union type `'4' | '5' | '6' | '7' | 'Q' | 'J' | 'K' | 'A' | '2' | '3'` with `assertRank()`, `nextRank()` and `rankStrength()` helpers.
- **`Suit`** — union type `'P' | 'C' | 'E' | 'O'` with `assertSuit()` guard.
- **`PlayerId`** — `'P1' | 'P2'`. Represents **teams**, not individual players. This decision proved critical for the 1v1→2v2 transition in Phase 5.
- **`Score`** — immutable value object. `Score.zero()`, `addPoint(player)`, `hasWinner(pointsToWin)`. Never mutated in place.
- **`MatchState`** — `'waiting' | 'in_progress' | 'finished'` type.
- **`RoundResult`** — `PlayerId | 'TIE'`.

### Domain Service

- **`TrucoRules`** (`truco-rules.ts`) — pure functions with no side effects:
  - `manilhaRankFromVira(vira)` — calculates the manilha rank from the vira card
  - `compareCards(a, b, vira)` — returns `'A' | 'B' | 'TIE'`, applying manilha and suit strength rules
  - Manilha suit strength order: Paus (3) > Copas (2) > Espadas (1) > Ouros (0)

### Entities

- **`Round`** — a single confrontation between P1 and P2. Holds plays as `Map<PlayerId, Card>`. Enforces: no double-play, no play after finished, result only available when finished.
- **`Hand`** — up to 3 rounds. Manages round progression. Evaluates winner by best-of-3 logic (with tie-breaking rules for Truco Paulista).
- **`Match`** (Aggregate Root) — owns the lifecycle: `waiting → in_progress → finished`. Delegates card play to `Hand`. Accumulates score. Detects match winner via `Score.hasWinner(pointsToWin)`.

### Exceptions

- **`DomainError`** — abstract base class for all domain rule violations. Extends `Error`.
- **`InvalidMoveError`** — thrown when a play violates a domain invariant (playing on a finished round, wrong turn order at domain level, etc.).

---

## Architectural decisions

### D1 — Zero external dependencies in the Domain

The entire domain has no `import` from NestJS, Prisma, Socket.IO, or any infrastructure concern.

**Result:** domain rules are testable with Jest alone — no server, no database, no mocks.

### D2 — PlayerId represents teams, not players

`PlayerId = 'P1' | 'P2'` was a deliberate choice to model Truco's team structure at the domain level, without hardcoding the number of players per team.

**Result:** the 1v1→2v2 transition in Phase 5 required zero changes to the Domain. The Gateway handled the `SeatId → PlayerId` mapping.

### D3 — Score is immutable

`Score.addPoint()` returns a new `Score` instance. Mutation is not possible from outside the entity.

**Result:** score state is always consistent and easy to test.

### D4 — Domain throws, never returns null for violations

When a rule is violated, the Domain throws a `DomainError`. It never returns `null` or a status object.

**Result:** callers (Use Cases, Gateway) can rely on exceptions to distinguish rule violations from infrastructure failures.

### D5 — TrucoRules is a pure domain service, not a static utility

`compareCards` and `manilhaRankFromVira` are exported pure functions — no class needed, no state, no side effects.

**Result:** testable in isolation without instantiating any entity.

---

## Files added

```
src/
├── domain/
│   ├── entities/
│   │   ├── hand.ts
│   │   ├── match.ts
│   │   └── round.ts
│   ├── exceptions/
│   │   ├── domain-error.ts
│   │   └── invalid-move-error.ts
│   ├── services/
│   │   └── truco-rules.ts
│   └── value-objects/
│       ├── card.ts
│       ├── match-state.ts
│       ├── player-id.ts
│       ├── rank.ts
│       ├── round-result.ts
│       ├── score.ts
│       └── suit.ts
test/
└── unit/
    └── domain/
        ├── hand.spec.ts
        ├── match.spec.ts
        └── truco-rules.spec.ts
```

---

## Technical debt

None introduced in this phase.

The domain was built without snapshots — those were added as a justified extension in Phase 5 (`toSnapshot/fromSnapshot`) to support robust persistence without breaking encapsulation.

---

## Success criteria — final assessment

| Criterion | Status |
|-----------|--------|
| Zero external dependencies in Domain | ✅ |
| `Card`, `Rank`, `Suit`, `PlayerId`, `Score`, `MatchState`, `RoundResult` modeled | ✅ |
| `Round`, `Hand`, `Match` entities with invariants | ✅ |
| `TrucoRules` domain service with manilha + card comparison | ✅ |
| `DomainError` and `InvalidMoveError` exceptions | ✅ |
| All domain tests passing with Jest (no server, no DB) | ✅ |
| `build` + `lint` + `test` passing | ✅ |