import unittest

from data.ml_assisted_ab import (
    run_ab_comparison,
)


class FakePredictor:
    def predict(
        self,
        state,
    ):
        return {
            'winProbability': 0.95,
            'predictedHandWin': 1,
            'artifactVersion': '1.0',
            'modelType': 'FakeModel',
        }


class MlAssistedAbTest(
    unittest.TestCase
):
    @classmethod
    def setUpClass(
        cls,
    ):
        cls.report = (
            run_ab_comparison(
                FakePredictor(),
                games_per_profile=4,
                seed_base=22001,
            )
        )

    def test_ab_runs_all_profiles(
        self,
    ):
        self.assertEqual(
            self.report[
                'configuration'
            ][
                'totalGames'
            ],
            12,
        )

        self.assertEqual(
            len(
                self.report[
                    'byProfile'
                ]
            ),
            3,
        )

    def test_ab_balances_assisted_seats(
        self,
    ):
        for profile in (
            self.report[
                'byProfile'
            ]
        ):
            self.assertEqual(
                profile[
                    'assistedSeatAssignments'
                ][
                    'P1'
                ],
                2,
            )

            self.assertEqual(
                profile[
                    'assistedSeatAssignments'
                ][
                    'P2'
                ],
                2,
            )

    def test_ab_accounts_for_every_game(
        self,
    ):
        overall = (
            self.report[
                'overall'
            ]
        )

        self.assertEqual(
            (
                overall[
                    'assistedWins'
                ]
                +
                overall[
                    'baselineWins'
                ]
            ),
            12,
        )

        self.assertGreater(
            overall[
                'mlOverrideCount'
            ],
            0,
        )


if __name__ == '__main__':
    unittest.main()
