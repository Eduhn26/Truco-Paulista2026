import csv
import tempfile
import unittest
from pathlib import Path

import pandas as pd

from data.pipeline import (
    DatasetValidationError,
    build_decision_dataset,
    load_raw_dataset,
)
from simulation.exporter import export_series
from simulation.results import SeriesResult
from simulation.runner import run_series


class DataPipelineTest(unittest.TestCase):
    def test_load_raw_dataset_keeps_schema_and_normalizes_dtypes(self) -> None:
        result = run_series(
            'aggressive',
            'balanced',
            games=2,
            seed=81,
        )

        with tempfile.TemporaryDirectory() as directory:
            export_series(result, directory)
            dataset = load_raw_dataset(directory)

        self.assertEqual(len(dataset.matches), len(result.matches))
        self.assertEqual(len(dataset.hands), len(result.hands))
        self.assertEqual(len(dataset.decisions), len(result.decisions))
        self.assertEqual(str(dataset.matches['match_index'].dtype), 'Int64')
        self.assertEqual(str(dataset.hands['points_awarded'].dtype), 'Int64')
        self.assertEqual(str(dataset.decisions['pending_value'].dtype), 'Int64')
        self.assertEqual(str(dataset.decisions['hand_strength'].dtype), 'Float64')
        self.assertEqual(
            str(dataset.decisions['special_decision_pending'].dtype),
            'boolean',
        )

    def test_build_decision_dataset_uses_player_relative_values_and_target(self) -> None:
        result = run_series(
            'balanced',
            'cautious',
            games=3,
            seed=91,
        )

        with tempfile.TemporaryDirectory() as directory:
            export_series(result, directory)
            dataset = load_raw_dataset(directory)
            decisions = build_decision_dataset(dataset)

        hand_winners = {
            hand.hand_id: hand.winner_player
            for hand in result.hands
        }

        self.assertGreater(len(decisions), 0)
        self.assertEqual(set(decisions['player_id']), {'P1', 'P2'})

        for row in decisions.itertuples(index=False):
            if row.player_id == 'P1':
                self.assertEqual(row.own_score, row.player_one_score)
                self.assertEqual(row.opponent_score, row.player_two_score)
                self._assert_nullable_equal(
                    row.own_round_card,
                    row.player_one_round_card,
                )
                self._assert_nullable_equal(
                    row.opponent_round_card,
                    row.player_two_round_card,
                )
            else:
                self.assertEqual(row.own_score, row.player_two_score)
                self.assertEqual(row.opponent_score, row.player_one_score)
                self._assert_nullable_equal(
                    row.own_round_card,
                    row.player_two_round_card,
                )
                self._assert_nullable_equal(
                    row.opponent_round_card,
                    row.player_one_round_card,
                )

            self.assertEqual(
                row.score_difference,
                row.own_score - row.opponent_score,
            )
            self.assertGreaterEqual(row.hand_size, 1)
            self.assertLessEqual(row.hand_size, 3)
            self.assertEqual(
                row.hand_won,
                hand_winners[row.hand_id] == row.player_id,
            )

    def test_empty_dataset_can_be_loaded_and_transformed(self) -> None:
        result = SeriesResult(
            simulation_run_id='empty-series',
            profile_one='aggressive',
            profile_two='balanced',
            games=0,
            seed=1,
        )

        with tempfile.TemporaryDirectory() as directory:
            export_series(result, directory)
            dataset = load_raw_dataset(directory)
            decisions = build_decision_dataset(dataset)

        self.assertTrue(dataset.matches.empty)
        self.assertTrue(dataset.hands.empty)
        self.assertTrue(dataset.decisions.empty)
        self.assertTrue(decisions.empty)
        self.assertIn('own_score', decisions.columns)
        self.assertIn('hand_size', decisions.columns)
        self.assertIn('hand_won', decisions.columns)

    def test_load_raw_dataset_rejects_orphan_decision(self) -> None:
        result = run_series(
            'aggressive',
            'cautious',
            games=1,
            seed=101,
        )

        with tempfile.TemporaryDirectory() as directory:
            paths = export_series(result, directory)

            with paths['decisions'].open(
                newline='',
                encoding='utf-8',
            ) as file:
                rows = list(csv.DictReader(file))
                columns = rows[0].keys()

            rows[0]['hand_id'] = 'missing-hand'

            with paths['decisions'].open(
                'w',
                newline='',
                encoding='utf-8',
            ) as file:
                writer = csv.DictWriter(file, fieldnames=columns)
                writer.writeheader()
                writer.writerows(rows)

            with self.assertRaisesRegex(
                DatasetValidationError,
                'decisions.hand_id',
            ):
                load_raw_dataset(directory)

    def test_load_raw_dataset_rejects_schema_drift(self) -> None:
        result = run_series(
            'balanced',
            'aggressive',
            games=1,
            seed=111,
        )

        with tempfile.TemporaryDirectory() as directory:
            paths = export_series(result, directory)
            matches = pd.read_csv(paths['matches'])
            matches['unexpected_column'] = 'bad'
            matches.to_csv(paths['matches'], index=False)

            with self.assertRaisesRegex(
                DatasetValidationError,
                'matches schema mismatch',
            ):
                load_raw_dataset(directory)

    def _assert_nullable_equal(self, left, right) -> None:
        if pd.isna(left) and pd.isna(right):
            return

        self.assertEqual(left, right)


if __name__ == '__main__':
    unittest.main()
