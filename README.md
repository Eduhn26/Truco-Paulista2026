# Truco Paulista — Backend

> Authoritative backend for the **Truco Paulista** card game, built with **NestJS**, **TypeScript (strict)**, **DDD**, and **Clean Architecture**.
>
> The focus of this project is **scalable architecture**, **pure domain modeling**, and **real operational discipline** — not just feature delivery.

---

## Table of Contents

- [Project Goal](#-project-goal)
- [Phase Status](#-phase-status)
- [Architectural Principles](#-architectural-principles)
- [What Works Today](#-what-works-today-phase-7)
- [Project Structure](#-project-structure)
- [Getting Started](#-getting-started)
- [Operational Validation](#-operational-validation)
- [Tests and Quality](#-tests-and-quality)
- [Manual Multiplayer Testing](#-manual-multiplayer-testing)
- [WebSocket Events](#-websocket-events)
- [Database Schema](#-database-schema)
- [Architectural Decisions](#-architectural-decisions)
- [Known Technical Debt](#-known-technical-debt)
- [Stack](#-stack)

---

## 🎯 Project Goal

This project was created as a practical, incremental study to:

- apply **Domain-Driven Design** in a real project
- use **TypeScript as a design tool**, not just for type-checking
- build a truly **authoritative real-time backend**
- ensure infrastructure changes **never affect the Domain**
- produce code that is defensible in technical interviews and portfolio reviews

---

## 🏁 Phase Status

| Phase | Description | Status |
|-------|-------------|--------|
| Phase 0  | Professional setup (TS strict, ESLint, Jest, scripts) | ✅ Complete |
| Phase 1  | Pure Domain (DDD — entities, value objects, domain service) | ✅ Complete |
| Phase 2  | Application Layer (Use Cases, DTOs, Ports) | ✅ Complete |
| Phase 3  | WebSocket transport (Socket.IO + Gateway) | ✅ Complete |
| Phase 4  | Real persistence (PostgreSQL + Prisma) | ✅ Complete |
| Phase 5  | Real 2v2 multiplayer + Ranking | ✅ Complete |
| Phase 6  | Observability (structured logs, health/readiness, error classification) | ✅ Complete |
| Phase 7  | Containerization (Docker multi-stage + Compose + migration flow) | ✅ Complete |
| Phase 8  | Production deploy | 🔜 Next |
| Phase 9  | Real authentication (Google/GitHub OAuth) | 🔜 |
| Phase 10 | Playable frontend (React/Next.js) | 🔜 |
| Phase 11 | 1v1 mode + bot seat filling | 🔜 |
| Phase 12 | Bot architecture preparation (BotDecisionPort) | 🔜 |
| Phase 13 | Public matchmaking | 🔜 |
| Phase 14 | Match history + replay | 🔜 |
| Phase 15 | Python AI service | 🔜 |
| Phase 16 | Hardening (security + performance) | 🔜 |

---

## 🧠 Architectural Principles

### Domain-first

The Domain has **zero dependency** on frameworks, databases, transport, or infrastructure details.

```
Gateway → Application → Domain
Infrastructure implements Application Ports
```

```
Domain has zero external dependencies:
  ❌ NestJS       ❌ Prisma
  ❌ Socket.IO    ❌ database logic
  ❌ transport-level validation
```

### Testability

Game rules are testable without a running server, database, or complex mocks — Jest only.

### Layer Responsibilities

| Layer | Responsibility |
|-------|----------------|
| Domain | Pure Truco rules — entities, value objects, services, invariants |
| Application | Use Cases, DTOs, flow orchestration, ports, mappers |
| Infrastructure | Persistence, external services, port implementations |
| Gateway | WebSocket transport, room state, presence, seats, turn coordination |
| Bootstrap / DevOps | Runtime startup, health/readiness, logs, containerization, deploy |

---

## ✅ What Works Today (Phase 7)

### Core gameplay

- Real 2v2 multiplayer via WebSocket (Socket.IO)
- 4 players per room — seats `T1A`, `T2A`, `T1B`, `T2B`
- Turn order coordinated in the Gateway
- Ready state synchronized — match starts only when all seats are ready
- Reconnection by token, preserving the same seat
- Persisted ranking — simplified ELO (+25 win, -25 loss, floor 100)
- Player profile — wins, losses, rating, matchesPlayed

### Observability

- `GET /health/live` and `GET /health/ready`
- Structured bootstrap, database, and multiplayer gateway logs
- Explicit error classification: `validation_error` · `transport_error` · `domain_error` · `unexpected_error`

### Containerized runtime

- Multi-stage Dockerfile
- Docker Compose orchestration for `postgres`, `migrate`, and `backend`
- Explicit migration flow with `prisma migrate deploy`
- Containerized local runtime validated end-to-end

### Debug tooling

- Debug frontend for manual multiplayer testing
- `ws-client.ts` script for transport-level validation

---

## 🧱 Project Structure

```
.
├── frontend/                      # Debug UI (Vanilla JS)
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── prisma/
│   ├── schema.prisma              # MatchSnapshot + PlayerProfile
│   └── migrations/
├── src/
│   ├── domain/                    # Pure business rules — framework-free
│   │   ├── entities/              # Match, Hand, Round
│   │   ├── value-objects/         # Card, PlayerId, Score, MatchState...
│   │   ├── services/              # TrucoRules
│   │   └── exceptions/            # DomainError, InvalidMoveError
│   ├── application/               # Use Cases, DTOs, Ports, Mappers
│   │   ├── use-cases/
│   │   ├── dtos/
│   │   ├── ports/
│   │   └── mappers/
│   ├── infrastructure/
│   │   └── persistence/
│   │       ├── prisma/            # Prisma repositories
│   │       └── in-memory/         # Test-oriented adapters
│   ├── gateway/                   # WebSocket transport and multiplayer state
│   │   ├── game.gateway.ts
│   │   └── multiplayer/           # RoomManager, SeatId, room flow
│   ├── health/                    # Liveness/readiness concerns
│   ├── modules/                   # NestJS module wiring
│   ├── scripts/                   # simulate-hand.ts, ws-client.ts
│   └── main.ts
├── test/
│   └── unit/
│       ├── domain/
│       ├── application/
│       ├── gateway/
│       └── health/
├── Dockerfile
├── docker-compose.yml
└── .env.example
```

---

## 🚀 Getting Started

### Prerequisites

- Node.js 20+
- Docker + Docker Compose

### Option A — Run locally with Node.js

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

### Option B — Run fully containerized

```bash
# 1. Build and start everything
docker compose up -d --build

# 2. Inspect services
docker compose ps

# 3. Inspect migration logs
docker compose logs --tail=100 migrate

# 4. Inspect backend logs
docker compose logs --tail=100 backend
```

---

## 🔍 Operational Validation

### Health endpoints

```bash
curl http://localhost:3000/health/live
curl http://localhost:3000/health/ready
```

Expected responses:

- `/health/live` → `200 OK`
- `/health/ready` → `200 OK` with `database: up`

### Compose validation

```bash
docker compose config
```

### Restart validation

```bash
docker compose restart backend
docker compose logs -f --tail=50 backend
```

---

## 🧪 Tests and Quality

```bash
npm run test          # run all tests
npm run test:watch    # watch mode
npm run lint          # ESLint
npm run build         # TypeScript build
```

Additional commands:

```bash
npm run test:cov       # coverage report
npm run prisma:status  # migration status
npm run prisma:deploy  # apply migrations
```

---

## 🎮 Manual Multiplayer Testing

Open `frontend/index.html` in the browser and use **4 separate tabs** with different player tokens to simulate a full 2v2 match.

Suggested flow:

1. `create-match` — one player creates the room
2. `join-match` — remaining 3 players join
3. `set-ready` — all 4 players signal ready
4. `start-hand` — any player starts the hand
5. `play-card` — players take turns playing cards

Inspect the backend logs to follow state transitions and event flow in real time.

---

## 📡 WebSocket Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `create-match` | Client → Server | Create a new room |
| `join-match` | Client → Server | Join an existing room |
| `set-ready` | Client → Server | Player signals ready |
| `start-hand` | Client → Server | Start the hand |
| `play-card` | Client → Server | Play a card |
| `get-state` | Client → Server | Request current match state |
| `get-ranking` | Client → Server | Request ranking |
| `player-assigned` | Server → Client | Confirms assigned seat |
| `room-state` | Server → Client | Room state broadcast |
| `match-state` | Server → Client | Match state broadcast |
| `hand-started` | Server → Client | Hand started broadcast |
| `card-played` | Server → Client | Card played broadcast |
| `rating-updated` | Server → Client | Ranking updated after match |
| `error` | Server → Client | Validation, transport, or domain error |

---

## 🗃️ Database Schema

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

model PlayerProfile {
  id            String   @id @default(cuid())
  playerToken   String   @unique
  rating        Int      @default(1000)
  wins          Int      @default(0)
  losses        Int      @default(0)
  matchesPlayed Int      @default(0)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}
```

---

## 📐 Architectural Decisions

| ID | Decision |
|----|----------|
| D1 | `PlayerId` in the Domain is `'P1' \| 'P2'` and represents teams, not individual players |
| D2 | `SeatId` and `TeamId` live in the Gateway, not as Domain Value Objects |
| D3 | Gateway manages room/presence/turn flow as a transport adaptation |
| D4 | Ranking is a separate bounded concern — `Match` never updates `PlayerProfile` directly |
| D5 | Aggregate persistence uses `toSnapshot/fromSnapshot` without weakening Domain invariants |
| D6 | Health/readiness remain outside the Domain |
| D7 | Structured logging begins with Nest Logger + structured payloads |
| D8 | Migration flow is separated from backend startup in containerized runtime |

---

## 📋 Known Technical Debt

| ID | Description | Planned review |
|----|-------------|----------------|
| DT-4  | Turn order remains coordinated in the Gateway as a transport adaptation | Phase 13+ |
| DT-7  | Formal metrics/instrumentation layer not implemented yet | Phase 8+ |
| DT-8  | No correlation ID strategy for socket tracing | Phase 16 |
| DT-9  | Frontend is still debug-only (Vanilla JS) | Phase 10 |
| DT-10 | Auth is still token-based in handshake | Phase 9 |
| DT-11 | No matchmaking yet | Phase 13 |
| DT-12 | No match history / replay yet | Phase 14 |

---

## 🛠️ Stack

| Aspect | Choice |
|--------|--------|
| Runtime | Node.js 20 |
| Language | TypeScript strict |
| Framework | NestJS |
| Transport | WebSocket via Socket.IO |
| Persistence | PostgreSQL 16 + Prisma ORM |
| Tests | Jest + ts-jest |
| Frontend (debug) | Vanilla JS |
| Observability | Nest Logger + health/readiness endpoints |
| Containerization | Docker multi-stage + Docker Compose |
| Deploy | Planned for Phase 8 |
| Future AI/Bots | TypeScript heuristic first → Python service (Phase 15) |

---

## 📌 Current Milestone

**Phase 7 complete.** The project has delivered:

- pure Domain modeling with DDD
- Application Layer with ports and use cases
- real-time multiplayer transport via WebSocket
- PostgreSQL + Prisma persistence with robust rehydration
- ranking and player profile as a separate bounded context
- observability with structured logs, health and readiness endpoints
- full local containerization with separated migration flow

**Next: Phase 8 — Production Deploy.**
