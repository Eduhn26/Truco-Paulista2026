import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.config import settings
from app.schemas import (
    BotDecisionRequest,
    BotDecisionResponse,
    BotProfile,
)
from app.strategy.engine import StrategyEngine
from app.strategy.ml_assisted import (
    MlAssistedStrategyEngine,
    SCORE_SENSITIVE_STRATEGIES,
)
from app.strategy.ml_shadow import (
    MlShadowObserver,
    build_shadow_runtime_state,
)
from app.strategy.ml_shadow_runtime import (
    MlShadowRuntime,
)
from app.strategy.ml_shadow_runtime import (
    MlShadowRuntime,
)
from data.ml_runtime_inference import (
    CandidateRuntimePredictor,
)
from app.strategy.card_rules import compare_cards
from simulation.match_simulator import (
    HeadlessMatchSimulator,
)


AiLabIntelligenceMode = Literal[
    'heuristic',
    'shadow',
    'ml-assisted',
]


class AiLabBotConfig(
    BaseModel,
):
    model_config = ConfigDict(
        populate_by_name=True,
    )

    profile: BotProfile
    intelligence_mode: AiLabIntelligenceMode = Field(
        alias='intelligenceMode'
    )


class AiLabObservabilityOptions(
    BaseModel,
):
    model_config = ConfigDict(
        populate_by_name=True,
    )

    show_internal_decisions: bool = Field(
        default=True,
        alias='showInternalDecisions',
    )
    show_ml_predictions: bool = Field(
        default=True,
        alias='showMlPredictions',
    )
    show_architecture_trace: bool = Field(
        default=True,
        alias='showArchitectureTrace',
    )


class AiLabSimulationRequest(
    BaseModel,
):
    model_config = ConfigDict(
        populate_by_name=True,
    )

    bot_a: AiLabBotConfig = Field(
        alias='botA'
    )
    bot_b: AiLabBotConfig = Field(
        alias='botB'
    )
    seed: int = Field(
        default=13001,
        ge=1,
        le=(2**31) - 1,
    )
    observability: AiLabObservabilityOptions = Field(
        default_factory=AiLabObservabilityOptions,
    )


@dataclass
class AiLabDecisionTraceRecorder:
    records: list[dict] = field(
        default_factory=list
    )

    def append(
        self,
        record: dict,
    ) -> None:
        self.records.append(
            record
        )


