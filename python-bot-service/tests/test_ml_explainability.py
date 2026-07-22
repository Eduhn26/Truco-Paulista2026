import tempfile
import unittest

from data.ml_dataset import (
    build_ml_ready_dataset,
)
from data.ml_explainability import (
    compare_logistic_explanations,
    explain_logistic_regression,
    write_logistic_explainability_report,
)
from data.pipeline import load_raw_dataset
from simulation.exporter import export_series
from simulation.runner import run_series


class MlExplainabilityTest(
    unittest.TestCase
):
    def build_frame(
        self,
        games=20,
        seed=521,
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

    def test_explanation_ranks_features(
        self,
    ):
        frame = self.build_frame()

        report = explain_logistic_regression(
            frame,
            random_state=11,
            top_n=5,
        )

        self.assertEqual(
            report['model'],
            'LogisticRegression',
        )

        self.assertEqual(
            len(
                report[
                    'topByAbsoluteCoefficient'
                ]
            ),
            5,
        )

        self.assertGreater(
            report[
                'transformedFeatureCount'
            ],
            0,
        )

    def test_first_decision_explanation_uses_reduced_dataset(
        self,
    ):
        frame = self.build_frame(
            games=20,
            seed=531,
        )

        all_report = explain_logistic_regression(
            frame,
            first_decision_only=False,
            random_state=13,
        )

        first_report = explain_logistic_regression(
            frame,
            first_decision_only=True,
            random_state=13,
        )

        self.assertLess(
            (
                first_report['trainingRows']
                + first_report['testRows']
            ),
            (
                all_report['trainingRows']
                + all_report['testRows']
            ),
        )

    def test_feature_directions_are_explicit(
        self,
    ):
        frame = self.build_frame(
            games=18,
            seed=541,
        )

        report = explain_logistic_regression(
            frame,
            random_state=17,
        )

        valid_directions = {
            'increases_win_probability',
            'decreases_win_probability',
            'neutral',
        }

        for feature in report[
            'allFeatures'
        ]:
            self.assertIn(
                feature['direction'],
                valid_directions,
            )

    def test_comparison_contains_both_stages(
        self,
    ):
        frame = self.build_frame(
            games=20,
            seed=551,
        )

        report = (
            compare_logistic_explanations(
                frame,
                random_state=19,
            )
        )

        self.assertIn(
            'allDecisions',
            report,
        )

        self.assertIn(
            'firstDecisionPerPlayerHand',
            report,
        )

    def test_explainability_report_is_written(
        self,
    ):
        frame = self.build_frame(
            games=16,
            seed=561,
        )

        with tempfile.TemporaryDirectory() as directory:
            path = (
                write_logistic_explainability_report(
                    frame,
                    (
                        f'{directory}'
                        '/explainability.json'
                    ),
                    random_state=23,
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
