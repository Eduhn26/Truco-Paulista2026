# Truco Paulista — Python Bot Service

External bot decision service introduced in Phase 15.

## Goal

Provide an isolated Python runtime for future bot decision strategies without changing the backend `BotDecisionPort` and without leaking Python concerns into the NestJS core.

## Scope of Phase 15.A

- FastAPI bootstrap
- Pydantic request/response validation
- health endpoints
- provisional `/decide` stub for local integration readiness

## Scope of Phase 15.B

- stable HTTP request contract for `POST /decide`
- stable HTTP response contract aligned with the existing TypeScript bot boundary
- explicit pass reasons matching the current backend contract
- no room/socket metadata in the decision payload

## Run locally

```bash
cd python-bot-service
py -m venv .venv