# Phase 15 — Python AI Service

> **Status:** ✅ Complete (current planned scope)
> **Branch:** `feat/phase-15-python-ai-service`

---

## Objective

Introduce an external Python-based bot service without breaking the architectural boundaries already stabilized in earlier phases.

The goal of this phase was **not** to make the bot truly intelligent yet.  
The goal was to create a **clean, testable, observable, and future-ready integration surface** so the project can evolve from a local heuristic bot toward an external AI decision service while preserving:

- the existing Application boundary
- the current Domain purity
- the Gateway orchestration role
- the fallback local baseline

---

## What was delivered

### External Python bot service bootstrap

A new isolated service was introduced under `python-bot-service/` with:

- FastAPI application bootstrap
- Pydantic-based request/response validation
- dedicated health endpoints
- local runtime support through virtual environment setup

This established the first external runtime dedicated to bot decisions, without leaking Python concerns into the NestJS backend.

### Stable HTTP decision contract

The Python service now exposes a stable `POST /decide` contract with:

- transport-agnostic request shape
- explicit response shape aligned with the backend decision space
- supported pass reasons:
  - `empty-hand`
  - `missing-round`
  - `unsupported-state`

This formalized the external decision surface before wiring it into runtime selection.

### Infrastructure configuration for remote bot integration

The backend now includes explicit configuration for the Python service through Infrastructure-only wiring:

- `PYTHON_BOT_ENABLED`
- `PYTHON_BOT_BASE_URL`
- `PYTHON_BOT_TIMEOUT_MS`

This keeps service coordinates and remote integration settings out of Gateway orchestration.

### Python bot adapter introduced in Infrastructure

A dedicated `PythonBotAdapter` was added to Infrastructure with:

- request mapping from `BotDecisionContext` to HTTP payload
- response mapping from HTTP payload back to `BotDecision`
- strict response validation
- safe fallback behavior to the local heuristic adapter

This preserves the existing boundary while preparing the project for future remote decision evolution.

### Selectable adapter wiring in `GameModule`

`BOT_DECISION_PORT` is now resolved through selectable Infrastructure wiring:

- `HeuristicBotAdapter` remains the safe baseline
- `PythonBotAdapter` becomes the selected implementation when enabled by config

This keeps the Application layer unchanged and prevents adapter knowledge from leaking into Gateway code.

### Runtime observability for adapter selection and fallback

Structured logs were added to make the new integration visible at runtime:

- selected bot adapter at module wiring time
- deferred/fallback decision behavior
- remote attempt start
- remote request failure
- rejected response shape
- transport error
- fallback application

This makes the integration operationally diagnosable instead of being a silent black box.

---

## Files introduced or updated

### Python service

- `python-bot-service/app/__init__.py`
- `python-bot-service/app/config.py`
- `python-bot-service/app/main.py`
- `python-bot-service/app/schemas.py`
- `python-bot-service/.env.example`
- `python-bot-service/requirements.txt`
- `python-bot-service/README.md`

### Backend

- `src/infrastructure/bots/python-bot.config.ts`
- `src/infrastructure/bots/python-bot.adapter.ts`
- `src/modules/game.module.ts`
- `.env.example` (backend-side Python adapter config support)

---

## Architectural impact

### What stayed stable

This phase intentionally preserved the architectural rules established earlier:

- `BotDecisionPort` remains the official Application boundary
- Domain remains untouched
- Gateway still depends only on the stable bot decision contract
- Python integration remains an Infrastructure concern
- heuristic bot remains the baseline fallback

### Why this matters

Without this phase, adding an external AI runtime would likely force one of the common architectural mistakes:

- pushing HTTP concerns into Gateway orchestration
- changing the Domain for infrastructure reasons
- redesigning the decision boundary prematurely
- replacing the local bot baseline before the remote path became reliable

Instead, this phase introduced the external runtime **as an adapter evolution**, not as a system-wide rewrite.

---

## Important limitation intentionally preserved

This phase does **not** yet make remote HTTP bot decisions the authoritative live decision path.

That limitation is intentional.

The current design preserves:

- stable existing boundary behavior
- safe local fallback
- runtime observability
- external contract maturity

This means the project is now structurally ready for future evolution, but still protects gameplay flow from unsafe remote activation.

---

## Validation performed

### Python service validation

- FastAPI service started successfully
- `GET /health/live` validated
- `GET /health/ready` validated
- `POST /decide` validated with:
  - `missing-round`
  - `empty-hand`
  - `unsupported-state`

### Backend validation

- lint passed
- build passed
- tests passed
- adapter selection wiring validated
- backend startup validated with Python adapter enabled
- runtime observability additions validated without regression

---

## Trade-offs and decisions

### Decision: preserve boundary stability

The project roadmap explicitly required preserving the existing bot boundary.  
So this phase avoided the tempting shortcut of redesigning the Application contract just to fit remote transport.

### Decision: keep heuristic fallback

The local heuristic bot remains essential because it gives the system:

- safe local baseline
- deterministic behavior during remote instability
- clean fallback path during progressive integration

### Decision: prioritize observability before remote authority

Remote integration without observability would create a black box that is hard to debug and hard to defend architecturally.

This phase therefore prioritized:

- explicit adapter selection visibility
- explicit fallback visibility
- explicit remote attempt failure visibility

before trying to make the remote path authoritative.

---

## Outcome

Phase 15 successfully transformed the bot architecture from:

- local-only heuristic decision support

into:

- externally prepared
- contract-driven
- observable
- selectable
- fallback-safe bot infrastructure

This phase does not finish the AI journey.  
It creates the integration foundation that makes future AI evolution technically defensible.

---

## Final status

Phase 15 is complete for its currently planned scope.

The project now has:

- an external Python bot runtime
- a stable decision HTTP contract
- a dedicated Infrastructure adapter
- configurable adapter selection
- safe local fallback
- operational observability for runtime diagnosis

This is the correct architectural stopping point before any future work on:

- true remote decision authority
- stronger end-to-end activation
- model-backed strategy evolution
- replay-driven training pipelines