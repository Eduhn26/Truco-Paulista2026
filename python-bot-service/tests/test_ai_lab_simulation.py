import unittest

from app.ai_lab_simulation import (
    AiLabSimulationRequest,
    run_ai_lab_simulation,
)


class FakePredictor:
    def __init__(
        self,
    ):
        self.calls = 0

    @property
    def prediction_threshold(
        self,
    ):
        return 0.5

    def predict(
        self,
        _state,
    ):
        self.calls += 1

        return {
            'winProbability': 0.95,
            'predictedHandWin': 1,
            'threshold': 0.5,
            'artifactVersion': 'test',
            'modelType': 'FakePredictor',
        }


class AiLabSimulationTest(
    unittest.TestCase,
):
    def test_heuristic_simulation_returns_real_match_events(
        self,
    ):
        payload = (
            AiLabSimulationRequest
            .model_validate(
                {
                    'botA': {
                        'profile': 'balanced',
                        'intelligenceMode': 'heuristic',
                    },
                    'botB': {
                        'profile': 'cautious',
                        'intelligenceMode': 'heuristic',
                    },
                    'seed': 13001,
                }
            )
        )

        result = (
            run_ai_lab_simulation(
                payload
            )
        )

        self.assertEqual(
            result[
                'seed'
            ],
            13001,
        )
        self.assertGreater(
            result[
                'match'
            ][
                'decisionCount'
            ],
            0,
        )
        self.assertTrue(
            any(
                event[
                    'type'
                ]
                ==
                'card.played'
                for event
                in result[
                    'events'
                ]
            )
        )
        self.assertEqual(
            result[
                'events'
            ][0][
                'type'
            ],
            'simulation.started',
        )
        self.assertTrue(
            any(
                event[
                    'type'
                ]
                ==
                'cards.dealt'
                for event
                in result[
                    'events'
                ]
            )
        )
        self.assertTrue(
            any(
                event[
                    'type'
                ]
                ==
                'round.resolved'
                for event
                in result[
                    'events'
                ]
            )
        )

    def test_ml_assisted_simulation_exposes_prediction_events(
        self,
    ):
        payload = (
            AiLabSimulationRequest
            .model_validate(
                {
                    'botA': {
                        'profile': 'balanced',
                        'intelligenceMode': 'ml-assisted',
                    },
                    'botB': {
                        'profile': 'balanced',
                        'intelligenceMode': 'heuristic',
                    },
                    'seed': 13002,
                }
            )
        )

        predictor = (
            FakePredictor()
        )

        result = (
            run_ai_lab_simulation(
                payload,
                predictor=(
                    predictor
                ),
            )
        )

        inference_events = [
            event
            for event
            in result[
                'events'
            ]
            if (
                event[
                    'type'
                ]
                ==
                'ml.inference'
            )
        ]

        self.assertTrue(
            result[
                'model'
            ][
                'available'
            ]
        )
        self.assertTrue(
            inference_events
        )
        self.assertEqual(
            predictor.calls,
            len(
                inference_events
            ),
        )
        self.assertTrue(
            any(
                (
                    event
                    .get(
                        'decision'
                    )
                    or {}
                )
                .get(
                    'prediction'
                )
                is not None
                for event
                in result[
                    'events'
                ]
            )
        )


if __name__ == '__main__':
    unittest.main()