class AiLabInstrumentedStrategyEngine:
    def __init__(
        self,
        mode: AiLabIntelligenceMode,
        recorder: AiLabDecisionTraceRecorder,
        *,
        predictor=None,
        shadow_runtime=None,
        model_error_type: str | None = None,
    ):
        self._mode = mode
        self._recorder = recorder
        self._predictor = predictor
        self._shadow_runtime = shadow_runtime
        self._model_error_type = model_error_type
        self._base_engine = StrategyEngine()
        self._assisted_engine = (
            MlAssistedStrategyEngine(
                predictor,
                base_engine=self._base_engine,
            )
            if mode == 'ml-assisted' and predictor is not None
            else None
        )

    def decide(
        self,
        payload: BotDecisionRequest,
    ) -> BotDecisionResponse:
        baseline = self._base_engine.decide(payload)
        ml_eligible = self._is_ml_eligible(payload)
        score_sensitive = self._is_score_sensitive(baseline)
        prediction = None
        prediction_error_type = None
        shadow_observed = False
        final_decision = baseline

        if self._mode == 'shadow' and self._shadow_runtime is not None:
            shadow_event = self._shadow_runtime.observe(payload, baseline)

            if shadow_event is not None:
                shadow_observed = shadow_event.get('status') == 'observed'

                if shadow_observed:
                    prediction = {
                        'winProbability': shadow_event['winProbability'],
                        'predictedHandWin': shadow_event['predictedHandWin'],
                        'threshold': (
                            self._predictor.prediction_threshold
                            if self._predictor is not None
                            else 0.5
                        ),
                        'artifactVersion': shadow_event['artifactVersion'],
                        'modelType': shadow_event['modelType'],
                    }
                else:
                    prediction_error_type = shadow_event.get('errorType')

        elif (
            self._mode == 'ml-assisted'
            and self._predictor is not None
            and ml_eligible
        ):
            try:
                prediction = self._predictor.predict(
                    build_shadow_runtime_state(payload)
                )

                if self._assisted_engine is not None:
                    final_decision = (
                        self._assisted_engine.resolve_with_probability(
                            payload,
                            baseline,
                            float(prediction['winProbability']),
                        )
                    )
            except Exception as error:
                prediction_error_type = type(error).__name__
                final_decision = baseline

        baseline_payload = _serialize_decision(baseline)
        final_payload = _serialize_decision(final_decision)

        self._recorder.append(
            {
                'mode': self._mode,
                'playerId': payload.player.player_id,
                'profile': payload.profile,
                'mlEligible': ml_eligible,
                'overrideEligible': ml_eligible and not score_sensitive,
                'scoreSensitive': score_sensitive,
                'shadowObserved': shadow_observed,
                'modelAvailable': self._predictor is not None,
                'modelErrorType': self._model_error_type,
                'predictionErrorType': prediction_error_type,
                'prediction': prediction,
                'baseline': baseline_payload,
                'final': final_payload,
                'overrideApplied': (
                    baseline_payload['action'] != final_payload['action']
                ),
            }
        )

        return final_decision

    @staticmethod
    def _is_ml_eligible(
        payload,
    ) -> bool:
        if payload.mode not in (None, '1v1'):
            return False

        if payload.bet is None:
            return False

        if payload.bet.special_state != 'normal':
            return False

        return MlShadowObserver.is_eligible(payload)

    @staticmethod
    def _is_score_sensitive(
        decision,
    ) -> bool:
        if decision.rationale is None:
            return False

        return (
            decision.rationale.strategy
            in SCORE_SENSITIVE_STRATEGIES
        )


def run_ai_lab_simulation(
    payload: AiLabSimulationRequest,
    *,
    predictor=None,
    model_error_type: str | None = None,
) -> dict:
    requested_ml = any(
        bot.intelligence_mode
        != 'heuristic'
        for bot in (
            payload.bot_a,
            payload.bot_b,
        )
    )

    resolved_predictor = predictor
    resolved_model_error = (
        model_error_type
    )

    if (
        requested_ml
        and
        resolved_predictor
        is None
        and
        resolved_model_error
        is None
    ):
        try:
            resolved_predictor = (
                CandidateRuntimePredictor
                .from_model_path(
                    Path(
                        settings
                        .ml_model_path
                    )
                )
            )
        except Exception as error:
            resolved_model_error = (
                type(
                    error
                ).__name__
            )

    recorder = (
        AiLabDecisionTraceRecorder()
    )

    shadow_runtime = (
        MlShadowRuntime(
            MlShadowObserver(
                resolved_predictor
            )
        )
        if (
            resolved_predictor is not None
            and any(
                bot.intelligence_mode == 'shadow'
                for bot in (
                    payload.bot_a,
                    payload.bot_b,
                )
            )
        )
        else None
    )

    engine_one = (
        AiLabInstrumentedStrategyEngine(
            payload
            .bot_a
            .intelligence_mode,
            recorder,
            predictor=(
                resolved_predictor
            ),
            shadow_runtime=(
                shadow_runtime
            ),
            model_error_type=(
                resolved_model_error
            ),
        )
    )

    engine_two = (
        AiLabInstrumentedStrategyEngine(
            payload
            .bot_b
            .intelligence_mode,
            recorder,
            predictor=(
                resolved_predictor
            ),
            shadow_runtime=(
                shadow_runtime
            ),
            model_error_type=(
                resolved_model_error
            ),
        )
    )

    simulation_run_id = (
        'ai-lab-'
        f'{payload.seed}-'
        f'{payload.bot_a.profile}-'
        f'{payload.bot_b.profile}'
    )
    match_id = (
        f'{simulation_run_id}-match'
    )

    simulator = (
        HeadlessMatchSimulator(
            payload.bot_a.profile,
            payload.bot_b.profile,
            seed=payload.seed,
            match_index=0,
            simulation_run_id=(
                simulation_run_id
            ),
            match_id=match_id,
            engine_one=engine_one,
            engine_two=engine_two,
        )
    )

    match = (
        simulator
        .simulate()
    )

    hands = (
        _build_hand_summaries(
            match
        )
    )

    events = (
        _build_events(
            payload,
            match,
            hands,
            recorder.records,
        )
    )

    return {
        'simulationRunId': (
            simulation_run_id
        ),
        'seed': payload.seed,
        'config': {
            'botA': (
                payload
                .bot_a
                .model_dump(
                    by_alias=True
                )
            ),
            'botB': (
                payload
                .bot_b
                .model_dump(
                    by_alias=True
                )
            ),
            'observability': (
                payload
                .observability
                .model_dump(
                    by_alias=True
                )
            ),
        },
        'model': {
            'requested': requested_ml,
            'available': (
                resolved_predictor
                is not None
            ),
            'errorType': (
                resolved_model_error
            ),
            'fallbackPreserved': True,
        },
        'architecture': (
            _architecture_trace()
            if (
                payload
                .observability
                .show_architecture_trace
            )
            else []
        ),
        'match': {
            'matchId': (
                match.match_id
            ),
            'winner': (
                match.winner
            ),
            'playerOneScore': (
                match.player_one_score
            ),
            'playerTwoScore': (
                match.player_two_score
            ),
            'handsPlayed': (
                match.hands_played
            ),
            'decisionCount': (
                len(
                    match.decisions
                )
            ),
        },
        'hands': hands,
        'events': events,
    }


