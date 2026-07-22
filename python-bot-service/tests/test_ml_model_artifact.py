import tempfile
import unittest

from data.ml_dataset import (
    build_ml_ready_dataset,
)
from data.ml_model_artifact import (
    MODEL_ARTIFACT_VERSION,
    build_candidate_metadata,
    load_candidate_model,
    predict_candidate_probabilities,
    save_candidate_model,
    train_candidate_model,
)
from data.ml_primary import (
    PRIMARY_TRAINING_FEATURES,
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


class MlModelArtifactTest(
    unittest.TestCase
):
    def build_frame(
        self,
        games=28,
        seed=831,
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

            dataset = (
                load_raw_dataset(
                    directory
                )
            )

            return build_ml_ready_dataset(
                dataset
            )

    def test_candidate_contract_excludes_hand_strength(
        self,
    ):
        frame = self.build_frame()

        bundle = train_candidate_model(
            frame,
            n_estimators=20,
        )

        self.assertEqual(
            bundle[
                'artifactVersion'
            ],
            MODEL_ARTIFACT_VERSION,
        )

        self.assertFalse(
            bundle[
                'handStrengthIncluded'
            ]
        )

        self.assertNotIn(
            'hand_strength',
            bundle[
                'trainingFeatures'
            ],
        )

        self.assertEqual(
            bundle[
                'trainingFeatures'
            ],
            list(
                PRIMARY_TRAINING_FEATURES
            ),
        )

    def test_first_decision_training_is_default(
        self,
    ):
        frame = self.build_frame(
            games=30,
            seed=841,
        )

        bundle = train_candidate_model(
            frame,
            n_estimators=20,
        )

        self.assertLess(
            bundle[
                'trainingDataset'
            ][
                'trainingRows'
            ],
            bundle[
                'trainingDataset'
            ][
                'sourceRows'
            ],
        )

    def test_predictions_have_valid_probabilities(
        self,
    ):
        frame = self.build_frame(
            games=28,
            seed=851,
        )

        bundle = train_candidate_model(
            frame,
            n_estimators=20,
        )

        predictions = (
            predict_candidate_probabilities(
                bundle,
                frame.head(20),
            )
        )

        self.assertEqual(
            len(
                predictions
            ),
            20,
        )

        self.assertTrue(
            predictions[
                'winProbability'
            ]
            .between(
                0.0,
                1.0,
            )
            .all()
        )

        self.assertTrue(
            set(
                predictions[
                    'predictedHandWin'
                ]
                .unique()
            )
            .issubset(
                {
                    0,
                    1,
                }
            )
        )

    def test_saved_model_round_trip_preserves_predictions(
        self,
    ):
        frame = self.build_frame(
            games=30,
            seed=861,
        )

        with tempfile.TemporaryDirectory() as directory:
            paths = save_candidate_model(
                frame,
                directory,
                n_estimators=20,
            )

            loaded = load_candidate_model(
                paths[
                    'model'
                ]
            )

            before = (
                predict_candidate_probabilities(
                    loaded,
                    frame.head(20),
                )
            )

            reloaded = load_candidate_model(
                paths[
                    'model'
                ]
            )

            after = (
                predict_candidate_probabilities(
                    reloaded,
                    frame.head(20),
                )
            )

            self.assertEqual(
                before[
                    'predictedHandWin'
                ].tolist(),
                after[
                    'predictedHandWin'
                ].tolist(),
            )

            for left, right in zip(
                before[
                    'winProbability'
                ],
                after[
                    'winProbability'
                ],
                strict=True,
            ):
                self.assertAlmostEqual(
                    left,
                    right,
                    places=12,
                )

    def test_model_and_metadata_are_written(
        self,
    ):
        frame = self.build_frame(
            games=24,
            seed=871,
        )

        with tempfile.TemporaryDirectory() as directory:
            paths = save_candidate_model(
                frame,
                directory,
                n_estimators=20,
            )

            self.assertTrue(
                paths[
                    'model'
                ].exists()
            )

            self.assertTrue(
                paths[
                    'metadata'
                ].exists()
            )

            bundle = load_candidate_model(
                paths[
                    'model'
                ]
            )

            metadata = (
                build_candidate_metadata(
                    bundle
                )
            )

            self.assertNotIn(
                'model',
                metadata,
            )

            self.assertEqual(
                metadata[
                    'artifactVersion'
                ],
                MODEL_ARTIFACT_VERSION,
            )


if __name__ == '__main__':
    unittest.main()
