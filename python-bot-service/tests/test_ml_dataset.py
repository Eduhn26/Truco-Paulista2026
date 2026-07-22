import json
import tempfile
import unittest

from data.ml_dataset import (
    FORBIDDEN_FEATURES,
    ML_READY_COLUMNS,
    SPLIT_GROUP_COLUMN,
    TARGET_COLUMN,
    TRAINING_FEATURES,
    build_ml_ready_dataset,
    export_ml_ready_bundle,
    feature_frame,
    ml_dataset_contract,
    split_groups,
    target_series,
    validate_group_split,
)
from data.pipeline import (
    DatasetValidationError,
    load_raw_dataset,
)
from simulation.exporter import export_series
from simulation.results import SeriesResult
from simulation.runner import run_series


class MlDatasetTest(unittest.TestCase):
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
            export_series(result, directory)
            dataset = load_raw_dataset(directory)
            frame = build_ml_ready_dataset(dataset)

        return result, frame

    def test_contract_blocks_leakage(self):
        contract = ml_dataset_contract()

        self.assertEqual(
            contract['target'],
            TARGET_COLUMN,
        )
        self.assertEqual(
            contract['splitGroup'],
            SPLIT_GROUP_COLUMN,
        )
        self.assertEqual(
            set(TRAINING_FEATURES)
            .intersection(FORBIDDEN_FEATURES),
            set(),
        )
        self.assertNotIn(
            'action',
            TRAINING_FEATURES,
        )
        self.assertNotIn(
            'profile',
            TRAINING_FEATURES,
        )

    def test_dataset_and_views_are_aligned(self):
        result, frame = self.build_frame(
            'aggressive',
            'balanced',
            5,
            171,
        )

        self.assertEqual(
            tuple(frame.columns),
            ML_READY_COLUMNS,
        )
        self.assertEqual(
            len(frame),
            len(result.decisions),
        )

        self.assertEqual(
            len(feature_frame(frame)),
            len(frame),
        )
        self.assertEqual(
            len(target_series(frame)),
            len(frame),
        )
        self.assertTrue(
            split_groups(frame).equals(
                frame['match_id']
            )
        )

    def test_profile_is_optional(self):
        _, frame = self.build_frame(
            'balanced',
            'cautious',
            3,
            181,
        )

        self.assertNotIn(
            'profile',
            feature_frame(frame).columns,
        )
        self.assertIn(
            'profile',
            feature_frame(
                frame,
                include_profile=True,
            ).columns,
        )

    def test_group_overlap_is_rejected(self):
        _, frame = self.build_frame(
            'aggressive',
            'cautious',
            4,
            191,
        )

        groups = split_groups(frame)
        first_match = groups.iloc[0]

        overlap = groups[
            groups.eq(first_match)
        ]

        with self.assertRaisesRegex(
            DatasetValidationError,
            'overlapping match groups',
        ):
            validate_group_split(
                overlap,
                overlap,
            )

    def test_bundle_exports_dataset_and_contract(self):
        result = run_series(
            'balanced',
            'aggressive',
            games=3,
            seed=201,
        )

        with tempfile.TemporaryDirectory() as directory:
            export_series(result, directory)

            paths = export_ml_ready_bundle(
                directory
            )

            contract = json.loads(
                paths['contract'].read_text(
                    encoding='utf-8',
                )
            )

            self.assertTrue(
                paths['dataset'].exists()
            )
            self.assertEqual(
                contract['target'],
                TARGET_COLUMN,
            )

        empty = SeriesResult(
            simulation_run_id='empty',
            profile_one='aggressive',
            profile_two='balanced',
            games=0,
            seed=1,
        )

        with tempfile.TemporaryDirectory() as directory:
            export_series(empty, directory)

            paths = export_ml_ready_bundle(
                directory
            )

            self.assertTrue(
                paths['dataset'].exists()
            )


if __name__ == '__main__':
    unittest.main()
