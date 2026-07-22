import tempfile
import unittest

from data.ml_dataset import (
    build_ml_ready_dataset,
)
from data.ml_stage_evaluation import (
    dataset_stage_summary,
    first_decision_per_player_hand,
    run_stage_evaluation,
    write_stage_evaluation_report,
)
from data.pipeline import load_raw_dataset
from simulation.exporter import export_series
from simulation.runner import run_series


class MlStageEvaluationTest(
    unittest.TestCase
):
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

        return frame

    def test_first_decision_is_unique_per_player_hand(
        self,
    ):
        frame = self.build_frame(
            'aggressive',
            'balanced',
            10,
            471,
        )

        first = (
            first_decision_per_player_hand(
                frame
            )
        )

        duplicates = first.duplicated(
            subset=[
                'hand_id',
                'player_id',
            ]
        )

        self.assertFalse(
            duplicates.any()
        )

    def test_first_decision_uses_earliest_index(
        self,
    ):
        frame = self.build_frame(
            'balanced',
            'cautious',
            10,
            481,
        )

        first = (
            first_decision_per_player_hand(
                frame
            )
        )

        expected = (
            frame
            .groupby(
                [
                    'hand_id',
                    'player_id',
                ]
            )['decision_index']
            .min()
        )

        actual = (
            first
            .set_index(
                [
                    'hand_id',
                    'player_id',
                ]
            )['decision_index']
        )

        self.assertTrue(
            actual
            .sort_index()
            .equals(
                expected.sort_index()
            )
        )

    def test_stage_summary_reports_reduction(
        self,
    ):
        frame = self.build_frame(
            'aggressive',
            'cautious',
            10,
            491,
        )

        summary = dataset_stage_summary(
            frame
        )

        self.assertLessEqual(
            summary[
                'firstDecisionRows'
            ],
            summary[
                'allDecisionRows'
            ],
        )

        self.assertEqual(
            summary[
                'firstDecisionRows'
            ],
            summary[
                'playerHands'
            ],
        )

        self.assertGreater(
            summary[
                'averageDecisionsPerPlayerHand'
            ],
            0,
        )

    def test_stage_evaluation_runs_both_views(
        self,
    ):
        frame = self.build_frame(
            'balanced',
            'aggressive',
            20,
            501,
        )

        report = run_stage_evaluation(
            frame,
            random_states=(11, 13),
            test_size=0.25,
        )

        self.assertIn(
            'allDecisions',
            report,
        )

        self.assertIn(
            'firstDecisionPerPlayerHand',
            report,
        )

        self.assertIn(
            'logisticRegression',
            report['comparison'],
        )

        self.assertEqual(
            len(
                report[
                    'allDecisions'
                ]['runs']
            ),
            2,
        )

        self.assertEqual(
            len(
                report[
                    'firstDecisionPerPlayerHand'
                ]['runs']
            ),
            2,
        )

    def test_stage_report_is_written(
        self,
    ):
        frame = self.build_frame(
            'balanced',
            'cautious',
            12,
            511,
        )

        with tempfile.TemporaryDirectory() as directory:
            path = (
                write_stage_evaluation_report(
                    frame,
                    (
                        f'{directory}'
                        '/stage-evaluation.json'
                    ),
                    random_states=(17,),
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
