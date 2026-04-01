from fastapi import FastAPI

from app.config import settings
from app.schemas import BotDecisionContextPayload, BotDecisionResponse, HealthResponse

app = FastAPI(
    title='Truco Paulista Python Bot Service',
    version='0.1.0',
    description=(
        'External decision service for Truco Paulista bots. '
        'This service is introduced in Phase 15 without changing the backend bot boundary.'
    ),
)


@app.get('/health/live', response_model=HealthResponse)
def get_liveness() -> HealthResponse:
    """Simple liveness endpoint for local runtime validation."""
    return HealthResponse(
        status='ok',
        service=settings.service_name,
        environment=settings.app_env,
    )


@app.get('/health/ready', response_model=HealthResponse)
def get_readiness() -> HealthResponse:
    """
    Readiness endpoint for future container/orchestration checks.

    NOTE:
    There are no external dependencies yet in Phase 15.A.
    """
    return HealthResponse(
        status='ok',
        service=settings.service_name,
        environment=settings.app_env,
    )


@app.post('/decide', response_model=BotDecisionResponse)
def decide(_payload: BotDecisionContextPayload) -> BotDecisionResponse:
    """
    Setup-phase stub endpoint.

    NOTE:
    This does not implement real bot intelligence yet.
    The goal is to validate that:
    - FastAPI is running
    - Pydantic validates structured input
    - the service already exposes the future decision surface
    """
    return BotDecisionResponse(
        action='pass',
        reason='setup-default',
    )