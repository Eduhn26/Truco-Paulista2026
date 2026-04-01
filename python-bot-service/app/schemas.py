from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field


BotProfile = Literal['balanced', 'aggressive', 'cautious']
PlayerId = Literal['P1', 'P2']
RoundResult = Literal['P1', 'P2', 'TIE']
PassReason = Literal['empty-hand', 'missing-round', 'unsupported-state']


class BotPlayerView(BaseModel):
    model_config = ConfigDict(extra='forbid')

    player_id: PlayerId = Field(alias='playerId')
    hand: list[str]


class BotRoundView(BaseModel):
    model_config = ConfigDict(extra='forbid')

    player_one_card: str | None = Field(alias='playerOneCard')
    player_two_card: str | None = Field(alias='playerTwoCard')
    finished: bool
    result: RoundResult | None


class BotDecisionRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')

    # NOTE: Keep the HTTP payload aligned with the existing backend bot boundary.
    # The Python service must adapt to the contract, not the other way around.
    match_id: str = Field(alias='matchId')
    profile: BotProfile
    vira_rank: str = Field(alias='viraRank')
    current_round: BotRoundView | None = Field(alias='currentRound')
    player: BotPlayerView


class PlayCardDecisionResponse(BaseModel):
    model_config = ConfigDict(extra='forbid')

    action: Literal['play-card']
    card: str


class PassDecisionResponse(BaseModel):
    model_config = ConfigDict(extra='forbid')

    # NOTE: Restrict reasons to the backend-supported decision space so the future
    # TypeScript adapter can map responses without defensive translation layers.
    action: Literal['pass']
    reason: PassReason


BotDecisionResponse = Annotated[
    PlayCardDecisionResponse | PassDecisionResponse,
    Field(discriminator='action'),
]


class HealthResponse(BaseModel):
    model_config = ConfigDict(extra='forbid')

    status: Literal['ok']
    service: str
    environment: str