from collections import Counter
from dataclasses import dataclass, field

from simulation.telemetry import DecisionRecord, MatchRecord


@dataclass
class DecisionMetrics:
    actions: Counter[str] = field(default_factory=Counter)
    strategies: Counter[str] = field(default_factory=Counter)

    def record(self, action: str, strategy: str | None) -> None:
        self.actions[action] += 1
        if strategy is not None:
            self.strategies[strategy] += 1

    def merge(self, other: 'DecisionMetrics') -> None:
        self.actions.update(other.actions)
        self.strategies.update(other.strategies)


@dataclass(frozen=True)
class MatchResult:
    winner: str
    player_one_score: int
    player_two_score: int
    hands_played: int
    match_index: int
    seed: int
    metrics: DecisionMetrics
    decisions: list[DecisionRecord]


@dataclass
class SeriesResult:
    profile_one: str
    profile_two: str
    games: int
    seed: int
    wins: Counter[str] = field(default_factory=Counter)
    total_hands: int = 0
    metrics: DecisionMetrics = field(default_factory=DecisionMetrics)
    matches: list[MatchRecord] = field(default_factory=list)
    decisions: list[DecisionRecord] = field(default_factory=list)

    def add_match(
        self,
        result: MatchResult,
        player_one_profile: str,
        player_two_profile: str,
    ) -> None:
        winning_profile = (
            player_one_profile
            if result.winner == 'P1'
            else player_two_profile
        )
        self.wins[winning_profile] += 1
        self.total_hands += result.hands_played
        self.metrics.merge(result.metrics)
        self.matches.append(
            MatchRecord(
                match_index=result.match_index,
                seed=result.seed,
                player_one_profile=player_one_profile,
                player_two_profile=player_two_profile,
                winner_player=result.winner,
                winner_profile=winning_profile,
                player_one_score=result.player_one_score,
                player_two_score=result.player_two_score,
                hands_played=result.hands_played,
            )
        )
        self.decisions.extend(result.decisions)

    def to_dict(self) -> dict:
        games = max(self.games, 1)
        profiles = (self.profile_one, self.profile_two)
        wins = {
            profile: self.wins.get(profile, 0)
            for profile in profiles
        }

        return {
            'profiles': list(profiles),
            'games': self.games,
            'seed': self.seed,
            'wins': wins,
            'winRates': {
                profile: round(wins[profile] / games, 4)
                for profile in profiles
            },
            'averageHandsPerGame': round(self.total_hands / games, 2),
            'actions': dict(self.metrics.actions.most_common()),
            'strategies': dict(self.metrics.strategies.most_common()),
        }
