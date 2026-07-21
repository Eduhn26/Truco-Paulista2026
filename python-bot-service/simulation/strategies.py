from dataclasses import dataclass
from itertools import combinations

from app.schemas import BotProfile

PROFILES: tuple[BotProfile, ...] = ('aggressive', 'balanced', 'cautious')


@dataclass(frozen=True)
class ProfilePair:
    first: BotProfile
    second: BotProfile


def round_robin_pairs() -> list[ProfilePair]:
    return [
        ProfilePair(first=first, second=second)
        for first, second in combinations(PROFILES, 2)
    ]
