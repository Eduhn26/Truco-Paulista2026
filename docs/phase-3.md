# Phase 3 — WebSocket Transport (Socket.IO + Gateway)

> **Status:** ✅ Complete
> **Branch:** `feat/phase-3-gateway`

---

## Objective

Expose the game over WebSocket using Socket.IO via a NestJS Gateway, and introduce the ephemeral room/presence layer without touching the Domain or Application.

The goal was not just to "make WebSocket work." It was to build a transport layer that is **authoritative** — the server controls state, the client only sends intentions.

---

## What was delivered

### NestJS Gateway (`game.gateway.ts`)

WebSocket event handlers wired to Application Use Cases:

| Event (client → server) | Handler | Description |
|-------------------------|---------|-------------|
| `create-match` | `handleCreateMatch` | Creates a new match room |
| `join-match` | `handleJoinMatch` | Joins an existing room |
| `set-ready` | `handleSetReady` | Player signals ready |
| `start-hand` | `handleStartHand` | Starts a hand in the match |
| `play-card` | `handlePlayCard` | Plays a card on the current round |
| `get-state` | `handleGetState` | Returns current match state |
| `get-ranking` | `handleGetRanking` | Returns top player profiles |

| Event (server → client) | Description |
|-------------------------|-------------|
| `player-assigned` | Confirms seat assignment to joining player |
| `room-state` | Broadcasts room presence/ready/turn state |
| `match-state` | Broadcasts match score and lifecycle state |
| `hand-started` | Broadcasts hand start with vira rank |
| `card-played` | Broadcasts card play result |
| `rating-updated` | Broadcasts ELO update after match ends |
| `error` | Returns validation or domain error to client |

### RoomManager

Manages ephemeral room state entirely in memory — never persisted to the database.

Responsibilities:
- `join(matchId, socketId, playerToken)` — assigns a seat (`T1A`, `T2A`, `T1B`, `T2B`) and records session
- `leave(socketId)` — removes session on disconnect
- `setReady(socketId, ready)` — updates ready state for a seat
- `canStart(matchId)` — returns `true` only when all 4 players are ready
- `beginHand(matchId)` — sets initial turn to `T1A`
- `advanceTurn(matchId)` — cycles through `TURN_ORDER = ['T1A', 'T2A', 'T1B', 'T2B']`
- `isPlayersTurn(socketId, matchId)` — validates turn before accepting a play
- `getTeamTokens(matchId)` — returns `{ T1: string[], T2: string[] }` for ELO update
- `tryMarkRatingApplied(matchId)` — idempotent flag to prevent duplicate ELO updates on reconnect
- Reconnection by `playerToken` — preserving the same seat and domainPlayerId on reconnect

### SeatId / TeamId types

```typescript
type SeatId = 'T1A' | 'T1B' | 'T2A' | 'T2B'
type TeamId = 'T1' | 'T2'
```

These are **transport-level types**, not Domain Value Objects. They live in `gateway/multiplayer/seat-id.ts`.

### NestJS DI wiring (`GameModule`, `game.tokens.ts`)

- `GameModule` registers Use Cases and Repository implementations via symbolic tokens (`MATCH_REPOSITORY`, `PLAYER_PROFILE_REPOSITORY`)
- Factories inject the correct concrete implementation without exposing it to Use Cases
- `PrismaModule` is global — available to all modules

### Debug frontend (`frontend/`)

A Vanilla JS browser UI for manual end-to-end testing:
- Connect/disconnect via Socket.IO
- Create match, join match, set ready, start hand, play card
- 4 seat display: `T1A`, `T2A`, `T1B`, `T2B`
- Real-time event log
- Ranking table with live updates

---

## Architectural decisions

### D1 — Gateway validates transport shape, not domain rules

The Gateway validates that a payload has the expected fields and types (e.g. `matchId` is a non-empty string). It never validates Truco rules — that is the Domain's responsibility.

**Result:** validation layers are clearly separated:
- Gateway → shape/type
- Application → contract (required fields, normalization)
- Domain → invariants

### D2 — RoomManager owns ephemeral state; the DB owns durable state

Presence (who is in the room), ready state, turn order, and seat assignments are never written to the database. They live in `RoomManager` in memory.

**Result:** the database schema stays focused on durable game state. Room state resets naturally if the server restarts.

### D3 — playerToken is the reconnection key

Each client sends a `playerToken` in the WebSocket handshake. When a player reconnects, `RoomManager.join()` detects the same token and restores the original seat, teamId and domainPlayerId.

**Result:** reconnection is seamless — no new seat is allocated, the session is restored.

### D4 — Gateway never calls the Domain directly

All game logic goes through the Application (Use Cases). The Gateway calls `playCardUseCase.execute(dto)`, never `match.play(...)`.

**Result:** the dependency arrow is always Gateway → Application → Domain. Infrastructure can change without affecting the flow.

### D5 — Turn order lives in RoomManager as a transitional adaptation

The Domain models teams (`P1`, `P2`), not individual seats. Turn order at seat level (`T1A → T2A → T1B → T2B`) is a transport-level concern managed by `RoomManager`.

**Accepted limitation (DT-4):** this is acknowledged as a transitional rule. The ideal architecture would have the Application orchestrate turn order. Documented for future revisit.

---

## Files added / modified

```
src/
├── gateway/
│   ├── game.gateway.ts
│   └── multiplayer/
│       ├── room-manager.ts
│       └── seat-id.ts
├── modules/
│   ├── game.module.ts
│   └── game.tokens.ts
├── infrastructure/
│   └── persistence/
│       └── in-memory/
│           └── in-memory-match.repository.ts   ← used before Phase 4
└── main.ts
frontend/
├── index.html
├── styles.css
└── app.js
test/
└── unit/
    └── gateway/
        └── room-manager.spec.ts
```

---

## Technical debt

| ID | Description | Impact |
|----|-------------|--------|
| DT-4 | Turn order in RoomManager as transitional rule | Low — acceptable for this phase |

---

## Success criteria — final assessment

| Criterion | Status |
|-----------|--------|
| WebSocket events wired to Use Cases | ✅ |
| `RoomManager` handles ephemeral state in memory | ✅ |
| `SeatId` and `TeamId` as transport-level types (not Domain) | ✅ |
| Reconnection by `playerToken` preserving seat | ✅ |
| Turn validation before accepting `play-card` | ✅ |
| NestJS DI wiring via symbolic tokens | ✅ |
| Debug frontend for 4-player manual testing | ✅ |
| Domain and Application layers not modified | ✅ |
| `build` + `lint` + `test` passing | ✅ |