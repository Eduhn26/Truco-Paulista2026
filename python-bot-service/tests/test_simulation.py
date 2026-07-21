import unittest
from random import Random

from simulation.deck import FULL_DECK, deal
from simulation.match_simulator import HeadlessMatchSimulator, resolve_hand_winner
from simulation.runner import run_series


class SimulationTest(unittest.TestCase):
    def test_deal_uses_unique_cards(self) -> None:
        dealt = deal(Random(10))
        cards = [
            dealt.vira_card,
            *dealt.player_one_hand,
            *dealt.player_two_hand,
        ]

        self.assertEqual(len(cards), 7)
        self.assertEqual(len(set(cards)), 7)
        self.assertEqual(len(FULL_DECK), 40)

    def test_resolves_domain_tie_rules(self) -> None:
        self.assertEqual(resolve_hand_winner(['P1', 'TIE']), 'P1')
        self.assertEqual(resolve_hand_winner(['TIE', 'P2']), 'P2')
        self.assertEqual(resolve_hand_winner(['P1', 'P2', 'TIE']), 'P1')
        self.assertEqual(resolve_hand_winner(['P1', 'P2', 'P2']), 'P2')
        self.assertEqual(resolve_hand_winner(['TIE', 'TIE', 'TIE']), 'P1')

    def test_match_is_reproducible_with_the_same_seed(self) -> None:
        first = HeadlessMatchSimulator(
            'aggressive',
            'balanced',
            seed=77,
            points_to_win=3,
        ).simulate()
        second = HeadlessMatchSimulator(
            'aggressive',
            'balanced',
            seed=77,
            points_to_win=3,
        ).simulate()

        self.assertEqual(first.winner, second.winner)
        self.assertEqual(first.player_one_score, second.player_one_score)
        self.assertEqual(first.player_two_score, second.player_two_score)
        self.assertEqual(first.hands_played, second.hands_played)

    def test_series_aggregates_all_games(self) -> None:
        result = run_series(
            'aggressive',
            'cautious',
            games=4,
            seed=15,
        )

        self.assertEqual(sum(result.wins.values()), 4)
        self.assertGreater(result.total_hands, 0)
        self.assertGreater(sum(result.metrics.actions.values()), 0)


if __name__ == '__main__':
    unittest.main()
