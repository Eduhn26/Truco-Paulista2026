# Truco Paulista — Backend (NestJS)

Authoritative backend for the **Truco Paulista** card game, built with **NestJS**, **TypeScript (strict)**, **DDD**, and **Clean Architecture**.

The focus of this project is **scalable architecture**, **pure domain modeling**, and **real testability** — not just functionality.

---

## 🎯 Project Goal

This project was created as a practical, incremental study to:

- Apply **Domain-Driven Design** in practice
- Use **TypeScript as a design tool**, not just for type-checking
- Build a truly **authoritative real-time backend**
- Ensure infrastructure changes **never affect the domain**
- Produce code that is defensible in technical interviews and portfolio reviews

---

## 🏁 Phase Status

| Phase | Description | Status |
|---|---|---|
| Phase 0 | Professional setup (TS strict, ESLint, Jest, scripts) | ✅ Complete |
| Phase 1 | Pure Domain (DDD — entities, value objects, domain service) | ✅ Complete |
| Phase 2 | Application Layer (Use Cases, DTOs, Ports) | ✅ Complete |
| Phase 3 | WebSocket transport (Socket.IO + Gateway) | ✅ Complete |
| Phase 4 | Real persistence (PostgreSQL + Prisma) | ✅ Complete |
| Phase 5 | Real 2v2 multiplayer + Ranking | ✅ Complete |
| Phase 6 | Observability (logger, metrics, healthcheck) | 🔜 Next |
| Phase 7 | Containerization (Docker multi-stage) | 🔜 |
| Phase 8 | Production deploy | 🔜 |
| Phase 9 | Hardening (security + performance) | 🔜 |

---

## 🧠 Architectural Principles

**Domain-first**
The domain has no dependency on any framework, database, or transport layer.

**Real Clean Architecture**
```
Gateway → Application → Domain
Infrastructure implements Application Ports
```

**Domain with zero external dependencies**
- ❌ NestJS
- ❌ Prisma
- ❌ Socket.IO
- ❌ Transport-level validations

**Testability**
Game rules are testable without a running server, database, or complex mocks.

**Layer responsibility**

| Layer | Responsibility |
|---|---|
| Domain | Pure Truco rules — never touched by infrastructure |
| Application | Flow orchestration, Use Cases, contracts (DTOs + Ports) |
| Infrastructure | Persistence, Port implementations |
| Gateway | Ephemeral room/presence/turn state, WebSocket transport |

---

## 🎮 What works today (Phase 5)

- **Real 2v2 multiplayer** via WebSocket (Socket.IO)
- **4 players** per room, with seats `T1A`, `T2A`, `T1B`, `T2B`
- **Turn order**: `T1A → T2A → T1B → T2B`
- **Ready state** synchronized — match only starts when all 4 players are ready
- **Reconnection** by token, preserving the same seat
- **Persisted ranking** — simplified ELO (+25 win, -25 loss, floor 100)
- **Player profile** — wins, losses, rating, matchesPlayed
- **Debug frontend** — browser UI for manual testing (4 tabs = 4 players)

---

## 🧱 Project Structure

```
backend/
├── frontend/                  # Debug UI (Vanilla JS, no framework)
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── prisma/
│   ├── schema.prisma          # MatchSnapshot + PlayerProfile
│   └── migrations/
├── src/
│   ├── domain/                # Pure business rules — DO NOT TOUCH
│   │   ├── entities/          # Match (Aggregate Root), Hand, Round
│   │   ├── value-objects/     # Card, PlayerId, Score, MatchState...
│   │   ├── services/          # TrucoRules
│   │   └── exceptions/        # DomainError, InvalidMoveError
│   ├── application/           # Use Cases, DTOs, and Ports
│   │   ├── use-cases/
│   │   ├── dtos/
│   │   ├── ports/
│   │   └── mappers/
│   ├── infrastructure/
│   │   └── persistence/
│   │       ├── prisma/        # PrismaMatchRepository, PrismaPlayerProfileRepository
│   │       └── in-memory/     # Legacy — used in tests
│   ├── gateway/               # WebSocket transport
│   │   ├── game.gateway.ts
│   │   └── multiplayer/       # RoomManager, SeatId
│   ├── modules/               # NestJS DI wiring
│   ├── scripts/               # simulate-hand.ts, ws-client.ts
│   └── main.ts
└── test/
    └── unit/
        ├── domain/
        ├── application/
        └── gateway/
```