def _build_hand_summaries(
    match,
) -> list[dict]:
    decisions_by_hand: dict[
        int,
        list,
    ] = {}

    for decision in (
        match.decisions
    ):
        decisions_by_hand.setdefault(
            decision.hand_index,
            [],
        ).append(
            decision
        )

    summaries = []

    for hand in (
        match.hands
    ):
        decisions = (
            decisions_by_hand
            .get(
                hand.hand_index,
                [],
            )
        )

        initial_hands = {
            'P1': [],
            'P2': [],
        }

        for player_id in (
            'P1',
            'P2',
        ):
            first_decision = next(
                (
                    decision
                    for decision
                    in decisions
                    if (
                        decision
                        .player_id
                        ==
                        player_id
                    )
                ),
                None,
            )

            if (
                first_decision
                is not None
            ):
                initial_hands[
                    player_id
                ] = (
                    _decode_hand(
                        first_decision
                        .player_hand_before
                    )
                )

        player_one_score_after = (
            hand
            .player_one_score_before
            +
            (
                hand.points_awarded
                if (
                    hand
                    .winner_player
                    ==
                    'P1'
                )
                else 0
            )
        )
        player_two_score_after = (
            hand
            .player_two_score_before
            +
            (
                hand.points_awarded
                if (
                    hand
                    .winner_player
                    ==
                    'P2'
                )
                else 0
            )
        )

        summaries.append(
            {
                'handIndex': (
                    hand.hand_index
                ),
                'starterPlayer': (
                    hand
                    .starter_player
                ),
                'viraRank': (
                    hand.vira_rank
                ),
                'specialState': (
                    hand.special_state
                ),
                'winnerPlayer': (
                    hand
                    .winner_player
                ),
                'pointsAwarded': (
                    hand
                    .points_awarded
                ),
                'finalHandValue': (
                    hand
                    .final_hand_value
                ),
                'roundsPlayed': (
                    hand
                    .rounds_played
                ),
                'scoreBefore': {
                    'P1': (
                        hand
                        .player_one_score_before
                    ),
                    'P2': (
                        hand
                        .player_two_score_before
                    ),
                },
                'scoreAfter': {
                    'P1': (
                        player_one_score_after
                    ),
                    'P2': (
                        player_two_score_after
                    ),
                },
                'initialHands': (
                    initial_hands
                ),
            }
        )

    return summaries


