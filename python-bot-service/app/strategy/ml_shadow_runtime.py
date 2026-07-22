from collections import deque
from pathlib import Path

from app.schemas import (
    BotDecisionRequest,
    BotDecisionResponse,
)
from app.strategy.ml_shadow import (
    MlShadowObserver,
)
from data.ml_runtime_inference import (
    CandidateRuntimePredictor,
)


DEFAULT_MAX_OBSERVED_STATES = 10_000


class MlShadowRuntime:
    def __init__(
        self,
        observer,
        *,
        max_observed_states=DEFAULT_MAX_OBSERVED_STATES,
    ):
        if max_observed_states < 1:
            raise ValueError(
                'max_observed_states must be positive'
            )

        self._observer = observer

        self._max_observed_states = (
            max_observed_states
        )

        self._observed_states = set()

        self._observation_order = deque()

    @classmethod
    def from_model_path(
        cls,
        model_path,
        *,
        max_observed_states=DEFAULT_MAX_OBSERVED_STATES,
    ):
        predictor = (
            CandidateRuntimePredictor
            .from_model_path(
                Path(
                    model_path
                )
            )
        )

        return cls(
            MlShadowObserver(
                predictor
            ),
            max_observed_states=(
                max_observed_states
            ),
        )

    def observe(
        self,
        payload: BotDecisionRequest,
        response: BotDecisionResponse,
    ):
        if not self._observer.is_eligible(
            payload
        ):
            return None

        observation_key = (
            self._observation_key(
                payload
            )
        )

        if (
            observation_key
            in self._observed_states
        ):
            return None

        self._remember(
            observation_key
        )

        try:
            prediction = (
                self._observer.observe(
                    payload
                )
            )
        except Exception as error:
            return {
                'layer': 'ml',
                'component': (
                    'ml_shadow_runtime'
                ),
                'event': (
                    'shadow_prediction'
                ),
                'status': 'failed',
                'matchId': (
                    payload.match_id
                ),
                'playerId': (
                    payload
                    .player
                    .player_id
                ),
                'profile': (
                    payload.profile
                ),
                'heuristicAction': (
                    response.action
                ),
                'errorType': (
                    type(
                        error
                    ).__name__
                ),
            }

        if prediction is None:
            return None

        return {
            'layer': 'ml',
            'component': (
                'ml_shadow_runtime'
            ),
            'event': (
                'shadow_prediction'
            ),
            'status': 'observed',
            'matchId': (
                payload.match_id
            ),
            'playerId': (
                payload
                .player
                .player_id
            ),
            'profile': (
                payload.profile
            ),
            'heuristicAction': (
                response.action
            ),
            'winProbability': round(
                prediction.win_probability,
                6,
            ),
            'predictedHandWin': (
                prediction
                .predicted_hand_win
            ),
            'artifactVersion': (
                prediction
                .artifact_version
            ),
            'modelType': (
                prediction
                .model_type
            ),
        }

    def _observation_key(
        self,
        payload,
    ):
        score = payload.score

        score_state = (
            (
                score.player_one,
                score.player_two,
            )
            if score is not None
            else (
                None,
                None,
            )
        )

        return (
            payload.match_id,
            payload.player.player_id,
            tuple(
                sorted(
                    payload.player.hand
                )
            ),
            payload.vira_rank,
            *score_state,
        )

    def _remember(
        self,
        observation_key,
    ):
        self._observed_states.add(
            observation_key
        )

        self._observation_order.append(
            observation_key
        )

        while (
            len(
                self._observation_order
            )
            > self._max_observed_states
        ):
            expired = (
                self
                ._observation_order
                .popleft()
            )

            self._observed_states.discard(
                expired
            )
