### `README.md`

```md
# Truco Paulista — Backend

> Authoritative backend for the **Truco Paulista** card game, built with **NestJS**, **TypeScript (strict)**, **DDD**, and **Clean Architecture**.
>
> The project prioritizes **scalable architecture**, **pure domain modeling**, **real testability**, and **operational discipline** — not just feature delivery.

---

## 🎯 Project Goal

This project was created as a practical, incremental study to:

- apply **Domain-Driven Design** in a real project
- use **TypeScript as a design tool**, not only for type-checking
- build an **authoritative real-time backend**
- ensure infrastructure changes **never affect the Domain**
- produce code that is defensible in technical interviews and portfolio reviews

---

## 🏁 Phase Status

| Phase | Description | Status |
|---|---|---|
| Phase 0 | Professional setup (TS strict, ESLint, Jest, scripts) | ✅ Complete |
| Phase 1 | Pure Domain (DDD — entities, value objects, domain services) | ✅ Complete |
| Phase 2 | Application Layer (Use Cases, DTOs, Ports) | ✅ Complete |
| Phase 3 | WebSocket transport (Socket.IO + Gateway) | ✅ Complete |
| Phase 4 | Real persistence (PostgreSQL + Prisma) | ✅ Complete |
| Phase 5 | Real 2v2 multiplayer + ranking | ✅ Complete |
| Phase 6 | Observability (health, readiness, structured logging, error classification) | ✅ Complete |
| Phase 7 | Containerization (Docker multi-stage + Compose orchestration) | ✅ Complete |
| Phase 8 | Production deployment (Render + managed Postgres + automated migrations) | ✅ Complete |
| Phase 9 | Real authentication (Google/GitHub OAuth + app auth token + authenticated WebSocket identity) | ✅ Complete |
| Phase 10 | Playable frontend (React/Next.js) | 🔜 Next |
| Phase 11 | 1v1 mode + bot seat filling | 🔜 Planned |
| Phase 12 | Bot architecture preparation | 🔜 Planned |
| Phase 13 | Public matchmaking | 🔜 Planned |
| Phase 14 | Match history + replay | 🔜 Planned |
| Phase 15 | Python AI service | 🔜 Planned |
| Phase 16 | Hardening (security + performance) | 🔜 Planned |

---

## 🧠 Architectural Principles

### Domain-first

The Domain has **zero dependency** on frameworks, databases, transport layers, logging, health checks, authentication providers, or operational concerns.

### Clean Architecture

```text
Gateway → Application → Domain
Infrastructure implements Application Ports
Domain with zero external dependencies

Domain must not depend on:

❌ NestJS
❌ Prisma
❌ Socket.IO
❌ OAuth providers
❌ transport-level validation concerns
❌ logging / health / readiness concerns
Testability

Game rules are testable without:

a running server
a real database
transport infrastructure
complex mocks
🧱 Layer Responsibilities
Layer	Responsibility
Domain	Pure Truco rules — entities, value objects, services, invariants
Application	Use Cases, DTOs, orchestration, ports, mappers
Infrastructure	Persistence, Prisma integration, database readiness, auth adapters, external integrations
Gateway	WebSocket transport, ephemeral room/presence/turn state, multiplayer coordination
Auth	HTTP auth entrypoints, OAuth strategies, internal auth token issuance
Bootstrap / Health	Startup lifecycle, health endpoints, structured operational logging
🎮 What Works Today
Multiplayer and Ranking
Real 2v2 multiplayer via WebSocket (Socket.IO)
4 players per room with seats:
T1A
T2A
T1B
T2B
Turn order:
T1A → T2A → T1B → T2B
Ready state synchronization — match starts only when all 4 players are ready
Reconnection by technical session identity, preserving the same seat
Persisted ranking with simplified ELO:
+25 for win
-25 for loss
floor 100
Authenticated identity and player ownership
Real Google OAuth flow
Real GitHub OAuth flow
Internal User persistence for authenticated identities
Application-issued auth token after OAuth callback
Authenticated WebSocket handshake through authToken
PlayerProfile persistence now linked to userId
Distinct authenticated users can join the same multiplayer match without seat collision
Player profile persistence
wins
losses
rating
matchesPlayed
Observability
GET /health/live
GET /health/ready
Database readiness probe through PrismaService
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
Containerized Runtime
Multi-stage Dockerfile
docker-compose.yml orchestration for:
postgres
migrate
backend
Explicit migration flow with prisma migrate deploy
Containerized local runtime validated end to end
Backend restart validated after container startup
Production Runtime
Backend deployed on Render
Managed Render Postgres database
Public production URL
Production env contract validated
Health endpoints validated in production
Automated Prisma migration execution adapted for Render Free
Successful production startup after migration execution
🌐 Production URL

