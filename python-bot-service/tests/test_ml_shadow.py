import unittest

from app.schemas import (
    BotDecisionRequest,
)
from app.strategy.ml_shadow import (
    MlShadowObserver,
    build_shadow_runtime_state,
)


class FakePredictor:
    def __init__(
        self,
    ):
        self.calls = []

    def predict(
        self,
        state,
    ):
        self.calls.append(
            state
        )

        return {
            'winProbability': 0.78,
            'predictedHandWin': 1,
            'artifactVersion': '1.0',
            'modelType': (
                'RandomForestClassifier'
            ),
        }


def build_request(
    *,
    hand=None,
    round_index=0,
    rounds_won_by_me=0,
    rounds_won_by_opponent=0,
    rounds_tied=0,
    player_one_card=None,
    player_two_card=None,
    player_id='P1',
    player_one_score=4,
    player_two_score=2,
):
    return (
        BotDecisionRequest
        .model_validate(
            {
                'matchId': (
                    'shadow-test'
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
                        'canRequestTruco': (
                            True
                        ),
                        'canRaiseToSix': (
                            False
                        ),
                        'canRaiseToNine': (
                            False
                        ),
                        'canRaiseToTwelve': (
                            False
                        ),
                        'canAcceptBet': (
                            False
                        ),
                        'canDeclineBet': (
                            False
                        ),
                        'canAcceptMaoDeOnze': (
                            False
                        ),
                        'canDeclineMaoDeOnze': (
                            False
                        ),
                        'canAttemptPlayCard': (
                            True
                        ),
                    },
                },
                'score': {
                    'playerOne': (
                        player_one_score
                    ),
                    'playerTwo': (
                        player_two_score
                    ),
                    'pointsToWin': 12,
                },
                'handProgress': {
                    'roundsWonByMe': (
                        rounds_won_by_me
                    ),
                    'roundsWonByOpponent': (
                        rounds_won_by_opponent
                    ),
                    'roundsTied': (
                        rounds_tied
                    ),
                    'currentRoundIndex': (
                        round_index
                    ),
                },
            }
        )
    )


class MlShadowObserverTest(
    unittest.TestCase
):
    def test_first_decision_is_eligible(
        self,
    ):
        predictor = FakePredictor()

        observer = MlShadowObserver(
            predictor
        )

        prediction = observer.observe(
            build_request()
        )

        self.assertIsNotNone(
            prediction
        )

        self.assertEqual(
            len(
                predictor.calls
            ),
            1,
        )

        self.assertEqual(
            prediction.win_probability,
            0.78,
        )

    def test_later_round_is_not_eligible(
        self,
    ):
        predictor = FakePredictor()

        observer = MlShadowObserver(
            predictor
        )

        prediction = observer.observe(
            build_request(
                round_index=1,
                rounds_won_by_me=1,
            )
        )

        self.assertIsNone(
            prediction
        )

        self.assertEqual(
            predictor.calls,
            [],
        )

    def test_played_card_is_not_eligible(
        self,
    ):
        predictor = FakePredictor()

        observer = MlShadowObserver(
            predictor
        )

        prediction = observer.observe(
            build_request(
                player_one_card='3P'
            )
        )

        self.assertIsNone(
            prediction
        )

        self.assertEqual(
            predictor.calls,
            [],
        )

    def test_incomplete_hand_is_not_eligible(
        self,
    ):
        predictor = FakePredictor()

        observer = MlShadowObserver(
            predictor
        )

        prediction = observer.observe(
            build_request(
                hand=[
                    '3P',
                    'AO',
                ]
            )
        )

        self.assertIsNone(
            prediction
        )

    def test_runtime_state_uses_actor_score_perspective(
        self,
    ):
        state = (
            build_shadow_runtime_state(
                build_request(
                    player_id='P2',
                    player_one_score=7,
                    player_two_score=4,
                )
            )
        )

        self.assertEqual(
            state[
                'score_difference'
            ],
            -3,
        )

        self.assertEqual(
            state[
                'own_points_to_win'
            ],
            8,
        )

        self.assertEqual(
            state[
                'opponent_points_to_win'
            ],
            5,
        )

    def test_shadow_prediction_does_not_return_game_action(
        self,
    ):
        observer = MlShadowObserver(
            FakePredictor()
        )

        prediction = observer.observe(
            build_request()
        )

        self.assertFalse(
            hasattr(
                prediction,
                'action',
            )
        )


if __name__ == '__main__':
    unittest.main()
