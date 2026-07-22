import json
import tempfile
import unittest

from data.ml_baseline import (
    grouped_train_test_split,
    run_dummy_baseline,
    write_dummy_baseline_report,
)
from data.ml_dataset import (
    build_ml_ready_dataset,
)
from data.pipeline import (
    DatasetValidationError,
    load_raw_dataset,
)
from simulation.exporter import (
    export_series,
)
from simulation.runner import run_series


class MlBaselineTest(unittest.TestCase):
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

    def test_split_keeps_matches_disjoint(self):
        _, frame = self.build_frame(
            'aggressive',
            'balanced',
            12,
            241,
        )

        train, test = (
            grouped_train_test_split(
                frame,
                test_size=0.25,
                random_state=42,
            )
        )

        train_matches = set(
            train['match_id']
        )
        test_matches = set(
            test['match_id']
        )

        self.assertEqual(
            train_matches.intersection(
                test_matches
            ),
            set(),
        )

        self.assertEqual(
            len(train) + len(test),
            len(frame),
        )

    def test_split_is_deterministic(self):
        _, frame = self.build_frame(
            'balanced',
            'cautious',
            10,
            251,
        )

        first_train, first_test = (
            grouped_train_test_split(
                frame,
                random_state=17,
            )
        )

        second_train, second_test = (
            grouped_train_test_split(
                frame,
                random_state=17,
            )
        )

        self.assertEqual(
            list(
                first_train[
                    'decision_id'
                ]
            ),
            list(
                second_train[
                    'decision_id'
                ]
            ),
        )

        self.assertEqual(
            list(
                first_test[
                    'decision_id'
                ]
            ),
            list(
                second_test[
                    'decision_id'
                ]
            ),
        )

    def test_dummy_baseline_reports_metrics(self):
        _, frame = self.build_frame(
            'aggressive',
            'cautious',
            12,
            261,
        )

        report = run_dummy_baseline(
            frame,
            test_size=0.25,
            random_state=23,
        )

        self.assertEqual(
            report['model'],
            'DummyClassifier',
        )

        self.assertEqual(
            report['strategy'],
            'prior',
        )

        self.assertFalse(
            report['usesGameFeatures']
        )

        self.assertEqual(
            report['split'][
                'groupColumn'
            ],
            'match_id',
        )

        self.assertEqual(
            (
                report['split'][
                    'trainRows'
                ]
                + report['split'][
                    'testRows'
                ]
            ),
            len(frame),
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

    def test_single_match_is_rejected(self):
        _, frame = self.build_frame(
            'aggressive',
            'balanced',
            1,
            271,
        )

        with self.assertRaisesRegex(
            DatasetValidationError,
            'at least two match groups',
        ):
            grouped_train_test_split(
                frame
            )

    def test_report_is_written_as_json(self):
        result = run_series(
            'balanced',
            'cautious',
            games=8,
            seed=281,
        )

        with tempfile.TemporaryDirectory() as directory:
            export_series(
                result,
                directory,
            )

            path = (
                write_dummy_baseline_report(
                    directory
                )
            )

            payload = json.loads(
                path.read_text(
                    encoding='utf-8',
                )
            )

        self.assertEqual(
            payload['model'],
            'DummyClassifier',
        )

        self.assertEqual(
            payload['split'][
                'groupColumn'
            ],
            'match_id',
        )

        self.assertIn(
            'metrics',
            payload,
        )


if __name__ == '__main__':
    unittest.main()
