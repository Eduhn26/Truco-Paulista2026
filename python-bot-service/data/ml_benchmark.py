import json
from pathlib import Path
from statistics import mean, pstdev

from data.ml_baseline import (
    DEFAULT_TEST_SIZE,
    run_dummy_baseline,
)
from data.ml_dataset import build_ml_ready_dataset_dir
from data.ml_logistic import run_logistic_regression
from data.ml_tree import (
    DEFAULT_MAX_DEPTH,
    DEFAULT_MIN_SAMPLES_LEAF,
    run_decision_tree,
)


DEFAULT_BENCHMARK_RANDOM_STATES = (
    42,
    43,
    44,
    45,
    46,
)

METRIC_NAMES = (
    'accuracy',
    'balancedAccuracy',
    'rocAuc',
    'brierScore',
    'logLoss',
)

MODEL_NAMES = (
    'dummy',
    'logisticRegression',
    'decisionTree',
)


def run_repeated_benchmarks(
    frame,
    *,
    random_states=DEFAULT_BENCHMARK_RANDOM_STATES,
    test_size=DEFAULT_TEST_SIZE,
    include_profile=False,
    max_depth=DEFAULT_MAX_DEPTH,
    min_samples_leaf=DEFAULT_MIN_SAMPLES_LEAF,
):
    states = tuple(
        int(state)
        for state in random_states
    )

    if not states:
        raise ValueError(
            'Repeated benchmark requires at least one random state'
        )

    runs = []

    for random_state in states:
        dummy = run_dummy_baseline(
            frame,
            test_size=test_size,
            random_state=random_state,
        )

        logistic = run_logistic_regression(
            frame,
            test_size=test_size,
            random_state=random_state,
            include_profile=include_profile,
        )

        tree = run_decision_tree(
            frame,
            test_size=test_size,
            random_state=random_state,
            include_profile=include_profile,
            max_depth=max_depth,
            min_samples_leaf=min_samples_leaf,
        )

        _validate_same_split(
            dummy,
            logistic,
            tree,
        )

        runs.append(
            {
                'randomState': random_state,
                'models': {
                    'dummy': dummy,
                    'logisticRegression': logistic,
                    'decisionTree': tree,
                },
            }
        )

    summary = {
        model_name: _summarize_model(
            runs,
            model_name,
        )
        for model_name in MODEL_NAMES
    }

    return {
        'configuration': {
            'randomStates': list(states),
            'testSize': test_size,
            'includeProfile': include_profile,
            'treeParameters': {
                'maxDepth': max_depth,
                'minSamplesLeaf': min_samples_leaf,
            },
        },
        'dataset': {
            'rows': len(frame),
            'matches': int(
                frame['match_id'].nunique()
            ),
        },
        'runs': runs,
        'summary': summary,
        'bestByBalancedAccuracy': _best_model(
            summary,
            'balancedAccuracy',
            higher_is_better=True,
        ),
        'bestByBrierScore': _best_model(
            summary,
            'brierScore',
            higher_is_better=False,
        ),
    }


def run_repeated_benchmarks_dir(
    dataset_dir,
    **kwargs,
):
    frame = build_ml_ready_dataset_dir(
        dataset_dir
    )

    return run_repeated_benchmarks(
        frame,
        **kwargs,
    )


def write_benchmark_suite_report(
    dataset_dir,
    output_path=None,
    **kwargs,
):
    directory = Path(dataset_dir)

    report = run_repeated_benchmarks_dir(
        directory,
        **kwargs,
    )

    destination = (
        Path(output_path)
        if output_path is not None
        else directory / 'benchmark-suite.json'
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


def _validate_same_split(
    dummy,
    logistic,
    tree,
):
    reference = dummy['split']

    for candidate in (
        logistic['split'],
        tree['split'],
    ):
        if candidate != reference:
            raise ValueError(
                'Benchmark models must use the same grouped split'
            )


def _summarize_model(
    runs,
    model_name,
):
    return {
        'metrics': {
            metric: _summarize_values(
                [
                    run['models'][model_name]
                    ['metrics'][metric]
                    for run in runs
                ]
            )
            for metric in METRIC_NAMES
        },
    }


def _summarize_values(values):
    valid = [
        float(value)
        for value in values
        if value is not None
    ]

    if not valid:
        return {
            'count': 0,
            'mean': None,
            'standardDeviation': None,
            'minimum': None,
            'maximum': None,
        }

    return {
        'count': len(valid),
        'mean': _round(mean(valid)),
        'standardDeviation': _round(
            pstdev(valid)
        ),
        'minimum': _round(min(valid)),
        'maximum': _round(max(valid)),
    }


def _best_model(
    summary,
    metric,
    *,
    higher_is_better,
):
    candidates = []

    for model_name in MODEL_NAMES:
        value = (
            summary[model_name]
            ['metrics'][metric]
            ['mean']
        )

        if value is not None:
            candidates.append(
                (
                    model_name,
                    value,
                )
            )

    if not candidates:
        return None

    if higher_is_better:
        model_name, value = max(
            candidates,
            key=lambda item: item[1],
        )
    else:
        model_name, value = min(
            candidates,
            key=lambda item: item[1],
        )

    return {
        'model': model_name,
        'metric': metric,
        'mean': value,
    }


def _round(value):
    return round(
        float(value),
        6,
    )
