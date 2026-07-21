import json
import logging
import time
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.config import settings
from app.schemas import (
    BotDecisionRequest,
    BotDecisionResponse,
    HealthResponse,
    PassDecisionResponse,
)
from app.strategy.engine import StrategyEngine

logging.basicConfig(
    level=getattr(logging, settings.log_level),
    format='%(asctime)s %(levelname)s [%(name)s] %(message)s',
)

logger = logging.getLogger('python-bot-service')


@asynccontextmanager
async def lifespan(_: FastAPI):
    logger.info(
        json.dumps(
            {
                'layer': 'service',
                'component': 'python_bot_service',
                'event': 'startup',
                'status': 'started',
                'service': settings.service_name,
                'version': settings.service_version,
                'environment': settings.app_env,
                'host': settings.host,
                'port': settings.port,
                'docsEnabled': settings.docs_enabled,
            }
        )
    )

    yield

    logger.info(
        json.dumps(
            {
                'layer': 'service',
                'component': 'python_bot_service',
                'event': 'shutdown',
                'status': 'stopped',
                'service': settings.service_name,
                'environment': settings.app_env,
            }
        )
    )


app = FastAPI(
    title='Truco Paulista Python Bot Service',
    version=settings.service_version,
    description=(
        'External decision service for Truco Paulista bots. '
        'This service keeps the backend bot boundary stable while exposing '
        'an explicit HTTP contract for infrastructure adapters.'
    ),
    docs_url='/docs' if settings.docs_enabled else None,
    redoc_url='/redoc' if settings.docs_enabled else None,
    openapi_url='/openapi.json' if settings.docs_enabled else None,
    lifespan=lifespan,
)

strategy_engine = StrategyEngine()


@app.middleware('http')
async def request_logging_middleware(request: Request, call_next):
    started_at = time.perf_counter()

    try:
        response = await call_next(request)
    except Exception:
        duration_ms = round((time.perf_counter() - started_at) * 1000, 2)

        logger.exception(
            json.dumps(
                {
                    'layer': 'service',
                    'component': 'python_bot_service',
                    'event': 'http_request_failed',
                    'status': 'failed',
                    'method': request.method,
                    'path': request.url.path,
                    'durationMs': duration_ms,
                    'environment': settings.app_env,
                }
            )
        )
        raise

    duration_ms = round((time.perf_counter() - started_at) * 1000, 2)

    logger.info(
        json.dumps(
            {
                'layer': 'service',
                'component': 'python_bot_service',
                'event': 'http_request_completed',
                'status': 'succeeded',
                'method': request.method,
                'path': request.url.path,
                'statusCode': response.status_code,
                'durationMs': duration_ms,
                'environment': settings.app_env,
            }
        )
    )

    return response


@app.exception_handler(RequestValidationError)
async def request_validation_exception_handler(
    request: Request,
    exc: RequestValidationError,
) -> JSONResponse:
    logger.warning(
        json.dumps(
            {
                'layer': 'service',
                'component': 'python_bot_service',
                'event': 'request_validation_failed',
                'status': 'failed',
                'method': request.method,
                'path': request.url.path,
                'errors': exc.errors(),
            }
        )
    )

    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            'status': 'error',
            'code': 'validation_error',
            'message': 'Invalid request payload.',
            'details': exc.errors(),
        },
    )


@app.exception_handler(Exception)
async def unexpected_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception(
        json.dumps(
            {
                'layer': 'service',
                'component': 'python_bot_service',
                'event': 'unexpected_error',
                'status': 'failed',
                'method': request.method,
                'path': request.url.path,
                'errorType': type(exc).__name__,
                'errorMessage': str(exc),
            }
        )
    )

    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            'status': 'error',
            'code': 'unexpected_error',
            'message': 'Unexpected internal error.',
        },
    )


@app.get('/health/live', response_model=HealthResponse)
def get_liveness() -> HealthResponse:
    return HealthResponse(
        status='ok',
        service=settings.service_name,
        environment=settings.app_env,
    )


@app.get('/health/ready', response_model=HealthResponse)
def get_readiness() -> HealthResponse:
    return HealthResponse(
        status='ok',
        service=settings.service_name,
        environment=settings.app_env,
    )


@app.post('/decide', response_model=BotDecisionResponse)
def decide(payload: BotDecisionRequest) -> BotDecisionResponse:
    logger.info(
        json.dumps(
            {
                'layer': 'service',
                'component': 'python_bot_service',
                'event': 'decision_requested',
                'status': 'started',
                'matchId': payload.match_id,
                'profile': payload.profile,
                'playerId': payload.player.player_id,
                'handSize': len(payload.player.hand),
                'hasCurrentRound': payload.current_round is not None,
            }
        )
    )

    if len(payload.player.hand) == 0:
        response = PassDecisionResponse(
            action='pass',
            reason='empty-hand',
        )

        logger.info(
            json.dumps(
                {
                    'layer': 'service',
                    'component': 'python_bot_service',
                    'event': 'decision_completed',
                    'status': 'succeeded',
                    'matchId': payload.match_id,
                    'action': response.action,
                    'reason': response.reason,
                }
            )
        )

        return response

    if payload.current_round is None:
        response = PassDecisionResponse(
            action='pass',
            reason='missing-round',
        )

        logger.info(
            json.dumps(
                {
                    'layer': 'service',
                    'component': 'python_bot_service',
                    'event': 'decision_completed',
                    'status': 'succeeded',
                    'matchId': payload.match_id,
                    'action': response.action,
                    'reason': response.reason,
                }
            )
        )

        return response

    response = strategy_engine.decide(payload)
    completed_event: dict[str, Any] = {
        'layer': 'service',
        'component': 'python_bot_service',
        'event': 'decision_completed',
        'status': 'succeeded',
        'matchId': payload.match_id,
        'action': response.action,
    }

    if response.action == 'play-card':
        completed_event['card'] = response.card
    elif response.action == 'pass':
        completed_event['reason'] = response.reason

    logger.info(json.dumps(completed_event))
    return response
