import tempfile
import unittest

from data.ml_ablation import (
    FEATURE_SETS,
    run_feature_ablation,
    write_feature_ablation_report,
)
from data.ml_dataset import (
    TRAINING_FEATURES,
    build_ml_ready_dataset,
)
from data.pipeline import load_raw_dataset
from simulation.exporter import export_series
from simulation.runner import run_series


class MlAblationTest(
    unittest.TestCase
):
    def build_frame(
        self,
        games=24,
        seed=571,
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

    def test_feature_sets_are_explicit(
        self,
    ):
        self.assertEqual(
            FEATURE_SETS['full'],
            TRAINING_FEATURES,
        )

        self.assertEqual(
            FEATURE_SETS[
                'handStrengthOnly'
            ],
            (
                'hand_strength',
            ),
        )

        self.assertNotIn(
            'hand_strength',
            FEATURE_SETS[
                'withoutHandStrength'
            ],
        )

        self.assertNotIn(
            'special_state',
            FEATURE_SETS[
                'withoutSpecialContext'
            ],
        )

    def test_ablation_defaults_to_first_decisions(
        self,
    ):
        frame = self.build_frame(
            games=24,
            seed=581,
        )

        report = run_feature_ablation(
            frame,
            random_states=(11,),
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

    def test_every_feature_set_is_evaluated(
        self,
    ):
        frame = self.build_frame(
            games=24,
            seed=591,
        )

        report = run_feature_ablation(
            frame,
            random_states=(13,),
        )

        self.assertEqual(
            set(
                report[
                    'runs'
                ][0][
                    'models'
                ]
            ),
            set(
                FEATURE_SETS
            ),
        )

    def test_summary_aggregates_repeated_runs(
        self,
    ):
        frame = self.build_frame(
            games=28,
            seed=601,
        )

        report = run_feature_ablation(
            frame,
            random_states=(
                17,
                19,
            ),
        )

        for feature_set_name in FEATURE_SETS:
            self.assertEqual(
                report[
                    'summary'
                ][
                    feature_set_name
                ][
                    'metrics'
                ][
                    'balancedAccuracy'
                ][
                    'count'
                ],
                2,
            )

    def test_changes_are_reported_against_full(
        self,
    ):
        frame = self.build_frame(
            games=24,
            seed=611,
        )

        report = run_feature_ablation(
            frame,
            random_states=(23,),
        )

        self.assertIn(
            'withoutHandStrength',
            report[
                'changeVsFull'
            ],
        )

        self.assertIn(
            'balancedAccuracy',
            report[
                'changeVsFull'
            ][
                'withoutHandStrength'
            ],
        )

        self.assertNotIn(
            'full',
            report[
                'changeVsFull'
            ],
        )

    def test_ablation_report_is_written(
        self,
    ):
        frame = self.build_frame(
            games=20,
            seed=621,
        )

        with tempfile.TemporaryDirectory() as directory:
            path = (
                write_feature_ablation_report(
                    frame,
                    (
                        f'{directory}'
                        '/feature-ablation.json'
                    ),
                    random_states=(29,),
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
