import tempfile
import unittest

from data.ml_dataset import (
    build_ml_ready_dataset,
)
from data.ml_random_forest_tuning import (
    build_feature_importance_report,
    run_random_forest_tuning,
    write_random_forest_tuning_report,
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


TEST_CONFIGS = (
    {
        'name': 'smallA',
        'n_estimators': 20,
        'max_depth': 6,
        'min_samples_leaf': 5,
        'max_features': 'sqrt',
    },
    {
        'name': 'smallB',
        'n_estimators': 20,
        'max_depth': 10,
        'min_samples_leaf': 3,
        'max_features': 'sqrt',
    },
)


class MlRandomForestTuningTest(
    unittest.TestCase
):
    def build_frame(
        self,
        games=24,
        seed=761,
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

    def test_tuning_evaluates_all_configurations(
        self,
    ):
        frame = self.build_frame()

        report = (
            run_random_forest_tuning(
                frame,
                configs=TEST_CONFIGS,
                random_states=(11,),
            )
        )

        self.assertEqual(
            set(
                report[
                    'summary'
                ]
            ),
            {
                'smallA',
                'smallB',
            },
        )

    def test_tuning_selects_best_configuration(
        self,
    ):
        frame = self.build_frame(
            games=26,
            seed=771,
        )

        report = (
            run_random_forest_tuning(
                frame,
                configs=TEST_CONFIGS,
                random_states=(
                    13,
                    17,
                ),
            )
        )

        self.assertIn(
            report[
                'bestByBalancedAccuracy'
            ][
                'configuration'
            ],
            {
                'smallA',
                'smallB',
            },
        )

    def test_feature_importance_excludes_hand_strength(
        self,
    ):
        frame = self.build_frame(
            games=26,
            seed=781,
        )

        report = (
            build_feature_importance_report(
                frame,
                TEST_CONFIGS[0],
                random_state=19,
                top_n=10,
            )
        )

        feature_names = {
            item[
                'feature'
            ]
            for item in report[
                'allFeatures'
            ]
        }

        self.assertNotIn(
            'hand_strength',
            feature_names,
        )

        self.assertGreater(
            report[
                'importanceSum'
            ],
            0.99,
        )

        self.assertLess(
            report[
                'importanceSum'
            ],
            1.01,
        )

    def test_feature_importance_is_ranked(
        self,
    ):
        frame = self.build_frame(
            games=26,
            seed=791,
        )

        report = (
            build_feature_importance_report(
                frame,
                TEST_CONFIGS[1],
                random_state=23,
                top_n=5,
            )
        )

        importances = [
            item[
                'importance'
            ]
            for item in report[
                'topFeatures'
            ]
        ]

        self.assertEqual(
            importances,
            sorted(
                importances,
                reverse=True,
            ),
        )

    def test_tuning_report_is_written(
        self,
    ):
        frame = self.build_frame(
            games=22,
            seed=801,
        )

        with tempfile.TemporaryDirectory() as directory:
            path = (
                write_random_forest_tuning_report(
                    frame,
                    (
                        f'{directory}'
                        '/random-forest-tuning.json'
                    ),
                    configs=TEST_CONFIGS,
                    random_states=(29,),
                    top_n=5,
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
