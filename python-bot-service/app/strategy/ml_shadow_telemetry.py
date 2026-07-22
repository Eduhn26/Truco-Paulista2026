import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock

from app.schemas import (
    BotDecisionRequest,
    BotDecisionResponse,
)
from app.strategy.ml_shadow import (
    build_shadow_runtime_state,
)


class MlShadowTelemetryWriter:
    def __init__(
        self,
        output_path,
    ):
        self._output_path = Path(
            output_path
        )
        self._lock = Lock()

    @property
    def output_path(
        self,
    ):
        return self._output_path

    def write(
        self,
        payload: BotDecisionRequest,
        response: BotDecisionResponse,
        shadow_event,
    ):
        record = (
            build_shadow_observation_record(
                payload,
                response,
                shadow_event,
            )
        )

        self._output_path.parent.mkdir(
            parents=True,
            exist_ok=True,
        )

        serialized = json.dumps(
            record,
            sort_keys=True,
            separators=(
                ',',
                ':',
            ),
        )

        with self._lock:
            with self._output_path.open(
                'a',
                encoding='utf-8',
            ) as stream:
                stream.write(
                    serialized
                )
                stream.write(
                    '\n'
                )

        return record


def build_shadow_observation_record(
    payload,
    response,
    shadow_event,
):
    runtime_state = (
        build_shadow_runtime_state(
            payload
        )
    )

    identity = {
        'matchId': (
            payload.match_id
        ),
        'playerId': (
            payload.player.player_id
        ),
        'playerHand': sorted(
            payload.player.hand
        ),
        'viraRank': (
            payload.vira_rank
        ),
        'scoreDifference': (
            runtime_state[
                'score_difference'
            ]
        ),
        'currentValue': (
            runtime_state[
                'current_value'
            ]
        ),
        'specialState': (
            runtime_state[
                'special_state'
            ]
        ),
    }

    canonical_identity = json.dumps(
        identity,
        sort_keys=True,
        separators=(
            ',',
            ':',
        ),
    )

    observation_id = hashlib.sha256(
        canonical_identity.encode(
            'utf-8'
        )
    ).hexdigest()

    return {
        'observedAt': (
            datetime.now(
                timezone.utc
            )
            .isoformat()
        ),
        'observationId': (
            observation_id
        ),
        'matchId': (
            payload.match_id
        ),
        'playerId': (
            payload.player.player_id
        ),
        'profile': (
            payload.profile
        ),
        'heuristicDecision': {
            'action': (
                response.action
            ),
            'card': getattr(
                response,
                'card',
                None,
            ),
        },
        'prediction': {
            'winProbability': (
                shadow_event[
                    'winProbability'
                ]
            ),
            'predictedHandWin': (
                shadow_event[
                    'predictedHandWin'
                ]
            ),
            'artifactVersion': (
                shadow_event[
                    'artifactVersion'
                ]
            ),
            'modelType': (
                shadow_event[
                    'modelType'
                ]
            ),
        },
        'runtimeState': (
            runtime_state
        ),
    }
