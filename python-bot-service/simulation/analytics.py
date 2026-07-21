from collections import Counter
from collections.abc import Iterable

from simulation.results import SeriesResult
from simulation.telemetry import DecisionRecord, MatchRecord

BET_ACTIONS = {
    'request-truco',
    'raise-to-six',
    'raise-to-nine',
    'raise-to-twelve',
    'accept-bet',
    'decline-bet',
}


def analyze_series(result: SeriesResult) -> dict:
    return _build_analysis(result.matches, result.decisions)


def analyze_round_robin(results: Iterable[SeriesResult]) -> dict:
    matches: list[MatchRecord] = []
    decisions: list[DecisionRecord] = []

    for result in results:
        matches.extend(result.matches)
        decisions.extend(result.decisions)

    return _build_analysis(matches, decisions)


def _build_analysis(
    matches: list[MatchRecord],
    decisions: list[DecisionRecord],
) -> dict:
    profiles = sorted(
        {
            profile
            for match in matches
            for profile in (
                match.player_one_profile,
                match.player_two_profile,
            )
        }
    )

    profile_stats: dict[str, dict] = {}

    for profile in profiles:
        appearances = [
            match
            for match in matches
            if profile in {
                match.player_one_profile,
                match.player_two_profile,
            }
        ]
        wins = sum(match.winner_profile == profile for match in appearances)

        as_player_one = [
            match
            for match in appearances
            if match.player_one_profile == profile
        ]
        as_player_two = [
            match
            for match in appearances
            if match.player_two_profile == profile
        ]

        profile_decisions = [
            decision
            for decision in decisions
            if decision.profile == profile
        ]
        actions = Counter(
            decision.action
            for decision in profile_decisions
        )
        strategies = Counter(
            decision.strategy
            for decision in profile_decisions
            if decision.strategy is not None
        )
        strength_samples = [
            decision.hand_strength
            for decision in profile_decisions
            if decision.hand_strength is not None
        ]

        profile_stats[profile] = {
            'games': len(appearances),
            'wins': wins,
            'winRate': _rate(wins, len(appearances)),
            'asPlayerOne': {
                'games': len(as_player_one),
                'wins': sum(
                    match.winner_profile == profile
                    for match in as_player_one
                ),
            },
            'asPlayerTwo': {
                'games': len(as_player_two),
                'wins': sum(
                    match.winner_profile == profile
                    for match in as_player_two
                ),
            },
            'actions': dict(actions.most_common()),
            'strategies': dict(strategies.most_common()),
            'betting': {
                'requests': actions['request-truco'],
                'raises': (
                    actions['raise-to-six']
                    + actions['raise-to-nine']
                    + actions['raise-to-twelve']
                ),
                'accepts': actions['accept-bet'],
                'declines': actions['decline-bet'],
            },
            'averageDecisionHandStrength': (
                round(sum(strength_samples) / len(strength_samples), 4)
                if strength_samples
                else None
            ),
        }

        for seat in ('asPlayerOne', 'asPlayerTwo'):
            seat_stats = profile_stats[profile][seat]
            seat_stats['winRate'] = _rate(
                seat_stats['wins'],
                seat_stats['games'],
            )

    player_one_wins = sum(
        match.winner_player == 'P1'
        for match in matches
    )
    player_two_wins = sum(
        match.winner_player == 'P2'
        for match in matches
    )
    bet_decisions = sum(
        decision.action in BET_ACTIONS
        for decision in decisions
    )

    return {
        'matches': len(matches),
        'decisions': len(decisions),
        'seatAdvantage': {
            'playerOneWins': player_one_wins,
            'playerTwoWins': player_two_wins,
            'playerOneWinRate': _rate(player_one_wins, len(matches)),
            'playerTwoWinRate': _rate(player_two_wins, len(matches)),
        },
        'betDecisionRate': _rate(bet_decisions, len(decisions)),
        'profiles': profile_stats,
    }


def _rate(numerator: int, denominator: int) -> float:
    if denominator == 0:
        return 0.0

    return round(numerator / denominator, 4)
