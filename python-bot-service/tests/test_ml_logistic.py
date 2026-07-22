import json
import tempfile
import unittest

from data.ml_logistic import (
    build_logistic_pipeline,
    compare_logistic_to_dummy,
    run_logistic_regression,
    write_logistic_comparison_report,
)
from data.ml_dataset import (
    build_ml_ready_dataset,
)
from data.pipeline import load_raw_dataset
from simulation.exporter import export_series
from simulation.runner import run_series


class MlLogisticTest(unittest.TestCase):
    def build_frame(
        self,
        profile_one,
        profile_two,
        games,
        seed,
    ):
        result = run_series(
            profile_one,
            profile_two,
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

            frame = build_ml_ready_dataset(
                dataset
            )

        return result, frame

    def test_pipeline_has_preprocessor_and_model(self):
        pipeline = build_logistic_pipeline()

        self.assertEqual(
            list(pipeline.named_steps),
            [
                'preprocessor',
                'model',
            ],
        )

    def test_logistic_uses_grouped_split(self):
        _, frame = self.build_frame(
            'aggressive',
            'balanced',
            16,
            291,
        )

        report = run_logistic_regression(
            frame,
            test_size=0.25,
            random_state=31,
        )

        self.assertEqual(
            report['model'],
            'LogisticRegression',
        )

        self.assertEqual(
            report['split']['groupColumn'],
            'match_id',
        )

        self.assertEqual(
            (
                report['split']['trainRows']
                + report['split']['testRows']
            ),
            len(frame),
        )

    def test_logistic_reports_metrics(self):
        _, frame = self.build_frame(
            'balanced',
            'cautious',
            16,
            301,
        )

        report = run_logistic_regression(
            frame,
            random_state=37,
        )

        for metric in (
            'accuracy',
            'balancedAccuracy',
            'rocAuc',
            'brierScore',
            'logLoss',
        ):
            self.assertIn(
                metric,
                report['metrics'],
            )

    def test_logistic_handles_fully_missing_numeric_feature(self):
        _, frame = self.build_frame(
            'balanced',
            'aggressive',
            20,
            306,
        )

        frame = frame.copy()
        frame['pending_value'] = None

        report = run_logistic_regression(
            frame,
            random_state=39,
        )

        self.assertEqual(
            report['model'],
            'LogisticRegression',
        )

        self.assertIn(
            'balancedAccuracy',
            report['metrics'],
        )

    def test_comparison_matches_split_configuration(self):
        _, frame = self.build_frame(
            'aggressive',
            'cautious',
            16,
            311,
        )

        report = compare_logistic_to_dummy(
            frame,
            test_size=0.25,
            random_state=41,
        )

        self.assertEqual(
            report['dummy']['split'],
            report[
                'logisticRegression'
            ]['split'],
        )

        self.assertIn(
            'balancedAccuracy',
            report['delta'],
        )

        self.assertIn(
            'rocAuc',
            report['delta'],
        )

    def test_comparison_report_is_written(self):
        result = run_series(
            'balanced',
            'aggressive',
            games=14,
            seed=321,
        )

        with tempfile.TemporaryDirectory() as directory:
            export_series(
                result,
                directory,
            )

            path = (
                write_logistic_comparison_report(
                    directory,
                    random_state=43,
                )
            )

            payload = json.loads(
                path.read_text(
                    encoding='utf-8',
                )
            )

        self.assertEqual(
            payload[
                'logisticRegression'
            ]['model'],
            'LogisticRegression',
        )

        self.assertEqual(
            payload['dummy']['model'],
            'DummyClassifier',
        )

        self.assertIn(
            'delta',
            payload,
        )


if __name__ == '__main__':
    unittest.main()

