import argparse
import json
import math
from collections import Counter
from pathlib import Path
from random import Random

from app.strategy.engine import StrategyEngine
from app.strategy.ml_assisted import (
    MlAssistedStrategyEngine,
)
from data.ml_runtime_inference import (
    CandidateRuntimePredictor,
)
from simulation.match_simulator import (
    HeadlessMatchSimulator,
)
from simulation.strategies import PROFILES


BET_ACTIONS = {
    'request-truco',
    'raise-to-six',
    'raise-to-nine',
    'raise-to-twelve',
    'accept-bet',
    'decline-bet',
}


def run_ab_comparison(
    predictor,
    *,
    games_per_profile=1000,
    seed_base=13001,
):
    if games_per_profile < 2:
        raise ValueError(
            'games_per_profile must be at least 2'
        )

    profile_reports = []

    overall_assisted_wins = 0
    overall_baseline_wins = 0
    overall_overrides = 0

    overall_assisted_actions = Counter()
    overall_baseline_actions = Counter()

    for profile_index, profile in enumerate(
        PROFILES
    ):
        rng = Random(
            seed_base
            + profile_index
        )

        assisted_wins = 0
        baseline_wins = 0
        ml_overrides = 0

        assisted_actions = Counter()
        baseline_actions = Counter()

        assisted_seat_counts = Counter()

        for game_index in range(
            games_per_profile
        ):
            assisted_player = (
                'P1'
                if game_index % 2 == 0
                else 'P2'
            )

            assisted_seat_counts[
                assisted_player
            ] += 1

            assisted_engine = (
                MlAssistedStrategyEngine(
                    predictor
                )
            )

            baseline_engine = (
                StrategyEngine()
            )

            if (
                assisted_player
                == 'P1'
            ):
                engine_one = (
                    assisted_engine
                )
                engine_two = (
                    baseline_engine
                )
            else:
                engine_one = (
                    baseline_engine
                )
                engine_two = (
                    assisted_engine
                )

            simulator = (
                HeadlessMatchSimulator(
                    profile,
                    profile,
                    seed=(
                        rng.randrange(
                            1,
                            2**31,
                        )
                    ),
                    match_index=(
                        game_index
                    ),
                    engine_one=(
                        engine_one
                    ),
                    engine_two=(
                        engine_two
                    ),
                )
            )

            match = (
                simulator.simulate()
            )

            if (
                match.winner
                == assisted_player
            ):
                assisted_wins += 1
            else:
                baseline_wins += 1

            for decision in (
                match.decisions
            ):
                if (
                    decision.player_id
                    == assisted_player
                ):
                    assisted_actions[
                        decision.action
                    ] += 1

                    if (
                        decision.strategy
                        is not None
                        and
                        decision.strategy.startswith(
                            'ml-assisted-'
                        )
                    ):
                        ml_overrides += 1
                else:
                    baseline_actions[
                        decision.action
                    ] += 1

        summary = _win_summary(
            assisted_wins,
            games_per_profile,
        )

        profile_reports.append(
            {
                'profile': (
                    profile
                ),
                'games': (
                    games_per_profile
                ),
                'assistedWins': (
                    assisted_wins
                ),
                'baselineWins': (
                    baseline_wins
                ),
                'assistedSeatAssignments': {
                    'P1': (
                        assisted_seat_counts[
                            'P1'
                        ]
                    ),
                    'P2': (
                        assisted_seat_counts[
                            'P2'
                        ]
                    ),
                },
                'assistedWinRate': (
                    summary[
                        'winRate'
                    ]
                ),
                'liftVsFiftyPercent': (
                    summary[
                        'liftVsFiftyPercent'
                    ]
                ),
                'confidenceInterval95': (
                    summary[
                        'confidenceInterval95'
                    ]
                ),
                'verdict': (
                    summary[
                        'verdict'
                    ]
                ),
                'mlOverrideCount': (
                    ml_overrides
                ),
                'assistedActions': dict(
                    assisted_actions
                ),
                'baselineActions': dict(
                    baseline_actions
                ),
                'assistedBetting': (
                    _betting_summary(
                        assisted_actions
                    )
                ),
                'baselineBetting': (
                    _betting_summary(
                        baseline_actions
                    )
                ),
            }
        )

        overall_assisted_wins += (
            assisted_wins
        )

        overall_baseline_wins += (
            baseline_wins
        )

        overall_overrides += (
            ml_overrides
        )

        overall_assisted_actions.update(
            assisted_actions
        )

        overall_baseline_actions.update(
            baseline_actions
        )

    total_games = (
        games_per_profile
        * len(
            PROFILES
        )
    )

    overall = _win_summary(
        overall_assisted_wins,
        total_games,
    )

    return {
        'evaluationType': (
            'direct-head-to-head-'
            'ml-assisted-vs-heuristic'
        ),
        'scientificScope': (
            'Both bots use the same profile and '
            'the same card-playing heuristics. '
            'The experimental bot differs only '
            'through conservative first-decision '
            'ML betting overrides in 1v1.'
        ),
        'configuration': {
            'gamesPerProfile': (
                games_per_profile
            ),
            'totalGames': (
                total_games
            ),
            'seedBase': (
                seed_base
            ),
            'profiles': list(
                PROFILES
            ),
        },
        'overall': {
            'assistedWins': (
                overall_assisted_wins
            ),
            'baselineWins': (
                overall_baseline_wins
            ),
            'assistedWinRate': (
                overall[
                    'winRate'
                ]
            ),
            'liftVsFiftyPercent': (
                overall[
                    'liftVsFiftyPercent'
                ]
            ),
            'confidenceInterval95': (
                overall[
                    'confidenceInterval95'
                ]
            ),
            'verdict': (
                overall[
                    'verdict'
                ]
            ),
            'mlOverrideCount': (
                overall_overrides
            ),
            'assistedActions': dict(
                overall_assisted_actions
            ),
            'baselineActions': dict(
                overall_baseline_actions
            ),
            'assistedBetting': (
                _betting_summary(
                    overall_assisted_actions
                )
            ),
            'baselineBetting': (
                _betting_summary(
                    overall_baseline_actions
                )
            ),
        },
        'byProfile': (
            profile_reports
        ),
    }


