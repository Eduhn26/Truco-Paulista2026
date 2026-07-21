from collections import Counter
from dataclasses import dataclass, field


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
    metrics: DecisionMetrics


@dataclass
class SeriesResult:
    profile_one: str
    profile_two: str
    games: int
    seed: int
    wins: Counter[str] = field(default_factory=Counter)
    total_hands: int = 0
    metrics: DecisionMetrics = field(default_factory=DecisionMetrics)

    def add_match(
        self,
        result: MatchResult,
        player_one_profile: str,
        player_two_profile: str,
    ) -> None:
        winning_profile = (
            player_one_profile if result.winner == 'P1' else player_two_profile
        )
        self.wins[winning_profile] += 1
        self.total_hands += result.hands_played
        self.metrics.merge(result.metrics)

    def to_dict(self) -> dict:
        games = max(self.games, 1)

        return {
            'profiles': [self.profile_one, self.profile_two],
            'games': self.games,
            'seed': self.seed,
            'wins': dict(sorted(self.wins.items())),
            'winRates': {
                profile: round(wins / games, 4)
                for profile, wins in sorted(self.wins.items())
            },
            'averageHandsPerGame': round(self.total_hands / games, 2),
            'actions': dict(self.metrics.actions.most_common()),
            'strategies': dict(self.metrics.strategies.most_common()),
        }
