from dataclasses import dataclass

from app.schemas import (
    BotDecisionRationalePayload,
    BotDecisionRequest,
    BotDecisionResponse,
    PassDecisionResponse,
    PlayCardDecisionResponse,
)
from app.strategy.betting import BettingStrategy
from app.strategy.card_rules import (
    card_strength_key,
    compare_cards,
    hand_strength_score,
    sort_cards,
)
from app.strategy.mao_de_onze import MaoDeOnzeStrategy
from app.strategy.teamwork import TeamworkStrategy
from app.strategy.profiles import CardSelectionMode, ProfilePolicy, policy_for


@dataclass(frozen=True)
class TacticalContext:
    hand_strength: float
    current_round_index: int
    rounds_won_by_me: int
    rounds_won_by_opponent: int

    @property
    def behind(self) -> bool:
        return self.rounds_won_by_opponent > self.rounds_won_by_me

    @property
    def decisive(self) -> bool:
        return self.current_round_index >= 2 or max(
            self.rounds_won_by_me,
            self.rounds_won_by_opponent,
        ) >= 1


class StrategyEngine:
    def __init__(self) -> None:
        self.betting = BettingStrategy()
        self.mao_de_onze = MaoDeOnzeStrategy()
        self.teamwork = TeamworkStrategy()

    def decide(self, payload: BotDecisionRequest) -> BotDecisionResponse:
        mao_de_onze_decision = self.mao_de_onze.decide(payload)
        if mao_de_onze_decision is not None:
            return mao_de_onze_decision

        bet_response = self.betting.decide_response(payload)
        if bet_response is not None:
            return bet_response

        bet_initiative = self.betting.decide_initiative(payload)
        if bet_initiative is not None:
            return bet_initiative

        can_play = payload.bet is None or payload.bet.available_actions.can_attempt_play_card
        if can_play:
            return self.decide_card(payload)

        return PassDecisionResponse(
            action='pass',
            reason='unsupported-state',
        )

    def decide_card(self, payload: BotDecisionRequest) -> PlayCardDecisionResponse:
        hand = payload.player.hand

        if not hand:
            raise ValueError('Cannot choose a card from an empty hand.')
        if payload.current_round is None:
            raise ValueError('Cannot choose a card without a current round.')

        ordered_hand = sort_cards(hand, payload.vira_rank)
        hand_strength = hand_strength_score(hand, payload.vira_rank)
        tactical = self._build_tactical_context(payload, hand_strength)
        policy = policy_for(payload.profile)
        teamwork = self.teamwork.select(payload, ordered_hand, hand_strength)

        if teamwork is not None:
            card = teamwork.card
            strategy = teamwork.strategy
        else:
            threat_card = self._resolve_public_threat_card(payload)

            if threat_card is None:
                selection = self._resolve_opening_selection(policy, tactical)
                card = self._select_card(ordered_hand, selection)
                strategy = f'opening-{selection}'
            else:
                winning_cards = [
                    card
                    for card in ordered_hand
                    if compare_cards(card, threat_card, payload.vira_rank) > 0
                ]

                if winning_cards:
                    selection = self._resolve_winning_selection(policy, tactical)
                    card = self._select_card(winning_cards, selection)
                    strategy = f'response-winning-{selection}'
                else:
                    selection = policy.losing_response
                    card = self._select_card(ordered_hand, selection)
                    strategy = f'response-losing-{selection}'

        rationale = BotDecisionRationalePayload.model_validate(
            {
                'handStrength': hand_strength,
                'strategy': strategy,
            }
        )

        return PlayCardDecisionResponse(
            action='play-card',
            card=card,
            rationale=rationale,
        )

    def _build_tactical_context(
        self,
        payload: BotDecisionRequest,
        hand_strength: float,
    ) -> TacticalContext:
        progress = payload.hand_progress

        if progress is None:
            return TacticalContext(
                hand_strength=hand_strength,
                current_round_index=0,
                rounds_won_by_me=0,
                rounds_won_by_opponent=0,
            )

        return TacticalContext(
            hand_strength=hand_strength,
            current_round_index=progress.current_round_index,
            rounds_won_by_me=progress.rounds_won_by_me,
            rounds_won_by_opponent=progress.rounds_won_by_opponent,
        )

    def _resolve_opening_selection(
        self,
        policy: ProfilePolicy,
        tactical: TacticalContext,
    ) -> CardSelectionMode:
        under_pressure = tactical.behind and tactical.decisive

        if not under_pressure:
            return policy.neutral_opening

        if tactical.hand_strength < 0.35:
            return policy.neutral_opening

        return policy.pressure_opening

    def _resolve_winning_selection(
        self,
        policy: ProfilePolicy,
        tactical: TacticalContext,
    ) -> CardSelectionMode:
        if tactical.behind and tactical.decisive:
            return policy.pressure_winning_response

        return policy.neutral_winning_response

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
