# Truco Paulista — Backend (NestJS)

Authoritative backend for the **Truco Paulista** card game, built with **NestJS**, **TypeScript (strict)**, **DDD**, and **Clean Architecture**.

The focus of this project is **scalable architecture**, **pure domain modeling**, **real testability**, and now also **runtime observability** — not just functionality.

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
| Phase 6 | Observability (health, readiness, structured logging, error classification) | ✅ Complete |
| Phase 7 | Containerization (Docker multi-stage / runtime consolidation) | ✅ Complete |
| Phase 8 | Production deploy | 🔜 Next |
| Phase 9 | Hardening (security + performance) | 🔜 |

---

## 🧠 Architectural Principles

**Domain-first**  
The domain has no dependency on any framework, database, transport layer, or observability concern.

**Real Clean Architecture**

```text
Gateway → Application → Domain
Infrastructure implements Application Ports
Domain with zero external dependencies
❌ NestJS
❌ Prisma
❌ Socket.IO
❌ Transport-level validations
❌ Logging / health / readiness concerns
Testability

Game rules are testable without a running server, database, or complex mocks.

Layer responsibility
Layer	Responsibility
Domain	Pure Truco rules — never touched by infrastructure
Application	Flow orchestration, Use Cases, contracts (DTOs + Ports)
Infrastructure	Persistence, Port implementations, database readiness
Gateway	Ephemeral room/presence/turn state, WebSocket transport, multiplayer observability
Health / Bootstrap	Liveness, readiness, startup lifecycle logs
🎮 What works today
Multiplayer and ranking
Real 2v2 multiplayer via WebSocket (Socket.IO)
4 players per room, with seats T1A, T2A, T1B, T2B
Turn order: T1A → T2A → T1B → T2B
Ready state synchronized — match only starts when all 4 players are ready
Reconnection by token, preserving the same seat
Persisted ranking — simplified ELO (+25 win, -25 loss, floor 100)
Player profile — wins, losses, rating, matchesPlayed
Debug frontend — browser UI for manual testing (4 tabs = 4 players)
Observability
Liveness endpoint: GET /health/live
Readiness endpoint: GET /health/ready
Database readiness probe implemented through PrismaService
Structured bootstrap logs for:
application_starting
application_started
application_start_failed
Structured database logs for:
connection attempts
retries
readiness failures
Structured gateway logs for multiplayer flow:
create-match
join-match
set-ready
start-hand
play-card
get-state
get-ranking
Observable error classification:
validation_error
transport_error
domain_error
unexpected_error
Containerized runtime
Multi-stage Dockerfile
Docker Compose orchestration for:
postgres
migrate
backend
Explicit migration flow with prisma migrate deploy
Containerized local runtime validated end-to-end
Backend restart validated after container startup
🧱 Project Structure
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
│   │       ├── prisma/        # PrismaMatchRepository, PrismaPlayerProfileRepository, PrismaService
│   │       └── in-memory/     # Legacy — used in tests
│   ├── gateway/               # WebSocket transport
│   │   ├── game.gateway.ts
│   │   └── multiplayer/       # RoomManager, SeatId
│   ├── health/                # Liveness / readiness surface
│   │   ├── health.controller.ts
│   │   ├── health.service.ts
│   │   └── health.module.ts
│   ├── modules/               # NestJS DI wiring
│   ├── scripts/               # simulate-hand.ts, ws-client.ts
│   └── main.ts                # Bootstrap + structured startup logs
└── test/
    └── unit/
        ├── domain/
        ├── application/
        └── gateway/
🚀 Getting Started
Prerequisites
Node.js 20+
Docker + Docker Compose
Setup
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
Validate health endpoints
# Process is alive
curl http://localhost:3000/health/live

# Database is ready
curl http://localhost:3000/health/ready
Run fully containerized
# 1. Build and start everything
docker compose up -d --build

# 2. Inspect services
docker compose ps

# 3. Inspect migration flow
docker compose logs --tail=100 migrate

# 4. Inspect backend logs
docker compose logs --tail=100 backend
Manual testing with the frontend
# Open backend/frontend/index.html in the browser
# Use 4 tabs with different tokens to simulate 4 players
Automated tests
npm run test          # Jest
npm run test:watch    # watch mode
npm run lint          # ESLint
npm run build         # TypeScript build
📡 HTTP / Operational Endpoints
Route	Method	Description
/	GET	Basic root route
/health/live	GET	Liveness check — process is up
/health/ready	GET	Readiness check — database dependency is ready
📡 WebSocket Events
Event (emit)	Direction	Description
create-match	Client → Server	Create a new room
join-match	Client → Server	Join an existing room
set-ready	Client → Server	Player signals ready
start-hand	Client → Server	Start the hand
play-card	Client → Server	Play a card
get-state	Client → Server	Request current state
get-ranking	Client → Server	Request ranking
player-assigned	Server → Client	Confirms assigned seat
room-state	Server → Client	Room state (broadcast)
match-state	Server → Client	Match state (broadcast)
hand-started	Server → Client	Hand started (broadcast)
card-played	Server → Client	Card played (broadcast)
rating-updated	Server → Client	Ranking updated after match
error	Server → Client	Validation, transport, domain, or unexpected error
🗃️ Database Schema
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
📐 Recorded Architectural Decisions
ID	Decision
D1	PlayerId in the Domain is 'P1' | 'P2' — represents teams, not individual players
D2	SeatId and TeamId live in the Gateway — not Domain Value Objects
D3	Turn order in the Gateway is a transitional transport adaptation
D4	Ranking is a separate Bounded Context — Match never updates PlayerProfile directly
D5	toSnapshot/fromSnapshot is a serialization extension — does not alter Domain invariants
D6	Health stays outside the Domain and lives in src/health/*
D7	Database readiness belongs to Infrastructure through PrismaService
D8	Structured logging starts with Nest Logger + structured payloads
D9	Gateway is the correct boundary for multiplayer observability
D10	DomainError must remain distinguishable from technical failures
📋 Known Technical Debt
ID	Description	Status
DT-4	Turn order in Gateway as transitional rule	⚠️ Accepted, revisit in later phases
DT-7	Metrics / formal instrumentation layer not implemented	🔜 Backlog
DT-8	No correlation ID strategy for socket-level tracing	🔜 Backlog
5.F	Match history (MatchRecord + paginated use case)	🔜 Backlog
5.G	ws-client.ts for 4 simultaneous players	🔜 Backlog
🛠️ Stack
Aspect	Choice
Runtime	Node.js 20
Language	TypeScript (strict — all flags enabled)
Framework	NestJS
Transport	WebSocket via Socket.IO
Persistence	PostgreSQL 16 + Prisma ORM
Tests	Jest + ts-jest
Frontend (debug)	Vanilla JS — no framework
Container (dev)	Docker + docker-compose
Observability	Health/readiness + structured logging