https://truco-paulista-backend.onrender.com

Health endpoints:

GET /health/live
GET /health/ready
🧱 Project Structure
backend/
├── frontend/                  # Debug UI (Vanilla JS, no framework)
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── src/
│   ├── auth/                  # OAuth strategies, auth controller, auth token service
│   ├── domain/                # Pure business rules — framework-free
│   │   ├── entities/
│   │   ├── value-objects/
│   │   ├── services/
│   │   └── exceptions/
│   ├── application/           # Use Cases, DTOs, Ports, Mappers
│   │   ├── use-cases/
│   │   ├── dtos/
│   │   ├── ports/
│   │   └── mappers/
│   ├── infrastructure/
│   │   └── persistence/
│   │       ├── prisma/
│   │       └── in-memory/
│   ├── gateway/               # WebSocket transport
│   │   ├── game.gateway.ts
│   │   └── multiplayer/
│   ├── health/                # Liveness / readiness surface
│   ├── modules/               # NestJS DI wiring
│   ├── scripts/               # simulate-hand.ts, ws-client.ts
│   └── main.ts
└── test/
    └── unit/
        ├── auth/
        ├── domain/
        ├── application/
        └── gateway/
🚀 Getting Started
Prerequisites
Node.js 20+
Docker + Docker Compose
Local Setup
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
Validate Health Endpoints
# Process is alive
curl http://localhost:3000/health/live

# Database is ready
curl http://localhost:3000/health/ready
Run Fully Containerized
# 1. Build and start everything
docker compose up -d --build

# 2. Inspect services
docker compose ps

# 3. Inspect migration flow
docker compose logs --tail=100 migrate

# 4. Inspect backend logs
docker compose logs --tail=100 backend
🔐 Authentication
OAuth endpoints
GET /auth/google
GET /auth/google/callback
GET /auth/github
GET /auth/github/callback

Expected callback response shape:

{
  "user": {
    "id": "...",
    "provider": "google | github",
    "providerUserId": "...",
    "email": "...",
    "displayName": "...",
    "avatarUrl": "..."
  },
  "authToken": "...",
  "expiresIn": "7d"
}
WebSocket authenticated flow

Create a match with authenticated identity:

npm run ws:client -- create <AUTH_TOKEN> 1

Join an existing match with another authenticated identity:

npm run ws:client -- join <MATCH_ID> <ANOTHER_AUTH_TOKEN>
🧪 Automated Validation
npm run test
npm run test:watch
npm run lint
npm run build

Current validated automated state:

16 test suites
55 tests
0 failures
📡 HTTP / Operational Endpoints
Route	Method	Description
/	GET	Basic root route
/health/live	GET	Liveness check — process is up
/health/ready	GET	Readiness check — database dependency is ready
/auth/google	GET	Starts Google OAuth login
/auth/google/callback	GET	Google OAuth callback
/auth/github	GET	Starts GitHub OAuth login
/auth/github/callback	GET	GitHub OAuth callback
📡 WebSocket Events
Event	Direction	Description
create-match	Client → Server	Create a new room
join-match	Client → Server	Join an existing room
set-ready	Client → Server	Player signals ready
start-hand	Client → Server	Start the hand
play-card	Client → Server	Play a card
get-state	Client → Server	Request current state
get-ranking	Client → Server	Request ranking
player-assigned	Server → Client	Confirms assigned seat
room-state	Server → Client	Room state broadcast
match-state	Server → Client	Match state broadcast
hand-started	Server → Client	Hand started broadcast
card-played	Server → Client	Card played broadcast
rating-updated	Server → Client	Ranking updated after match
error	Server → Client	Validation, transport, domain, or unexpected error
🗃️ Database Schema
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

