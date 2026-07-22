import json
import tempfile
import unittest

import pandas as pd

from data.ml_experiment import (
    DEFAULT_MATCHUPS,
    build_experiment_dataset,
    run_benchmark_experiment,
    write_benchmark_experiment,
)


class MlExperimentTest(unittest.TestCase):
    def test_default_matchups_balance_seat_order(self):
        matchup_set = set(
            DEFAULT_MATCHUPS
        )

        for (
            profile_one,
            profile_two,
        ) in DEFAULT_MATCHUPS:
            self.assertIn(
                (
                    profile_two,
                    profile_one,
                ),
                matchup_set,
            )

    def test_experiment_combines_all_matchups(self):
        frame, matchups = (
            build_experiment_dataset(
                games_per_matchup=3,
                seed=431,
            )
        )

        expected_matches = (
            len(DEFAULT_MATCHUPS)
            * 3
        )

        self.assertEqual(
            frame['match_id'].nunique(),
            expected_matches,
        )

        self.assertEqual(
            len(matchups),
            len(DEFAULT_MATCHUPS),
        )

        self.assertEqual(
            frame[
                'simulation_run_id'
            ].nunique(),
            len(DEFAULT_MATCHUPS),
        )

    def test_experiment_is_deterministic(self):
        first, _ = (
            build_experiment_dataset(
                games_per_matchup=2,
                seed=441,
            )
        )

        second, _ = (
            build_experiment_dataset(
                games_per_matchup=2,
                seed=441,
            )
        )

        pd.testing.assert_frame_equal(
            first,
            second,
        )

    def test_benchmark_runs_on_combined_dataset(self):
        report = run_benchmark_experiment(
            games_per_matchup=8,
            seed=451,
            random_states=(11, 13),
            test_size=0.25,
        )

        self.assertEqual(
            report['dataset']['matches'],
            (
                len(DEFAULT_MATCHUPS)
                * 8
            ),
        )

        self.assertEqual(
            len(
                report[
                    'benchmark'
                ]['runs']
            ),
            2,
        )

        self.assertEqual(
            set(
                report[
                    'benchmark'
                ]['summary']
            ),
            {
                'dummy',
                'logisticRegression',
                'decisionTree',
            },
        )

    def test_experiment_artifacts_are_written(self):
        with tempfile.TemporaryDirectory() as directory:
            paths = write_benchmark_experiment(
                directory,
                games_per_matchup=4,
                seed=461,
                random_states=(17,),
            )

            dataset = pd.read_csv(
                paths['dataset']
            )

            report = json.loads(
                paths['report'].read_text(
                    encoding='utf-8',
                )
            )

        self.assertFalse(
            dataset.empty
        )

        self.assertEqual(
            report['dataset']['matches'],
            (
                len(DEFAULT_MATCHUPS)
                * 4
            ),
        )

        self.assertIn(
            'benchmark',
            report,
        )

    def test_invalid_experiment_configuration_is_rejected(self):
        with self.assertRaisesRegex(
            ValueError,
            'greater than zero',
        ):
            build_experiment_dataset(
                games_per_matchup=0,
            )

        with self.assertRaisesRegex(
            ValueError,
            'at least one matchup',
        ):
            build_experiment_dataset(
                games_per_matchup=1,
                matchups=(),
            )


if __name__ == '__main__':
    unittest.main()
