# Phase 25 — Live Python Bot Integration

## Objective

Move the Python bot from a prepared integration into the real match decision flow while preserving the application boundary, legal game rules, and heuristic fallback.

Phase 25 does not implement the final Python strategy engine. Its purpose is to make the remote decision path real, observable, validated, and operationally reproducible. Advanced strategy belongs to Phase 26.

## 25.A — Async decision boundary

`BotDecisionPort` became asynchronous so remote adapters can participate in the real runtime flow.

The Gateway now awaits bot decisions both in the normal bot turn and in the card-only fallback used by mixed human + bot teams.

## 25.B — Contract alignment

The TypeScript and Pydantic contracts were aligned with the real `BotDecisionContext`, including:

- 1v1 and 2v2 mode;
- actor seat and team;
- partner seat and signals;
- current round and ordered plays;
- player hand;
- Truco / 6 / 9 / 12 state;
- Mão de 11 actions;
- score;
- hand progress.

The response contract supports the complete bot action space required by the application boundary.

## 25.C — Live remote decisions

`PythonBotAdapter.decide()` now calls `POST /decide` in the real match flow:

```text
GameGateway
    ↓
BotDecisionPort
    ↓
PythonBotAdapter
    ↓ POST /decide
FastAPI
    ↓
validated remote decision
    ↓
GameGateway
```

Remote decisions are structurally and semantically validated before execution.

Fallback remains available for:

- timeout;
- transport failure;
- non-2xx HTTP response;
- invalid JSON;
- invalid response shape;
- card outside the bot hand;
- unavailable action;
- unsupported decision state.

## End-to-end proof

The live flow was validated locally with PostgreSQL, NestJS, FastAPI and the React frontend running together.

During a real 1v1 match:

- the backend selected the Python adapter;
- the adapter emitted `python_bot_request_started`;
- the adapter emitted `python_bot_request_succeeded`;
- FastAPI returned successful `POST /decide` responses;
- remote cards were executed by `GameGateway`.

Observed remote cards included `JO`, `4P` and `KC`.

This proves the complete path:

```text
real match
→ NestJS
→ PythonBotAdapter
→ HTTP
→ FastAPI
→ remote decision
→ semantic validation
→ GameGateway execution
```

## Automated validation

Phase 25 closed its backend validation with:

```text
33 test suites passed
238 tests passed
```

The Python source was also compiled successfully with:

```powershell
py -m compileall app
```

## 25.D — Operational hardening

### PostgreSQL host port

The previous host port `51214` collided with a Windows excluded TCP range during local validation.

The local default is now:

```text
localhost:5433 → container:5432
```

The internal PostgreSQL container port remains `5432`.

### Local vs Compose Python URL

Local development uses:

```env
PYTHON_BOT_BASE_URL=http://localhost:8000
```

The containerized backend uses:

```env
DOCKER_PYTHON_BOT_BASE_URL=http://python-bot-service:8000
```

This prevents a container from incorrectly using its own `localhost` to reach FastAPI.

### Python container

Compose defines `python-bot-service`, built from:

```text
python-bot-service/Dockerfile
```

The service exposes port `8000` and has a readiness healthcheck at:

```text
/health/ready
```

### Python generated files

The repository ignores:

```text
__pycache__/
*.py[cod]
.venv/
venv/
```

Previously tracked cache files are removed from Git so future Python executions do not dirty the working tree.

## Local development

### PostgreSQL

```powershell
docker compose up -d postgres
```

### Python bot

```powershell
cd python-bot-service
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### Backend

```powershell
npm run start:dev
```

### Frontend

```powershell
cd frontend-app
npm run dev
```

## Full Compose runtime

Stop manually started services using ports `3000` or `8000`, then run:

```powershell
docker compose up -d --build
docker compose ps
```

Expected long-running services:

```text
truco-postgres
truco-python-bot
truco-backend
```

`truco-migrate` is a one-shot service and should exit successfully after migrations.

## Out of scope

Phase 26 owns the Python strategy layer:

- aggressive / balanced / cautious personalities;
- hand-strength evaluation;
- tactical card selection;
- Truco decision heuristics;
- partner-signal interpretation;
- strategy comparison against the TypeScript heuristic baseline.
