# Phase 8 — Production Deployment

> **Status:** ✅ Complete (core scope)
> **Branch:** `main`

---

## Objective

Transport the already containerized backend into a real cloud runtime without violating the architectural boundaries established in previous phases.

The goal was not just to "publish the app." It was to deploy the backend into a production-like environment with a managed PostgreSQL database, explicit runtime configuration, working health checks, and an automated migration flow compatible with the platform constraints.

This phase closes the gap between a locally validated containerized runtime and a publicly reachable backend running in the cloud.

---

## What was delivered

### Production deployment on Render

- Backend deployed successfully to **Render**
- Service published at a real public URL
- Docker-based deployment preserved from the containerized baseline
- Production runtime aligned with the existing multi-stage image strategy
- Backend now starts in a real hosted environment instead of only local Compose orchestration

### Managed PostgreSQL in production

- Dedicated **Render Postgres** instance provisioned
- Production database kept separate from local Docker PostgreSQL
- Backend connected using the platform-provided internal connection URL
- Region alignment preserved between app service and database service

### Production environment contract

- Runtime environment validated in production with:
  - `NODE_ENV=production`
  - `PORT=10000`
  - `DATABASE_URL=<Render Internal Database URL>`
- Incorrect local database URL usage was identified and corrected
- Production service no longer depends on localhost assumptions from Docker Compose

### Health and readiness validation in production

- Public validation completed for:
  - `GET /health/live`
  - `GET /health/ready`
- Service confirmed reachable at the Render public URL
- Health endpoints remained consistent between local container runtime and cloud runtime

### Automated migration flow for Render Free

- Render Free plan limitation identified:
  - **Pre-Deploy Command is unavailable on free instances**
- Migration automation adapted to platform constraints
- `prisma migrate deploy` moved into container startup flow
- Automated schema preparation now runs before Nest runtime boot in production
- All pending migrations applied successfully during deploy

### End-to-end production validation

Validated successfully in hosted production runtime:

- container image builds successfully on Render
- managed PostgreSQL is reachable from the hosted backend
- Prisma migrations execute automatically in production
- Nest application starts successfully after migrations
- Prisma connects successfully to the production database
- `GET /health/live` returns success in production
- `GET /health/ready` returns success in production
- service is marked live by Render
- public backend URL is reachable

---

## Build/runtime issues uncovered and corrected

Production deployment exposed real environment inconsistencies that were corrected during the phase:

- Render initially failed because `Dockerfile` was not present in the deployed `main` branch
- deployment target branch and Git state had to be aligned with the actual production branch
- Render service was initially configured with **Node runtime** instead of **Docker runtime**
- wrong root/build assumptions were detected and corrected during service setup
- production database configuration was initially pointing to local development PostgreSQL:
  - `localhost:51214`
- production database URL was replaced with the proper Render internal database URL
- Render Free plan limitation blocked the original migration automation strategy
- migration flow was adapted without changing Domain or Application architecture

---

## Architectural decisions

### D1 — Production deployment remains outside the Domain

Cloud runtime, managed database provisioning, environment variables, deployment platform configuration, and hosted startup flow remain infrastructure/bootstrap concerns.

Result: the Domain Layer remained completely untouched during the entire phase.

### D2 — Production must preserve the containerization contract already validated locally

The deployed backend continues to use the Docker image flow established in Phase 7 instead of switching to a different runtime model just because the platform supports it.

Reason: production should transport the validated runtime, not invent a second execution model.

Result: local container validation and hosted execution stay operationally consistent.

### D3 — Managed database configuration must replace localhost assumptions

A hosted service must not use development URLs such as `localhost` for database access.

Reason: localhost inside a hosted container refers to the container itself, not to the managed database service.

Result: production connectivity now correctly depends on the managed Render Postgres internal network URL.

### D4 — Migration automation may be adapted to platform constraints without changing the architecture

The original preferred approach was to keep migration separate from the backend runtime, matching the Compose design from Phase 7.

However, Render Free blocks pre-deploy commands.

Reason: platform limitation required an operational workaround.

Result: migrations were moved into container startup using:

