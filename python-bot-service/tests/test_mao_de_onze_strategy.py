import unittest

from app.schemas import BotDecisionRequest
from app.strategy.engine import StrategyEngine


def build_request(
    *,
    profile: str = 'balanced',
    hand: list[str] | None = None,
    player_one_score: int = 11,
    player_two_score: int = 6,
) -> BotDecisionRequest:
    return BotDecisionRequest.model_validate(
        {
            'matchId': 'match-mao-de-onze',
            'profile': profile,
            'mode': '1v1',
            'actorSeatId': 'T1A',
            'actorTeamId': 'T1',
            'partnerSeatId': None,
            'viraRank': '7',
            'currentRound': {
                'playerOneCard': None,
                'playerTwoCard': None,
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
            'bet': {
                'currentValue': 1,
                'betState': 'idle',
                'pendingValue': None,
                'requestedBy': None,
                'specialState': 'mao_de_onze',
                'specialDecisionPending': True,
                'availableActions': {
                    'canRequestTruco': False,
                    'canRaiseToSix': False,
                    'canRaiseToNine': False,
                    'canRaiseToTwelve': False,
                    'canAcceptBet': False,
                    'canDeclineBet': False,
                    'canAcceptMaoDeOnze': True,
                    'canDeclineMaoDeOnze': True,
                    'canAttemptPlayCard': False,
                },
            },
            'score': {
                'playerOne': player_one_score,
                'playerTwo': player_two_score,
                'pointsToWin': 12,
            },
            'handProgress': {
                'roundsWonByMe': 0,
                'roundsWonByOpponent': 0,
                'roundsTied': 0,
                'currentRoundIndex': 0,
            },
        }
    )


class MaoDeOnzeStrategyTest(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = StrategyEngine()

    def test_accepts_a_strong_hand(self) -> None:
        response = self.engine.decide(
            build_request(hand=['QP', '3O', '2O'])
        )

        self.assertEqual(response.action, 'accept-mao-de-onze')
        self.assertEqual(response.rationale.strategy, 'mao-de-onze-accept-strong-hand')

    def test_declines_a_weak_hand(self) -> None:
        response = self.engine.decide(
            build_request(hand=['4O', '5O', '6O'])
        )

        self.assertEqual(response.action, 'decline-mao-de-onze')
        self.assertEqual(response.rationale.strategy, 'mao-de-onze-decline-weak-hand')

    def test_aggressive_profile_accepts_more_risk(self) -> None:
        response = self.engine.decide(
            build_request(
                profile='aggressive',
                hand=['3O', 'AO', '7O'],
            )
        )

        self.assertEqual(response.action, 'accept-mao-de-onze')
        self.assertEqual(
            response.rationale.strategy,
            'mao-de-onze-accept-aggressive-risk',
        )

    def test_cautious_profile_declines_the_same_medium_hand(self) -> None:
        response = self.engine.decide(
            build_request(
                profile='cautious',
                hand=['3O', 'AO', '7O'],
            )
        )

        self.assertEqual(response.action, 'decline-mao-de-onze')
        self.assertEqual(
            response.rationale.strategy,
            'mao-de-onze-decline-cautious-risk',
        )


if __name__ == '__main__':
    unittest.main()