def _build_events(
    payload,
    match,
    hands,
    traces,
) -> list[dict]:
    events: list[dict] = []

    def emit(
        event_type: str,
        category: str,
        title: str,
        description: str,
        **extra,
    ) -> None:
        sequence = len(
            events
        )

        events.append(
            {
                'eventId': (
                    f'event-'
                    f'{sequence:04d}'
                ),
                'sequence': sequence,
                'type': event_type,
                'category': category,
                'title': title,
                'description': description,
                **extra,
            }
        )

    emit(
        'simulation.started',
        'system',
        'Simulação iniciada',
        (
            'O NestJS encaminhou a configuração '
            'ao microserviço Python.'
        ),
        architecture=(
            _architecture_trace()
            if (
                payload
                .observability
                .show_architecture_trace
            )
            else []
        ),
    )

    emit(
        'match.started',
        'system',
        'Partida criada',
        (
            f'Seed {payload.seed} · '
            f'{payload.bot_a.profile} '
            'vs '
            f'{payload.bot_b.profile}.'
        ),
        snapshot={
            'scores': {
                'P1': 0,
                'P2': 0,
            },
        },
    )

    decisions_by_hand: dict[
        int,
        list,
    ] = {}

    for decision in (
        match.decisions
    ):
        decisions_by_hand.setdefault(
            decision.hand_index,
            [],
        ).append(
            decision
        )

    hand_lookup = {
        hand[
            'handIndex'
        ]: hand
        for hand
        in hands
    }

    for hand in hands:
        hand_index = (
            hand[
                'handIndex'
            ]
        )

        emit(
            'hand.started',
            'hand',
            (
                'Mão '
                f'{hand_index + 1} '
                'iniciada'
            ),
            (
                f'Vira {hand["viraRank"]} · '
                f'valor inicial 1 ponto.'
            ),
            handIndex=hand_index,
            snapshot={
                'scores': (
                    hand[
                        'scoreBefore'
                    ]
                ),
                'viraRank': (
                    hand[
                        'viraRank'
                    ]
                ),
                'currentValue': 1,
            },
        )

        emit(
            'cards.dealt',
            'hand',
            'Cartas distribuídas',
            (
                'As duas mãos foram abertas '
                'para o modo espectador do AI Lab.'
            ),
            handIndex=hand_index,
            snapshot={
                'scores': hand['scoreBefore'],
                'viraRank': hand['viraRank'],
                'currentValue': 1,
                'initialHands': hand['initialHands'],
            },
        )

        resolved_rounds: set[tuple[int, int]] = set()

        for decision in (
            decisions_by_hand
            .get(
                hand_index,
                []
            )
        ):
            trace = (
                traces[
                    decision
                    .decision_index
                ]
                if (
                    decision
                    .decision_index
                    <
                    len(
                        traces
                    )
                )
                else {}
            )

            snapshot = (
                _decision_snapshot(
                    decision,
                    hand_lookup[
                        hand_index
                    ],
                )
            )

            decision_payload = {
                'decisionIndex': (
                    decision
                    .decision_index
                ),
                'playerId': (
                    decision
                    .player_id
                ),
                'profile': (
                    decision
                    .profile
                ),
                'mode': (
                    trace.get(
                        'mode',
                        'heuristic',
                    )
                ),
                'baseline': (
                    trace.get(
                        'baseline'
                    )
                ),
                'final': (
                    trace.get(
                        'final'
                    )
                ),
                'mlEligible': (
                    trace.get(
                        'mlEligible',
                        False,
                    )
                ),
                'overrideEligible': (
                    trace.get(
                        'overrideEligible',
                        False,
                    )
                ),
                'scoreSensitive': (
                    trace.get(
                        'scoreSensitive',
                        False,
                    )
                ),
                'shadowObserved': (
                    trace.get(
                        'shadowObserved',
                        False,
                    )
                ),
                'overrideApplied': (
                    trace.get(
                        'overrideApplied',
                        False,
                    )
                ),
                'prediction': (
                    trace.get(
                        'prediction'
                    )
                ),
                'modelAvailable': (
                    trace.get(
                        'modelAvailable',
                        True,
                    )
                ),
                'modelErrorType': (
                    trace.get(
                        'modelErrorType'
                    )
                ),
                'predictionErrorType': (
                    trace.get(
                        'predictionErrorType'
                    )
                ),
                'shadowDeduplicated': (
                    trace.get(
                        'shadowDeduplicated',
                        False,
                    )
                ),
            }

            emit(
                'decision.requested',
                'decision',
                'Decisão solicitada',
                (
                    f'{decision.player_id} entrou '
                    'no Strategy Engine.'
                ),
                handIndex=hand_index,
                roundIndex=(
                    decision
                    .round_index
                ),
                playerId=(
                    decision
                    .player_id
                ),
                snapshot=snapshot,
                decision=(
                    decision_payload
                ),
            )

            if (
                payload
                .observability
                .show_internal_decisions
            ):
                baseline = (
                    trace.get(
                        'baseline'
                    )
                )

                if baseline:
                    emit(
                        'strategy.heuristic',
                        'decision',
                        'Heurística avaliada',
                        (
                            'Decisão base: '
                            f'{baseline["action"]}.'
                        ),
                        handIndex=hand_index,
                        roundIndex=(
                            decision
                            .round_index
                        ),
                        playerId=(
                            decision
                            .player_id
                        ),
                        snapshot=snapshot,
                        decision=(
                            decision_payload
                        ),
                    )

            if (
                payload
                .observability
                .show_ml_predictions
                and
                trace.get(
                    'mode'
                )
                != 'heuristic'
            ):
                prediction = (
                    trace.get(
                        'prediction'
                    )
                )

                if prediction:
                    probability = (
                        float(
                            prediction[
                                'winProbability'
                            ]
                        )
                        *
                        100
                    )

                    emit(
                        'ml.inference',
                        'ml',
                        'Random Forest executado',
                        (
                            'Probabilidade estimada '
                            f'de vitória: '
                            f'{probability:.2f}%.'
                        ),
                        handIndex=hand_index,
                        roundIndex=(
                            decision
                            .round_index
                        ),
                        playerId=(
                            decision
                            .player_id
                        ),
                        snapshot=snapshot,
                        decision=(
                            decision_payload
                        ),
                    )
                elif (
                    not trace.get(
                        'modelAvailable',
                        True,
                    )
                ):
                    emit(
                        'ml.unavailable',
                        'ml',
                        'Modelo indisponível',
                        (
                            'O fallback heurístico '
                            'foi preservado.'
                        ),
                        handIndex=hand_index,
                        roundIndex=(
                            decision
                            .round_index
                        ),
                        playerId=(
                            decision
                            .player_id
                        ),
                        snapshot=snapshot,
                        decision=(
                            decision_payload
                        ),
                    )
                elif trace.get(
                    'shadowDeduplicated',
                    False,
                ):
                    emit(
                        'ml.deduplicated',
                        'ml',
                        'Observação Shadow deduplicada',
                        (
                            'Este estado já havia sido '
                            'observado nesta mão.'
                        ),
                        handIndex=hand_index,
                        roundIndex=(
                            decision
                            .round_index
                        ),
                        playerId=(
                            decision
                            .player_id
                        ),
                        snapshot=snapshot,
                        decision=(
                            decision_payload
                        ),
                    )
                elif (
                    not trace.get(
                        'mlEligible',
                        False,
                    )
                ):
                    emit(
                        'ml.skipped',
                        'ml',
                        'Estado fora do escopo ML',
                        (
                            'A decisão permaneceu '
                            '100% heurística.'
                        ),
                        handIndex=hand_index,
                        roundIndex=(
                            decision
                            .round_index
                        ),
                        playerId=(
                            decision
                            .player_id
                        ),
                        snapshot=snapshot,
                        decision=(
                            decision_payload
                        ),
                    )

            if trace.get(
                'overrideApplied',
                False,
            ):
                emit(
                    'ml.override',
                    'ml',
                    'Override ML aplicado',
                    (
                        f'{trace["baseline"]["action"]} '
                        '→ '
                        f'{trace["final"]["action"]}.'
                    ),
                    handIndex=hand_index,
                    roundIndex=(
                        decision
                        .round_index
                    ),
                    playerId=(
                        decision
                        .player_id
                    ),
                    snapshot=snapshot,
                    decision=(
                        decision_payload
                    ),
                )

            emit(
                'decision.returned',
                'decision',
                'Decisão final retornada',
                (
                    f'{decision.player_id}: '
                    f'{decision.action}.'
                ),
                handIndex=hand_index,
                roundIndex=(
                    decision
                    .round_index
                ),
                playerId=(
                    decision
                    .player_id
                ),
                action=(
                    decision.action
                ),
                card=(
                    decision
                    .selected_card
                ),
                snapshot=snapshot,
                decision=(
                    decision_payload
                ),
            )

            if (
                decision.action
                ==
                'play-card'
            ):
                emit(
                    'card.played',
                    'action',
                    'Carta jogada',
                    (
                        f'{decision.player_id} '
                        f'jogou '
                        f'{decision.selected_card}.'
                    ),
                    handIndex=hand_index,
                    roundIndex=(
                        decision
                        .round_index
                    ),
                    playerId=(
                        decision
                        .player_id
                    ),
                    action=(
                        decision.action
                    ),
                    card=(
                        decision
                        .selected_card
                    ),
                    snapshot=snapshot,
                    decision=(
                        decision_payload
                    ),
                )
            elif (
                decision.action
                != 'pass'
            ):
                bet_event_type, bet_title = _bet_event_identity(
                    decision.action
                )

                emit(
                    bet_event_type,
                    'action',
                    bet_title,
                    (
                        f'{decision.player_id}: '
                        f'{decision.action}.'
                    ),
                    handIndex=hand_index,
                    roundIndex=decision.round_index,
                    playerId=decision.player_id,
                    action=decision.action,
                    snapshot=snapshot,
                    decision=decision_payload,
                )

            round_key = (
                hand_index,
                decision.round_index,
            )

            if (
                decision.action == 'play-card'
                and round_key not in resolved_rounds
            ):
                emitted_round_cards = {
                    emitted.get('playerId'): emitted.get('card')
                    for emitted in events
                    if (
                        emitted.get('type') == 'card.played'
                        and emitted.get('handIndex') == hand_index
                        and emitted.get('roundIndex') == decision.round_index
                        and emitted.get('playerId') in ('P1', 'P2')
                    )
                }

                player_one_card = emitted_round_cards.get('P1')
                player_two_card = emitted_round_cards.get('P2')

                if (
                    player_one_card is not None
                    and player_two_card is not None
                ):
                    comparison = compare_cards(
                        player_one_card,
                        player_two_card,
                        hand['viraRank'],
                    )
                    round_winner = (
                        'P1'
                        if comparison > 0
                        else (
                            'P2'
                            if comparison < 0
                            else 'TIE'
                        )
                    )
                    resolved_rounds.add(round_key)

                    emit(
                        'round.resolved',
                        'result',
                        (
                            'Vasa empatada'
                            if round_winner == 'TIE'
                            else f'{round_winner} venceu a vasa'
                        ),
                        f'{player_one_card} × {player_two_card}.',
                        handIndex=hand_index,
                        roundIndex=decision.round_index,
                        playerId=(
                            None
                            if round_winner == 'TIE'
                            else round_winner
                        ),
                        snapshot=snapshot,
                    )

        emit(
            'hand.finished',
            'result',
            (
                'Mão '
                f'{hand_index + 1} '
                'finalizada'
            ),
            (
                f'{hand["winnerPlayer"]} venceu '
                f'{hand["pointsAwarded"]} '
                'ponto(s).'
            ),
            handIndex=hand_index,
            playerId=(
                hand[
                    'winnerPlayer'
                ]
            ),
            snapshot={
                'scores': (
                    hand[
                        'scoreAfter'
                    ]
                ),
                'viraRank': (
                    hand[
                        'viraRank'
                    ]
                ),
                'currentValue': (
                    hand[
                        'finalHandValue'
                    ]
                ),
            },
        )

    emit(
        'match.finished',
        'result',
        'Partida finalizada',
        (
            f'{match.winner} venceu '
            f'{match.player_one_score} '
            '× '
            f'{match.player_two_score}.'
        ),
        playerId=(
            match.winner
        ),
        snapshot={
            'scores': {
                'P1': (
                    match
                    .player_one_score
                ),
                'P2': (
                    match
                    .player_two_score
                ),
            },
        },
    )

    return events


