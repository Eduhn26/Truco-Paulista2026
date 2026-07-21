import unittest

from app.schemas import BotDecisionRequest
from app.strategy.engine import StrategyEngine


def partner_signal(kind: str, scope: str) -> dict:
    return {
        'fromSeatId': 'T1B',
        'kind': kind,
        'scope': scope,
        'strengthHint': 'medium',
        'intent': 'neutral',
        'expiresAt': '2099-01-01T00:00:00Z',
    }


def build_request(
    *,
    hand: list[str],
    hand_memory: dict | None = None,
    round_tactic: dict | None = None,
    bet_intent: dict | None = None,
) -> BotDecisionRequest:
    return BotDecisionRequest.model_validate(
        {
            'matchId': 'match-bet-signals',
            'profile': 'balanced',
            'mode': '2v2',
            'actorSeatId': 'T1A',
            'actorTeamId': 'T1',
            'partnerSeatId': 'T1B',
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
                'hand': hand,
            },
            'partnerSignals': {
                'handMemory': hand_memory,
                'roundTactic': round_tactic,
                'betIntent': bet_intent,
            },
            'bet': {
                'currentValue': 3,
                'betState': 'awaiting_response',
                'pendingValue': 6,
                'requestedBy': 'P2',
                'specialState': 'normal',
                'specialDecisionPending': False,
                'availableActions': {
                    'canRequestTruco': False,
                    'canRaiseToSix': False,
                    'canRaiseToNine': False,
                    'canRaiseToTwelve': False,
                    'canAcceptBet': True,
                    'canDeclineBet': True,
                    'canAcceptMaoDeOnze': False,
                    'canDeclineMaoDeOnze': False,
                    'canAttemptPlayCard': False,
                },
            },
            'score': {
                'playerOne': 3,
                'playerTwo': 3,
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


class BettingSignalStrategyTest(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = StrategyEngine()

    def test_strong_hand_memory_can_turn_a_decline_into_an_accept(self) -> None:
        response = self.engine.decide(
            build_request(
                hand=['3O', '7O', '6O'],
                hand_memory=partner_signal('strong-hand', 'hand-memory'),
            )
        )

        self.assertEqual(response.action, 'accept-bet')

    def test_avoid_bet_intent_can_turn_an_accept_into_a_decline(self) -> None:
        response = self.engine.decide(
            build_request(
                hand=['3O', 'AO', '7O'],
                bet_intent=partner_signal('avoid-bet', 'bet-intent'),
            )
        )

        self.assertEqual(response.action, 'decline-bet')

    def test_round_tactic_signal_does_not_change_betting_strength(self) -> None:
        response = self.engine.decide(
            build_request(
                hand=['3O', '7O', '6O'],
                round_tactic=partner_signal('pressure', 'round-tactic'),
            )
        )

        self.assertEqual(response.action, 'decline-bet')


if __name__ == '__main__':
    unittest.main()
