from dataclasses import dataclass


@dataclass(frozen=True)
class DecisionRecord:
    simulation_run_id: str
    match_id: str
    hand_id: str
    decision_id: str
    decision_index: int
    match_index: int
    match_seed: int
    hand_index: int
    round_index: int
    player_id: str
    profile: str
    vira_rank: str
    player_hand_before: str
    player_one_round_card: str | None
    player_two_round_card: str | None
    rounds_won_by_me: int
    rounds_won_by_opponent: int
    rounds_tied: int
    points_to_win: int
    current_value: int
    pending_value: int | None
    bet_state: str
    requested_by: str | None
    special_state: str
    special_decision_pending: bool
    action: str
    selected_card: str | None
    strategy: str | None
    hand_strength: float | None
    player_one_score: int
    player_two_score: int


@dataclass(frozen=True)
class HandRecord:
    simulation_run_id: str
    match_id: str
    hand_id: str
    match_index: int
    match_seed: int
    hand_index: int
    starter_player: str
    player_one_score_before: int
    player_two_score_before: int
    vira_rank: str
    special_state: str
    winner_player: str
    points_awarded: int
    final_hand_value: int
    rounds_played: int


@dataclass(frozen=True)
class MatchRecord:
    simulation_run_id: str
    match_id: str
    match_index: int
    seed: int
    player_one_profile: str
    player_two_profile: str
    winner_player: str
    winner_profile: str
    player_one_score: int
    player_two_score: int
    hands_played: int
