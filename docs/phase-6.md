# Phase 6 — Observability

> **Status:** ✅ Complete (core scope)
> **Branch:** `feat/phase-6-observability`

---

## Objective

Introduce operational visibility into the backend without violating the architectural boundaries defined in earlier phases.

The goal was not to add "random logs." It was to make the system observable in a way that supports local runtime diagnosis now and prepares the project for containerization, deployment, and hardening later.

---

## What was delivered

### Health surface

- `GET /health/live` for process liveness
- `GET /health/ready` for infrastructure readiness
- Readiness backed by an explicit database probe through `PrismaService`

### Structured bootstrap and infrastructure logging

- Structured startup logs in `main.ts`
- Structured database connection and readiness logs in `PrismaService`
- Clear distinction between application startup and database availability

### Structured gateway logging

- Structured logs for:
  - connection / disconnection
  - create-match
  - join-match
  - set-ready
  - start-hand
  - play-card
  - get-state
  - get-ranking
- Stable context fields such as `matchId`, `seatId`, `socketId`, `status`

### Observable error classification

- Validation errors logged as `validation_error`
- Transport/session errors logged as `transport_error`
- Domain rule violations logged as `domain_error`
- Unexpected failures logged as `unexpected_error`

---

## Architectural decisions

### D1 — Health concerns stay outside the Domain

Health endpoints live in `src/health/*`.
The Domain remains unaware of liveness, readiness, probes, or operational concerns.

### D2 — Database readiness belongs to Infrastructure

The readiness probe is executed through `PrismaService`, not inside controllers or use cases.

**Result:** Infrastructure is responsible for dependency status, while HTTP only exposes the result.

### D3 — Structured logging starts with Nest Logger, not a dedicated logging library

This phase uses Nest's built-in `Logger` plus structured JSON payloads.

**Reason:** enough operational value now, without prematurely adding a logging stack such as Pino.

### D4 — Gateway is the correct place to observe realtime flow

The multiplayer transport layer is where socket/session/match flow happens, so it is the correct boundary for multiplayer logging.

### D5 — Domain errors must not be flattened into technical failures

The Gateway recognizes `DomainError` and logs it as `domain_error` instead of `unexpected_error`.

**Result:** rule violations are now operationally distinguishable from infrastructure or coding failures.

---

## Operational validation

### Liveness

Run the backend and call:

```bash
curl http://localhost:3000/health/live

Expected response:

{
  "status": "ok",
  "check": "liveness",
  "service": "truco-paulista-backend",
  "timestamp": "..."
}
Readiness

Run the backend with Postgres available and call:

curl http://localhost:3000/health/ready

Expected response when the database is available:

{
  "status": "ok",
  "check": "readiness",
  "service": "truco-paulista-backend",
  "dependencies": {
    "database": "up"
  },
  "timestamp": "..."
}

Expected response when the database is unavailable:

{
  "status": "error",
  "check": "readiness",
  "service": "truco-paulista-backend",
  "dependencies": {
    "database": "down"
  },
  "timestamp": "..."
}
Validation commands
npm run lint
npm run build
npm run test
npm run start:dev
How to read the logs
Bootstrap logs

Look for events such as:

application_starting

application_started

application_start_failed

These indicate whether the process booted correctly and on which port/url.

Database logs

Look for events such as:

database_connecting

database_connected

database_connection_retry

database_connection_failed

database_readiness_failed

These indicate whether the database was reachable during startup and during readiness probing.

Gateway logs

Look for fields such as:

event

status

matchId

seatId

socketId

playerTokenSuffix

errorType

These allow troubleshooting realtime flow without exposing full player tokens.

Local troubleshooting
Scenario 1 — App starts, but readiness is failing

Symptoms:

/health/live returns ok

/health/ready returns database down

Likely cause:

Postgres is not running yet

or Prisma cannot reach the configured database

What to check:

Docker / Postgres container status

connection string

migration state

PrismaService logs for retry / failure events

Scenario 2 — A player action fails, but the server stays healthy

Symptoms:

health endpoints stay up

socket event returns an error

gateway logs show domain_error or transport_error

Meaning:

the runtime is healthy

the failure is local to the match/session/action flow

Scenario 3 — Startup fails before the app becomes ready

Symptoms:

backend exits during startup

bootstrap logs show application_start_failed

Likely cause:

infrastructure dependency failure

or startup configuration/runtime issue

Files added / modified
src/
├── health/
│   ├── health.controller.ts
│   ├── health.module.ts
│   └── health.service.ts
├── gateway/
│   └── game.gateway.ts
├── infrastructure/
│   └── persistence/
│       └── prisma/
│           └── prisma.service.ts
└── main.ts
Technical debt
Still open
ID	Description	Impact
DT-4	Turn order still lives in the Gateway as a transitional rule	Low for now; revisit in later phases
DT-5	Metrics are still minimal / not implemented as a formal instrumentation layer	Medium
DT-6	No correlation ID strategy yet for socket-level tracing	Medium
Success criteria — final assessment
Criterion	Status
Liveness endpoint available	✅
Readiness endpoint checks database	✅
Structured bootstrap logs available	✅
Structured database logs available	✅
Structured gateway logs available	✅
Domain errors distinguished from unexpected failures	✅
build + lint + test passing	✅