def _decision_snapshot(
    decision,
    hand,
) -> dict:
    return {
        'scores': {
            'P1': (
                decision
                .player_one_score
            ),
            'P2': (
                decision
                .player_two_score
            ),
        },
        'viraRank': (
            decision
            .vira_rank
        ),
        'currentValue': (
            decision
            .current_value
        ),
        'pendingValue': (
            decision
            .pending_value
        ),
        'betState': (
            decision
            .bet_state
        ),
        'specialState': (
            decision
            .special_state
        ),
        'actorHand': (
            _decode_hand(
                decision
                .player_hand_before
            )
        ),
        'initialHands': (
            hand[
                'initialHands'
            ]
        ),
    }


def _serialize_decision(
    decision,
) -> dict:
    rationale = (
        decision.rationale
    )

    return {
        'action': (
            decision.action
        ),
        'card': (
            getattr(
                decision,
                'card',
                None,
            )
        ),
        'reason': (
            getattr(
                decision,
                'reason',
                None,
            )
        ),
        'strategy': (
            rationale.strategy
            if rationale
            is not None
            else None
        ),
        'handStrength': (
            rationale.hand_strength
            if rationale
            is not None
            else None
        ),
    }


def _decode_hand(
    value,
) -> list[str]:
    if isinstance(
        value,
        str,
    ):
        try:
            parsed = (
                json.loads(
                    value
                )
            )
        except json.JSONDecodeError:
            return []
    else:
        parsed = value

    if not isinstance(
        parsed,
        list,
    ):
        return []

    return [
        str(
            card
        )
        for card
        in parsed
    ]



