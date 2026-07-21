from typing import Literal

from app.schemas import (
    ActionDecisionResponse,
    BotDecisionRationalePayload,
    BotDecisionRequest,
    BotProfile,
)
from app.strategy.card_rules import hand_strength_score

MaoDeOnzeAction = Literal['accept-mao-de-onze', 'decline-mao-de-onze']

ACCEPT_THRESHOLDS: dict[BotProfile, float] = {
    'aggressive': 0.50,
    'balanced': 0.58,
    'cautious': 0.66,
}


class MaoDeOnzeStrategy:
    def decide(
        self,
        payload: BotDecisionRequest,
    ) -> ActionDecisionResponse | None:
        bet = payload.bet
        if bet is None or bet.special_state != 'mao_de_onze':
            return None
        if not bet.special_decision_pending:
            return None

        actions = bet.available_actions
        if not actions.can_accept_mao_de_onze and not actions.can_decline_mao_de_onze:
            return None

        hand_strength = hand_strength_score(payload.player.hand, payload.vira_rank)

        if actions.can_accept_mao_de_onze and hand_strength >= 0.78:
            return self._decision(
                'accept-mao-de-onze',
                hand_strength,
                'mao-de-onze-accept-strong-hand',
            )

        threshold = self._accept_threshold(payload)

        if actions.can_accept_mao_de_onze and hand_strength >= threshold:
            strategy = (
                'mao-de-onze-accept-aggressive-risk'
                if payload.profile == 'aggressive'
                else 'mao-de-onze-accept-balanced-hand'
            )
            return self._decision('accept-mao-de-onze', hand_strength, strategy)

        if actions.can_decline_mao_de_onze:
            return self._decision(
                'decline-mao-de-onze',
                hand_strength,
                self._decline_strategy(payload, hand_strength),
            )

        return self._decision(
            'accept-mao-de-onze',
            hand_strength,
            'mao-de-onze-accept-balanced-hand',
        )

    def _accept_threshold(self, payload: BotDecisionRequest) -> float:
        threshold = ACCEPT_THRESHOLDS[payload.profile]

        if self._decline_loses_match(payload):
            threshold -= 0.12
        if self._accept_risks_match(payload):
            threshold += 0.08

        return max(0.35, min(0.80, threshold))

    def _decline_strategy(
        self,
        payload: BotDecisionRequest,
        hand_strength: float,
    ) -> str:
        if self._accept_risks_match(payload):
            return 'mao-de-onze-decline-match-risk'
        if payload.profile == 'cautious':
            return 'mao-de-onze-decline-cautious-risk'
        if hand_strength <= 0.38:
            return 'mao-de-onze-decline-weak-hand'
        return 'mao-de-onze-decline-weak-hand'

    def _decline_loses_match(self, payload: BotDecisionRequest) -> bool:
        opponent_score = self._opponent_score(payload)
        return (
            opponent_score is not None
            and payload.score is not None
            and opponent_score + 1 >= payload.score.points_to_win
        )

    def _accept_risks_match(self, payload: BotDecisionRequest) -> bool:
        opponent_score = self._opponent_score(payload)
        return (
            opponent_score is not None
            and payload.score is not None
            and opponent_score + 3 >= payload.score.points_to_win
        )

    def _opponent_score(self, payload: BotDecisionRequest) -> int | None:
        score = payload.score
        if score is None:
            return None

        if payload.player.player_id == 'P1':
            return score.player_two

        return score.player_one

    def _decision(
        self,
        action: MaoDeOnzeAction,
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
