from dataclasses import dataclass
from typing import Literal

from app.schemas import (
    ActionDecisionResponse,
    BotDecisionRationalePayload,
    BotDecisionRequest,
    BotProfile,
)
from app.strategy.card_rules import hand_strength_score
from app.strategy.signals import signal_for_scope

BetAction = Literal[
    'accept-bet',
    'decline-bet',
    'request-truco',
    'raise-to-six',
    'raise-to-nine',
    'raise-to-twelve',
]


@dataclass(frozen=True)
class BetThresholds:
    accept: float
    raise_value: float
    initiative: float
    decline_floor: float


THRESHOLDS: dict[BotProfile, BetThresholds] = {
    'aggressive': BetThresholds(0.36, 0.74, 0.68, 0.46),
    'balanced': BetThresholds(0.50, 0.84, 0.72, 0.55),
    'cautious': BetThresholds(0.70, 0.97, 0.85, 0.72),
}


class BettingStrategy:
    def decide_response(
        self,
        payload: BotDecisionRequest,
    ) -> ActionDecisionResponse | None:
        bet = payload.bet
        if bet is None or bet.special_state != 'normal':
            return None
        if bet.bet_state != 'awaiting_response':
            return None

        actions = bet.available_actions
        if not (
            actions.can_accept_bet
            or actions.can_decline_bet
            or actions.can_raise_to_six
            or actions.can_raise_to_nine
            or actions.can_raise_to_twelve
        ):
            return None

        hand_strength = hand_strength_score(payload.player.hand, payload.vira_rank)
        effective_strength = self._clamp(
            hand_strength
            + self._progress_adjustment(payload)
            + self._partner_signal_adjustment(payload, initiative=False)
        )
        thresholds = THRESHOLDS[payload.profile]

        if self._decline_loses_match(payload) and actions.can_accept_bet:
            return self._decision(
                'accept-bet',
                hand_strength,
                'bet-accept-forced-by-score',
            )

        if (
            self._accept_risks_match(payload)
            and actions.can_decline_bet
            and effective_strength < thresholds.decline_floor
        ):
            return self._decision(
                'decline-bet',
                hand_strength,
                'bet-decline-by-score',
            )

        raise_action = self._strongest_raise(payload)
        if raise_action is not None and effective_strength >= thresholds.raise_value:
            return self._decision(raise_action, hand_strength, 'bet-raise')

        if actions.can_accept_bet and effective_strength >= thresholds.accept:
            return self._decision('accept-bet', hand_strength, 'bet-accept')

        if actions.can_decline_bet:
            return self._decision('decline-bet', hand_strength, 'bet-decline')

        if actions.can_accept_bet:
            return self._decision('accept-bet', hand_strength, 'bet-no-response')

        return None

    def decide_initiative(
        self,
        payload: BotDecisionRequest,
    ) -> ActionDecisionResponse | None:
        bet = payload.bet
        if bet is None or bet.special_state != 'normal':
            return None
        if bet.bet_state != 'idle' or bet.special_decision_pending:
            return None
        if not bet.available_actions.can_attempt_play_card:
            return None
        if self._before_any_round(payload):
            return None

        action = self._initiative_action(payload)
        if action is None:
            return None

        hand_strength = hand_strength_score(payload.player.hand, payload.vira_rank)
        progress_adjustment = self._progress_adjustment(payload)
        score_adjustment = self._score_adjustment(payload)
        signal_adjustment = self._partner_signal_adjustment(payload, initiative=True)
        effective_strength = self._clamp(
            hand_strength + progress_adjustment + score_adjustment + signal_adjustment
        )
        threshold = THRESHOLDS[payload.profile].initiative

        if effective_strength >= threshold:
            return self._decision(action, hand_strength, 'bet-initiative-value')

        if (
            progress_adjustment + score_adjustment >= 0.20
            and effective_strength >= threshold - 0.18
        ):
            return self._decision(action, hand_strength, 'bet-initiative-pressure')

        return None

    def _decision(
        self,
        action: BetAction,
        hand_strength: float,
        strategy: str,
    ) -> ActionDecisionResponse:
        rationale = BotDecisionRationalePayload.model_validate(
            {
                'handStrength': hand_strength,
                'strategy': strategy,
            }
        )
        return ActionDecisionResponse(
            action=action,
            rationale=rationale,
        )

    def _strongest_raise(self, payload: BotDecisionRequest) -> BetAction | None:
        actions = payload.bet.available_actions if payload.bet else None
        if actions is None:
            return None
        if actions.can_raise_to_twelve:
            return 'raise-to-twelve'
        if actions.can_raise_to_nine:
            return 'raise-to-nine'
        if actions.can_raise_to_six:
            return 'raise-to-six'
        return None

    def _initiative_action(self, payload: BotDecisionRequest) -> BetAction | None:
        actions = payload.bet.available_actions if payload.bet else None
        if actions is None:
            return None
        if actions.can_request_truco:
            return 'request-truco'
        if actions.can_raise_to_six:
            return 'raise-to-six'
        if actions.can_raise_to_nine:
            return 'raise-to-nine'
        if actions.can_raise_to_twelve:
            return 'raise-to-twelve'
        return None

    def _progress_adjustment(self, payload: BotDecisionRequest) -> float:
        progress = payload.hand_progress
        if progress is None:
            return 0.0

        if progress.rounds_won_by_me == 1 and progress.rounds_won_by_opponent == 0:
            return 0.18
        if progress.rounds_won_by_me > progress.rounds_won_by_opponent:
            return 0.10
        if progress.rounds_won_by_opponent > progress.rounds_won_by_me:
            return -0.12
        if progress.rounds_tied > 0:
            return 0.03
        return 0.0

    def _partner_signal_adjustment(
        self,
        payload: BotDecisionRequest,
        *,
        initiative: bool,
    ) -> float:
        if payload.mode != '2v2':
            return 0.0

        hand_memory = signal_for_scope(payload, 'hand-memory')
        bet_intent = signal_for_scope(payload, 'bet-intent')
        signals = [signal for signal in (hand_memory, bet_intent) if signal is not None]

        base_adjustments = {
            'manilha-zap': 0.34,
            'manilha-copas': 0.26,
            'manilha-espadilha': 0.16,
            'manilha-ouros': 0.08,
            'strong-manilha': 0.28,
            'has-manilha': 0.14,
            'weak-manilha': 0.06,
            'no-manilha': -0.10,
            'strong-hand': 0.18,
            'weak-hand': -0.16,
            'pressure': 0.10,
            'avoid-bet': -0.22,
        }

        initiative_adjustments = {
            'manilha-zap': 0.06,
            'manilha-copas': 0.04,
            'manilha-espadilha': 0.02,
            'strong-manilha': 0.04,
            'has-manilha': 0.02,
            'strong-hand': 0.03,
            'no-manilha': -0.05,
            'pressure': 0.05,
            'avoid-bet': -0.08,
        }

        adjustment = 0.0

        for signal in signals:
            adjustment += base_adjustments.get(signal.kind, 0.0)
            if initiative:
                adjustment += initiative_adjustments.get(signal.kind, 0.0)

        return adjustment

    def _score_adjustment(self, payload: BotDecisionRequest) -> float:
        score = payload.score
        if score is None:
            return 0.0

        my_score, opponent_score = self._scores(payload)
        diff = my_score - opponent_score
        my_remaining = score.points_to_win - my_score
        opponent_remaining = score.points_to_win - opponent_score

        if opponent_remaining <= 3 and diff < 0:
            return 0.14
        if my_remaining <= 3 and diff >= 0:
            return 0.08
        if diff >= 6:
            return -0.10
        return 0.0

    def _decline_loses_match(self, payload: BotDecisionRequest) -> bool:
        if payload.score is None or payload.bet is None:
            return False

        _, opponent_score = self._scores(payload)
        return opponent_score + payload.bet.current_value >= payload.score.points_to_win

    def _accept_risks_match(self, payload: BotDecisionRequest) -> bool:
        if payload.score is None or payload.bet is None:
            return False

        _, opponent_score = self._scores(payload)
        pending_value = payload.bet.pending_value or payload.bet.current_value
        return opponent_score + pending_value >= payload.score.points_to_win

    def _scores(self, payload: BotDecisionRequest) -> tuple[int, int]:
        score = payload.score
        if score is None:
            raise ValueError('Score is required.')

        if payload.player.player_id == 'P1':
            return score.player_one, score.player_two

        return score.player_two, score.player_one

    def _before_any_round(self, payload: BotDecisionRequest) -> bool:
        progress = payload.hand_progress
        round_state = payload.current_round

        if progress is not None:
            return (
                progress.current_round_index == 0
                and progress.rounds_won_by_me == 0
                and progress.rounds_won_by_opponent == 0
                and progress.rounds_tied == 0
                and round_state is not None
                and round_state.player_one_card is None
                and round_state.player_two_card is None
            )

        return (
            round_state is not None
            and round_state.player_one_card is None
            and round_state.player_two_card is None
        )

    def _clamp(self, value: float) -> float:
        return max(0.0, min(1.0, value))
