from app.schemas import (
    BotDecisionRationalePayload,
    BotDecisionRequest,
    PlayCardDecisionResponse,
)
from app.strategy.card_rules import (
    card_strength_key,
    compare_cards,
    hand_strength_score,
    sort_cards,
)
from app.strategy.profiles import CardSelectionMode, policy_for


class StrategyEngine:
    def decide_card(self, payload: BotDecisionRequest) -> PlayCardDecisionResponse:
        hand = payload.player.hand

        if not hand:
            raise ValueError('Cannot choose a card from an empty hand.')
        if payload.current_round is None:
            raise ValueError('Cannot choose a card without a current round.')

        ordered_hand = sort_cards(hand, payload.vira_rank)
        policy = policy_for(payload.profile)
        threat_card = self._resolve_public_threat_card(payload)

        if threat_card is None:
            card = self._select_card(ordered_hand, policy.opening)
            strategy = f'opening-{policy.opening}'
        else:
            winning_cards = [
                card
                for card in ordered_hand
                if compare_cards(card, threat_card, payload.vira_rank) > 0
            ]

            if winning_cards:
                card = self._select_card(winning_cards, policy.winning_response)
                strategy = f'response-winning-{policy.winning_response}'
            else:
                card = self._select_card(ordered_hand, policy.losing_response)
                strategy = f'response-losing-{policy.losing_response}'

        rationale = BotDecisionRationalePayload.model_validate(
            {
                'handStrength': hand_strength_score(hand, payload.vira_rank),
                'strategy': strategy,
            }
        )

        return PlayCardDecisionResponse(
            action='play-card',
            card=card,
            rationale=rationale,
        )

    def _resolve_public_threat_card(self, payload: BotDecisionRequest) -> str | None:
        current_round = payload.current_round

        if current_round is None:
            return None

        if current_round.ordered_plays:
            opponent_cards = [
                play.card
                for play in current_round.ordered_plays
                if play.player_id != payload.player.player_id
            ]

            if opponent_cards:
                return max(
                    opponent_cards,
                    key=lambda card: card_strength_key(card, payload.vira_rank),
                )

        if payload.player.player_id == 'P1':
            return current_round.player_two_card

        return current_round.player_one_card

    def _select_card(
        self,
        ordered_cards: list[str],
        selection: CardSelectionMode,
    ) -> str:
        if not ordered_cards:
            raise ValueError('Cannot select a card from an empty collection.')

        if selection == 'weakest':
            return ordered_cards[0]
        if selection == 'strongest':
            return ordered_cards[-1]

        return ordered_cards[len(ordered_cards) // 2]
