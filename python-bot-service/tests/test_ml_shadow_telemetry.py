import json
import tempfile
import unittest
from pathlib import Path

from app.schemas import (
    BotDecisionRequest,
)
from app.strategy.ml_shadow_telemetry import (
    MlShadowTelemetryWriter,
    build_shadow_observation_record,
)


class FakeDecision:
    action = 'play-card'
    card = 'AO'


def build_request(
    *,
    match_id='shadow-telemetry-match',
    hand=None,
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
                'actorSeatId': 'T1A',
                'actorTeamId': 'T1',
                'partnerSeatId': None,
                'viraRank': '7',
                'currentRound': {
                    'playerOneCard': None,
                    'playerTwoCard': None,
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
                    'currentRoundIndex': 0,
                },
            }
        )
    )


def shadow_event():
    return {
        'status': 'observed',
        'winProbability': 0.742159,
        'predictedHandWin': 1,
        'artifactVersion': '1.0',
        'modelType': (
            'RandomForestClassifier'
        ),
    }


class MlShadowTelemetryTest(
    unittest.TestCase
):
    def test_record_contains_prediction_and_decision(
        self,
    ):
        record = (
            build_shadow_observation_record(
                build_request(),
                FakeDecision(),
                shadow_event(),
            )
        )

        self.assertEqual(
            record[
                'heuristicDecision'
            ][
                'action'
            ],
            'play-card',
        )

        self.assertEqual(
            record[
                'heuristicDecision'
            ][
                'card'
            ],
            'AO',
        )

        self.assertEqual(
            record[
                'prediction'
            ][
                'winProbability'
            ],
            0.742159,
        )

    def test_record_contains_runtime_state(
        self,
    ):
        record = (
            build_shadow_observation_record(
                build_request(),
                FakeDecision(),
                shadow_event(),
            )
        )

        state = record[
            'runtimeState'
        ]

        self.assertEqual(
            state[
                'player_hand'
            ],
            [
                '3P',
                'AO',
                '7C',
            ],
        )

        self.assertEqual(
            state[
                'vira_rank'
            ],
            '7',
        )

        self.assertEqual(
            state[
                'score_difference'
            ],
            2,
        )

    def test_observation_id_is_deterministic(
        self,
    ):
        first = (
            build_shadow_observation_record(
                build_request(),
                FakeDecision(),
                shadow_event(),
            )
        )

        second = (
            build_shadow_observation_record(
                build_request(),
                FakeDecision(),
                shadow_event(),
            )
        )

        self.assertEqual(
            first[
                'observationId'
            ],
            second[
                'observationId'
            ],
        )

    def test_different_hand_changes_observation_id(
        self,
    ):
        first = (
            build_shadow_observation_record(
                build_request(),
                FakeDecision(),
                shadow_event(),
            )
        )

        second = (
            build_shadow_observation_record(
                build_request(
                    hand=[
                        '4O',
                        '5C',
                        '6P',
                    ]
                ),
                FakeDecision(),
                shadow_event(),
            )
        )

        self.assertNotEqual(
            first[
                'observationId'
            ],
            second[
                'observationId'
            ],
        )

    def test_writer_creates_jsonl_file(
        self,
    ):
        with tempfile.TemporaryDirectory() as directory:
            path = (
                Path(
                    directory
                )
                / 'shadow'
                / 'observations.jsonl'
            )

            writer = (
                MlShadowTelemetryWriter(
                    path
                )
            )

            writer.write(
                build_request(),
                FakeDecision(),
                shadow_event(),
            )

            self.assertTrue(
                path.exists()
            )

            lines = (
                path.read_text(
                    encoding='utf-8'
                )
                .splitlines()
            )

            self.assertEqual(
                len(
                    lines
                ),
                1,
            )

            payload = json.loads(
                lines[0]
            )

            self.assertEqual(
                payload[
                    'prediction'
                ][
                    'predictedHandWin'
                ],
                1,
            )

    def test_multiple_records_are_valid_json_lines(
        self,
    ):
        with tempfile.TemporaryDirectory() as directory:
            path = (
                Path(
                    directory
                )
                / 'observations.jsonl'
            )

            writer = (
                MlShadowTelemetryWriter(
                    path
                )
            )

            writer.write(
                build_request(
                    match_id='match-1'
                ),
                FakeDecision(),
                shadow_event(),
            )

            writer.write(
                build_request(
                    match_id='match-2'
                ),
                FakeDecision(),
                shadow_event(),
            )

            records = [
                json.loads(
                    line
                )
                for line
                in path.read_text(
                    encoding='utf-8'
                )
                .splitlines()
            ]

            self.assertEqual(
                len(
                    records
                ),
                2,
            )

            self.assertNotEqual(
                records[
                    0
                ][
                    'observationId'
                ],
                records[
                    1
                ][
                    'observationId'
                ],
            )


if __name__ == '__main__':
    unittest.main()
