import csv
import json
import tempfile
import unittest
from pathlib import Path

from simulation.analytics import analyze_series
from simulation.exporter import export_series
from simulation.runner import run_series


class SimulationTelemetryTest(unittest.TestCase):
    def test_series_keeps_match_and_decision_records(self) -> None:
        result = run_series(
            'aggressive',
            'balanced',
            games=2,
            seed=21,
        )

        self.assertEqual(len(result.matches), 2)
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
        self.assertEqual(len(first_match_ids), len(set(first_match_ids)))

        match_ids = set(first_match_ids)
        decision_ids = {decision.decision_id for decision in first.decisions}

        self.assertEqual(len(decision_ids), len(first.decisions))
        self.assertTrue(
            all(decision.match_id in match_ids for decision in first.decisions)
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

    def test_exporter_writes_matches_decisions_and_summary(self) -> None:
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

            with paths['decisions'].open(
                newline='',
                encoding='utf-8',
            ) as file:
                decisions = list(csv.DictReader(file))

            summary = json.loads(
                Path(paths['summary']).read_text(encoding='utf-8')
            )

            self.assertEqual(len(matches), 2)
            self.assertGreater(len(decisions), 0)
            self.assertEqual(
                summary['simulationRunId'],
                result.simulation_run_id,
            )
            self.assertIn('simulation_run_id', matches[0])
            self.assertIn('match_id', matches[0])
            self.assertIn('hand_id', decisions[0])
            self.assertIn('decision_id', decisions[0])
            self.assertIn('analysis', summary)
            self.assertIn('profiles', summary['analysis'])


if __name__ == '__main__':
    unittest.main()
