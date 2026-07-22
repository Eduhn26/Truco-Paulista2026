import tempfile
import unittest

from data.ml_card_features import (
    RAW_CARD_FEATURES,
)
from data.ml_primary import (
    PRIMARY_TRAINING_FEATURES,
    build_primary_feature_frame,
    run_primary_model_benchmark,
    write_primary_model_benchmark,
)
from data.ml_dataset import (
    build_ml_ready_dataset,
)
from data.pipeline import load_raw_dataset
from simulation.exporter import export_series
from simulation.runner import run_series


class MlPrimaryTest(
    unittest.TestCase
):
    def build_frame(
        self,
        games=24,
        seed=661,
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

            dataset = load_raw_dataset(
                directory
            )

            return build_ml_ready_dataset(
                dataset
            )

    def test_primary_features_exclude_hand_strength(
        self,
    ):
        self.assertNotIn(
            'hand_strength',
            PRIMARY_TRAINING_FEATURES,
        )

        for feature in RAW_CARD_FEATURES:
            self.assertIn(
                feature,
                PRIMARY_TRAINING_FEATURES,
            )

    def test_primary_feature_frame_matches_contract(
        self,
    ):
        frame = self.build_frame()

        features = (
            build_primary_feature_frame(
                frame
            )
        )

        self.assertEqual(
            tuple(
                features.columns
            ),
            PRIMARY_TRAINING_FEATURES,
        )

        self.assertEqual(
            len(features),
            len(frame),
        )

    def test_benchmark_uses_first_decisions_by_default(
        self,
    ):
        frame = self.build_frame(
            games=24,
            seed=671,
        )

        report = (
            run_primary_model_benchmark(
                frame,
                random_states=(11,),
            )
        )

        self.assertTrue(
            report[
                'configuration'
            ][
                'firstDecisionOnly'
            ]
        )

        self.assertFalse(
            report[
                'configuration'
            ][
                'handStrengthIncluded'
            ]
        )

        self.assertLess(
            report[
                'dataset'
            ][
                'evaluationRows'
            ],
            report[
                'dataset'
            ][
                'sourceRows'
            ],
        )

    def test_benchmark_compares_three_models(
        self,
    ):
        frame = self.build_frame(
            games=28,
            seed=681,
        )

        report = (
            run_primary_model_benchmark(
                frame,
                random_states=(13,),
            )
        )

        self.assertEqual(
            set(
                report[
                    'runs'
                ][0][
                    'models'
                ]
            ),
            {
                'dummy',
                'logisticRegression',
                'decisionTree',
            },
        )

    def test_repeated_runs_are_summarized(
        self,
    ):
        frame = self.build_frame(
            games=28,
            seed=691,
        )

        report = (
            run_primary_model_benchmark(
                frame,
                random_states=(
                    17,
                    19,
                ),
            )
        )

        self.assertEqual(
            report[
                'summary'
            ][
                'logisticRegression'
            ][
                'metrics'
            ][
                'balancedAccuracy'
            ][
                'count'
            ],
            2,
        )

        self.assertIn(
            'model',
            report[
                'bestByBalancedAccuracy'
            ],
        )

    def test_primary_report_is_written(
        self,
    ):
        frame = self.build_frame(
            games=20,
            seed=701,
        )

        with tempfile.TemporaryDirectory() as directory:
            path = (
                write_primary_model_benchmark(
                    frame,
                    (
                        f'{directory}'
                        '/primary-benchmark.json'
                    ),
                    random_states=(23,),
                )
            )

            self.assertTrue(
                path.exists()
            )

            self.assertGreater(
                path.stat().st_size,
                0,
            )


if __name__ == '__main__':
    unittest.main()
