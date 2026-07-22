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


def identify_matchup_pairs(
    frame,
):
    run_mapping = {}

    grouped = frame.groupby(
        'simulation_run_id',
        sort=True,
    )

    for run_id, run_frame in grouped:
        profiles = tuple(
            sorted(
                run_frame[
                    'profile'
                ]
                .dropna()
                .astype(str)
                .unique()
            )
        )

        if len(profiles) != 2:
            raise ValueError(
                'Each simulation run must contain exactly two profiles'
            )

        matchup_key = (
            f'{profiles[0]}-vs-{profiles[1]}'
        )

        run_mapping[
            str(run_id)
        ] = {
            'matchupKey': (
                matchup_key
            ),
            'profiles': list(
                profiles
            ),
        }

    return run_mapping


def run_leave_one_matchup_pair_out_validation(
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

    run_mapping = (
        identify_matchup_pairs(
            dataset
        )
    )

    matchup_keys = sorted(
        {
            value[
                'matchupKey'
            ]
            for value
            in run_mapping.values()
        }
    )

    if len(matchup_keys) < 2:
        raise ValueError(
            'Matchup generalization requires at least two matchup pairs'
        )

    runs = []

    for held_out_matchup in matchup_keys:
        held_out_run_ids = sorted(
            [
                run_id
                for run_id, metadata
                in run_mapping.items()
                if (
                    metadata[
                        'matchupKey'
                    ]
                    == held_out_matchup
                )
            ]
        )

        test_mask = (
            dataset[
                'simulation_run_id'
            ]
            .astype(str)
            .isin(
                held_out_run_ids
            )
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
                'Matchup holdout produced an empty dataset'
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
                    n_estimators=(
                        n_estimators
                    ),
                    max_depth=(
                        max_depth
                    ),
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

        profiles = next(
            metadata[
                'profiles'
            ]
            for metadata
            in run_mapping.values()
            if (
                metadata[
                    'matchupKey'
                ]
                == held_out_matchup
            )
        )

        runs.append(
            {
                'heldOutMatchup': (
                    held_out_matchup
                ),
                'heldOutProfiles': (
                    profiles
                ),
                'heldOutSimulationRunIds': (
                    held_out_run_ids
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
            'validationStrategy': (
                'leave-one-matchup-pair-out'
            ),
            'firstDecisionOnly': (
                first_decision_only
            ),
            'modelRandomState': (
                model_random_state
            ),
            'handStrengthIncluded': False,
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
            'simulationRuns': int(
                dataset[
                    'simulation_run_id'
                ].nunique()
            ),
            'matchupPairs': len(
                matchup_keys
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


def write_matchup_generalization_report(
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
        run_leave_one_matchup_pair_out_validation(
            frame,
            first_decision_only=(
                first_decision_only
            ),
            model_random_state=(
                model_random_state
            ),
            n_estimators=(
                n_estimators
            ),
            max_depth=(
                max_depth
            ),
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
        'heldOutMatchup': (
            worst[
                'heldOutMatchup'
            ]
        ),
        'heldOutProfiles': (
            worst[
                'heldOutProfiles'
            ]
        ),
        'heldOutSimulationRunIds': (
            worst[
                'heldOutSimulationRunIds'
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
