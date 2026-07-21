import json
import tempfile
import unittest
from pathlib import Path

from data.analytics import (
    BET_ACTIONS,
    analyze_dataset,
    write_analysis_report,
)
from data.pipeline import load_raw_dataset
from simulation.exporter import export_series
from simulation.results import SeriesResult
from simulation.runner import run_series


class DataAnalyticsTest(unittest.TestCase):
    def test_report_tracks_rows_targets_and_profiles(self) -> None:
        result = run_series(
            'aggressive',
            'balanced',
            games=6,
            seed=121,
        )

        with tempfile.TemporaryDirectory() as directory:
            export_series(result, directory)
            dataset = load_raw_dataset(directory)
            report = analyze_dataset(dataset)

        self.assertEqual(
            report['rowCounts'],
            {
                'matches': len(result.matches),
                'hands': len(result.hands),
                'decisions': len(result.decisions),
            },
        )
        self.assertEqual(
            report['targetBalance']['rows'],
            len(result.decisions),
        )
        self.assertEqual(
            set(report['profiles']),
            {'aggressive', 'balanced'},
        )
        self.assertEqual(
            sum(
                profile['wins']
                for profile in report['profiles'].values()
            ),
            len(result.matches),
        )
        self.assertEqual(
            sum(
                profile['decisionRows']
                for profile in report['profiles'].values()
            ),
            len(result.decisions),
        )

    def test_seat_and_betting_counts_match_raw_data(self) -> None:
        result = run_series(
            'aggressive',
            'cautious',
            games=8,
            seed=131,
        )

        with tempfile.TemporaryDirectory() as directory:
            export_series(result, directory)
            dataset = load_raw_dataset(directory)
            report = analyze_dataset(dataset)

        player_one_wins = int(
            dataset.matches['winner_player'].eq('P1').sum()
        )
        player_two_wins = int(
            dataset.matches['winner_player'].eq('P2').sum()
        )

        self.assertEqual(
            report['seatBalance']['playerOneWins'],
            player_one_wins,
        )
        self.assertEqual(
            report['seatBalance']['playerTwoWins'],
            player_two_wins,
        )

        expected_bets = dataset.decisions.loc[
            dataset.decisions['action'].isin(BET_ACTIONS)
        ]['action'].value_counts()

        self.assertEqual(
            report['betting']['actions'],
            {
                str(action): int(count)
                for action, count in expected_bets.items()
            },
        )
        self.assertEqual(
            report['betting']['trucoRequests']['count'],
            int(
                dataset.decisions['action']
                .eq('request-truco')
                .sum()
            ),
        )

    def test_data_quality_reports_density_and_duplicates(self) -> None:
        result = run_series(
            'balanced',
            'cautious',
            games=5,
            seed=141,
        )

        with tempfile.TemporaryDirectory() as directory:
            export_series(result, directory)
            dataset = load_raw_dataset(directory)
            report = analyze_dataset(dataset)

        quality = report['dataQuality']

        self.assertEqual(
            quality['duplicateIds'],
            {
                'matches': 0,
                'hands': 0,
                'decisions': 0,
            },
        )
        self.assertEqual(quality['targetNulls'], 0)
        self.assertEqual(
            quality['decisionRowsPerHand']['groups'],
            dataset.decisions['hand_id'].nunique(),
        )
        self.assertEqual(
            quality['decisionRowsPerHand']['rows'],
            len(dataset.decisions),
        )
        self.assertEqual(
            quality['decisionRowsPerMatch']['groups'],
            len(dataset.matches),
        )

    def test_context_breakdowns_cover_profile_decisions(self) -> None:
        result = run_series(
            'aggressive',
            'balanced',
            games=5,
            seed=151,
        )

        with tempfile.TemporaryDirectory() as directory:
            export_series(result, directory)
            dataset = load_raw_dataset(directory)
            report = analyze_dataset(dataset)

        for profile, stats in report['profiles'].items():
            expected = stats['decisionRows']

            self.assertEqual(
                sum(
                    report['contexts']
                    ['scoreStateByProfile']
                    [profile]
                    .values()
                ),
                expected,
            )
            self.assertEqual(
                sum(
                    report['contexts']
                    ['currentValueByProfile']
                    [profile]
                    .values()
                ),
                expected,
            )
            self.assertEqual(
                sum(
                    report['contexts']
                    ['specialStateByProfile']
                    [profile]
                    .values()
                ),
                expected,
            )

    def test_analysis_report_can_be_written_as_json(self) -> None:
        result = run_series(
            'balanced',
            'aggressive',
            games=3,
            seed=161,
        )

        with tempfile.TemporaryDirectory() as directory:
            export_series(result, directory)
            report_path = write_analysis_report(directory)

            payload = json.loads(
                Path(report_path).read_text(
                    encoding='utf-8',
                )
            )

        self.assertEqual(
            payload['rowCounts']['matches'],
            len(result.matches),
        )
        self.assertIn('dataQuality', payload)
        self.assertIn('targetBalance', payload)
        self.assertIn('profiles', payload)
        self.assertIn('betting', payload)

    def test_empty_dataset_returns_zeroed_analysis(self) -> None:
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
            report = analyze_dataset(dataset)

        self.assertEqual(
            report['rowCounts'],
            {
                'matches': 0,
                'hands': 0,
                'decisions': 0,
            },
        )
        self.assertEqual(report['targetBalance']['rows'], 0)
        self.assertEqual(report['profiles'], {})
        self.assertEqual(
            report['dataQuality']
            ['decisionRowsPerHand']
            ['groups'],
            0,
        )


if __name__ == '__main__':
    unittest.main()