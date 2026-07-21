import unittest

from app.schemas import BotDecisionRequest
from app.strategy.engine import StrategyEngine


def build_request(
    *,
    profile: str = 'balanced',
    hand: list[str] | None = None,
    opponent_card: str | None = None,
) -> BotDecisionRequest:
    return BotDecisionRequest.model_validate(
        {
            'matchId': 'match-phase-26',
            'profile': profile,
            'mode': '1v1',
            'actorSeatId': 'T1A',
            'actorTeamId': 'T1',
            'partnerSeatId': None,
            'viraRank': '7',
            'currentRound': {
                'playerOneCard': None,
                'playerTwoCard': opponent_card,
                'finished': False,
                'result': None,
                'seatPlays': None,
                'orderedPlays': [],
                'winningSeatId': None,
            },
            'player': {
                'playerId': 'P1',
                'hand': hand or ['4O', 'AO', '3O'],
            },
        }
    )


class StrategyEngineTest(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = StrategyEngine()

    def test_balanced_profile_opens_with_middle_card(self) -> None:
        response = self.engine.decide_card(build_request(profile='balanced'))

        self.assertEqual(response.card, 'AO')
        self.assertEqual(response.rationale.strategy, 'opening-middle')

    def test_aggressive_profile_opens_with_strongest_card(self) -> None:
        response = self.engine.decide_card(build_request(profile='aggressive'))

        self.assertEqual(response.card, '3O')
        self.assertEqual(response.rationale.strategy, 'opening-strongest')

    def test_cautious_profile_opens_with_weakest_card(self) -> None:
        response = self.engine.decide_card(build_request(profile='cautious'))

        self.assertEqual(response.card, '4O')
        self.assertEqual(response.rationale.strategy, 'opening-weakest')

    def test_balanced_profile_uses_weakest_card_that_can_win(self) -> None:
        response = self.engine.decide_card(
            build_request(
                profile='balanced',
                opponent_card='7O',
            )
        )

        self.assertEqual(response.card, 'AO')
        self.assertEqual(response.rationale.strategy, 'response-winning-weakest')

    def test_aggressive_profile_uses_strongest_winning_card(self) -> None:
        response = self.engine.decide_card(
            build_request(
                profile='aggressive',
                opponent_card='7O',
            )
        )

        self.assertEqual(response.card, '3O')
        self.assertEqual(response.rationale.strategy, 'response-winning-strongest')

    def test_cautious_profile_discards_weakest_card_when_it_cannot_win(self) -> None:
        response = self.engine.decide_card(
            build_request(
                profile='cautious',
                opponent_card='QP',
            )
        )

        self.assertEqual(response.card, '4O')
        self.assertEqual(response.rationale.strategy, 'response-losing-weakest')

    def test_response_includes_normalized_hand_strength(self) -> None:
        response = self.engine.decide_card(build_request())

        self.assertIsNotNone(response.rationale)
        self.assertIsNotNone(response.rationale.hand_strength)
        self.assertGreaterEqual(response.rationale.hand_strength, 0.0)
        self.assertLessEqual(response.rationale.hand_strength, 1.0)


if __name__ == '__main__':
    unittest.main()
