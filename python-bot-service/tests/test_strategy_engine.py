import unittest

from app.schemas import BotDecisionRequest
from app.strategy.engine import StrategyEngine


def build_request(
    *,
    profile: str = 'balanced',
    hand: list[str] | None = None,
    opponent_card: str | None = None,
    current_round_index: int = 0,
    rounds_won_by_me: int = 0,
    rounds_won_by_opponent: int = 0,
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
            'handProgress': {
                'roundsWonByMe': rounds_won_by_me,
                'roundsWonByOpponent': rounds_won_by_opponent,
                'roundsTied': 0,
                'currentRoundIndex': current_round_index,
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

    def test_aggressive_profile_does_not_spend_strongest_card_without_pressure(self) -> None:
        response = self.engine.decide_card(build_request(profile='aggressive'))

        self.assertEqual(response.card, 'AO')
        self.assertEqual(response.rationale.strategy, 'opening-middle')

    def test_aggressive_profile_uses_strongest_card_when_behind_in_decisive_round(self) -> None:
        response = self.engine.decide_card(
            build_request(
                profile='aggressive',
                current_round_index=1,
                rounds_won_by_opponent=1,
            )
        )

        self.assertEqual(response.card, '3O')
        self.assertEqual(response.rationale.strategy, 'opening-strongest')

    def test_cautious_profile_opens_with_weakest_card(self) -> None:
        response = self.engine.decide_card(build_request(profile='cautious'))

        self.assertEqual(response.card, '4O')
        self.assertEqual(response.rationale.strategy, 'opening-weakest')

    def test_cautious_profile_uses_middle_card_under_real_pressure(self) -> None:
        response = self.engine.decide_card(
            build_request(
                profile='cautious',
                hand=['4O', '3O', 'QP'],
                current_round_index=1,
                rounds_won_by_opponent=1,
            )
        )

        self.assertEqual(response.card, '3O')
        self.assertEqual(response.rationale.strategy, 'opening-middle')

    def test_balanced_profile_uses_weakest_card_that_can_win(self) -> None:
        response = self.engine.decide_card(
            build_request(
                profile='balanced',
                opponent_card='7O',
            )
        )

        self.assertEqual(response.card, 'AO')
        self.assertEqual(response.rationale.strategy, 'response-winning-weakest')

    def test_aggressive_profile_saves_strongest_winner_without_pressure(self) -> None:
        response = self.engine.decide_card(
            build_request(
                profile='aggressive',
                opponent_card='7O',
            )
        )

        self.assertEqual(response.card, 'AO')
        self.assertEqual(response.rationale.strategy, 'response-winning-weakest')

    def test_aggressive_profile_preserves_extra_strength_when_behind(self) -> None:
        response = self.engine.decide_card(
            build_request(
                profile='aggressive',
                opponent_card='7O',
                current_round_index=1,
                rounds_won_by_opponent=1,
            )
        )

        self.assertEqual(response.card, 'AO')
        self.assertEqual(response.rationale.strategy, 'response-winning-weakest')

    def test_balanced_profile_preserves_manilha_when_regular_card_can_win(self) -> None:
        response = self.engine.decide_card(
            build_request(
                profile='balanced',
                hand=['AO', '3O', 'QP'],
                opponent_card='7O',
            )
        )

        self.assertEqual(response.card, 'AO')
        self.assertEqual(response.rationale.strategy, 'response-winning-weakest')

    def test_cautious_profile_discards_weakest_card_when_it_cannot_win(self) -> None:
        response = self.engine.decide_card(
            build_request(
                profile='cautious',
                opponent_card='QP',
            )
        )

        self.assertEqual(response.card, '4O')
        self.assertEqual(response.rationale.strategy, 'response-losing-weakest')

    def test_weak_hand_does_not_force_pressure_play(self) -> None:
        response = self.engine.decide_card(
            build_request(
                profile='aggressive',
                hand=['4O', '5O', '6O'],
                current_round_index=1,
                rounds_won_by_opponent=1,
            )
        )

        self.assertEqual(response.card, '5O')
        self.assertEqual(response.rationale.strategy, 'opening-middle')

    def test_response_includes_normalized_hand_strength(self) -> None:
        response = self.engine.decide_card(build_request())

        self.assertIsNotNone(response.rationale)
        self.assertIsNotNone(response.rationale.hand_strength)
        self.assertGreaterEqual(response.rationale.hand_strength, 0.0)
        self.assertLessEqual(response.rationale.hand_strength, 1.0)


if __name__ == '__main__':
    unittest.main()
