# Phase 16 — Runtime Hardening & Operational Safety

**Status:** Completed  
**Branch:** `feat/phase-16-runtime-hardening`

---

## Objective

Phase 16 focused on hardening the system from an operational and runtime perspective rather than introducing new product features.

The goal was to improve the safety, predictability, observability, and deploy robustness of the application across the NestJS backend, WebSocket gateway, container runtime, and auxiliary Python bot service, while preserving the existing Domain boundaries and avoiding architectural regressions.

This phase intentionally stayed outside Domain rules and game semantics.  
The emphasis was on:

- runtime protection
- transport hardening
- startup safety
- environment validation
- operational observability
- deploy consistency
- safer auxiliary-service behavior

---

## What was delivered

### 16.A — WebSocket rate limiting
A dedicated WebSocket rate limiting guard was introduced to protect the gateway against event spam and abusive socket usage.

Delivered outcomes:
- global WebSocket guard registration through application wiring
- per-tracker throttling using socket/auth identity
- temporary cooldown after threshold overflow
- structured warnings for blocked and triggered rate-limit scenarios
- environment-driven tuning for:
  - rate limit window
  - max allowed events
  - temporary block duration

This reduced gateway abuse exposure without leaking protection logic into Domain or use cases.

---

### 16.B — HTTP bootstrap hardening
The HTTP runtime bootstrap was hardened to align with production-grade expectations.

Delivered outcomes:
- `helmet` added to improve HTTP security defaults
- `compression` added for response optimization
- explicit CORS configuration driven by runtime environment
- structured bootstrap logging for:
  - startup begin
  - runtime config loaded
  - startup success
  - startup failure

This established a more defensible transport layer and reduced the gap between local and hosted runtime behavior.

---

### 16.C — HTTP correlation and request logging
A request context and correlation layer was added to the HTTP pipeline.

Delivered outcomes:
- request context middleware generating or propagating `x-request-id`
- response header propagation of the active request id
- global HTTP request logging interceptor
- structured logs for:
  - request start
  - request completion
  - request failure

This made request tracing much easier and created a stronger operational baseline for future debugging and observability improvements.

---

### 16.D — In-memory HTTP metrics endpoint
A minimal metrics layer was added without introducing external observability dependencies.

Delivered outcomes:
- in-memory HTTP metrics service
- request metrics interceptor
- `/health/metrics` endpoint
- aggregation for:
  - total requests
  - failed requests
  - accumulated duration
  - average duration
  - counts by status code

This created a lightweight observability foundation while keeping the implementation incremental and easy to reason about.

---

### 16.E — Environment validation and startup safety
Runtime configuration loading was formalized and startup became fail-fast for invalid critical settings.

Delivered outcomes:
- centralized runtime config loading
- explicit validation for required environment variables
- positive integer checks for numeric runtime values
- boolean parsing for feature flags
- URL validation for runtime origins and remote services
- production secret sanity checks against placeholder values

This reduced hidden misconfiguration risk and made startup failures clearer and earlier.

---

### 16.F — Deploy drift reduction and explicit migration policy
Container runtime behavior was hardened to reduce drift between local orchestration and hosted environments.

Delivered outcomes:
- explicit container entrypoint
- explicit `RUN_MIGRATIONS_ON_BOOT` policy
- separation between:
  - one-shot migration service in local compose
  - optional startup migration mode for single-container environments
- improved container startup predictability
- Docker/Compose env alignment for auth and runtime requirements

This made deployment intent explicit and removed ambiguity around when migrations should or should not run during boot.

---

### 16.G — Gateway hardening and matchmaking extraction

#### 16.G.A — Matchmaking DI and orchestration extraction
The WebSocket gateway was reduced in responsibility by improving matchmaking wiring and extracting orchestration logic.

Delivered outcomes:
- `MatchmakingQueueManager` converted to proper module wiring
- `MatchmakingPairingPolicy` converted to proper module wiring
- `GatewayMatchmakingService` introduced to absorb queue/fallback orchestration
- `GameGateway` stopped directly owning as much matchmaking flow state
- improved separation between:
  - socket transport concerns
  - matchmaking orchestration
  - room management responsibilities

This reduced direct gateway concentration and improved maintainability without redesigning the entire gateway in one step.

#### 16.G.B — WebSocket transport hardening
The gateway transport policy was aligned with the HTTP hardening work from earlier micro-steps.

Delivered outcomes:
- WebSocket CORS changed from permissive wildcard to runtime-configured origin
- gateway error payloads standardized to:
  - `code`
  - `message`
- transport-side rejection responses became more predictable for clients
- gateway logging remained structured and operationally useful

This removed a major inconsistency between HTTP and WebSocket security posture.

---

### 16.H — Python bot timeout/fallback hardening

#### 16.H.A — Safer timeout and fallback policy
The Python bot adapter and its runtime config were hardened without changing the synchronous `BotDecisionPort` boundary.

Delivered outcomes:
- safer timeout validation with bounded accepted range
- explicit classification for remote bot failures:
  - `timeout`
  - `http_error`
  - `invalid_payload`
  - `transport_error`
- clearer fallback logging
- fallback to heuristic bot preserved as the safe runtime default
- stricter mapping and validation of remote decision payloads

This improved runtime safety around the external decision service while preserving the existing application boundary.

---

