# Phase 7 — Containerization

> **Status:** ✅ Complete (core scope)
> **Branch:** `feat/phase-7-containerization`

---

## Objective

Introduce a real containerized runtime for the backend without violating the architectural boundaries established in previous phases.

The goal was not just to "add Docker files." It was to make the backend buildable, reproducible, and operationally consistent in a containerized environment, while keeping Domain rules untouched and making startup, configuration, and migrations explicit.

This phase closes the gap between a locally runnable backend and a backend that is ready to be transported into a real deployment environment.

---

## What was delivered

### Multi-stage backend image

- Added a multi-stage `Dockerfile`
- Separate **build** and **runtime** stages
- Prisma Client generation incorporated into the image build flow
- Final runtime image kept leaner by copying only compiled output and Prisma runtime artifacts
- Production entrypoint aligned with the actual compiled Nest output

### Compose orchestration

- `docker-compose.yml` expanded to orchestrate:
  - `postgres`
  - `migrate`
  - `backend`
- PostgreSQL healthcheck wired into startup order
- Backend startup now depends on:
  - healthy database
  - successful migration completion

### Explicit migration flow

- Migration execution separated from the backend main runtime
- Dedicated one-shot `migrate` service running:

```bash
npm run prisma:deploy
Backend no longer hides schema preparation inside its main CMD
Environment contract
.env.example updated to document runtime configuration clearly
Separation made explicit between:
host-based local execution
intra-container execution
Compose now resolves variables with safe local defaults
Operational validation

Validated successfully in local containerized runtime:

backend image builds successfully
PostgreSQL becomes healthy
migration service executes successfully
backend starts after migration completion
Prisma connects inside the container network
GET /health/live returns 200
GET /health/ready returns 200
backend restart works without breaking runtime flow
docker compose config resolves correctly
Build/runtime issues uncovered and corrected

Containerization exposed real operational inconsistencies that were corrected during the phase:

legacy peer dependency conflict in the Docker build flow
package.json / package-lock.json synchronization issue
production entrypoint not matching compiled output
legacy @types/socket.io-client conflict
socket.io-client dependency restoration for build compatibility
Architectural decisions
D1 — Containerization stays outside the Domain

Docker, Compose, migrations, environment configuration, and operational startup flow remain infrastructure/bootstrap concerns.

Result: the Domain Layer remained completely untouched during the entire phase.

D2 — Build and runtime are separate responsibilities

The image build process compiles the app and prepares runtime artifacts.
The runtime container is focused on execution, not compilation.

Result: the container flow became cleaner, smaller, and closer to production expectations.

D3 — Migration must not be hidden inside backend startup

Schema preparation was separated into a dedicated one-shot migrate service.

Reason: migration is an operational responsibility, not part of the backend main runtime lifecycle.

Result: logs, startup order, and troubleshooting became much clearer.

D4 — Compose is the correct place to express runtime order

Service ordering was made explicit in docker-compose.yml using:

database health
migration completion
backend startup dependencies

Result: orchestration logic stays in the operational boundary instead of being buried in shell commands inside the app container.

D5 — Environment configuration must distinguish host runtime from container runtime

The project now makes it explicit that values such as DATABASE_URL differ between:

local execution from the host
execution inside Compose networking

Result: avoids the common mistake of reusing localhost assumptions inside containers.

D6 — Containerization is allowed to expose technical debt, but not rewrite architecture

The phase corrected build/runtime inconsistencies surfaced by Docker adoption, but did not use containerization as an excuse to redesign the core architecture.

Result: operational maturity improved without violating the Domain-first rule.

Operational validation
Full environment startup
docker compose down
docker compose up -d --build
docker compose ps

Expected behavior:

postgres becomes healthy
migrate runs and exits successfully
backend starts and remains running
Migration flow
docker compose logs --tail=100 migrate

Expected output includes:

Prisma schema loaded
database reachable at postgres:5432
migrations discovered
No pending migrations to apply. or successful migration application
Backend runtime
docker compose logs --tail=100 backend

Expected output includes:

application_starting
Nest bootstrap logs
health routes mapped
database_connecting
database_connected
application_started
Health checks
curl http://localhost:3000/health/live
curl http://localhost:3000/health/ready

Expected response for liveness:

{
  "status": "ok",
  "check": "liveness",
  "service": "truco-paulista-backend",
  "timestamp": "..."
}

Expected response for readiness:

{
  "status": "ok",
  "check": "readiness",
  "service": "truco-paulista-backend",
  "dependencies": {
    "database": "up"
  },
  "timestamp": "..."
}
Compose resolution
docker compose config

This validates the final resolved service graph, variables, startup conditions, and port mapping.

Restart validation
docker compose restart backend
docker compose logs -f --tail=50 backend

Expected behavior:

backend restarts normally
Prisma reconnects successfully
health endpoints continue to return 200
Validation commands
npm run lint
npm run build
npm run test
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 migrate
docker compose logs --tail=100 backend
curl http://localhost:3000/health/live
curl http://localhost:3000/health/ready
docker compose config
How to read the logs
Migration logs

Look for output such as:

Prisma schema loaded
datasource resolved
migrations found
migrations applied or already up to date

These indicate whether schema preparation completed successfully before backend startup.

Backend startup logs

Look for events such as:

application_starting
application_started

These confirm whether the application booted correctly inside the containerized environment.

Database logs

Look for events such as:

database_connecting
database_connected

These indicate whether the backend could reach PostgreSQL after container startup.

Compose state

Use docker compose ps to confirm the intended runtime split:

postgres → running and healthy
migrate → exited successfully
backend → running
Local troubleshooting
Scenario 1 — Image build fails before containers start

Symptoms:

docker compose up -d --build fails during image build

Likely cause:

dependency resolution problem
lockfile mismatch
build script inconsistency
missing runtime dependency

What to check:

Docker build logs
package.json
package-lock.json
TypeScript build output
dependency conflicts surfaced by npm ci
Scenario 2 — PostgreSQL is healthy, but backend does not start

Symptoms:

postgres is healthy
migrate may succeed
backend is not running

Likely cause:

runtime entrypoint issue
compiled output mismatch
app startup failure inside the container

What to check:

docker compose logs --tail=100 backend
compiled output path
CMD / production entrypoint
Scenario 3 — Migration fails and blocks backend startup

Symptoms:

postgres is healthy
migrate exits with failure
backend never starts

Meaning:

schema preparation failed before runtime

What to check:

docker compose logs --tail=100 migrate
migration files
datasource resolution
database credentials / environment values
Scenario 4 — Liveness is up, readiness is down

Symptoms:

/health/live returns ok
/health/ready returns database down

Meaning:

process is alive
dependency state is unhealthy

What to check:

database container status
DATABASE_URL
Prisma connectivity
backend logs for database connection events
Scenario 5 — Backend restart breaks runtime flow

Symptoms:

initial startup works
backend restart fails or hangs

Likely cause:

hidden startup coupling
missing runtime dependency
container startup assumptions that only worked on first boot

What to check:

docker compose restart backend
backend logs after restart
database reconnect behavior
runtime dependency availability
Files added / modified
Dockerfile
docker-compose.yml
.dockerignore
.env.example
package.json
package-lock.json
src/main.ts
Operationally relevant files
src/
├── main.ts
├── infrastructure/
│   └── persistence/
│       └── prisma/
│           └── prisma.service.ts
├── health/
│   ├── health.controller.ts
│   ├── health.service.ts
│   └── health.module.ts
Technical debt
Still open
ID	Description	Impact
DT-4	Turn order still lives in the Gateway as a transitional rule	Low for now; revisit later
DT-7	Metrics are still not implemented as a formal instrumentation layer	Medium
DT-8	No correlation ID strategy yet for socket-level tracing	Medium
DT-13	Docker build still depends on a transitional legacy-peer-deps workaround due to old Nest ecosystem dependency compatibility	Medium
Success criteria — final assessment
Criterion	Status
Multi-stage backend image builds successfully	✅
Compose orchestrates postgres + migrate + backend correctly	✅
PostgreSQL healthcheck controls startup order	✅
Migration flow is separated from backend startup	✅
Environment contract documented in .env.example	✅
Backend starts only after database + migration conditions are satisfied	✅
GET /health/live returns 200 in containerized runtime	✅
GET /health/ready returns 200 in containerized runtime	✅
Backend restart validated after startup	✅
Domain remains free of containerization concerns	✅