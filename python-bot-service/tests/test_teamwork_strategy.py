import unittest

from app.schemas import BotDecisionRequest
from app.strategy.engine import StrategyEngine


def signal(kind: str, scope: str) -> dict:
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
    hand: list[str] | None = None,
    profile: str = 'balanced',
    ordered_plays: list[dict] | None = None,
    round_tactic: dict | None = None,
    bet_intent: dict | None = None,
    rounds_won_by_me: int = 0,
    rounds_won_by_opponent: int = 0,
    current_round_index: int = 0,
    current_value: int = 1,
) -> BotDecisionRequest:
    return BotDecisionRequest.model_validate(
        {
            'matchId': 'match-2v2',
            'profile': profile,
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
                'orderedPlays': ordered_plays or [],
                'winningSeatId': None,
            },
            'player': {
                'playerId': 'P1',
                'hand': hand or ['4O', 'AO', '3O'],
            },
            'partnerSignals': {
                'handMemory': None,
                'roundTactic': round_tactic,
                'betIntent': bet_intent,
            },
            'bet': {
                'currentValue': current_value,
                'betState': 'idle',
                'pendingValue': None,
                'requestedBy': None,
                'specialState': 'normal',
                'specialDecisionPending': False,
                'availableActions': {
                    'canRequestTruco': False,
                    'canRaiseToSix': False,
                    'canRaiseToNine': False,
                    'canRaiseToTwelve': False,
                    'canAcceptBet': False,
                    'canDeclineBet': False,
                    'canAcceptMaoDeOnze': False,
                    'canDeclineMaoDeOnze': False,
                    'canAttemptPlayCard': True,
                },
            },
            'handProgress': {
                'roundsWonByMe': rounds_won_by_me,
                'roundsWonByOpponent': rounds_won_by_opponent,
                'roundsTied': 0,
                'currentRoundIndex': current_round_index,
            },
        }
    )


def play(seat_id: str, player_id: str, card: str) -> dict:
    return {
        'ownerId': seat_id,
        'seatId': seat_id,
        'playerId': player_id,
        'card': card,
    }


class TeamworkStrategyTest(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = StrategyEngine()

    def test_saves_the_weakest_card_when_partner_is_winning(self) -> None:
        response = self.engine.decide(
            build_request(
                ordered_plays=[
                    play('T2A', 'P2', '7O'),
                    play('T1B', 'P1', '3O'),
                ]
            )
        )

        self.assertEqual(response.card, '4O')
        self.assertEqual(
            response.rationale.strategy,
            'two-versus-two-partner-winning-save-weakest',
        )

    def test_hold_signal_keeps_the_weakest_card_when_team_is_winning(self) -> None:
        response = self.engine.decide(
            build_request(
                ordered_plays=[
                    play('T1B', 'P1', '3O'),
                    play('T2A', 'P2', '7O'),
                ],
                round_tactic=signal('hold', 'round-tactic'),
            )
        )

        self.assertEqual(response.card, '4O')
        self.assertEqual(
            response.rationale.strategy,
            'two-versus-two-signal-hold-save-weakest',
        )

    def test_kill_round_uses_the_cheapest_winning_card(self) -> None:
        response = self.engine.decide(
            build_request(
                hand=['4O', 'AO', '3O'],
                ordered_plays=[
                    play('T2A', 'P2', '7O'),
                    play('T1B', 'P1', '6O'),
                ],
                round_tactic=signal('kill-round', 'round-tactic'),
            )
        )

        self.assertEqual(response.card, 'AO')
        self.assertEqual(
            response.rationale.strategy,
            'two-versus-two-signal-kill-round-weakest-winner',
        )

    def test_discards_the_weakest_card_when_the_round_cannot_be_won(self) -> None:
        response = self.engine.decide(
            build_request(
                ordered_plays=[play('T2A', 'P2', 'QP')]
            )
        )

        self.assertEqual(response.card, '4O')
        self.assertEqual(
            response.rationale.strategy,
            'two-versus-two-response-losing-save-weakest',
        )

    def test_pressure_signal_pushes_after_winning_the_first_round(self) -> None:
        response = self.engine.decide(
            build_request(
                hand=['4O', 'AO', '3O'],
                bet_intent=signal('pressure', 'bet-intent'),
                rounds_won_by_me=1,
                current_round_index=1,
            )
        )

        self.assertEqual(response.card, '3O')
        self.assertEqual(
            response.rationale.strategy,
            'two-versus-two-opening-after-first-win-pressure',
        )

    def test_avoid_bet_signal_saves_strength_after_winning_the_first_round(self) -> None:
        response = self.engine.decide(
            build_request(
                hand=['4O', '3O', 'QP'],
                bet_intent=signal('avoid-bet', 'bet-intent'),
                rounds_won_by_me=1,
                current_round_index=1,
                current_value=9,
            )
        )

        self.assertEqual(response.card, '4O')
        self.assertEqual(
            response.rationale.strategy,
            'two-versus-two-opening-after-first-win-save-weakest',
        )


if __name__ == '__main__':
    unittest.main()
