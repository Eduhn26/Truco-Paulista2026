import tempfile
import unittest

import pandas as pd

from data.ml_dataset import (
    build_ml_ready_dataset,
)
from data.ml_matchup_generalization import (
    identify_matchup_pairs,
    run_leave_one_matchup_pair_out_validation,
    write_matchup_generalization_report,
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
        'aggressive',
    ),
    (
        'aggressive',
        'cautious',
    ),
    (
        'cautious',
        'aggressive',
    ),
    (
        'balanced',
        'cautious',
    ),
    (
        'cautious',
        'balanced',
    ),
)


class MlMatchupGeneralizationTest(
    unittest.TestCase
):
    def build_frame(
        self,
        games=12,
        seed=821,
    ):
        frames = []

        for index, (
            profile_one,
            profile_two,
        ) in enumerate(
            MATCHUPS
        ):
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

    def test_reverse_matchups_share_same_pair(
        self,
    ):
        frame = self.build_frame()

        mapping = (
            identify_matchup_pairs(
                frame
            )
        )

        pair_counts = {}

        for metadata in mapping.values():
            key = metadata[
                'matchupKey'
            ]

            pair_counts[
                key
            ] = (
                pair_counts.get(
                    key,
                    0,
                )
                + 1
            )

        self.assertEqual(
            len(
                pair_counts
            ),
            3,
        )

        self.assertEqual(
            set(
                pair_counts.values()
            ),
            {
                2,
            },
        )

    def test_each_matchup_pair_is_held_out_once(
        self,
    ):
        frame = self.build_frame()

        report = (
            run_leave_one_matchup_pair_out_validation(
                frame,
                n_estimators=20,
            )
        )

        self.assertEqual(
            len(
                report[
                    'runs'
                ]
            ),
            3,
        )

        self.assertEqual(
            len(
                {
                    run[
                        'heldOutMatchup'
                    ]
                    for run in report[
                        'runs'
                    ]
                }
            ),
            3,
        )

    def test_both_orientations_are_held_out_together(
        self,
    ):
        frame = self.build_frame()

        report = (
            run_leave_one_matchup_pair_out_validation(
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
                2,
            )

            self.assertEqual(
                run[
                    'split'
                ][
                    'trainSimulationRuns'
                ],
                4,
            )

            self.assertEqual(
                len(
                    run[
                        'heldOutSimulationRunIds'
                    ]
                ),
                2,
            )

    def test_models_are_compared(
        self,
    ):
        frame = self.build_frame()

        report = (
            run_leave_one_matchup_pair_out_validation(
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

    def test_report_is_written(
        self,
    ):
        frame = self.build_frame(
            games=10
        )

        with tempfile.TemporaryDirectory() as directory:
            path = (
                write_matchup_generalization_report(
                    frame,
                    (
                        f'{directory}'
                        '/matchup-generalization.json'
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
