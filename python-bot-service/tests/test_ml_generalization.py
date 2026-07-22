import tempfile
import unittest

import pandas as pd

from data.ml_dataset import (
    build_ml_ready_dataset,
)
from data.ml_generalization import (
    run_leave_one_run_out_validation,
    write_generalization_report,
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


MATCHUPS = (
    (
        'aggressive',
        'balanced',
    ),
    (
        'balanced',
        'cautious',
    ),
    (
        'cautious',
        'aggressive',
    ),
)


class MlGeneralizationTest(
    unittest.TestCase
):
    def build_frame(
        self,
        runs=3,
        games=16,
        seed=811,
    ):
        frames = []

        for index in range(
            runs
        ):
            profile_one, profile_two = (
                MATCHUPS[
                    index
                    % len(
                        MATCHUPS
                    )
                ]
            )

            result = run_series(
                profile_one,
                profile_two,
                games=games,
                seed=(
                    seed
                    + index
                ),
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

                frames.append(
                    build_ml_ready_dataset(
                        dataset
                    )
                )

        return pd.concat(
            frames,
            ignore_index=True,
        )

    def test_requires_multiple_simulation_runs(
        self,
    ):
        frame = self.build_frame(
            runs=1
        )

        with self.assertRaises(
            ValueError
        ):
            run_leave_one_run_out_validation(
                frame,
                n_estimators=20,
            )

    def test_every_simulation_run_is_held_out_once(
        self,
    ):
        frame = self.build_frame()

        report = (
            run_leave_one_run_out_validation(
                frame,
                n_estimators=20,
            )
        )

        expected = set(
            frame[
                'simulation_run_id'
            ]
            .astype(str)
            .unique()
        )

        actual = {
            run[
                'heldOutSimulationRunId'
            ]
            for run in report[
                'runs'
            ]
        }

        self.assertEqual(
            actual,
            expected,
        )

    def test_train_and_test_runs_are_isolated(
        self,
    ):
        frame = self.build_frame()

        report = (
            run_leave_one_run_out_validation(
                frame,
                n_estimators=20,
            )
        )

        for run in report[
            'runs'
        ]:
            self.assertEqual(
                run[
                    'split'
                ][
                    'testSimulationRuns'
                ],
                1,
            )

            self.assertEqual(
                run[
                    'split'
                ][
                    'trainSimulationRuns'
                ],
                2,
            )

    def test_logistic_and_forest_are_compared(
        self,
    ):
        frame = self.build_frame()

        report = (
            run_leave_one_run_out_validation(
                frame,
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
                'logisticRegression',
                'randomForest',
            },
        )

        self.assertIn(
            'randomForest',
            report[
                'worstByBalancedAccuracy'
            ],
        )

    def test_generalization_report_is_written(
        self,
    ):
        frame = self.build_frame()

        with tempfile.TemporaryDirectory() as directory:
            path = (
                write_generalization_report(
                    frame,
                    (
                        f'{directory}'
                        '/generalization.json'
                    ),
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
