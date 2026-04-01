from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


BotProfile = Literal['balanced', 'aggressive', 'cautious']
PlayerId = Literal['P1', 'P2']
RoundResult = Literal['P1', 'P2', 'TIE']


class BotPlayerView(BaseModel):
    """Transport-agnostic player view aligned with the backend bot boundary."""

    model_config = ConfigDict(extra='forbid')

    player_id: PlayerId = Field(alias='playerId')
    hand: list[str]


class BotRoundView(BaseModel):
    """Transport-agnostic round view aligned with the backend bot boundary."""

    model_config = ConfigDict(extra='forbid')

    player_one_card: str | None = Field(alias='playerOneCard')
    player_two_card: str | None = Field(alias='playerTwoCard')
    finished: bool
    result: RoundResult | None


class BotDecisionContextPayload(BaseModel):
    """
    Provisional HTTP payload for the setup phase.

    NOTE:
    The canonical contract still belongs to the backend `BotDecisionPort`.
    This schema exists only so the Python service can validate structured input
    during Phase 15.A setup. Phase 15.B hardens the final HTTP contract.
    """

    model_config = ConfigDict(extra='forbid')

    match_id: str = Field(alias='matchId')
    profile: BotProfile
    vira_rank: str = Field(alias='viraRank')
    current_round: BotRoundView | None = Field(alias='currentRound')
    player: BotPlayerView


class BotDecisionResponse(BaseModel):
    """
    Minimal response shape for setup validation.

    NOTE:
    The response is intentionally simple and deterministic for now.
    Phase 15.B will formalize the stable HTTP decision contract.
    """

    model_config = ConfigDict(extra='forbid')

    action: Literal['play-card', 'pass']
    card: str | None = None
    reason: Literal['empty-hand', 'missing-round', 'unsupported-state', 'setup-default'] | None = None


class HealthResponse(BaseModel):
    """Operational health payload for local checks and future container wiring."""

    model_config = ConfigDict(extra='forbid')

    status: Literal['ok']
    service: str
    environment: str