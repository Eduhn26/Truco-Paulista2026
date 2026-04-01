from fastapi import FastAPI

from app.config import settings
from app.schemas import (
    BotDecisionRequest,
    BotDecisionResponse,
    HealthResponse,
    PassDecisionResponse,
)

app = FastAPI(
    title='Truco Paulista Python Bot Service',
    version='0.2.0',
    description=(
        'External decision service for Truco Paulista bots. '
        'This service keeps the backend bot boundary stable while exposing '
        'an explicit HTTP contract for infrastructure adapters.'
    ),
)


@app.get('/health/live', response_model=HealthResponse)
def get_liveness() -> HealthResponse:
    # NOTE: Liveness must stay dependency-free so process health remains distinct
    # from any future downstream integration failures.
    return HealthResponse(
        status='ok',
        service=settings.service_name,
        environment=settings.app_env,
    )


@app.get('/health/ready', response_model=HealthResponse)
def get_readiness() -> HealthResponse:
    # NOTE: Readiness is intentionally identical for now because Phase 15.B still
    # has no external dependencies. This keeps the endpoint stable for later hardening.
    return HealthResponse(
        status='ok',
        service=settings.service_name,
        environment=settings.app_env,
    )


@app.post('/decide', response_model=BotDecisionResponse)
def decide(payload: BotDecisionRequest) -> BotDecisionResponse:
    # NOTE: Phase 15.B locks the external contract first.
    # Real strategy comes later, after the HTTP boundary is stable enough for the adapter.
    if len(payload.player.hand) == 0:
        return PassDecisionResponse(
            action='pass',
            reason='empty-hand',
        )

    if payload.current_round is None:
        return PassDecisionResponse(
            action='pass',
            reason='missing-round',
        )

    # NOTE: Returning an explicit fallback keeps unsupported situations observable
    # without inventing ad-hoc response shapes outside the agreed contract.
    return PassDecisionResponse(
        action='pass',
        reason='unsupported-state',
    )