---

## 🚀 Getting started

### Prerequisites

- Node.js 20+
- Docker + Docker Compose

### Setup

```bash
# 1. Install dependencies
npm install

# 2. Copy environment variables
cp .env.example .env

# 3. Start the database
docker compose up -d postgres

# 4. Run migrations
npx prisma migrate dev

# 5. Start the backend
npm run start:dev
```

### Manual testing with the frontend

```bash
# Open backend/frontend/index.html in the browser
# Use 4 tabs with different tokens to simulate 4 players
```

### Automated tests

```bash
npm run test          # Jest
npm run test:watch    # watch mode
npm run lint          # ESLint
npm run build         # TypeScript build
```

---

## 📡 WebSocket Events

| Event (emit) | Direction | Description |
|---|---|---|
| `create-match` | Client → Server | Create a new room |
| `join-match` | Client → Server | Join an existing room |
| `set-ready` | Client → Server | Player signals ready |
| `start-hand` | Client → Server | Start the hand |
| `play-card` | Client → Server | Play a card |
| `get-state` | Client → Server | Request current state |
| `get-ranking` | Client → Server | Request ranking |
| `player-assigned` | Server → Client | Confirms assigned seat |
| `room-state` | Server → Client | Room state (broadcast) |
| `match-state` | Server → Client | Match state (broadcast) |
| `hand-started` | Server → Client | Hand started (broadcast) |
| `card-played` | Server → Client | Card played (broadcast) |
| `rating-updated` | Server → Client | Ranking updated after match |
| `error` | Server → Client | Domain or validation error |

---

## 🗃️ Database Schema

```prisma
model MatchSnapshot {
  id        String   @id
  state     Json     // full Match aggregate snapshot
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model PlayerProfile {
  id             String   @id  // playerToken
  rating         Int      @default(1000)
  wins           Int      @default(0)
  losses         Int      @default(0)
  matchesPlayed  Int      @default(0)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
}
```

---

## 📐 Recorded Architectural Decisions

| ID | Decision |
|---|---|
| D1 | `PlayerId` in the Domain is `'P1' \| 'P2'` — represents teams, not individual players |
| D2 | `SeatId` and `TeamId` live in the Gateway — not Domain Value Objects |
| D3 | Turn order in the Gateway is a transitional transport adaptation (acceptable in Phase 5) |
| D4 | Ranking is a separate Bounded Context — `Match` never updates `PlayerProfile` directly |
| D5 | `toSnapshot/fromSnapshot` is a serialization extension — does not alter Domain invariants |

---

## 📋 Known Technical Debt

| ID | Description | Status |
|---|---|---|
| DT-4 | Turn order in Gateway as transitional rule | ⚠️ Accepted, revisit in Phase 6+ |
| 5.F | Match history (`MatchRecord` + paginated use case) | 🔜 Backlog |
| 5.G | `ws-client.ts` for 4 simultaneous players | 🔜 Backlog |

---

## 🛠️ Stack

| Aspect | Choice |
|---|---|
| Runtime | Node.js 20 |
| Language | TypeScript (strict — all flags enabled) |
| Framework | NestJS |
| Transport | WebSocket via Socket.IO |
| Persistence | PostgreSQL 16 + Prisma ORM |
| Tests | Jest + ts-jest |
| Frontend (debug) | Vanilla JS — no framework |
| Container (dev) | Docker + docker-compose |