import unittest

from app.schemas import BotDecisionRequest
from app.strategy.engine import StrategyEngine


def build_request(
    *,
    profile: str = 'balanced',
    hand: list[str] | None = None,
    bet_state: str = 'awaiting_response',
    can_request_truco: bool = False,
    can_raise_to_six: bool = False,
    can_accept_bet: bool = True,
    can_decline_bet: bool = True,
    can_attempt_play_card: bool = False,
    rounds_won_by_me: int = 0,
    rounds_won_by_opponent: int = 0,
    current_round_index: int = 0,
    player_one_score: int = 3,
    player_two_score: int = 3,
) -> BotDecisionRequest:
    return BotDecisionRequest.model_validate(
        {
            'matchId': 'match-betting',
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
                'currentValue': 3,
                'betState': bet_state,
                'pendingValue': 6 if bet_state == 'awaiting_response' else None,
                'requestedBy': 'P2' if bet_state == 'awaiting_response' else None,
                'specialState': 'normal',
                'specialDecisionPending': False,
                'availableActions': {
                    'canRequestTruco': can_request_truco,
                    'canRaiseToSix': can_raise_to_six,
                    'canRaiseToNine': False,
                    'canRaiseToTwelve': False,
                    'canAcceptBet': can_accept_bet,
                    'canDeclineBet': can_decline_bet,
                    'canAcceptMaoDeOnze': False,
                    'canDeclineMaoDeOnze': False,
                    'canAttemptPlayCard': can_attempt_play_card,
                },
            },
            'score': {
                'playerOne': player_one_score,
                'playerTwo': player_two_score,
                'pointsToWin': 12,
            },
            'handProgress': {
                'roundsWonByMe': rounds_won_by_me,
                'roundsWonByOpponent': rounds_won_by_opponent,
                'roundsTied': 0,
                'currentRoundIndex': current_round_index,
            },
        }
    )


class BettingStrategyTest(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = StrategyEngine()

    def test_raises_with_a_strong_hand(self) -> None:
        response = self.engine.decide(
            build_request(
                hand=['QP', '3O', '2O'],
                can_raise_to_six=True,
            )
        )

        self.assertEqual(response.action, 'raise-to-six')
        self.assertEqual(response.rationale.strategy, 'bet-raise')

    def test_accepts_with_enough_strength(self) -> None:
        response = self.engine.decide(build_request(hand=['3O', 'AO', '7O']))

        self.assertEqual(response.action, 'accept-bet')
        self.assertEqual(response.rationale.strategy, 'bet-accept')

    def test_declines_a_weak_hand(self) -> None:
        response = self.engine.decide(build_request(hand=['4O', '5O', '6O']))

        self.assertEqual(response.action, 'decline-bet')
        self.assertEqual(response.rationale.strategy, 'bet-decline')

    def test_accepts_when_declining_would_lose_the_match(self) -> None:
        response = self.engine.decide(
            build_request(
                hand=['4O', '5O', '6O'],
                player_two_score=9,
            )
        )

        self.assertEqual(response.action, 'accept-bet')
        self.assertEqual(response.rationale.strategy, 'bet-accept-forced-by-score')

    def test_declines_match_risk_with_insufficient_strength(self) -> None:
        response = self.engine.decide(
            build_request(
                hand=['4O', '5O', '6O'],
                player_two_score=7,
            )
        )

        self.assertEqual(response.action, 'decline-bet')
        self.assertEqual(response.rationale.strategy, 'bet-decline-by-score')

    def test_aggressive_profile_requests_truco_after_winning_first_round(self) -> None:
        response = self.engine.decide(
            build_request(
                profile='aggressive',
                hand=['3O', 'AO', '7O'],
                bet_state='idle',
                can_request_truco=True,
                can_accept_bet=False,
                can_decline_bet=False,
                can_attempt_play_card=True,
                rounds_won_by_me=1,
                current_round_index=1,
            )
        )

        self.assertEqual(response.action, 'request-truco')
        self.assertEqual(response.rationale.strategy, 'bet-initiative-value')

    def test_aggressive_profile_holds_truco_with_a_marginal_hand(self) -> None:
        response = self.engine.decide(
            build_request(
                profile='aggressive',
                hand=['3O', '7O', '4O'],
                bet_state='idle',
                can_request_truco=True,
                can_accept_bet=False,
                can_decline_bet=False,
                can_attempt_play_card=True,
                rounds_won_by_me=1,
                current_round_index=1,
            )
        )

        self.assertEqual(response.action, 'play-card')

    def test_aggressive_profile_declines_a_marginal_bet(self) -> None:
        response = self.engine.decide(
            build_request(
                profile='aggressive',
                hand=['AO', '7O', '4O'],
            )
        )

        self.assertEqual(response.action, 'decline-bet')
        self.assertEqual(response.rationale.strategy, 'bet-decline')

    def test_does_not_request_truco_before_any_round_information(self) -> None:
        response = self.engine.decide(
            build_request(
                profile='aggressive',
                hand=['QP', '3O', '2O'],
                bet_state='idle',
                can_request_truco=True,
                can_accept_bet=False,
                can_decline_bet=False,
                can_attempt_play_card=True,
            )
        )

        self.assertEqual(response.action, 'play-card')


if __name__ == '__main__':
    unittest.main()
