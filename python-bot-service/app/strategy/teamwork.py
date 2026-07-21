from dataclasses import dataclass

from app.schemas import BotDecisionRequest, BotSeatId, BotTeamId
from app.strategy.card_rules import compare_cards
from app.strategy.signals import signal_for_scope

TEAM_BY_SEAT: dict[BotSeatId, BotTeamId] = {
    'T1A': 'T1',
    'T1B': 'T1',
    'T2A': 'T2',
    'T2B': 'T2',
}

PARTNER_BY_SEAT: dict[BotSeatId, BotSeatId] = {
    'T1A': 'T1B',
    'T1B': 'T1A',
    'T2A': 'T2B',
    'T2B': 'T2A',
}

SEAT_ORDER: tuple[BotSeatId, ...] = ('T1A', 'T2A', 'T1B', 'T2B')


@dataclass(frozen=True)
class TeamworkSelection:
    card: str
    strategy: str


@dataclass(frozen=True)
class RoundLeader:
    seat_id: BotSeatId | None
    team_id: BotTeamId | None
    card: str | None


class TeamworkStrategy:
    def select(
        self,
        payload: BotDecisionRequest,
        ordered_hand: list[str],
        hand_strength: float,
    ) -> TeamworkSelection | None:
        if payload.mode != '2v2':
            return None
        if payload.current_round is None or payload.current_round.finished:
            return None
        if payload.actor_seat_id is None:
            return None

        plays = self._plays(payload)
        if not plays:
            return self._opening_after_lead(payload, ordered_hand, hand_strength)

        leader = self._leader(payload, plays)
        actor_team = payload.actor_team_id or TEAM_BY_SEAT[payload.actor_seat_id]
        partner_seat = payload.partner_seat_id or PARTNER_BY_SEAT[payload.actor_seat_id]
        tactic = signal_for_scope(payload, 'round-tactic')

        if leader.seat_id == partner_seat:
            strategy = (
                'two-versus-two-signal-hold-save-weakest'
                if tactic is not None and tactic.kind in {'hold', 'low-card'}
                else 'two-versus-two-partner-winning-save-weakest'
            )
            return TeamworkSelection(ordered_hand[0], strategy)

        if leader.team_id == actor_team and tactic is not None and tactic.kind in {'hold', 'low-card'}:
            return TeamworkSelection(
                ordered_hand[0],
                'two-versus-two-signal-hold-save-weakest',
            )

        if leader.team_id is not None and leader.team_id != actor_team and leader.card is not None:
            winning_cards = [
                card
                for card in ordered_hand
                if compare_cards(card, leader.card, payload.vira_rank) > 0
            ]

            if not winning_cards:
                return TeamworkSelection(
                    ordered_hand[0],
                    'two-versus-two-response-losing-save-weakest',
                )

            if tactic is not None and tactic.kind == 'kill-round':
                return TeamworkSelection(
                    winning_cards[0],
                    'two-versus-two-signal-kill-round-weakest-winner',
                )

            if payload.profile == 'aggressive':
                return TeamworkSelection(
                    winning_cards[-1],
                    'response-winning-strongest',
                )

            return TeamworkSelection(
                winning_cards[0],
                'response-winning-weakest',
            )

        return None

    def _opening_after_lead(
        self,
        payload: BotDecisionRequest,
        ordered_hand: list[str],
        hand_strength: float,
    ) -> TeamworkSelection | None:
        progress = payload.hand_progress
        if progress is None:
            return None
        if progress.current_round_index == 0:
            return None
        if progress.rounds_won_by_me <= progress.rounds_won_by_opponent:
            return None

        tactic = signal_for_scope(payload, 'round-tactic')
        bet_intent = signal_for_scope(payload, 'bet-intent')

        if tactic is not None and tactic.kind in {'hold', 'low-card'}:
            return TeamworkSelection(
                ordered_hand[0],
                'two-versus-two-opening-after-first-win-save-weakest',
            )

        if bet_intent is not None and bet_intent.kind == 'avoid-bet':
            return TeamworkSelection(
                ordered_hand[0],
                'two-versus-two-opening-after-first-win-save-weakest',
            )

        pressure_threshold = {
            'aggressive': 0.48,
            'balanced': 0.62,
            'cautious': 0.74,
        }[payload.profile]

        current_value = payload.bet.current_value if payload.bet is not None else 1
        value_pressure = {
            'aggressive': 3,
            'balanced': 6,
            'cautious': 9,
        }[payload.profile]

        should_pressure = (
            hand_strength >= pressure_threshold
            or current_value >= value_pressure
            or (bet_intent is not None and bet_intent.kind == 'pressure' and hand_strength >= 0.38)
        )

        if should_pressure:
            return TeamworkSelection(
                ordered_hand[-1],
                'two-versus-two-opening-after-first-win-pressure',
            )

        return TeamworkSelection(
            ordered_hand[0],
            'two-versus-two-opening-after-first-win-save-weakest',
        )

    def _plays(
        self,
        payload: BotDecisionRequest,
    ) -> list[tuple[BotSeatId, str]]:
        round_state = payload.current_round
        if round_state is None:
            return []

        ordered = [
            (play.seat_id, play.card)
            for play in (round_state.ordered_plays or [])
            if play.seat_id is not None
        ]
        if ordered:
            return ordered

        if not round_state.seat_plays:
            return []

        return [
            (seat_id, round_state.seat_plays[seat_id])
            for seat_id in SEAT_ORDER
            if round_state.seat_plays.get(seat_id)
        ]

    def _leader(
        self,
        payload: BotDecisionRequest,
        plays: list[tuple[BotSeatId, str]],
    ) -> RoundLeader:
        leaders = [plays[0]]

        for play in plays[1:]:
            comparison = compare_cards(play[1], leaders[0][1], payload.vira_rank)

            if comparison > 0:
                leaders = [play]
            elif comparison == 0:
                leaders.append(play)

        if len(leaders) != 1:
            return RoundLeader(None, None, None)

        seat_id, card = leaders[0]
        return RoundLeader(seat_id, TEAM_BY_SEAT[seat_id], card)
