from collections.abc import Mapping
from dataclasses import dataclass
from typing import Protocol

from app.schemas import (
    BotDecisionRequest,
)


class HandWinPredictor(
    Protocol
):
    def predict(
        self,
        state: Mapping,
    ) -> Mapping:
        ...


@dataclass(
    frozen=True
)
class ShadowPrediction:
    win_probability: float
    predicted_hand_win: int
    artifact_version: str
    model_type: str


class MlShadowObserver:
    def __init__(
        self,
        predictor: HandWinPredictor,
    ):
        self._predictor = predictor

    def observe(
        self,
        payload: BotDecisionRequest,
    ) -> ShadowPrediction | None:
        if not self.is_eligible(
            payload
        ):
            return None

        state = (
            build_shadow_runtime_state(
                payload
            )
        )

        result = (
            self._predictor.predict(
                state
            )
        )

        return ShadowPrediction(
            win_probability=float(
                result[
                    'winProbability'
                ]
            ),
            predicted_hand_win=int(
                result[
                    'predictedHandWin'
                ]
            ),
            artifact_version=str(
                result[
                    'artifactVersion'
                ]
            ),
            model_type=str(
                result[
                    'modelType'
                ]
            ),
        )

    @staticmethod
    def is_eligible(
        payload: BotDecisionRequest,
    ) -> bool:
        if len(
            payload.player.hand
        ) != 3:
            return False

        progress = (
            payload.hand_progress
        )

        if progress is None:
            return False

        if (
            progress.current_round_index
            != 0
        ):
            return False

        if (
            progress.rounds_won_by_me
            != 0
        ):
            return False

        if (
            progress.rounds_won_by_opponent
            != 0
        ):
            return False

        if (
            progress.rounds_tied
            != 0
        ):
            return False

        round_state = (
            payload.current_round
        )

        if round_state is None:
            return False

        if (
            round_state.player_one_card
            is not None
        ):
            return False

        if (
            round_state.player_two_card
            is not None
        ):
            return False

        return True


def build_shadow_runtime_state(
    payload: BotDecisionRequest,
) -> dict:
    score = payload.score
    bet = payload.bet

    if score is None:
        raise ValueError(
            'ML shadow prediction requires score state'
        )

    actor_is_player_one = (
        payload.player.player_id
        == 'P1'
    )

    own_score = (
        score.player_one
        if actor_is_player_one
        else score.player_two
    )

    opponent_score = (
        score.player_two
        if actor_is_player_one
        else score.player_one
    )

    return {
        'player_hand': list(
            payload.player.hand
        ),
        'vira_rank': (
            payload.vira_rank
        ),
        'score_difference': (
            own_score
            - opponent_score
        ),
        'own_points_to_win': (
            score.points_to_win
            - own_score
        ),
        'opponent_points_to_win': (
            score.points_to_win
            - opponent_score
        ),
        'current_value': (
            bet.current_value
            if bet is not None
            else 1
        ),
        'pending_value': (
            bet.pending_value
            if bet is not None
            else None
        ),
        'special_decision_pending': (
            bet.special_decision_pending
            if bet is not None
            else False
        ),
        'bet_state': (
            bet.bet_state
            if bet is not None
            else 'idle'
        ),
        'special_state': (
            bet.special_state
            if bet is not None
            else 'normal'
        ),
    }
