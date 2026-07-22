import unittest

from app.schemas import (
    BotDecisionRequest,
)
from app.strategy.engine import (
    StrategyEngine,
)
from app.strategy.ml_assisted import (
    MlAssistedStrategyEngine,
)


class FakePredictor:
    def __init__(
        self,
        probability=0.5,
        *,
        should_fail=False,
    ):
        self.probability = (
            probability
        )
        self.should_fail = (
            should_fail
        )
        self.calls = 0

    def predict(
        self,
        state,
    ):
        self.calls += 1

        if self.should_fail:
            raise RuntimeError(
                'prediction failed'
            )

        return {
            'winProbability': (
                self.probability
            ),
            'predictedHandWin': int(
                self.probability
                >= 0.5
            ),
            'artifactVersion': '1.0',
            'modelType': (
                'FakeModel'
            ),
        }


def build_request(
    *,
    profile='balanced',
    hand=None,
    mode='1v1',
    bet_state='idle',
    current_value=1,
    pending_value=None,
    can_request_truco=True,
    can_raise_to_six=False,
    can_raise_to_nine=False,
    can_raise_to_twelve=False,
    can_accept_bet=False,
    can_decline_bet=False,
    can_attempt_play_card=True,
    round_index=0,
    rounds_won_by_me=0,
    rounds_won_by_opponent=0,
    rounds_tied=0,
    player_one_card=None,
    player_two_card=None,
    player_one_score=4,
    player_two_score=2,
):
    return (
        BotDecisionRequest
        .model_validate(
            {
                'matchId': (
                    'ml-assisted-test'
                ),
                'profile': (
                    profile
                ),
                'mode': (
                    mode
                ),
                'actorSeatId': 'T1A',
                'actorTeamId': 'T1',
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
                    'playerId': 'P1',
                    'hand': (
                        hand
                        or [
                            '4O',
                            'AO',
                            '3O',
                        ]
                    ),
                },
                'bet': {
                    'currentValue': (
                        current_value
                    ),
                    'betState': (
                        bet_state
                    ),
                    'pendingValue': (
                        pending_value
                    ),
                    'requestedBy': (
                        'P2'
                        if (
                            bet_state
                            == 'awaiting_response'
                        )
                        else None
                    ),
                    'specialState': (
                        'normal'
                    ),
                    'specialDecisionPending': (
                        False
                    ),
                    'availableActions': {
                        'canRequestTruco': (
                            can_request_truco
                        ),
                        'canRaiseToSix': (
                            can_raise_to_six
                        ),
                        'canRaiseToNine': (
                            can_raise_to_nine
                        ),
                        'canRaiseToTwelve': (
                            can_raise_to_twelve
                        ),
                        'canAcceptBet': (
                            can_accept_bet
                        ),
                        'canDeclineBet': (
                            can_decline_bet
                        ),
                        'canAcceptMaoDeOnze': (
                            False
                        ),
                        'canDeclineMaoDeOnze': (
                            False
                        ),
                        'canAttemptPlayCard': (
                            can_attempt_play_card
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


class MlAssistedStrategyTest(
    unittest.TestCase
):
    def test_high_probability_requests_truco_before_first_card(
        self,
    ):
        engine = (
            MlAssistedStrategyEngine(
                FakePredictor(
                    0.95
                )
            )
        )

        response = engine.decide(
            build_request()
        )

        self.assertEqual(
            response.action,
            'request-truco',
        )

        self.assertEqual(
            response.rationale.strategy,
            'ml-assisted-request-truco',
        )

    def test_low_probability_keeps_heuristic_card_decision(
        self,
    ):
        request = build_request()

        baseline = (
            StrategyEngine()
            .decide(
                request
            )
        )

        response = (
            MlAssistedStrategyEngine(
                FakePredictor(
                    0.10
                )
            )
            .decide(
                request
            )
        )

        self.assertEqual(
            response.action,
            baseline.action,
        )

        self.assertEqual(
            response.card,
            baseline.card,
        )

    def test_high_probability_uses_available_raise(
        self,
    ):
        response = (
            MlAssistedStrategyEngine(
                FakePredictor(
                    0.95
                )
            )
            .decide(
                build_request(
                    bet_state=(
                        'awaiting_response'
                    ),
                    current_value=3,
                    pending_value=6,
                    can_request_truco=False,
                    can_raise_to_nine=True,
                    can_accept_bet=True,
                    can_decline_bet=True,
                    can_attempt_play_card=False,
                )
            )
        )

        self.assertEqual(
            response.action,
            'raise-to-nine',
        )

    def test_strong_probability_can_override_decline_with_accept(
        self,
    ):
        response = (
            MlAssistedStrategyEngine(
                FakePredictor(
                    0.75
                )
            )
            .decide(
                build_request(
                    hand=[
                        '4O',
                        '5O',
                        '6O',
                    ],
                    bet_state=(
                        'awaiting_response'
                    ),
                    current_value=3,
                    pending_value=6,
                    can_request_truco=False,
                    can_accept_bet=True,
                    can_decline_bet=True,
                    can_attempt_play_card=False,
                )
            )
        )

        self.assertEqual(
            response.action,
            'accept-bet',
        )

    def test_low_probability_can_override_accept_with_decline(
        self,
    ):
        response = (
            MlAssistedStrategyEngine(
                FakePredictor(
                    0.05
                )
            )
            .decide(
                build_request(
                    hand=[
                        'QP',
                        '3O',
                        '2O',
                    ],
                    bet_state=(
                        'awaiting_response'
                    ),
                    current_value=3,
                    pending_value=6,
                    can_request_truco=False,
                    can_accept_bet=True,
                    can_decline_bet=True,
                    can_attempt_play_card=False,
                )
            )
        )

        self.assertEqual(
            response.action,
            'decline-bet',
        )

    def test_later_round_preserves_existing_engine(
        self,
    ):
        request = build_request(
            profile='aggressive',
            hand=[
                'QP',
                '3O',
                '2O',
            ],
            round_index=1,
            rounds_won_by_me=1,
        )

        baseline = (
            StrategyEngine()
            .decide(
                request
            )
        )

        response = (
            MlAssistedStrategyEngine(
                FakePredictor(
                    0.99
                )
            )
            .decide(
                request
            )
        )

        self.assertEqual(
            response.action,
            baseline.action,
        )

    def test_prediction_failure_falls_back_to_existing_engine(
        self,
    ):
        request = build_request()

        baseline = (
            StrategyEngine()
            .decide(
                request
            )
        )

        response = (
            MlAssistedStrategyEngine(
                FakePredictor(
                    should_fail=True
                )
            )
            .decide(
                request
            )
        )

        self.assertEqual(
            response.action,
            baseline.action,
        )

        if (
            response.action
            == 'play-card'
        ):
            self.assertEqual(
                response.card,
                baseline.card,
            )

    def test_score_sensitive_decision_is_never_overridden(
        self,
    ):
        request = build_request(
            hand=[
                '4O',
                '5O',
                '6O',
            ],
            bet_state=(
                'awaiting_response'
            ),
            current_value=3,
            pending_value=6,
            can_request_truco=False,
            can_accept_bet=True,
            can_decline_bet=True,
            can_attempt_play_card=False,
            player_one_score=3,
            player_two_score=9,
        )

        baseline = (
            StrategyEngine()
            .decide(
                request
            )
        )

        response = (
            MlAssistedStrategyEngine(
                FakePredictor(
                    0.01
                )
            )
            .decide(
                request
            )
        )

        self.assertEqual(
            response.action,
            baseline.action,
        )

        self.assertEqual(
            response.rationale.strategy,
            baseline.rationale.strategy,
        )


if __name__ == '__main__':
    unittest.main()