### 16.I — Auxiliary Python bot service hardening
The `python-bot-service` was hardened to behave more like a real auxiliary production service.

Delivered outcomes:
- stronger runtime config validation in `config.py`
- optional docs exposure policy via configuration
- structured startup logging
- request logging middleware
- consistent exception handling for:
  - validation errors
  - unexpected internal errors
- stricter request/response schemas
- updated `.env.example` aligned with runtime config

This improved the operational maturity of the Python service and strengthened the contract between the Nest backend and the auxiliary HTTP decision service.

---

## Files introduced or updated

### Backend runtime / observability / security
- `src/app.module.ts`
- `src/main.ts`
- `src/application/http/request-context.types.ts`
- `src/application/http/middleware/request-context.middleware.ts`
- `src/application/http/interceptors/request-logging.interceptor.ts`
- `src/application/http/interceptors/request-metrics.interceptor.ts`
- `src/application/http/metrics/http-metrics.service.ts`
- `src/application/runtime/env/runtime-config.ts`
- `src/gateway/security/socket-rate-limit.guard.ts`
- `src/health/health.controller.ts`
- `src/health/health.module.ts`

### Gateway / runtime hardening
- `src/gateway/game.gateway.ts`
- `src/gateway/matchmaking/matchmaking-queue-manager.ts`
- `src/gateway/matchmaking/matchmaking-pairing-policy.ts`
- `src/gateway/matchmaking/gateway-matchmaking.service.ts`
- `src/modules/game.module.ts`

### Bot runtime hardening
- `src/infrastructure/bots/python-bot.adapter.ts`
- `src/infrastructure/bots/python-bot.config.ts`
- `src/auth/strategies/google-auth.strategy.ts`
- `src/auth/strategies/github-auth.strategy.ts`

### Python auxiliary service
- `python-bot-service/app/config.py`
- `python-bot-service/app/main.py`
- `python-bot-service/app/schemas.py`
- `python-bot-service/.env.example`

### Container / deploy
- `Dockerfile`
- `docker-compose.yml`
- `docker/entrypoint.sh`
- `.env.example`

### Tests
- `test/unit/gateway/security/socket-rate-limit.guard.spec.ts`
- `src/health/health.controller.spec.ts`
- existing health-related validation flows updated and revalidated

---

## Architectural impact

This phase did **not** change Domain rules.

No game semantics, card comparison rules, Truco scoring logic, or Domain invariants were intentionally modified here.

The architectural effect was concentrated on:

- runtime hardening
- transport consistency
- module wiring quality
- safer boot behavior
- deploy clarity
- observability maturity
- auxiliary service reliability

Key architectural gains:
- better separation between gateway transport and matchmaking orchestration
- stronger startup and environment discipline
- more predictable operational behavior
- more coherent security posture between HTTP and WebSocket boundaries
- stronger contract alignment between Nest backend and Python auxiliary service

---

## Validation performed

The phase was validated incrementally across its micro-steps.

Validation included:
- ESLint and Prettier compliance
- TypeScript build validation
- targeted unit tests
- health endpoint validation
- metrics endpoint verification
- request correlation verification
- WebSocket rate limit verification
- Docker Compose runtime validation
- migration behavior verification in container startup
- Python auxiliary service runtime verification
- `/decide` contract validation against the hardened Python service

Representative validations performed during the phase:
- backend lint and build passing
- WebSocket rate limit guard tests passing
- health and metrics endpoints returning expected payloads
- `x-request-id` propagation confirmed
- `/health/metrics` counters increasing correctly
- Docker image build and Compose orchestration validated
- Python auxiliary service startup confirmed with Uvicorn
- Python service `health/live`, `health/ready`, and `POST /decide` validated successfully

---

## Trade-offs and decisions

### 1. Incremental hardening over full redesign
The gateway was not fully rewritten.  
Instead, the phase used targeted extractions and safer wiring improvements to reduce risk.

### 2. In-memory metrics instead of full metrics stack
A lightweight in-memory metrics endpoint was preferred over introducing Prometheus or external observability infrastructure during this phase.

### 3. Synchronous bot boundary preserved
The `BotDecisionPort` remained synchronous.  
The Python bot hardening improved fallback and runtime safety without forcing a larger async redesign into the gateway flow.

### 4. Explicit migration policy instead of hidden startup behavior
Container migration behavior was made explicit through runtime flags and compose orchestration to reduce ambiguity and drift.

### 5. Runtime strictness accepted as a feature, not a regression
Some local startup failures happened during the phase because env validation became stricter.  
This was treated as intended hardening, not as a defect.

---

## Final status

Phase 16 is considered **completed**.

It successfully transformed the system into a more production-defensible runtime without changing the core game Domain.

By the end of the phase, the project gained:

- safer HTTP startup
- safer WebSocket transport behavior
- request correlation and logging
- basic runtime metrics
- stricter environment validation
- clearer deploy behavior
- reduced gateway concentration
- safer Python bot timeout/fallback behavior
- a more robust auxiliary Python bot service

This phase materially improved the operational maturity of the system and prepared the project for later phases with a stronger runtime baseline.

---

## Closing note

Phase 16 was not about making the game richer.  
It was about making the system **safer, clearer, easier to diagnose, and more trustworthy in real runtime conditions**.

That objective was achieved without violating the architectural boundaries established by the project.