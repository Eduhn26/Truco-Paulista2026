import tempfile
import unittest

from data.ml_card_features import (
    FEATURE_SETS,
    RAW_CARD_FEATURES,
    derive_raw_card_features,
    extract_raw_card_features,
    run_raw_card_feature_benchmark,
    write_raw_card_feature_report,
)
from data.ml_dataset import (
    build_ml_ready_dataset,
)
from data.pipeline import load_raw_dataset
from simulation.exporter import export_series
from simulation.runner import run_series


class MlCardFeaturesTest(
    unittest.TestCase
):
    def build_frame(
        self,
        games=24,
        seed=631,
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

    def test_raw_features_capture_card_order_and_manilha(
        self,
    ):
        features = (
            extract_raw_card_features(
                [
                    'QP',
                    '3C',
                    '4O',
                ],
                '7',
            )
        )

        self.assertEqual(
            features[
                'raw_card_count'
            ],
            3,
        )

        self.assertEqual(
            features[
                'raw_manilha_count'
            ],
            1,
        )

        self.assertEqual(
            features[
                'raw_strongest_card_power'
            ],
            13.0,
        )

        self.assertEqual(
            features[
                'raw_second_card_power'
            ],
            9.0,
        )

        self.assertEqual(
            features[
                'raw_weakest_card_power'
            ],
            0.0,
        )

    def test_derived_features_preserve_rows(
        self,
    ):
        frame = self.build_frame()

        raw = derive_raw_card_features(
            frame
        )

        self.assertEqual(
            len(raw),
            len(frame),
        )

        self.assertEqual(
            tuple(raw.columns),
            RAW_CARD_FEATURES,
        )

        self.assertFalse(
            raw.isna().any().any()
        )

    def test_raw_card_models_do_not_use_hand_strength(
        self,
    ):
        self.assertNotIn(
            'hand_strength',
            FEATURE_SETS[
                'rawCardsOnly'
            ],
        )

        self.assertNotIn(
            'hand_strength',
            FEATURE_SETS[
                'rawCardsPlusContext'
            ],
        )

        self.assertIn(
            'hand_strength',
            FEATURE_SETS[
                'fullCurrentModel'
            ],
        )

    def test_benchmark_evaluates_every_feature_set(
        self,
    ):
        frame = self.build_frame(
            games=28,
            seed=641,
        )

        report = (
            run_raw_card_feature_benchmark(
                frame,
                random_states=(11,),
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
            set(
                FEATURE_SETS
            ),
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

    def test_raw_card_report_is_written(
        self,
    ):
        frame = self.build_frame(
            games=24,
            seed=651,
        )

        with tempfile.TemporaryDirectory() as directory:
            path = (
                write_raw_card_feature_report(
                    frame,
                    (
                        f'{directory}'
                        '/raw-card-features.json'
                    ),
                    random_states=(13,),
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
