import tempfile
import unittest

from data.ml_dataset import (
    build_ml_ready_dataset,
)
from data.ml_model_artifact import (
    predict_candidate_probabilities,
    save_candidate_model,
    train_candidate_model,
)
from data.ml_runtime_inference import (
    CandidateRuntimePredictor,
    RuntimeInferenceError,
    build_runtime_input_frame,
    predict_runtime_state,
    runtime_state_from_ml_row,
)
from data.ml_stage_evaluation import (
    first_decision_per_player_hand,
)
from data.pipeline import (
    load_raw_dataset,
)
from simulation.exporter import (
    export_series,
)
from simulation.runner import (
    run_series,
)


class MlRuntimeInferenceTest(
    unittest.TestCase
):
    def build_frame(
        self,
        games=30,
        seed=881,
    ):
        result = run_series(
            'aggressive',
            'balanced',
            games=games,
            seed=seed,
        )

        with tempfile.TemporaryDirectory() as directory:
            export_series(
                result,
                directory,
            )

            dataset = (
                load_raw_dataset(
                    directory
                )
            )

            return build_ml_ready_dataset(
                dataset
            )

    def test_runtime_frame_requires_no_dataset_target(
        self,
    ):
        frame = self.build_frame()

        first_decisions = (
            first_decision_per_player_hand(
                frame
            )
        )

        state = runtime_state_from_ml_row(
            first_decisions.iloc[0]
        )

        runtime_frame = (
            build_runtime_input_frame(
                state
            )
        )

        self.assertNotIn(
            'hand_won',
            runtime_frame.columns,
        )

        self.assertNotIn(
            'match_id',
            runtime_frame.columns,
        )

        self.assertNotIn(
            'decision_id',
            runtime_frame.columns,
        )

    def test_runtime_contract_enforces_first_decision_hand_size(
        self,
    ):
        state = {
            'player_hand': [
                {
                    'rank': 'A',
                    'suit': 'P',
                },
                {
                    'rank': '3',
                    'suit': 'C',
                },
            ],
            'vira_rank': '7',
            'score_difference': 0,
            'own_points_to_win': 12,
            'opponent_points_to_win': 12,
            'current_value': 1,
            'pending_value': None,
            'special_decision_pending': False,
            'bet_state': 'idle',
            'special_state': 'normal',
        }

        with self.assertRaises(
            RuntimeInferenceError
        ):
            build_runtime_input_frame(
                state
            )

    def test_runtime_contract_derives_initial_round_state(
        self,
    ):
        frame = self.build_frame(
            games=26,
            seed=891,
        )

        first_decisions = (
            first_decision_per_player_hand(
                frame
            )
        )

        state = runtime_state_from_ml_row(
            first_decisions.iloc[0]
        )

        runtime_frame = (
            build_runtime_input_frame(
                state
            )
        )

        self.assertEqual(
            runtime_frame.loc[
                0,
                'round_index',
            ],
            0,
        )

        self.assertEqual(
            runtime_frame.loc[
                0,
                'rounds_won_by_me',
            ],
            0,
        )

        self.assertEqual(
            runtime_frame.loc[
                0,
                'rounds_won_by_opponent',
            ],
            0,
        )

        self.assertEqual(
            runtime_frame.loc[
                0,
                'rounds_tied',
            ],
            0,
        )

        self.assertEqual(
            runtime_frame.loc[
                0,
                'hand_size',
            ],
            3,
        )

    def test_runtime_prediction_matches_dataset_pipeline(
        self,
    ):
        frame = self.build_frame(
            games=32,
            seed=901,
        )

        first_decisions = (
            first_decision_per_player_hand(
                frame
            )
        )

        bundle = train_candidate_model(
            frame,
            n_estimators=20,
        )

        sample = (
            first_decisions
            .iloc[
                [0]
            ]
            .copy()
        )

        dataset_prediction = (
            predict_candidate_probabilities(
                bundle,
                sample,
            )
            .iloc[
                0
            ][
                'winProbability'
            ]
        )

        state = runtime_state_from_ml_row(
            sample.iloc[0]
        )

        runtime_prediction = (
            predict_runtime_state(
                bundle,
                state,
            )
        )

        self.assertAlmostEqual(
            dataset_prediction,
            runtime_prediction[
                'winProbability'
            ],
            places=12,
        )

    def test_runtime_prediction_returns_model_contract(
        self,
    ):
        frame = self.build_frame(
            games=28,
            seed=911,
        )

        first_decisions = (
            first_decision_per_player_hand(
                frame
            )
        )

        bundle = train_candidate_model(
            frame,
            n_estimators=20,
        )

        state = runtime_state_from_ml_row(
            first_decisions.iloc[0]
        )

        result = predict_runtime_state(
            bundle,
            state,
        )

        self.assertGreaterEqual(
            result[
                'winProbability'
            ],
            0.0,
        )

        self.assertLessEqual(
            result[
                'winProbability'
            ],
            1.0,
        )

        self.assertIn(
            result[
                'predictedHandWin'
            ],
            {
                0,
                1,
            },
        )

        self.assertEqual(
            result[
                'artifactVersion'
            ],
            '1.0',
        )

        self.assertEqual(
            result[
                'modelType'
            ],
            'RandomForestClassifier',
        )

    def test_runtime_predictor_loads_saved_artifact(
        self,
    ):
        frame = self.build_frame(
            games=30,
            seed=921,
        )

        first_decisions = (
            first_decision_per_player_hand(
                frame
            )
        )

        state = runtime_state_from_ml_row(
            first_decisions.iloc[0]
        )

        with tempfile.TemporaryDirectory() as directory:
            paths = save_candidate_model(
                frame,
                directory,
                n_estimators=20,
            )

            predictor = (
                CandidateRuntimePredictor
                .from_model_path(
                    paths[
                        'model'
                    ]
                )
            )

            result = predictor.predict(
                state
            )

            self.assertEqual(
                predictor.artifact_version,
                '1.0',
            )

            self.assertEqual(
                predictor.model_type,
                'RandomForestClassifier',
            )

            self.assertEqual(
                predictor.prediction_threshold,
                0.5,
            )

            self.assertGreaterEqual(
                result[
                    'winProbability'
                ],
                0.0,
            )

            self.assertLessEqual(
                result[
                    'winProbability'
                ],
                1.0,
            )


if __name__ == '__main__':
    unittest.main()
