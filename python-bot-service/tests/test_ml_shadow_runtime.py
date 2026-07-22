import unittest
from unittest.mock import patch

from app.schemas import (
    BotDecisionRequest,
)
from app.strategy.ml_shadow import (
    MlShadowObserver,
)
from app.strategy.ml_shadow_runtime import (
    MlShadowRuntime,
)


class FakePredictor:
    def __init__(
        self,
        *,
        should_fail=False,
    ):
        self.calls = []
        self.should_fail = (
            should_fail
        )

    def predict(
        self,
        state,
    ):
        self.calls.append(
            state
        )

        if self.should_fail:
            raise RuntimeError(
                'prediction failed'
            )

        return {
            'winProbability': 0.81234567,
            'predictedHandWin': 1,
            'artifactVersion': '1.0',
            'modelType': (
                'RandomForestClassifier'
            ),
        }


class FakeDecision:
    action = 'request-truco'


def build_request(
    *,
    match_id='match-shadow',
    player_id='P1',
    hand=None,
    round_index=0,
    player_one_card=None,
    player_two_card=None,
):
    return (
        BotDecisionRequest
        .model_validate(
            {
                'matchId': (
                    match_id
                ),
                'profile': (
                    'balanced'
                ),
                'mode': '1v1',
                'actorSeatId': (
                    'T1A'
                    if player_id
                    == 'P1'
                    else 'T2A'
                ),
                'actorTeamId': (
                    'T1'
                    if player_id
                    == 'P1'
                    else 'T2'
                ),
                'partnerSeatId': None,
                'viraRank': '7',
                'currentRound': {
                    'playerOneCard': (
                        player_one_card
                    ),
                    'playerTwoCard': (
                        player_two_card
                    ),
                    'finished': False,
                    'result': None,
                    'seatPlays': None,
                    'orderedPlays': [],
                    'winningSeatId': None,
                },
                'player': {
                    'playerId': (
                        player_id
                    ),
                    'hand': (
                        hand
                        or [
                            '3P',
                            'AO',
                            '7C',
                        ]
                    ),
                },
                'bet': {
                    'currentValue': 1,
                    'betState': 'idle',
                    'pendingValue': None,
                    'requestedBy': None,
                    'specialState': (
                        'normal'
                    ),
                    'specialDecisionPending': (
                        False
                    ),
                    'availableActions': {
                        'canRequestTruco': True,
                        'canRaiseToSix': False,
                        'canRaiseToNine': False,
                        'canRaiseToTwelve': False,
                        'canAcceptBet': False,
                        'canDeclineBet': False,
                        'canAcceptMaoDeOnze': False,
                        'canDeclineMaoDeOnze': False,
                        'canAttemptPlayCard': True,
                    },
                },
                'score': {
                    'playerOne': 4,
                    'playerTwo': 2,
                    'pointsToWin': 12,
                },
                'handProgress': {
                    'roundsWonByMe': 0,
                    'roundsWonByOpponent': 0,
                    'roundsTied': 0,
                    'currentRoundIndex': (
                        round_index
                    ),
                },
            }
        )
    )


class MlShadowRuntimeTest(
    unittest.TestCase
):
    def test_runtime_builds_observer_from_model_once(
        self,
    ):
        predictor = FakePredictor()

        with patch(
            (
                'app.strategy.'
                'ml_shadow_runtime.'
                'CandidateRuntimePredictor.'
                'from_model_path'
            ),
            return_value=predictor,
        ) as loader:
            runtime = (
                MlShadowRuntime
                .from_model_path(
                    'candidate.joblib'
                )
            )

            first = runtime.observe(
                build_request(),
                FakeDecision(),
            )

            second = runtime.observe(
                build_request(
                    match_id=(
                        'another-match'
                    )
                ),
                FakeDecision(),
            )

        loader.assert_called_once()

        self.assertIsNotNone(
            first
        )

        self.assertIsNotNone(
            second
        )

    def test_successful_shadow_event_contains_prediction(
        self,
    ):
        predictor = FakePredictor()

        runtime = MlShadowRuntime(
            MlShadowObserver(
                predictor
            )
        )

        event = runtime.observe(
            build_request(),
            FakeDecision(),
        )

        self.assertEqual(
            event[
                'status'
            ],
            'observed',
        )

        self.assertEqual(
            event[
                'heuristicAction'
            ],
            'request-truco',
        )

        self.assertEqual(
            event[
                'winProbability'
            ],
            0.812346,
        )

        self.assertEqual(
            event[
                'predictedHandWin'
            ],
            1,
        )

    def test_same_initial_state_is_observed_only_once(
        self,
    ):
        predictor = FakePredictor()

        runtime = MlShadowRuntime(
            MlShadowObserver(
                predictor
            )
        )

        request = build_request()

        first = runtime.observe(
            request,
            FakeDecision(),
        )

        second = runtime.observe(
            request,
            FakeDecision(),
        )

        self.assertIsNotNone(
            first
        )

        self.assertIsNone(
            second
        )

        self.assertEqual(
            len(
                predictor.calls
            ),
            1,
        )

    def test_ineligible_state_is_not_observed(
        self,
    ):
        predictor = FakePredictor()

        runtime = MlShadowRuntime(
            MlShadowObserver(
                predictor
            )
        )

        event = runtime.observe(
            build_request(
                round_index=1,
            ),
            FakeDecision(),
        )

        self.assertIsNone(
            event
        )

        self.assertEqual(
            predictor.calls,
            [],
        )

    def test_prediction_failure_is_fail_open(
        self,
    ):
        runtime = MlShadowRuntime(
            MlShadowObserver(
                FakePredictor(
                    should_fail=True
                )
            )
        )

        event = runtime.observe(
            build_request(),
            FakeDecision(),
        )

        self.assertEqual(
            event[
                'status'
            ],
            'failed',
        )

        self.assertEqual(
            event[
                'errorType'
            ],
            'RuntimeError',
        )

        self.assertEqual(
            event[
                'heuristicAction'
            ],
            'request-truco',
        )

    def test_observation_cache_is_bounded(
        self,
    ):
        predictor = FakePredictor()

        runtime = MlShadowRuntime(
            MlShadowObserver(
                predictor
            ),
            max_observed_states=2,
        )

        runtime.observe(
            build_request(
                match_id='match-1'
            ),
            FakeDecision(),
        )

        runtime.observe(
            build_request(
                match_id='match-2'
            ),
            FakeDecision(),
        )

        runtime.observe(
            build_request(
                match_id='match-3'
            ),
            FakeDecision(),
        )

        repeated_first = (
            runtime.observe(
                build_request(
                    match_id='match-1'
                ),
                FakeDecision(),
            )
        )

        self.assertIsNotNone(
            repeated_first
        )

        self.assertEqual(
            len(
                predictor.calls
            ),
            4,
        )


if __name__ == '__main__':
    unittest.main()
