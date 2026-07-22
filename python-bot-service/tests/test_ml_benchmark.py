import json
import tempfile
import unittest

from data.ml_benchmark import (
    MODEL_NAMES,
    run_repeated_benchmarks,
    write_benchmark_suite_report,
)
from data.ml_dataset import build_ml_ready_dataset
from data.pipeline import load_raw_dataset
from simulation.exporter import export_series
from simulation.runner import run_series


class MlBenchmarkTest(unittest.TestCase):
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

    def test_suite_runs_every_model_for_every_seed(self):
        _, frame = self.build_frame(
            'aggressive',
            'balanced',
            12,
            371,
        )

        report = run_repeated_benchmarks(
            frame,
            random_states=(11, 13),
            test_size=0.25,
        )

        self.assertEqual(
            len(report['runs']),
            2,
        )

        for run in report['runs']:
            self.assertEqual(
                set(run['models']),
                set(MODEL_NAMES),
            )

            splits = [
                run['models'][model]['split']
                for model in MODEL_NAMES
            ]

            self.assertTrue(
                all(
                    split == splits[0]
                    for split in splits[1:]
                )
            )

    def test_summary_aggregates_every_seed(self):
        _, frame = self.build_frame(
            'balanced',
            'cautious',
            12,
            381,
        )

        report = run_repeated_benchmarks(
            frame,
            random_states=(17, 19, 23),
        )

        for model in MODEL_NAMES:
            metrics = (
                report['summary'][model]
                ['metrics']
            )

            self.assertEqual(
                metrics['accuracy']['count'],
                3,
            )

            self.assertIsNotNone(
                metrics['accuracy']['mean']
            )

            self.assertIsNotNone(
                metrics['brierScore']
                ['standardDeviation']
            )

    def test_suite_reports_best_models(self):
        _, frame = self.build_frame(
            'aggressive',
            'cautious',
            12,
            391,
        )

        report = run_repeated_benchmarks(
            frame,
            random_states=(29, 31),
        )

        self.assertIn(
            report[
                'bestByBalancedAccuracy'
            ]['model'],
            MODEL_NAMES,
        )

        self.assertIn(
            report[
                'bestByBrierScore'
            ]['model'],
            MODEL_NAMES,
        )

    def test_suite_is_deterministic(self):
        _, frame = self.build_frame(
            'balanced',
            'aggressive',
            10,
            401,
        )

        first = run_repeated_benchmarks(
            frame,
            random_states=(37, 41),
        )

        second = run_repeated_benchmarks(
            frame,
            random_states=(37, 41),
        )

        self.assertEqual(
            first,
            second,
        )

    def test_report_is_written_as_json(self):
        result = run_series(
            'balanced',
            'cautious',
            games=10,
            seed=411,
        )

        with tempfile.TemporaryDirectory() as directory:
            export_series(
                result,
                directory,
            )

            path = write_benchmark_suite_report(
                directory,
                random_states=(43, 47),
            )

            payload = json.loads(
                path.read_text(
                    encoding='utf-8',
                )
            )

        self.assertEqual(
            payload['configuration']
            ['randomStates'],
            [43, 47],
        )

        self.assertEqual(
            set(payload['summary']),
            set(MODEL_NAMES),
        )

    def test_empty_random_states_are_rejected(self):
        _, frame = self.build_frame(
            'aggressive',
            'balanced',
            4,
            421,
        )

        with self.assertRaisesRegex(
            ValueError,
            'at least one random state',
        ):
            run_repeated_benchmarks(
                frame,
                random_states=(),
            )


if __name__ == '__main__':
    unittest.main()
