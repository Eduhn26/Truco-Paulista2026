import csv
import json
import tempfile
import unittest
from dataclasses import fields
from pathlib import Path

from simulation.analytics import analyze_series
from simulation.exporter import (
    DATASET_SCHEMA_VERSION,
    DECISION_COLUMNS,
    HAND_COLUMNS,
    MATCH_COLUMNS,
    export_round_robin,
    export_series,
)
from simulation.results import SeriesResult
from simulation.runner import run_round_robin, run_series
from simulation.telemetry import DecisionRecord, HandRecord, MatchRecord


class SimulationTelemetryTest(unittest.TestCase):
    def test_series_keeps_match_and_decision_records(self) -> None:
        result = run_series(
            'aggressive',
            'balanced',
            games=2,
            seed=21,
        )

        self.assertEqual(len(result.matches), 2)
        self.assertEqual(len(result.hands), result.total_hands)
        self.assertGreater(len(result.decisions), 0)
        self.assertEqual(
            {match.match_index for match in result.matches},
            {0, 1},
        )

    def test_telemetry_ids_are_stable_and_joinable(self) -> None:
        first = run_series(
            'aggressive',
            'balanced',
            games=3,
            seed=51,
        )
        second = run_series(
            'aggressive',
            'balanced',
            games=3,
            seed=51,
        )

        self.assertEqual(first.simulation_run_id, second.simulation_run_id)

        first_match_ids = [match.match_id for match in first.matches]
        second_match_ids = [match.match_id for match in second.matches]

        self.assertEqual(first_match_ids, second_match_ids)
        self.assertEqual(first.decisions, second.decisions)
        self.assertEqual(len(first_match_ids), len(set(first_match_ids)))

        match_ids = set(first_match_ids)
        decision_ids = {decision.decision_id for decision in first.decisions}

        self.assertEqual(len(decision_ids), len(first.decisions))
        self.assertTrue(
            all(decision.match_id in match_ids for decision in first.decisions)
        )
        hand_ids = {hand.hand_id for hand in first.hands}
        self.assertEqual(len(hand_ids), len(first.hands))
        self.assertTrue(
            all(hand.match_id in match_ids for hand in first.hands)
        )
        self.assertTrue(
            all(decision.hand_id in hand_ids for decision in first.decisions)
        )
        self.assertTrue(
            all(
                decision.hand_id.startswith(f'{decision.match_id}-hand-')
                for decision in first.decisions
            )
        )
        first_match_decisions = [
            decision
            for decision in first.decisions
            if decision.match_index == 0
        ]
        self.assertEqual(
            [decision.decision_index for decision in first_match_decisions],
            list(range(len(first_match_decisions))),
        )

    def test_decisions_capture_the_state_before_the_action(self) -> None:
        result = run_series(
            'aggressive',
            'balanced',
            games=3,
            seed=61,
        )

        self.assertGreater(len(result.decisions), 0)

        for decision in result.decisions:
            hand = json.loads(decision.player_hand_before)

            self.assertGreater(len(hand), 0)
            self.assertIn(decision.vira_rank, (
                '4', '5', '6', '7', 'Q', 'J', 'K', 'A', '2', '3',
            ))
            self.assertGreaterEqual(decision.rounds_won_by_me, 0)
            self.assertGreaterEqual(decision.rounds_won_by_opponent, 0)
            self.assertGreaterEqual(decision.rounds_tied, 0)
            self.assertLessEqual(
                decision.rounds_won_by_me
                + decision.rounds_won_by_opponent
                + decision.rounds_tied,
                2,
            )
            self.assertEqual(decision.points_to_win, 12)

            if decision.action == 'play-card':
                self.assertIsNotNone(decision.selected_card)
                self.assertIn(decision.selected_card, hand)
            else:
                self.assertIsNone(decision.selected_card)

            if decision.bet_state == 'awaiting_response':
                self.assertIsNotNone(decision.pending_value)
                self.assertIsNotNone(decision.requested_by)

    def test_hand_records_rebuild_the_final_match_score(self) -> None:
        result = run_series(
            'balanced',
            'aggressive',
            games=3,
            seed=71,
        )

        for match in result.matches:
            scores = {'P1': 0, 'P2': 0}
            hands = [
                hand
                for hand in result.hands
                if hand.match_id == match.match_id
            ]

            self.assertEqual(len(hands), match.hands_played)

            for hand_index, hand in enumerate(hands):
                self.assertEqual(hand.hand_index, hand_index)
                self.assertEqual(hand.player_one_score_before, scores['P1'])
                self.assertEqual(hand.player_two_score_before, scores['P2'])
                self.assertGreaterEqual(hand.rounds_played, 0)
                self.assertLessEqual(hand.rounds_played, 3)

                scores[hand.winner_player] += hand.points_awarded

            self.assertEqual(scores['P1'], match.player_one_score)
            self.assertEqual(scores['P2'], match.player_two_score)

    def test_analysis_reports_profile_and_seat_metrics(self) -> None:
        result = run_series(
            'balanced',
            'cautious',
            games=2,
            seed=31,
        )
        analysis = analyze_series(result)

        self.assertEqual(analysis['matches'], 2)
        self.assertGreater(analysis['decisions'], 0)
        self.assertIn('balanced', analysis['profiles'])
        self.assertIn('cautious', analysis['profiles'])
        self.assertEqual(
            analysis['seatAdvantage']['playerOneWins']
            + analysis['seatAdvantage']['playerTwoWins'],
            2,
        )

    def test_exporter_writes_matches_hands_decisions_and_summary(self) -> None:
        result = run_series(
            'aggressive',
            'cautious',
            games=2,
            seed=41,
        )

        with tempfile.TemporaryDirectory() as directory:
            paths = export_series(result, directory)

            for path in paths.values():
                self.assertTrue(path.exists())

            with paths['matches'].open(
                newline='',
                encoding='utf-8',
            ) as file:
                matches = list(csv.DictReader(file))

            with paths['hands'].open(
                newline='',
                encoding='utf-8',
            ) as file:
                hands = list(csv.DictReader(file))

            with paths['decisions'].open(
                newline='',
                encoding='utf-8',
            ) as file:
                decisions = list(csv.DictReader(file))

            summary = json.loads(
                Path(paths['summary']).read_text(encoding='utf-8')
            )

            self.assertEqual(len(matches), 2)
            self.assertEqual(len(hands), result.total_hands)
            self.assertGreater(len(decisions), 0)
            self.assertEqual(
                summary['simulationRunId'],
                result.simulation_run_id,
            )
            self.assertIn('simulation_run_id', matches[0])
            self.assertIn('match_id', matches[0])
            self.assertIn('hand_id', hands[0])
            self.assertIn('winner_player', hands[0])
            self.assertIn('points_awarded', hands[0])
            self.assertIn('hand_id', decisions[0])
            self.assertIn('decision_id', decisions[0])
            self.assertIn('player_hand_before', decisions[0])
            self.assertIn('selected_card', decisions[0])
            self.assertIn('pending_value', decisions[0])
            self.assertIn('special_state', decisions[0])
            self.assertIn('analysis', summary)
            self.assertIn('profiles', summary['analysis'])
            self.assertEqual(
                summary['schemaVersion'],
                DATASET_SCHEMA_VERSION,
            )
            self.assertEqual(
                summary['rowCounts'],
                {
                    'matches': len(result.matches),
                    'hands': len(result.hands),
                    'decisions': len(result.decisions),
                },
            )
            self.assertEqual(
                summary['simulationConfig'],
                {
                    'simulationRunId': result.simulation_run_id,
                    'profileOne': result.profile_one,
                    'profileTwo': result.profile_two,
                    'games': result.games,
                    'seed': result.seed,
                },
            )

    def test_empty_export_keeps_the_dataset_schema(self) -> None:
        result = SeriesResult(
            simulation_run_id='empty-series',
            profile_one='aggressive',
            profile_two='balanced',
            games=0,
            seed=1,
        )

        with tempfile.TemporaryDirectory() as directory:
            paths = export_series(result, directory)

            expected_columns = {
                'matches': list(MATCH_COLUMNS),
                'hands': list(HAND_COLUMNS),
                'decisions': list(DECISION_COLUMNS),
            }

            for name, columns in expected_columns.items():
                with paths[name].open(
                    newline='',
                    encoding='utf-8',
                ) as file:
                    reader = csv.DictReader(file)
                    self.assertEqual(reader.fieldnames, columns)
                    self.assertEqual(list(reader), [])

            summary = json.loads(
                Path(paths['summary']).read_text(encoding='utf-8')
            )

            self.assertEqual(
                summary['rowCounts'],
                {
                    'matches': 0,
                    'hands': 0,
                    'decisions': 0,
                },
            )

    def test_export_columns_match_the_telemetry_records(self) -> None:
        self.assertEqual(
            MATCH_COLUMNS,
            tuple(field.name for field in fields(MatchRecord)),
        )
        self.assertEqual(
            HAND_COLUMNS,
            tuple(field.name for field in fields(HandRecord)),
        )
        self.assertEqual(
            DECISION_COLUMNS,
            tuple(field.name for field in fields(DecisionRecord)),
        )

    def test_round_robin_summary_reports_export_row_counts(self) -> None:
        results = run_round_robin(games=1, seed=91)

        with tempfile.TemporaryDirectory() as directory:
            summary_path = export_round_robin(results, directory)
            summary = json.loads(
                Path(summary_path).read_text(encoding='utf-8')
            )

            self.assertEqual(
                summary['schemaVersion'],
                DATASET_SCHEMA_VERSION,
            )
            self.assertEqual(
                summary['rowCounts'],
                {
                    'series': len(results),
                    'matches': sum(len(result.matches) for result in results),
                    'hands': sum(len(result.hands) for result in results),
                    'decisions': sum(
                        len(result.decisions) for result in results
                    ),
                },
            )
            self.assertTrue(
                all(
                    series['schemaVersion'] == DATASET_SCHEMA_VERSION
                    for series in summary['series']
                )
            )


if __name__ == '__main__':
    unittest.main()
