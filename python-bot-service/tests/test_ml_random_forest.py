import tempfile
import unittest

from data.ml_dataset import (
    build_ml_ready_dataset,
)
from data.ml_random_forest import (
    run_random_forest_benchmark,
    write_random_forest_benchmark,
)
from data.pipeline import load_raw_dataset
from simulation.exporter import export_series
from simulation.runner import run_series


class MlRandomForestTest(
    unittest.TestCase
):
    def build_frame(
        self,
        games=24,
        seed=711,
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

    def test_benchmark_excludes_hand_strength(
        self,
    ):
        frame = self.build_frame()

        report = (
            run_random_forest_benchmark(
                frame,
                random_states=(11,),
                n_estimators=20,
            )
        )

        self.assertFalse(
            report[
                'configuration'
            ][
                'handStrengthIncluded'
            ]
        )

    def test_benchmark_compares_tree_and_forest(
        self,
    ):
        frame = self.build_frame(
            games=26,
            seed=721,
        )

        report = (
            run_random_forest_benchmark(
                frame,
                random_states=(13,),
                n_estimators=20,
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
                'decisionTree',
                'randomForest',
            },
        )

    def test_first_decision_is_default_scope(
        self,
    ):
        frame = self.build_frame(
            games=24,
            seed=731,
        )

        report = (
            run_random_forest_benchmark(
                frame,
                random_states=(17,),
                n_estimators=20,
            )
        )

        self.assertTrue(
            report[
                'configuration'
            ][
                'firstDecisionOnly'
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

    def test_improvement_against_tree_is_reported(
        self,
    ):
        frame = self.build_frame(
            games=26,
            seed=741,
        )

        report = (
            run_random_forest_benchmark(
                frame,
                random_states=(
                    19,
                    23,
                ),
                n_estimators=20,
            )
        )

        self.assertIn(
            'balancedAccuracy',
            report[
                'improvementVsDecisionTree'
            ],
        )

        self.assertEqual(
            report[
                'summary'
            ][
                'randomForest'
            ][
                'metrics'
            ][
                'balancedAccuracy'
            ][
                'count'
            ],
            2,
        )

    def test_report_is_written(
        self,
    ):
        frame = self.build_frame(
            games=22,
            seed=751,
        )

        with tempfile.TemporaryDirectory() as directory:
            path = (
                write_random_forest_benchmark(
                    frame,
                    (
                        f'{directory}'
                        '/random-forest.json'
                    ),
                    random_states=(29,),
                    n_estimators=20,
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
