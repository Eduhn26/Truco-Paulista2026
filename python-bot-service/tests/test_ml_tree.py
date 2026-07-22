import json
import tempfile
import unittest

from data.ml_dataset import (
    build_ml_ready_dataset,
)
from data.ml_tree import (
    build_decision_tree_pipeline,
    compare_tree_benchmarks,
    run_decision_tree,
    write_tree_comparison_report,
)
from data.pipeline import load_raw_dataset
from simulation.exporter import export_series
from simulation.runner import run_series


class MlTreeTest(unittest.TestCase):
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

    def test_pipeline_has_preprocessor_and_tree(self):
        pipeline = build_decision_tree_pipeline()

        self.assertEqual(
            list(pipeline.named_steps),
            [
                'preprocessor',
                'model',
            ],
        )

        self.assertEqual(
            pipeline.named_steps[
                'model'
            ].max_depth,
            6,
        )

    def test_tree_uses_grouped_split(self):
        _, frame = self.build_frame(
            'aggressive',
            'balanced',
            16,
            331,
        )

        report = run_decision_tree(
            frame,
            test_size=0.25,
            random_state=47,
        )

        self.assertEqual(
            report['model'],
            'DecisionTreeClassifier',
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

    def test_tree_reports_metrics_and_parameters(self):
        _, frame = self.build_frame(
            'balanced',
            'cautious',
            16,
            341,
        )

        report = run_decision_tree(
            frame,
            random_state=53,
            max_depth=5,
            min_samples_leaf=8,
        )

        self.assertEqual(
            report['parameters'],
            {
                'maxDepth': 5,
                'minSamplesLeaf': 8,
            },
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

    def test_comparison_reuses_same_split(self):
        _, frame = self.build_frame(
            'aggressive',
            'cautious',
            16,
            351,
        )

        report = compare_tree_benchmarks(
            frame,
            test_size=0.25,
            random_state=59,
        )

        self.assertEqual(
            report['dummy']['split'],
            report['logisticRegression']['split'],
        )

        self.assertEqual(
            report['dummy']['split'],
            report['decisionTree']['split'],
        )

        self.assertIn(
            'balancedAccuracy',
            report['deltaVsDummy'],
        )

        self.assertIn(
            'rocAuc',
            report['deltaVsLogistic'],
        )

    def test_comparison_report_is_written(self):
        result = run_series(
            'balanced',
            'aggressive',
            games=14,
            seed=361,
        )

        with tempfile.TemporaryDirectory() as directory:
            export_series(
                result,
                directory,
            )

            path = write_tree_comparison_report(
                directory,
                random_state=61,
            )

            payload = json.loads(
                path.read_text(
                    encoding='utf-8',
                )
            )

        self.assertEqual(
            payload['decisionTree']['model'],
            'DecisionTreeClassifier',
        )

        self.assertEqual(
            payload['logisticRegression']['model'],
            'LogisticRegression',
        )

        self.assertEqual(
            payload['dummy']['model'],
            'DummyClassifier',
        )


if __name__ == '__main__':
    unittest.main()
