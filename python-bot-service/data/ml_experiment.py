import argparse
import json
import tempfile
from pathlib import Path

import pandas as pd

from data.ml_benchmark import (
    DEFAULT_BENCHMARK_RANDOM_STATES,
    run_repeated_benchmarks,
)
from data.ml_baseline import DEFAULT_TEST_SIZE
from data.ml_dataset import (
    build_ml_ready_dataset_dir,
    validate_ml_ready_dataset,
)
from simulation.exporter import export_series
from simulation.runner import run_series


DEFAULT_GAMES_PER_MATCHUP = 1000
DEFAULT_EXPERIMENT_SEED = 500

DEFAULT_MATCHUPS = (
    ('aggressive', 'balanced'),
    ('balanced', 'aggressive'),
    ('aggressive', 'cautious'),
    ('cautious', 'aggressive'),
    ('balanced', 'cautious'),
    ('cautious', 'balanced'),
)


def build_experiment_dataset(
    *,
    games_per_matchup=DEFAULT_GAMES_PER_MATCHUP,
    seed=DEFAULT_EXPERIMENT_SEED,
    matchups=DEFAULT_MATCHUPS,
):
    if games_per_matchup <= 0:
        raise ValueError(
            'games_per_matchup must be greater than zero'
        )

    matchups = tuple(matchups)

    if not matchups:
        raise ValueError(
            'Experiment requires at least one matchup'
        )

    frames = []
    matchup_summaries = []

    with tempfile.TemporaryDirectory() as temporary:
        root = Path(temporary)

        for index, (
            profile_one,
            profile_two,
        ) in enumerate(matchups):
            series_seed = seed + index

            result = run_series(
                profile_one,
                profile_two,
                games=games_per_matchup,
                seed=series_seed,
            )

            output_dir = (
                root
                / (
                    f'{index:02d}-'
                    f'{profile_one}-vs-{profile_two}'
                )
            )

            export_series(
                result,
                output_dir,
            )

            frame = build_ml_ready_dataset_dir(
                output_dir
            )

            frames.append(frame)

            matchup_summaries.append(
                {
                    'profileOne': profile_one,
                    'profileTwo': profile_two,
                    'games': games_per_matchup,
                    'seed': series_seed,
                    'rows': len(frame),
                    'matches': int(
                        frame['match_id'].nunique()
                    ),
                    'hands': int(
                        frame['hand_id'].nunique()
                    ),
                    'targetPositiveRate': (
                        _positive_rate(
                            frame['hand_won']
                        )
                    ),
                }
            )

    combined = pd.concat(
        frames,
        ignore_index=True,
    )

    validate_ml_ready_dataset(
        combined
    )

    return combined, matchup_summaries


def run_benchmark_experiment(
    *,
    games_per_matchup=DEFAULT_GAMES_PER_MATCHUP,
    seed=DEFAULT_EXPERIMENT_SEED,
    matchups=DEFAULT_MATCHUPS,
    random_states=DEFAULT_BENCHMARK_RANDOM_STATES,
    test_size=DEFAULT_TEST_SIZE,
    include_profile=False,
):
    frame, matchup_summaries = (
        build_experiment_dataset(
            games_per_matchup=games_per_matchup,
            seed=seed,
            matchups=matchups,
        )
    )

    benchmark = run_repeated_benchmarks(
        frame,
        random_states=random_states,
        test_size=test_size,
        include_profile=include_profile,
    )

    return {
        'configuration': {
            'gamesPerMatchup': games_per_matchup,
            'seed': seed,
            'randomStates': list(
                random_states
            ),
            'testSize': test_size,
            'includeProfile': include_profile,
            'matchups': [
                {
                    'profileOne': profile_one,
                    'profileTwo': profile_two,
                }
                for (
                    profile_one,
                    profile_two,
                ) in matchups
            ],
        },
        'dataset': {
            'rows': len(frame),
            'matches': int(
                frame['match_id'].nunique()
            ),
            'hands': int(
                frame['hand_id'].nunique()
            ),
            'simulationRuns': int(
                frame[
                    'simulation_run_id'
                ].nunique()
            ),
            'targetPositiveRate': (
                _positive_rate(
                    frame['hand_won']
                )
            ),
        },
        'matchups': matchup_summaries,
        'benchmark': benchmark,
    }


