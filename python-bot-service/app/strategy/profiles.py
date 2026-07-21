from dataclasses import dataclass
from typing import Literal

from app.schemas import BotProfile

CardSelectionMode = Literal['weakest', 'middle', 'strongest']
WinningSelectionMode = Literal['weakest', 'strongest']


@dataclass(frozen=True)
class ProfilePolicy:
    opening: CardSelectionMode
    winning_response: WinningSelectionMode
    losing_response: CardSelectionMode


PROFILE_POLICIES: dict[BotProfile, ProfilePolicy] = {
    'balanced': ProfilePolicy(
        opening='middle',
        winning_response='weakest',
        losing_response='weakest',
    ),
    'aggressive': ProfilePolicy(
        opening='strongest',
        winning_response='strongest',
        losing_response='middle',
    ),
    'cautious': ProfilePolicy(
        opening='weakest',
        winning_response='weakest',
        losing_response='weakest',
    ),
}


def policy_for(profile: BotProfile) -> ProfilePolicy:
    return PROFILE_POLICIES[profile]
