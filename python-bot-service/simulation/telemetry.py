from dataclasses import dataclass


@dataclass(frozen=True)
class DecisionRecord:
    match_index: int
    match_seed: int
    hand_index: int
    round_index: int
    player_id: str
    profile: str
    action: str
    strategy: str | None
    hand_strength: float | None
    current_value: int
    player_one_score: int
    player_two_score: int


@dataclass(frozen=True)
class MatchRecord:
    match_index: int
    seed: int
    player_one_profile: str
    player_two_profile: str
    winner_player: str
    winner_profile: str
    player_one_score: int
    player_two_score: int
    hands_played: int