def write_benchmark_experiment(
    output_dir,
    *,
    games_per_matchup=DEFAULT_GAMES_PER_MATCHUP,
    seed=DEFAULT_EXPERIMENT_SEED,
    matchups=DEFAULT_MATCHUPS,
    random_states=DEFAULT_BENCHMARK_RANDOM_STATES,
    test_size=DEFAULT_TEST_SIZE,
    include_profile=False,
):
    destination = Path(output_dir)

    destination.mkdir(
        parents=True,
        exist_ok=True,
    )

    frame, matchup_summaries = (
        build_experiment_dataset(
            games_per_matchup=games_per_matchup,
            seed=seed,
            matchups=matchups,
        )
    )

    benchmark = run_repeated_benchmarks(
        frame,
        random_states=random_states,
        test_size=test_size,
        include_profile=include_profile,
    )

    report = {
        'configuration': {
            'gamesPerMatchup': games_per_matchup,
            'seed': seed,
            'randomStates': list(
                random_states
            ),
            'testSize': test_size,
            'includeProfile': include_profile,
        },
        'dataset': {
            'rows': len(frame),
            'matches': int(
                frame['match_id'].nunique()
            ),
            'hands': int(
                frame['hand_id'].nunique()
            ),
            'simulationRuns': int(
                frame[
                    'simulation_run_id'
                ].nunique()
            ),
            'targetPositiveRate': (
                _positive_rate(
                    frame['hand_won']
                )
            ),
        },
        'matchups': matchup_summaries,
        'benchmark': benchmark,
    }

    dataset_path = (
        destination
        / 'decision_states_ml.csv'
    )

    report_path = (
        destination
        / 'benchmark-experiment.json'
    )

    frame.to_csv(
        dataset_path,
        index=False,
    )

    report_path.write_text(
        json.dumps(
            report,
            indent=2,
            sort_keys=True,
        ),
        encoding='utf-8',
    )

    return {
        'dataset': dataset_path,
        'report': report_path,
    }


def _positive_rate(target):
    if target.empty:
        return 0.0

    return round(
        float(
            target
            .astype('boolean')
            .mean()
        ),
        6,
    )


def main():
    parser = argparse.ArgumentParser()

    parser.add_argument(
        '--games-per-matchup',
        type=int,
        default=DEFAULT_GAMES_PER_MATCHUP,
    )

    parser.add_argument(
        '--seed',
        type=int,
        default=DEFAULT_EXPERIMENT_SEED,
    )

    parser.add_argument(
        '--random-states',
        type=int,
        nargs='+',
        default=list(
            DEFAULT_BENCHMARK_RANDOM_STATES
        ),
    )

    parser.add_argument(
        '--test-size',
        type=float,
        default=DEFAULT_TEST_SIZE,
    )

    parser.add_argument(
        '--include-profile',
        action='store_true',
    )

    parser.add_argument(
        '--output-dir',
        default='ml-artifacts/benchmark-experiment',
    )

    arguments = parser.parse_args()

    paths = write_benchmark_experiment(
        arguments.output_dir,
        games_per_matchup=(
            arguments.games_per_matchup
        ),
        seed=arguments.seed,
        random_states=tuple(
            arguments.random_states
        ),
        test_size=arguments.test_size,
        include_profile=(
            arguments.include_profile
        ),
    )

    print(
        f'Dataset: {paths["dataset"]}'
    )
    print(
        f'Report: {paths["report"]}'
    )


if __name__ == '__main__':
    main()
