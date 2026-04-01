# Truco Paulista — Python Bot Service

External bot decision service introduced in Phase 15.

## Goal

Provide an isolated Python runtime for future bot decision strategies without changing the backend `BotDecisionPort` and without leaking Python concerns into the NestJS core.

## Scope of Phase 15.A

- FastAPI bootstrap
- Pydantic request/response validation
- health endpoints
- provisional `/decide` stub for local integration readiness

## Run locally

```bash
cd python-bot-service
python -m venv .venv