```bash
npx prisma migrate deploy && node dist/src/main.js

This is an operational compromise, not an architectural redesign.

D5 — Platform limitations can create technical debt, but must not justify boundary violations

The Render Free migration workaround is acceptable because it changes operational startup behavior only.

Reason: the workaround affects bootstrap/runtime flow, not Domain rules, Use Cases, or Ports.

Result: the project remains architecturally correct while accepting a temporary operational compromise.

D6 — Health checks are the correct operational contract for hosted validation

Production validation should rely on explicit liveness/readiness endpoints rather than assumptions based only on deploy success logs.

Reason: a service can be deployed but not actually ready.

Result: cloud validation now uses the same operational contract established locally in Phase 7.

Production validation
Public service URL

Backend published successfully at:

https://truco-paulista-backend.onrender.com
Health checks

Validated successfully in production:

curl https://truco-paulista-backend.onrender.com/health/live
curl https://truco-paulista-backend.onrender.com/health/ready

Expected behavior:

liveness returns success
readiness returns success
database dependency reports healthy through readiness
Migration validation

Deploy logs confirmed:

Prisma CLI starts correctly
migrations are discovered
migrations are applied successfully
startup continues after migration completion

Expected log behavior includes entries equivalent to:

All migrations have been successfully applied.
database_connected
Nest application successfully started
Your service is live
Database connectivity validation

Production logs confirmed:

database_connecting
database_connected
connection succeeded on first retry cycle

This validates that the backend can reach the managed PostgreSQL instance through the production DATABASE_URL.

Hosted runtime validation

Render logs confirmed the final startup sequence:

container boots
migrations execute
Nest starts
health routes are mapped
Prisma connects
service becomes live
Validation commands
Local Git validation
git checkout main
git pull origin main
git status
dir Dockerfile
Production health validation
curl https://truco-paulista-backend.onrender.com/health/live
curl https://truco-paulista-backend.onrender.com/health/ready
Render-side operational validation

Use the Render dashboard to validate:

service runtime = Docker
database region matches backend region
DATABASE_URL points to Render internal database URL
deploy logs include migration execution
deploy logs include successful Nest startup
service status = live
How to read the logs
Migration logs

Look for output such as:

Prisma CLI banner
migrations discovered
migrations applied successfully
all migrations up to date

These indicate whether schema preparation completed before the application runtime booted.

Backend startup logs

Look for events such as:

application_starting
Nest bootstrap logs
route mapping logs
application_started

These confirm whether the application booted correctly in hosted production.

Database logs

Look for events such as:

database_connecting
database_connected

These indicate whether the backend could reach the managed PostgreSQL service with the configured production environment variables.

Render platform logs

Look for events such as:

build completed
image pushed successfully
service marked live
primary URL published

These indicate whether the platform accepted the image and the runtime became publicly available.

Production troubleshooting
Scenario 1 — Render cannot find Dockerfile

Symptoms:

deploy fails before build
Render logs show:
failed to read dockerfile
no such file or directory

Likely cause:

Dockerfile not committed to the deployed branch
service pointing to the wrong branch
wrong Docker build context assumptions

What to check:

GitHub main branch contents
service branch configuration
Dockerfile path in Render settings
Scenario 2 — Service builds but cannot connect to the database

Symptoms:

application starts partially
Prisma fails to connect
logs reference localhost or local port assumptions

Likely cause:

production DATABASE_URL still points to local Docker/dev database
wrong database URL copied into Render environment variables

What to check:

Render Environment tab
actual DATABASE_URL
whether the URL is the Render Internal Database URL
Scenario 3 — Health endpoint is live but readiness fails

Symptoms:

/health/live works
/health/ready fails

Meaning:

the process is alive
dependency state is unhealthy

What to check:

database connectivity
current environment variables
Prisma connection logs
migration completion state
Scenario 4 — Migration automation is needed on Render Free

Symptoms:

deploy succeeds only when schema already exists
no pre-deploy command is available in settings

Meaning:

Render Free plan limitation blocks the preferred migration strategy

What to check:

plan capabilities
Docker startup command
whether npx prisma migrate deploy is executed before app startup
Scenario 5 — Deploy succeeds but runtime model differs from the local baseline

Symptoms:

Render configured with Node runtime
build/start commands entered manually
service behaves differently than the Phase 7 container baseline

Likely cause:

runtime drift between local validation and production hosting

What to check:

Render runtime type
Docker configuration
Dockerfile path
build context directory
Files added / modified
Dockerfile
README.md
Render service configuration
Render environment configuration
Render managed PostgreSQL provisioning
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

prisma/
├── schema.prisma
└── migrations/

Dockerfile
package.json
.env.example
Technical debt
Still open
ID	Description	Impact
DT-4	Turn order still lives in the Gateway as a transitional rule	Low for now; revisit later
DT-7	Metrics are still not implemented as a formal instrumentation layer	Medium
DT-8	No correlation ID strategy yet for socket-level tracing	Medium
DT-13	Docker build still depends on a transitional legacy-peer-deps workaround due to old Nest ecosystem dependency compatibility	Medium
DT-14	On Render Free, Prisma migrations run inside container startup instead of an isolated pre-deploy/job flow	Medium
Success criteria — final assessment
Criterion	Status
Backend successfully deployed to hosted production runtime	✅
Managed PostgreSQL provisioned and connected successfully	✅
Docker runtime preserved in production instead of switching execution model	✅
Production environment contract configured correctly	✅
Localhost database assumptions removed from production config	✅
Public GET /health/live validated successfully	✅
Public GET /health/ready validated successfully	✅
Prisma migrations automated successfully in Render Free runtime	✅
Nest application starts after migration execution in production	✅
Service marked live and reachable at public Render URL	✅
Domain remains free of deployment concerns	✅