def _bet_event_identity(
    action: str,
) -> tuple[str, str]:
    identities = {
        'request-truco': ('bet.requested', 'Truco pedido'),
        'raise-to-six': ('bet.raised', 'Aposta elevada para 6'),
        'raise-to-nine': ('bet.raised', 'Aposta elevada para 9'),
        'raise-to-twelve': ('bet.raised', 'Aposta elevada para 12'),
        'accept-bet': ('bet.accepted', 'Aposta aceita'),
        'decline-bet': ('bet.declined', 'Aposta recusada'),
        'accept-mao-de-onze': ('special.accepted', 'Mão de 11 aceita'),
        'decline-mao-de-onze': ('special.declined', 'Mão de 11 recusada'),
    }

    return identities.get(
        action,
        ('bet.action', 'Ação de aposta'),
    )


def _architecture_trace() -> list[dict]:
    return [
        {
            'id': 'react-ai-lab',
            'label': 'React AI Lab',
            'detail': (
                'Configura o confronto '
                'e inicia a execução.'
            ),
        },
        {
            'id': 'nestjs-proxy',
            'label': 'NestJS AI Lab Controller',
            'detail': (
                'Mantém a fronteira pública '
                'do produto.'
            ),
        },
        {
            'id': 'python-http',
            'label': 'HTTP /ai-lab/simulate',
            'detail': (
                'Transporta a configuração '
                'entre Node e Python.'
            ),
        },
        {
            'id': 'fastapi',
            'label': 'FastAPI',
            'detail': (
                'Valida o contrato '
                'da simulação.'
            ),
        },
        {
            'id': 'simulation-engine',
            'label': 'HeadlessMatchSimulator',
            'detail': (
                'Executa uma partida real '
                'com seed determinística.'
            ),
        },
        {
            'id': 'strategy-engine',
            'label': 'Strategy Engines',
            'detail': (
                'Heurística, Shadow Mode '
                'ou ML-assisted por bot.'
            ),
        },
    ]
