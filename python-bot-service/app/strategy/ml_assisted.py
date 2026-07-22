from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from app.schemas import (
    ActionDecisionResponse,
    BotDecisionRationalePayload,
    BotDecisionRequest,
    BotDecisionResponse,
    BotProfile,
)
from app.strategy.engine import StrategyEngine
from app.strategy.ml_shadow import (
    HandWinPredictor,
    MlShadowObserver,
    build_shadow_runtime_state,
)
from data.ml_runtime_inference import (
    CandidateRuntimePredictor,
)


BetAction = Literal[
    'accept-bet',
    'decline-bet',
    'request-truco',
    'raise-to-six',
    'raise-to-nine',
    'raise-to-twelve',
]


@dataclass(frozen=True)
class MlAssistedThresholds:
    initiative: float
    accept: float
    raise_value: float
    decline: float


ML_ASSISTED_THRESHOLDS: dict[
    BotProfile,
    MlAssistedThresholds,
] = {
    'aggressive': MlAssistedThresholds(
        initiative=0.74,
        accept=0.62,
        raise_value=0.84,
        decline=0.30,
    ),
    'balanced': MlAssistedThresholds(
        initiative=0.79,
        accept=0.68,
        raise_value=0.88,
        decline=0.28,
    ),
    'cautious': MlAssistedThresholds(
        initiative=0.84,
        accept=0.74,
        raise_value=0.92,
        decline=0.25,
    ),
}


SCORE_SENSITIVE_STRATEGIES = {
    'bet-accept-forced-by-score',
    'bet-decline-by-score',
}


class MlAssistedStrategyEngine:
    """
    Use ML only as a conservative betting signal.

    Card selection, later-round decisions, 2v2 and special
    states remain controlled by the existing heuristic engine.
    """

    def __init__(
        self,
        predictor: HandWinPredictor,
        *,
        base_engine: StrategyEngine | None = None,
    ):
        self._predictor = predictor
        self._base_engine = (
            base_engine
            or StrategyEngine()
        )

    @classmethod
    def from_model_path(
        cls,
        model_path,
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
            predictor
        )

    def decide(
        self,
        payload: BotDecisionRequest,
    ) -> BotDecisionResponse:
        baseline = (
            self._base_engine
            .decide(
                payload
            )
        )

        if not self._can_use_ml(
            payload
        ):
            return baseline

        if self._is_score_sensitive(
            baseline
        ):
            return baseline

        try:
            result = (
                self._predictor
                .predict(
                    build_shadow_runtime_state(
                        payload
                    )
                )
            )

            probability = float(
                result[
                    'winProbability'
                ]
            )
        except Exception:
            return baseline

        return self._resolve_decision(
            payload,
            baseline,
            probability,
        )

    def _can_use_ml(
        self,
        payload,
    ) -> bool:
        if payload.mode not in (
            None,
            '1v1',
        ):
            return False

        if payload.bet is None:
            return False

        if (
            payload.bet.special_state
            != 'normal'
        ):
            return False

        return (
            MlShadowObserver
            .is_eligible(
                payload
            )
        )

    def _resolve_decision(
        self,
        payload,
        baseline,
        probability,
    ):
        bet = payload.bet

        if bet is None:
            return baseline

        thresholds = (
            ML_ASSISTED_THRESHOLDS[
                payload.profile
            ]
        )

        actions = (
            bet.available_actions
        )

        if (
            bet.bet_state
            == 'idle'
        ):
            if (
                actions.can_request_truco
                and
                probability
                >= thresholds.initiative
            ):
                return self._decision_or_baseline(
                    baseline,
                    'request-truco',
                )

            return baseline

        if (
            bet.bet_state
            != 'awaiting_response'
        ):
            return baseline

        raise_action = (
            self._strongest_raise(
                payload
            )
        )

        if (
            raise_action
            is not None
            and
            probability
            >= thresholds.raise_value
        ):
            return self._decision_or_baseline(
                baseline,
                raise_action,
            )

        if (
            actions.can_accept_bet
            and
            probability
            >= thresholds.accept
        ):
            return self._decision_or_baseline(
                baseline,
                'accept-bet',
            )

        if (
            actions.can_decline_bet
            and
            probability
            <= thresholds.decline
        ):
            return self._decision_or_baseline(
                baseline,
                'decline-bet',
            )

        return baseline

    def _strongest_raise(
        self,
        payload,
    ) -> BetAction | None:
        actions = (
            payload.bet
            .available_actions
        )

        if actions.can_raise_to_twelve:
            return 'raise-to-twelve'

        if actions.can_raise_to_nine:
            return 'raise-to-nine'

        if actions.can_raise_to_six:
            return 'raise-to-six'

        return None

    def _decision_or_baseline(
        self,
        baseline,
        action: BetAction,
    ):
        if (
            baseline.action
            == action
        ):
            return baseline

        hand_strength = (
            baseline
            .rationale
            .hand_strength
            if (
                baseline.rationale
                is not None
            )
            else None
        )

        rationale = (
            BotDecisionRationalePayload
            .model_validate(
                {
                    'handStrength': (
                        hand_strength
                    ),
                    'strategy': (
                        f'ml-assisted-'
                        f'{action}'
                    ),
                }
            )
        )

        return ActionDecisionResponse(
            action=action,
            rationale=rationale,
        )

    @staticmethod
    def _is_score_sensitive(
        baseline,
    ) -> bool:
        if (
            baseline.rationale
            is None
        ):
            return False

        return (
            baseline
            .rationale
            .strategy
            in SCORE_SENSITIVE_STRATEGIES
        )
