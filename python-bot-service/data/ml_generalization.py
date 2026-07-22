import json
from pathlib import Path
from statistics import mean, pstdev

from data.ml_baseline import (
    DEFAULT_RANDOM_STATE,
)
from data.ml_dataset import (
    target_series,
    validate_ml_ready_dataset,
)
from data.ml_primary import (
    _build_logistic_pipeline,
    build_primary_feature_frame,
)
from data.ml_random_forest import (
    DEFAULT_MAX_DEPTH,
    DEFAULT_MIN_SAMPLES_LEAF,
    DEFAULT_N_ESTIMATORS,
    METRIC_NAMES,
    _build_random_forest_pipeline,
    _evaluate_model,
    _prepare_train_test_features,
)
from data.ml_stage_evaluation import (
    first_decision_per_player_hand,
)


def run_leave_one_run_out_validation(
    frame,
    *,
    first_decision_only=True,
    model_random_state=DEFAULT_RANDOM_STATE,
    n_estimators=DEFAULT_N_ESTIMATORS,
    max_depth=DEFAULT_MAX_DEPTH,
    min_samples_leaf=DEFAULT_MIN_SAMPLES_LEAF,
):
    validate_ml_ready_dataset(
        frame
    )

    dataset = (
        first_decision_per_player_hand(
            frame
        )
        if first_decision_only
        else frame.copy()
    )

    simulation_runs = sorted(
        dataset[
            'simulation_run_id'
        ]
        .astype(str)
        .unique()
    )

    if len(simulation_runs) < 2:
        raise ValueError(
            'Generalization validation requires at least two simulation runs'
        )

    runs = []

    for held_out_run in simulation_runs:
        test_mask = (
            dataset[
                'simulation_run_id'
            ]
            .astype(str)
            == held_out_run
        )

        train = (
            dataset.loc[
                ~test_mask
            ]
            .copy()
        )

        test = (
            dataset.loc[
                test_mask
            ]
            .copy()
        )

        if train.empty or test.empty:
            raise ValueError(
                'Generalization split produced an empty dataset'
            )

        x_train = (
            build_primary_feature_frame(
                train
            )
        )

        x_test = (
            build_primary_feature_frame(
                test
            )
        )

        x_train, x_test = (
            _prepare_train_test_features(
                x_train,
                x_test,
            )
        )

        y_train = (
            target_series(train)
            .astype('int64')
        )

        y_test = (
            target_series(test)
            .astype('int64')
        )

        logistic = (
            _evaluate_model(
                _build_logistic_pipeline(
                    model_random_state
                ),
                x_train,
                x_test,
                y_train,
                y_test,
            )
        )

        random_forest = (
            _evaluate_model(
                _build_random_forest_pipeline(
                    model_random_state,
                    n_estimators=n_estimators,
                    max_depth=max_depth,
                    min_samples_leaf=(
                        min_samples_leaf
                    ),
                ),
                x_train,
                x_test,
                y_train,
                y_test,
            )
        )

        runs.append(
            {
                'heldOutSimulationRunId': (
                    held_out_run
                ),
                'heldOutProfilesByPlayer': (
                    _profiles_by_player(
                        test
                    )
                ),
                'split': {
                    'trainRows': len(
                        train
                    ),
                    'testRows': len(
                        test
                    ),
                    'trainMatches': int(
                        train[
                            'match_id'
                        ].nunique()
                    ),
                    'testMatches': int(
                        test[
                            'match_id'
                        ].nunique()
                    ),
                    'trainSimulationRuns': int(
                        train[
                            'simulation_run_id'
                        ].nunique()
                    ),
                    'testSimulationRuns': int(
                        test[
                            'simulation_run_id'
                        ].nunique()
                    ),
                },
                'models': {
                    'logisticRegression': (
                        logistic
                    ),
                    'randomForest': (
                        random_forest
                    ),
                },
            }
        )

    summary = {
        model_name: (
            _summarize_model(
                runs,
                model_name,
            )
        )
        for model_name in (
            'logisticRegression',
            'randomForest',
        )
    }

    return {
        'configuration': {
            'firstDecisionOnly': (
                first_decision_only
            ),
            'modelRandomState': (
                model_random_state
            ),
            'handStrengthIncluded': False,
            'validationStrategy': (
                'leave-one-simulation-run-out'
            ),
            'randomForest': {
                'nEstimators': (
                    n_estimators
                ),
                'maxDepth': (
                    max_depth
                ),
                'minSamplesLeaf': (
                    min_samples_leaf
                ),
                'maxFeatures': 'sqrt',
            },
        },
        'dataset': {
            'sourceRows': len(
                frame
            ),
            'evaluationRows': len(
                dataset
            ),
            'matches': int(
                dataset[
                    'match_id'
                ].nunique()
            ),
            'hands': int(
                dataset[
                    'hand_id'
                ].nunique()
            ),
            'simulationRuns': len(
                simulation_runs
            ),
        },
        'runs': runs,
        'summary': summary,
        'worstByBalancedAccuracy': {
            model_name: (
                _worst_holdout(
                    runs,
                    model_name,
                )
            )
            for model_name in (
                'logisticRegression',
                'randomForest',
            )
        },
    }


