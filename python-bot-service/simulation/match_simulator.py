from collections import Counter
from dataclasses import dataclass
from random import Random

from app.schemas import BotDecisionRequest, BotProfile
from app.strategy.card_rules import compare_cards
from app.strategy.engine import StrategyEngine
from simulation.deck import deal
from simulation.results import DecisionMetrics, MatchResult
from simulation.telemetry import DecisionRecord

PlayerId = str

ACTION_TO_VALUE = {
    'request-truco': 3,
    'raise-to-six': 6,
    'raise-to-nine': 9,
    'raise-to-twelve': 12,
}


@dataclass
class BetState:
    current_value: int = 1
    bet_state: str = 'idle'
    pending_value: int | None = None
    requested_by: PlayerId | None = None
    raise_authority: PlayerId | None = None


@dataclass(frozen=True)
class HandOutcome:
    winner: PlayerId
    points: int


class HeadlessMatchSimulator:
    def __init__(
        self,
        profile_one: BotProfile,
        profile_two: BotProfile,
        *,
        seed: int = 1,
        points_to_win: int = 12,
        match_index: int = 0,
    ) -> None:
        self.profile_one = profile_one
        self.profile_two = profile_two
        self.points_to_win = points_to_win
        self.rng = Random(seed)
        self.seed = seed
        self.match_index = match_index
        self.engine = StrategyEngine()
        self.metrics = DecisionMetrics()
        self.decisions: list[DecisionRecord] = []

    def simulate(self) -> MatchResult:
        scores = {'P1': 0, 'P2': 0}
        hands_played = 0
        starter = self.rng.choice(('P1', 'P2'))

        while max(scores.values()) < self.points_to_win:
            if hands_played >= 200:
                raise RuntimeError('Simulation exceeded the hand limit.')

            outcome = self._simulate_hand(scores, starter, hands_played)
            scores[outcome.winner] += outcome.points
            hands_played += 1

            if max(scores.values()) < self.points_to_win:
                starter = resolve_next_hand_starter(outcome.winner)

        winner = 'P1' if scores['P1'] >= self.points_to_win else 'P2'

        return MatchResult(
            winner=winner,
            player_one_score=scores['P1'],
            player_two_score=scores['P2'],
            hands_played=hands_played,
            match_index=self.match_index,
            seed=self.seed,
            metrics=self.metrics,
            decisions=list(self.decisions),
        )

    def _simulate_hand(
        self,
        scores: dict[PlayerId, int],
        starter: PlayerId,
        hand_index: int,
    ) -> HandOutcome:
        dealt = deal(self.rng)
        hands = {
            'P1': list(dealt.player_one_hand),
            'P2': list(dealt.player_two_hand),
        }
        round_results: list[str] = []
        bet = BetState()

        special_state, decision_player = self._special_state(scores)

        if special_state == 'mao_de_onze' and decision_player is not None:
            decision = self._decide(
                player=decision_player,
                hands=hands,
                vira_rank=dealt.vira_rank,
                scores=scores,
                round_results=round_results,
                round_index=0,
                round_cards={'P1': None, 'P2': None},
                bet=bet,
                special_state=special_state,
                special_decision_pending=True,
                special_decision_by=decision_player,
                hand_index=hand_index,
            )

            if decision.action == 'decline-mao-de-onze':
                return HandOutcome(
                    winner=self._opponent(decision_player),
                    points=1,
                )

            if decision.action != 'accept-mao-de-onze':
                raise RuntimeError(
                    f'Unexpected mão de onze decision: {decision.action}'
                )

            bet.current_value = 3

        round_starter = starter

        for round_index in range(3):
            round_cards: dict[PlayerId, str | None] = {
                'P1': None,
                'P2': None,
            }

            for player in (
                round_starter,
                self._opponent(round_starter),
            ):
                if special_state == 'normal':
                    bet_outcome = self._play_with_betting(
                        player=player,
                        hands=hands,
                        vira_rank=dealt.vira_rank,
                        scores=scores,
                        round_results=round_results,
                        round_index=round_index,
                        round_cards=round_cards,
                        bet=bet,
                        hand_index=hand_index,
                    )
                    if bet_outcome is not None:
                        return bet_outcome
                else:
                    self._play_card(
                        player=player,
                        hands=hands,
                        vira_rank=dealt.vira_rank,
                        scores=scores,
                        round_results=round_results,
                        round_index=round_index,
                        round_cards=round_cards,
                        bet=bet,
                        special_state=special_state,
                        hand_index=hand_index,
                    )

            result = self._round_result(
                round_cards['P1'],
                round_cards['P2'],
                dealt.vira_rank,
            )
            round_results.append(result)

            winner = resolve_hand_winner(round_results)
            if winner is not None:
                return HandOutcome(
                    winner=winner,
                    points=bet.current_value,
                )

            round_starter = resolve_next_round_starter(
                result,
                round_starter,
            )

        winner = resolve_hand_winner(round_results)
        if winner is None:
            raise RuntimeError('Hand finished without a winner.')

        return HandOutcome(winner=winner, points=bet.current_value)

    def _play_with_betting(
        self,
        *,
        player: PlayerId,
        hands: dict[PlayerId, list[str]],
        vira_rank: str,
        scores: dict[PlayerId, int],
        round_results: list[str],
        round_index: int,
        round_cards: dict[PlayerId, str | None],
        bet: BetState,
        hand_index: int,
    ) -> HandOutcome | None:
        while True:
            decision = self._decide(
                player=player,
                hands=hands,
                vira_rank=vira_rank,
                scores=scores,
                round_results=round_results,
                round_index=round_index,
                round_cards=round_cards,
                bet=bet,
                special_state='normal',
                special_decision_pending=False,
                special_decision_by=None,
                hand_index=hand_index,
            )

            if decision.action in ACTION_TO_VALUE:
                outcome = self._resolve_bet(
                    requester=player,
                    request_action=decision.action,
                    hands=hands,
                    vira_rank=vira_rank,
                    scores=scores,
                    round_results=round_results,
                    round_index=round_index,
                    round_cards=round_cards,
                    bet=bet,
                    hand_index=hand_index,
                )

                if outcome is not None:
                    return outcome

                continue

            if decision.action != 'play-card':
                raise RuntimeError(f'Expected card play, got {decision.action}.')

            self._apply_card(player, decision.card, hands, round_cards)
            return None

    def _play_card(
        self,
        *,
        player: PlayerId,
        hands: dict[PlayerId, list[str]],
        vira_rank: str,
        scores: dict[PlayerId, int],
        round_results: list[str],
        round_index: int,
        round_cards: dict[PlayerId, str | None],
        bet: BetState,
        special_state: str,
        hand_index: int,
    ) -> None:
        decision = self._decide(
            player=player,
            hands=hands,
            vira_rank=vira_rank,
            scores=scores,
            round_results=round_results,
            round_index=round_index,
            round_cards=round_cards,
            bet=bet,
            special_state=special_state,
            special_decision_pending=False,
            special_decision_by=None,
            hand_index=hand_index,
        )

        if decision.action != 'play-card':
            raise RuntimeError(f'Expected card play, got {decision.action}.')

        self._apply_card(player, decision.card, hands, round_cards)

    def _resolve_bet(
        self,
        *,
        requester: PlayerId,
        request_action: str,
        hands: dict[PlayerId, list[str]],
        vira_rank: str,
        scores: dict[PlayerId, int],
        round_results: list[str],
        round_index: int,
        round_cards: dict[PlayerId, str | None],
        bet: BetState,
        hand_index: int,
    ) -> HandOutcome | None:
        bet.pending_value = ACTION_TO_VALUE[request_action]
        bet.requested_by = requester
        bet.bet_state = 'awaiting_response'
        responder = self._opponent(requester)

        for _ in range(4):
            decision = self._decide(
                player=responder,
                hands=hands,
                vira_rank=vira_rank,
                scores=scores,
                round_results=round_results,
                round_index=round_index,
                round_cards=round_cards,
                bet=bet,
                special_state='normal',
                special_decision_pending=False,
                special_decision_by=None,
                hand_index=hand_index,
            )

            if decision.action == 'decline-bet':
                return HandOutcome(
                    winner=bet.requested_by,
                    points=bet.current_value,
                )

            if decision.action == 'accept-bet':
                bet.current_value = bet.pending_value or bet.current_value
                bet.raise_authority = responder
                bet.pending_value = None
                bet.requested_by = None
                bet.bet_state = 'idle'
                return None

            if decision.action in ACTION_TO_VALUE:
                bet.current_value = bet.pending_value or bet.current_value
                bet.raise_authority = responder
                bet.pending_value = ACTION_TO_VALUE[decision.action]
                bet.requested_by = responder
                responder = self._opponent(responder)
                continue

            raise RuntimeError(f'Unexpected bet response: {decision.action}')

        raise RuntimeError('Bet negotiation exceeded the raise limit.')

    def _decide(
        self,
        *,
        player: PlayerId,
        hands: dict[PlayerId, list[str]],
        vira_rank: str,
        scores: dict[PlayerId, int],
        round_results: list[str],
        round_index: int,
        round_cards: dict[PlayerId, str | None],
        bet: BetState,
        special_state: str,
        special_decision_pending: bool,
        special_decision_by: PlayerId | None,
        hand_index: int,
    ):
        payload = BotDecisionRequest.model_validate(
            self._payload(
                player=player,
                hands=hands,
                vira_rank=vira_rank,
                scores=scores,
                round_results=round_results,
                round_index=round_index,
                round_cards=round_cards,
                bet=bet,
                special_state=special_state,
                special_decision_pending=special_decision_pending,
                special_decision_by=special_decision_by,
                hand_index=hand_index,
            )
        )
        decision = self.engine.decide(payload)
        strategy = decision.rationale.strategy if decision.rationale else None
        hand_strength = (
            decision.rationale.hand_strength
            if decision.rationale
            else None
        )
        self.metrics.record(decision.action, strategy)
        self.decisions.append(
            DecisionRecord(
                match_index=self.match_index,
                match_seed=self.seed,
                hand_index=hand_index,
                round_index=round_index,
                player_id=player,
                profile=self._profile(player),
                action=decision.action,
                strategy=strategy,
                hand_strength=hand_strength,
                current_value=bet.current_value,
                player_one_score=scores['P1'],
                player_two_score=scores['P2'],
            )
        )
        return decision

    def _payload(
        self,
        *,
        player: PlayerId,
        hands: dict[PlayerId, list[str]],
        vira_rank: str,
        scores: dict[PlayerId, int],
        round_results: list[str],
        round_index: int,
        round_cards: dict[PlayerId, str | None],
        bet: BetState,
        special_state: str,
        special_decision_pending: bool,
        special_decision_by: PlayerId | None,
        hand_index: int,
    ) -> dict:
        available_actions = self._available_actions(
            player,
            bet,
            special_state,
            special_decision_pending,
            special_decision_by,
        )

        return {
            'matchId': f'simulation-{self.seed}-{hand_index}',
            'profile': self._profile(player),
            'mode': '1v1',
            'actorSeatId': 'T1A' if player == 'P1' else 'T2A',
            'actorTeamId': 'T1' if player == 'P1' else 'T2',
            'partnerSeatId': None,
            'viraRank': vira_rank,
            'currentRound': {
                'playerOneCard': round_cards['P1'],
                'playerTwoCard': round_cards['P2'],
                'finished': False,
                'result': None,
                'seatPlays': None,
                'orderedPlays': [],
                'winningSeatId': None,
            },
            'player': {
                'playerId': player,
                'hand': list(hands[player]),
            },
            'bet': {
                'currentValue': bet.current_value,
                'betState': bet.bet_state,
                'pendingValue': bet.pending_value,
                'requestedBy': bet.requested_by,
                'specialState': special_state,
                'specialDecisionPending': special_decision_pending,
                'availableActions': available_actions,
            },
            'score': {
                'playerOne': scores['P1'],
                'playerTwo': scores['P2'],
                'pointsToWin': self.points_to_win,
            },
            'handProgress': {
                'roundsWonByMe': self._round_wins(round_results, player),
                'roundsWonByOpponent': self._round_wins(
                    round_results,
                    self._opponent(player),
                ),
                'roundsTied': round_results.count('TIE'),
                'currentRoundIndex': round_index,
            },
        }

    def _available_actions(
        self,
        player: PlayerId,
        bet: BetState,
        special_state: str,
        special_decision_pending: bool,
        special_decision_by: PlayerId | None,
    ) -> dict:
        if special_state == 'mao_de_onze' and special_decision_pending:
            is_decider = player == special_decision_by
            return {
                'canRequestTruco': False,
                'canRaiseToSix': False,
                'canRaiseToNine': False,
                'canRaiseToTwelve': False,
                'canAcceptBet': False,
                'canDeclineBet': False,
                'canAcceptMaoDeOnze': is_decider,
                'canDeclineMaoDeOnze': is_decider,
                'canAttemptPlayCard': False,
            }

        if special_state != 'normal':
            return {
                'canRequestTruco': False,
                'canRaiseToSix': False,
                'canRaiseToNine': False,
                'canRaiseToTwelve': False,
                'canAcceptBet': False,
                'canDeclineBet': False,
                'canAcceptMaoDeOnze': False,
                'canDeclineMaoDeOnze': False,
                'canAttemptPlayCard': True,
            }

        if bet.bet_state == 'awaiting_response':
            is_responder = player != bet.requested_by
            pending = bet.pending_value
            return {
                'canRequestTruco': False,
                'canRaiseToSix': is_responder and pending == 3,
                'canRaiseToNine': is_responder and pending == 6,
                'canRaiseToTwelve': is_responder and pending == 9,
                'canAcceptBet': is_responder,
                'canDeclineBet': is_responder,
                'canAcceptMaoDeOnze': False,
                'canDeclineMaoDeOnze': False,
                'canAttemptPlayCard': False,
            }

        return {
            'canRequestTruco': bet.current_value == 1 and bet.raise_authority is None,
            'canRaiseToSix': bet.current_value == 3 and bet.raise_authority == player,
            'canRaiseToNine': bet.current_value == 6 and bet.raise_authority == player,
            'canRaiseToTwelve': bet.current_value == 9 and bet.raise_authority == player,
            'canAcceptBet': False,
            'canDeclineBet': False,
            'canAcceptMaoDeOnze': False,
            'canDeclineMaoDeOnze': False,
            'canAttemptPlayCard': True,
        }

    def _special_state(
        self,
        scores: dict[PlayerId, int],
    ) -> tuple[str, PlayerId | None]:
        if scores['P1'] == 11 and scores['P2'] == 11:
            return 'mao_de_ferro', None
        if scores['P1'] == 11:
            return 'mao_de_onze', 'P1'
        if scores['P2'] == 11:
            return 'mao_de_onze', 'P2'
        return 'normal', None

    def _profile(self, player: PlayerId) -> BotProfile:
        return self.profile_one if player == 'P1' else self.profile_two

    def _round_wins(
        self,
        round_results: list[str],
        player: PlayerId,
    ) -> int:
        return sum(1 for result in round_results if result == player)

    def _round_result(
        self,
        player_one_card: str | None,
        player_two_card: str | None,
        vira_rank: str,
    ) -> str:
        if player_one_card is None or player_two_card is None:
            raise RuntimeError('Round ended without two cards.')

        comparison = compare_cards(player_one_card, player_two_card, vira_rank)

        if comparison > 0:
            return 'P1'
        if comparison < 0:
            return 'P2'
        return 'TIE'

    def _apply_card(
        self,
        player: PlayerId,
        card: str,
        hands: dict[PlayerId, list[str]],
        round_cards: dict[PlayerId, str | None],
    ) -> None:
        if card not in hands[player]:
            raise RuntimeError(f'{player} selected a card outside its hand: {card}')

        hands[player].remove(card)
        round_cards[player] = card

    def _opponent(self, player: PlayerId) -> PlayerId:
        return 'P2' if player == 'P1' else 'P1'


def resolve_next_hand_starter(hand_winner: PlayerId) -> PlayerId:
    return 'P2' if hand_winner == 'P1' else 'P1'


def resolve_next_round_starter(
    round_result: str,
    current_starter: PlayerId,
) -> PlayerId:
    if round_result == 'P1':
        return 'P1'
    if round_result == 'P2':
        return 'P2'
    return current_starter


def resolve_hand_winner(round_results: list[str]) -> str | None:
    first = round_results[0] if len(round_results) > 0 else None
    second = round_results[1] if len(round_results) > 1 else None
    third = round_results[2] if len(round_results) > 2 else None

    if first is not None and second is not None:
        if first != 'TIE' and second == first:
            return first
        if first != 'TIE' and second == 'TIE':
            return first
        if first == 'TIE' and second != 'TIE':
            return second

    if first is not None and second is not None and third is not None:
        if first != 'TIE' and second != first:
            return first if third == 'TIE' else third
        if third != 'TIE':
            return third
        return 'P1'

    return None