model User {
  id             String   @id @default(cuid())
  provider       String
  providerUserId String
  email          String?
  displayName    String?
  avatarUrl      String?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  playerProfile  PlayerProfile?

  @@unique([provider, providerUserId])
}

model PlayerProfile {
  id            String   @id @default(cuid())
  userId        String   @unique
  rating        Int      @default(1000)
  wins          Int      @default(0)
  losses        Int      @default(0)
  matchesPlayed Int      @default(0)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  user          User     @relation(fields: [userId], references: [id])
}
📐 Recorded Architectural Decisions
ID	Decision
D1	PlayerId in the Domain remains `'P1'
D2	SeatId and TeamId live in the Gateway, not as Domain Value Objects
D3	Turn order in the Gateway is a transitional transport adaptation
D4	Ranking is a separate Bounded Context — Match never updates PlayerProfile directly
D5	toSnapshot() / fromSnapshot() are serialization extensions and do not alter Domain invariants
D6	Health remains outside the Domain and lives in src/health/*
D7	Database readiness belongs to Infrastructure through PrismaService
D8	Structured logging starts with Nest Logger + structured payloads
D9	Gateway is the correct boundary for multiplayer observability
D10	DomainError must remain distinguishable from technical failures
D11	Production deployment remains an infrastructure/bootstrap concern, never a Domain concern
D12	Render Free migration automation is implemented at container startup as an operational workaround
D13	User is an Infrastructure identity boundary and must never leak into the Domain
D14	OAuth providers are adapters; the application must normalize them into internal user identity
D15	The application issues its own auth token for later runtime boundaries such as WebSocket handshake
D16	Authenticated multiplayer entry resolves userId first and keeps technical session identity separate
📋 Known Technical Debt
ID	Description	Status
DT-4	Turn order still lives in the Gateway as a transitional rule	⚠️ Accepted
DT-7	Metrics / formal instrumentation layer not implemented yet	🔜 Backlog
DT-8	No correlation ID strategy for socket-level tracing yet	🔜 Backlog
DT-13	Docker build still depends on a transitional legacy-peer-deps workaround	⚠️ Accepted
DT-14	On Render Free, Prisma migrations run inside container startup instead of isolated pre-deploy/job flow	⚠️ Accepted
DT-15	Transitional compatibility for legacy socket identity should eventually be removed after the frontend fully consumes authenticated flow	⚠️ Accepted
DT-16	OAuth callback auth token is backend-ready, but real frontend session consumption belongs to Phase 10	🔜 Backlog
🛠️ Stack
Aspect	Choice
Runtime	Node.js 20
Language	TypeScript (strict — all major strict flags enabled)
Framework	NestJS
Transport	WebSocket via Socket.IO
Persistence	PostgreSQL 16 + Prisma ORM
Authentication	Google OAuth + GitHub OAuth + app-issued auth token
Tests	Jest + ts-jest
Frontend (debug)	Vanilla JS
Local container runtime	Docker + Docker Compose
Production hosting	Render
Production database	Render Postgres
Observability	Health/readiness + structured logging
✅ Current State

The backend is currently:

architecturally layered
multiplayer-capable
persistence-backed
observable
containerized
deployed in production
connected to a managed PostgreSQL database
running automated migrations in production
authenticated through real Google/GitHub OAuth
issuing its own application auth token
capable of authenticated multiplayer session entry
ready to evolve into a playable frontend, bots, and public matchmaking

🧪 Como testar

Depois de colar os dois arquivos:

```bash
npm run test
npm run build