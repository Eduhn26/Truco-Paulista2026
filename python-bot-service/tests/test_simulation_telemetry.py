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
            self.assertIn('analysis', summary)
            self.assertIn('profiles', summary['analysis'])


if __name__ == '__main__':
    unittest.main()