def write_generalization_report(
    frame,
    output_path,
    *,
    first_decision_only=True,
    model_random_state=DEFAULT_RANDOM_STATE,
    n_estimators=DEFAULT_N_ESTIMATORS,
    max_depth=DEFAULT_MAX_DEPTH,
    min_samples_leaf=DEFAULT_MIN_SAMPLES_LEAF,
):
    report = (
        run_leave_one_run_out_validation(
            frame,
            first_decision_only=(
                first_decision_only
            ),
            model_random_state=(
                model_random_state
            ),
            n_estimators=n_estimators,
            max_depth=max_depth,
            min_samples_leaf=(
                min_samples_leaf
            ),
        )
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


def _profiles_by_player(
    frame,
):
    result = {}

    for player_id in sorted(
        frame[
            'player_id'
        ]
        .astype(str)
        .unique()
    ):
        profiles = sorted(
            frame.loc[
                (
                    frame[
                        'player_id'
                    ]
                    .astype(str)
                    == player_id
                ),
                'profile',
            ]
            .dropna()
            .astype(str)
            .unique()
        )

        result[
            player_id
        ] = profiles

    return result


def _summarize_model(
    runs,
    model_name,
):
    return {
        'metrics': {
            metric: (
                _summarize_values(
                    [
                        run[
                            'models'
                        ][
                            model_name
                        ][
                            'metrics'
                        ][
                            metric
                        ]
                        for run in runs
                    ]
                )
            )
            for metric in METRIC_NAMES
        },
    }


def _summarize_values(
    values,
):
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
        'count': len(
            valid
        ),
        'mean': _round(
            mean(
                valid
            )
        ),
        'standardDeviation': (
            _round(
                pstdev(
                    valid
                )
            )
        ),
        'minimum': _round(
            min(
                valid
            )
        ),
        'maximum': _round(
            max(
                valid
            )
        ),
    }


def _worst_holdout(
    runs,
    model_name,
):
    worst = min(
        runs,
        key=lambda run: (
            run[
                'models'
            ][
                model_name
            ][
                'metrics'
            ][
                'balancedAccuracy'
            ]
        ),
    )

    return {
        'heldOutSimulationRunId': (
            worst[
                'heldOutSimulationRunId'
            ]
        ),
        'heldOutProfilesByPlayer': (
            worst[
                'heldOutProfilesByPlayer'
            ]
        ),
        'balancedAccuracy': (
            worst[
                'models'
            ][
                model_name
            ][
                'metrics'
            ][
                'balancedAccuracy'
            ]
        ),
        'rocAuc': (
            worst[
                'models'
            ][
                model_name
            ][
                'metrics'
            ][
                'rocAuc'
            ]
        ),
    }


def _round(
    value,
):
    return round(
        float(
            value
        ),
        6,
    )
