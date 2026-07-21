from dataclasses import dataclass
from typing import Literal

from app.schemas import BotProfile

CardSelectionMode = Literal['weakest', 'middle', 'strongest']


@dataclass(frozen=True)
class ProfilePolicy:
    neutral_opening: CardSelectionMode
    pressure_opening: CardSelectionMode
    neutral_winning_response: CardSelectionMode
    pressure_winning_response: CardSelectionMode
    losing_response: CardSelectionMode


PROFILE_POLICIES: dict[BotProfile, ProfilePolicy] = {
    'balanced': ProfilePolicy(
        neutral_opening='middle',
        pressure_opening='middle',
        neutral_winning_response='weakest',
        pressure_winning_response='weakest',
        losing_response='weakest',
    ),
    'aggressive': ProfilePolicy(
        neutral_opening='middle',
        pressure_opening='strongest',
        neutral_winning_response='weakest',
        pressure_winning_response='weakest',
        losing_response='middle',
    ),
    'cautious': ProfilePolicy(
        neutral_opening='weakest',
        pressure_opening='middle',
        neutral_winning_response='weakest',
        pressure_winning_response='weakest',
        losing_response='weakest',
    ),
}


def policy_for(profile: BotProfile) -> ProfilePolicy:
    return PROFILE_POLICIES[profile]
