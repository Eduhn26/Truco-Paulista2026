import json
from pathlib import Path

import pandas as pd

from data.ml_benchmark import (
    DEFAULT_BENCHMARK_RANDOM_STATES,
    run_repeated_benchmarks,
)
from data.ml_baseline import DEFAULT_TEST_SIZE
from data.ml_dataset import (
    validate_ml_ready_dataset,
)


def first_decision_per_player_hand(
    frame: pd.DataFrame,
) -> pd.DataFrame:
    validate_ml_ready_dataset(frame)

    if frame.empty:
        return frame.copy()

    ordered = frame.sort_values(
        [
            'simulation_run_id',
            'match_id',
            'hand_id',
            'player_id',
            'decision_index',
        ],
        kind='stable',
    )

    first_decisions = (
        ordered
        .groupby(
            [
                'hand_id',
                'player_id',
            ],
            sort=False,
            as_index=False,
        )
        .head(1)
        .reset_index(drop=True)
    )

    validate_ml_ready_dataset(
        first_decisions
    )

    return first_decisions


def dataset_stage_summary(
    frame: pd.DataFrame,
) -> dict:
    validate_ml_ready_dataset(frame)

    first_decisions = (
        first_decision_per_player_hand(
            frame
        )
    )

    player_hands = (
        frame[
            [
                'hand_id',
                'player_id',
            ]
        ]
        .drop_duplicates()
    )

    return {
        'allDecisionRows': len(frame),
        'firstDecisionRows': len(
            first_decisions
        ),
        'playerHands': len(
            player_hands
        ),
        'matches': int(
            frame['match_id'].nunique()
        ),
        'hands': int(
            frame['hand_id'].nunique()
        ),
        'firstDecisionRetentionRate': (
            _safe_ratio(
                len(first_decisions),
                len(frame),
            )
        ),
        'averageDecisionsPerPlayerHand': (
            _safe_ratio(
                len(frame),
                len(player_hands),
            )
        ),
    }


def run_stage_evaluation(
    frame: pd.DataFrame,
    *,
    random_states=DEFAULT_BENCHMARK_RANDOM_STATES,
    test_size=DEFAULT_TEST_SIZE,
    include_profile=False,
):
    validate_ml_ready_dataset(
        frame
    )

    first_decisions = (
        first_decision_per_player_hand(
            frame
        )
    )

    all_decisions = run_repeated_benchmarks(
        frame,
        random_states=random_states,
        test_size=test_size,
        include_profile=include_profile,
    )

    opening_decisions = (
        run_repeated_benchmarks(
            first_decisions,
            random_states=random_states,
            test_size=test_size,
            include_profile=include_profile,
        )
    )

    return {
        'configuration': {
            'randomStates': list(
                random_states
            ),
            'testSize': test_size,
            'includeProfile': (
                include_profile
            ),
        },
        'dataset': dataset_stage_summary(
            frame
        ),
        'allDecisions': all_decisions,
        'firstDecisionPerPlayerHand': (
            opening_decisions
        ),
        'comparison': _compare_stages(
            all_decisions,
            opening_decisions,
        ),
    }


def write_stage_evaluation_report(
    frame: pd.DataFrame,
    output_path,
    *,
    random_states=DEFAULT_BENCHMARK_RANDOM_STATES,
    test_size=DEFAULT_TEST_SIZE,
    include_profile=False,
):
    report = run_stage_evaluation(
        frame,
        random_states=random_states,
        test_size=test_size,
        include_profile=include_profile,
    )

    destination = Path(
        output_path
    )

    destination.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    destination.write_text(
        json.dumps(
            report,
            indent=2,
            sort_keys=True,
        ),
        encoding='utf-8',
    )

    return destination


def _compare_stages(
    all_decisions,
    first_decisions,
):
    comparison = {}

    for model_name in (
        'dummy',
        'logisticRegression',
        'decisionTree',
    ):
        all_metrics = (
            all_decisions[
                'summary'
            ][model_name]['metrics']
        )

        first_metrics = (
            first_decisions[
                'summary'
            ][model_name]['metrics']
        )

        comparison[model_name] = {
            metric: _metric_difference(
                all_metrics[metric]['mean'],
                first_metrics[metric]['mean'],
            )
            for metric in (
                'accuracy',
                'balancedAccuracy',
                'rocAuc',
                'brierScore',
                'logLoss',
            )
        }

    return comparison


def _metric_difference(
    all_value,
    first_value,
):
    if (
        all_value is None
        or first_value is None
    ):
        return {
            'allDecisions': all_value,
            'firstDecision': first_value,
            'difference': None,
        }

    return {
        'allDecisions': all_value,
        'firstDecision': first_value,
        'difference': round(
            float(
                first_value
                - all_value
            ),
            6,
        ),
    }


def _safe_ratio(
    numerator,
    denominator,
):
    if denominator == 0:
        return 0.0

    return round(
        float(
            numerator
            / denominator
        ),
        6,
    )
