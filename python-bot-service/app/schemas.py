from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

NonEmptyString = Annotated[str, Field(min_length=1)]

BotProfile = Literal['balanced', 'aggressive', 'cautious']
BotMode = Literal['1v1', '2v2']
BotTeamId = Literal['T1', 'T2']
BotSeatId = Literal['T1A', 'T2A', 'T1B', 'T2B']
PlayerId = Literal['P1', 'P2']
RoundResult = Literal['P1', 'P2', 'TIE']
PassReason = Literal['empty-hand', 'missing-round', 'unsupported-state']

PartnerSignalKind = Literal[
    'manilha-zap',
    'manilha-copas',
    'manilha-espadilha',
    'manilha-ouros',
    'has-manilha',
    'strong-manilha',
    'weak-manilha',
    'no-manilha',
    'strong-hand',
    'weak-hand',
    'hold',
    'kill-round',
    'low-card',
    'pressure',
    'avoid-bet',
]
PartnerSignalScope = Literal['hand-memory', 'round-tactic', 'bet-intent']
PartnerSignalStrengthHint = Literal['none', 'weak', 'medium', 'strong']
PartnerSignalIntent = Literal['save', 'attack', 'pressure', 'neutral']


class BotPlayerView(BaseModel):
    model_config = ConfigDict(extra='forbid')

    player_id: PlayerId = Field(alias='playerId')
    hand: list[NonEmptyString]


class BotRoundPlayView(BaseModel):
    model_config = ConfigDict(extra='forbid')

    owner_id: NonEmptyString = Field(alias='ownerId')
    seat_id: BotSeatId | None = Field(alias='seatId')
    player_id: PlayerId = Field(alias='playerId')
    card: NonEmptyString


class BotRoundView(BaseModel):
    model_config = ConfigDict(extra='forbid')

    player_one_card: str | None = Field(alias='playerOneCard')
    player_two_card: str | None = Field(alias='playerTwoCard')
    finished: bool
    result: RoundResult | None
    seat_plays: dict[BotSeatId, str | None] | None = Field(default=None, alias='seatPlays')
    ordered_plays: list[BotRoundPlayView] | None = Field(default=None, alias='orderedPlays')
    winning_seat_id: BotSeatId | None = Field(default=None, alias='winningSeatId')


class BotAvailableActionsView(BaseModel):
    model_config = ConfigDict(extra='forbid')

    can_request_truco: bool = Field(alias='canRequestTruco')
    can_raise_to_six: bool = Field(alias='canRaiseToSix')
    can_raise_to_nine: bool = Field(alias='canRaiseToNine')
    can_raise_to_twelve: bool = Field(alias='canRaiseToTwelve')
    can_accept_bet: bool = Field(alias='canAcceptBet')
    can_decline_bet: bool = Field(alias='canDeclineBet')
    can_accept_mao_de_onze: bool = Field(alias='canAcceptMaoDeOnze')
    can_decline_mao_de_onze: bool = Field(alias='canDeclineMaoDeOnze')
    can_attempt_play_card: bool = Field(alias='canAttemptPlayCard')


class BotBetView(BaseModel):
    model_config = ConfigDict(extra='forbid')

    current_value: int = Field(alias='currentValue')
    bet_state: Literal['idle', 'awaiting_response'] = Field(alias='betState')
    pending_value: int | None = Field(alias='pendingValue')
    requested_by: PlayerId | None = Field(alias='requestedBy')
    special_state: Literal['normal', 'mao_de_onze', 'mao_de_ferro'] = Field(alias='specialState')
    special_decision_pending: bool = Field(alias='specialDecisionPending')
    available_actions: BotAvailableActionsView = Field(alias='availableActions')


class BotMatchScoreView(BaseModel):
    model_config = ConfigDict(extra='forbid')

    player_one: int = Field(alias='playerOne')
    player_two: int = Field(alias='playerTwo')
    points_to_win: int = Field(alias='pointsToWin')


class BotHandProgressView(BaseModel):
    model_config = ConfigDict(extra='forbid')

    rounds_won_by_me: int = Field(alias='roundsWonByMe')
    rounds_won_by_opponent: int = Field(alias='roundsWonByOpponent')
    rounds_tied: int = Field(alias='roundsTied')
    current_round_index: int = Field(alias='currentRoundIndex')


class BotPartnerSignalView(BaseModel):
    model_config = ConfigDict(extra='forbid')

    from_seat_id: BotSeatId = Field(alias='fromSeatId')
    kind: PartnerSignalKind
    scope: PartnerSignalScope
    strength_hint: PartnerSignalStrengthHint = Field(alias='strengthHint')
    intent: PartnerSignalIntent
    expires_at: NonEmptyString = Field(alias='expiresAt')


class BotPartnerSignalBucketView(BaseModel):
    model_config = ConfigDict(extra='forbid')

    hand_memory: BotPartnerSignalView | None = Field(default=None, alias='handMemory')
    round_tactic: BotPartnerSignalView | None = Field(default=None, alias='roundTactic')
    bet_intent: BotPartnerSignalView | None = Field(default=None, alias='betIntent')


class BotDecisionRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')

    match_id: NonEmptyString = Field(alias='matchId')
    profile: BotProfile
    mode: BotMode | None = None
    actor_seat_id: BotSeatId | None = Field(default=None, alias='actorSeatId')
    actor_team_id: BotTeamId | None = Field(default=None, alias='actorTeamId')
    partner_seat_id: BotSeatId | None = Field(default=None, alias='partnerSeatId')
    vira_rank: NonEmptyString = Field(alias='viraRank')
    current_round: BotRoundView | None = Field(alias='currentRound')
    player: BotPlayerView
    partner_signal: BotPartnerSignalView | None = Field(default=None, alias='partnerSignal')
    partner_signals: BotPartnerSignalBucketView | None = Field(default=None, alias='partnerSignals')
    bet: BotBetView | None = None
    score: BotMatchScoreView | None = None
    hand_progress: BotHandProgressView | None = Field(default=None, alias='handProgress')


class BotDecisionRationalePayload(BaseModel):
    model_config = ConfigDict(extra='forbid')

    hand_strength: float | None = Field(default=None, alias='handStrength')
    strategy: NonEmptyString | None = None


class PlayCardDecisionResponse(BaseModel):
    model_config = ConfigDict(extra='forbid')

    action: Literal['play-card']
    card: NonEmptyString
    rationale: BotDecisionRationalePayload | None = None


class ActionDecisionResponse(BaseModel):
    model_config = ConfigDict(extra='forbid')

    action: Literal[
        'accept-bet',
        'decline-bet',
        'request-truco',
        'raise-to-six',
        'raise-to-nine',
        'raise-to-twelve',
        'accept-mao-de-onze',
        'decline-mao-de-onze',
    ]
    rationale: BotDecisionRationalePayload | None = None


class PassDecisionResponse(BaseModel):
    model_config = ConfigDict(extra='forbid')

    action: Literal['pass']
    reason: PassReason
    rationale: BotDecisionRationalePayload | None = None


BotDecisionResponse = Annotated[
    PlayCardDecisionResponse | ActionDecisionResponse | PassDecisionResponse,
    Field(discriminator='action'),
]


class HealthResponse(BaseModel):
    model_config = ConfigDict(extra='forbid')

    status: Literal['ok']
    service: NonEmptyString
    environment: NonEmptyString