import json
import tempfile
import unittest
from pathlib import Path

import pandas as pd

from app.schemas import (
    BotDecisionRequest,
)
from app.strategy.ml_shadow_telemetry import (
    MlShadowTelemetryWriter,
    build_shadow_observation_record,
)
from data.ml_shadow_evaluation import (
    HOLDOUT_MATCHUPS,
    build_holdout_plan,
    compute_binary_metrics,
    probability_calibration,
)


class FakeDecision:
    action = 'play-card'
    card = 'AO'


def build_request(
    *,
    match_id='shadow-package-test',
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
                    'hand': [
                        '3P',
                        'AO',
                        '7C',
                    ],
                },
                'bet': {
                    'currentValue': 1,
                    'betState': 'idle',
                    'pendingValue': None,
                    'requestedBy': None,
                    'specialState': 'normal',
                    'specialDecisionPending': False,
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


class MlShadowPackageTest(
    unittest.TestCase
):
    def test_shadow_record_keeps_prediction_and_decision(
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

    def test_shadow_writer_appends_json_lines(
        self,
    ):
        with tempfile.TemporaryDirectory() as directory:
            path = (
                Path(
                    directory
                )
                / 'shadow.jsonl'
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

    def test_holdout_plan_uses_all_matchups_and_unique_seeds(
        self,
    ):
        plan = build_holdout_plan(
            games_per_matchup=100,
            seed_base=9101,
        )

        self.assertEqual(
            len(
                plan
            ),
            len(
                HOLDOUT_MATCHUPS
            ),
        )

        self.assertEqual(
            len(
                {
                    run[
                        'seed'
                    ]
                    for run
                    in plan
                }
            ),
            len(
                HOLDOUT_MATCHUPS
            ),
        )

    def test_holdout_plan_rejects_zero_games(
        self,
    ):
        with self.assertRaises(
            ValueError
        ):
            build_holdout_plan(
                games_per_matchup=0,
                seed_base=9101,
            )

    def test_binary_metrics_score_perfect_predictions(
        self,
    ):
        frame = pd.DataFrame(
            {
                'hand_won': [
                    0,
                    0,
                    1,
                    1,
                ],
                'winProbability': [
                    0.1,
                    0.2,
                    0.8,
                    0.9,
                ],
                'predictedHandWin': [
                    0,
                    0,
                    1,
                    1,
                ],
            }
        )

        metrics = (
            compute_binary_metrics(
                frame
            )
        )

        self.assertEqual(
            metrics[
                'accuracy'
            ],
            1.0,
        )

        self.assertEqual(
            metrics[
                'balancedAccuracy'
            ],
            1.0,
        )

        self.assertEqual(
            metrics[
                'rocAuc'
            ],
            1.0,
        )

    def test_probability_calibration_covers_rows(
        self,
    ):
        frame = pd.DataFrame(
            {
                'hand_won': [
                    0,
                    0,
                    1,
                    1,
                ],
                'winProbability': [
                    0.15,
                    0.25,
                    0.75,
                    0.85,
                ],
                'predictedHandWin': [
                    0,
                    0,
                    1,
                    1,
                ],
            }
        )

        calibration = (
            probability_calibration(
                frame
            )
        )

        self.assertEqual(
            sum(
                item[
                    'rows'
                ]
                for item
                in calibration
            ),
            4,
        )


if __name__ == '__main__':
    unittest.main()