def _win_summary(
    wins,
    games,
):
    win_rate = (
        wins
        / games
    )

    standard_error = math.sqrt(
        (
            win_rate
            * (
                1
                - win_rate
            )
        )
        / games
    )

    lower = max(
        0.0,
        win_rate
        - (
            1.96
            * standard_error
        ),
    )

    upper = min(
        1.0,
        win_rate
        + (
            1.96
            * standard_error
        ),
    )

    if lower > 0.5:
        verdict = 'positive'
    elif upper < 0.5:
        verdict = 'negative'
    else:
        verdict = 'inconclusive'

    return {
        'winRate': round(
            win_rate,
            6,
        ),
        'liftVsFiftyPercent': round(
            win_rate
            - 0.5,
            6,
        ),
        'confidenceInterval95': {
            'lower': round(
                lower,
                6,
            ),
            'upper': round(
                upper,
                6,
            ),
        },
        'verdict': (
            verdict
        ),
    }


def _betting_summary(
    actions,
):
    return {
        'requests': (
            actions[
                'request-truco'
            ]
        ),
        'raises': (
            actions[
                'raise-to-six'
            ]
            + actions[
                'raise-to-nine'
            ]
            + actions[
                'raise-to-twelve'
            ]
        ),
        'accepts': (
            actions[
                'accept-bet'
            ]
        ),
        'declines': (
            actions[
                'decline-bet'
            ]
        ),
        'total': sum(
            actions[
                action
            ]
            for action
            in BET_ACTIONS
        ),
    }


def main():
    parser = argparse.ArgumentParser()

    parser.add_argument(
        '--model-path',
        type=Path,
        default=Path(
            'ml-artifacts/'
            'candidate-v1/'
            'truco-hand-win-random-forest.joblib'
        ),
    )

    parser.add_argument(
        '--games-per-profile',
        type=int,
        default=1000,
    )

    parser.add_argument(
        '--seed-base',
        type=int,
        default=13001,
    )

    parser.add_argument(
        '--output-dir',
        type=Path,
        default=Path(
            'ml-artifacts/'
            'ml-assisted-ab'
        ),
    )

    args = parser.parse_args()

    predictor = (
        CandidateRuntimePredictor
        .from_model_path(
            args.model_path
        )
    )

    print(
        'Running direct ML-assisted '
        'vs heuristic A/B...'
    )

    report = run_ab_comparison(
        predictor,
        games_per_profile=(
            args.games_per_profile
        ),
        seed_base=(
            args.seed_base
        ),
    )

    args.output_dir.mkdir(
        parents=True,
        exist_ok=True,
    )

    report_path = (
        args.output_dir
        / 'ab-report.json'
    )

    report_path.write_text(
        json.dumps(
            report,
            indent=2,
            sort_keys=True,
        ),
        encoding='utf-8',
    )

    overall = (
        report[
            'overall'
        ]
    )

    print()
    print(
        '=== ML-ASSISTED A/B ==='
    )

    print(
        'Total games: '
        f'{report["configuration"]["totalGames"]:,}'
    )

    print(
        'Assisted wins: '
        f'{overall["assistedWins"]:,}'
    )

    print(
        'Baseline wins: '
        f'{overall["baselineWins"]:,}'
    )

    print(
        'Assisted win rate: '
        f'{overall["assistedWinRate"]:.6f}'
    )

    print(
        'Lift vs 50%: '
        f'{overall["liftVsFiftyPercent"]:.6f}'
    )

    print(
        '95% CI: '
        f'{overall["confidenceInterval95"]["lower"]:.6f}'
        ' - '
        f'{overall["confidenceInterval95"]["upper"]:.6f}'
    )

    print(
        'ML overrides: '
        f'{overall["mlOverrideCount"]:,}'
    )

    print(
        'Verdict: '
        f'{overall["verdict"]}'
    )

    print()
    print(
        'Report: '
        f'{report_path}'
    )


if __name__ == '__main__':
    main()
