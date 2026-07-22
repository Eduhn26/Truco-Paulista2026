import json
from pathlib import Path
from statistics import mean, pstdev

from sklearn.ensemble import RandomForestClassifier
from sklearn.pipeline import Pipeline

from data.ml_baseline import (
    DEFAULT_RANDOM_STATE,
    DEFAULT_TEST_SIZE,
    grouped_train_test_split,
)
from data.ml_benchmark import (
    DEFAULT_BENCHMARK_RANDOM_STATES,
)
from data.ml_dataset import (
    split_groups,
    target_series,
    validate_ml_ready_dataset,
)
from data.ml_primary import (
    build_primary_feature_frame,
)
from data.ml_random_forest import (
    METRIC_NAMES,
    _build_preprocessor,
    _evaluate_model,
    _prepare_train_test_features,
)
from data.ml_stage_evaluation import (
    first_decision_per_player_hand,
)


DEFAULT_RF_TUNING_CONFIGS = (
    {
        'name': 'baseline',
        'n_estimators': 250,
        'max_depth': 12,
        'min_samples_leaf': 10,
        'max_features': 'sqrt',
    },
    {
        'name': 'shallower',
        'n_estimators': 300,
        'max_depth': 8,
        'min_samples_leaf': 10,
        'max_features': 'sqrt',
    },
    {
        'name': 'deeper',
        'n_estimators': 300,
        'max_depth': 16,
        'min_samples_leaf': 10,
        'max_features': 'sqrt',
    },
    {
        'name': 'lessRegularized',
        'n_estimators': 300,
        'max_depth': 16,
        'min_samples_leaf': 5,
        'max_features': 'sqrt',
    },
    {
        'name': 'moreRegularized',
        'n_estimators': 300,
        'max_depth': 12,
        'min_samples_leaf': 20,
        'max_features': 'sqrt',
    },
    {
        'name': 'widerFeatureSampling',
        'n_estimators': 300,
        'max_depth': 12,
        'min_samples_leaf': 10,
        'max_features': 0.75,
    },
)


def run_random_forest_tuning(
    frame,
    *,
    configs=DEFAULT_RF_TUNING_CONFIGS,
    random_states=DEFAULT_BENCHMARK_RANDOM_STATES,
    test_size=DEFAULT_TEST_SIZE,
    first_decision_only=True,
):
    validate_ml_ready_dataset(
        frame
    )

    prepared_configs = tuple(
        _validate_config(config)
        for config in configs
    )

    if not prepared_configs:
        raise ValueError(
            'Random Forest tuning requires at least one configuration'
        )

    states = tuple(
        int(state)
        for state in random_states
    )

    if not states:
        raise ValueError(
            'Random Forest tuning requires at least one random state'
        )

    dataset = (
        first_decision_per_player_hand(
            frame
        )
        if first_decision_only
        else frame.copy()
    )

    runs = []

    for random_state in states:
        train, test = (
            grouped_train_test_split(
                dataset,
                test_size=test_size,
                random_state=random_state,
            )
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

        models = {}

        for config in prepared_configs:
            model = (
                _build_random_forest_pipeline(
                    config,
                    random_state=random_state,
                )
            )

            models[
                config['name']
            ] = _evaluate_model(
                model,
                x_train,
                x_test,
                y_train,
                y_test,
            )

        runs.append(
            {
                'randomState': random_state,
                'split': {
                    'trainRows': len(
                        train
                    ),
                    'testRows': len(
                        test
                    ),
                    'trainMatches': int(
                        split_groups(
                            train
                        ).nunique()
                    ),
                    'testMatches': int(
                        split_groups(
                            test
                        ).nunique()
                    ),
                },
                'models': models,
            }
        )

    summary = {
        config['name']: (
            _summarize_configuration(
                runs,
                config['name'],
            )
        )
        for config in prepared_configs
    }

    best_balanced_accuracy = (
        _best_configuration(
            summary,
            'balancedAccuracy',
            higher_is_better=True,
        )
    )

    best_brier_score = (
        _best_configuration(
            summary,
            'brierScore',
            higher_is_better=False,
        )
    )

    return {
        'configuration': {
            'randomStates': list(
                states
            ),
            'testSize': test_size,
            'firstDecisionOnly': (
                first_decision_only
            ),
            'handStrengthIncluded': False,
            'candidateConfigurations': list(
                prepared_configs
            ),
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
        },
        'runs': runs,
        'summary': summary,
        'bestByBalancedAccuracy': (
            best_balanced_accuracy
        ),
        'bestByBrierScore': (
            best_brier_score
        ),
    }


def build_feature_importance_report(
    frame,
    config,
    *,
    random_state=DEFAULT_RANDOM_STATE,
    test_size=DEFAULT_TEST_SIZE,
    first_decision_only=True,
    top_n=20,
):
    validate_ml_ready_dataset(
        frame
    )

    prepared_config = (
        _validate_config(
            config
        )
    )

    dataset = (
        first_decision_per_player_hand(
            frame
        )
        if first_decision_only
        else frame.copy()
    )

    train, test = (
        grouped_train_test_split(
            dataset,
            test_size=test_size,
            random_state=random_state,
        )
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

    model = (
        _build_random_forest_pipeline(
            prepared_config,
            random_state=random_state,
        )
    )

    model.fit(
        x_train,
        y_train,
    )

    preprocessor = (
        model.named_steps[
            'preprocessor'
        ]
    )

    classifier = (
        model.named_steps[
            'model'
        ]
    )

    feature_names = (
        preprocessor
        .get_feature_names_out()
    )

    importances = (
        classifier
        .feature_importances_
    )

    features = [
        {
            'feature': (
                _clean_feature_name(
                    feature_name
                )
            ),
            'importance': round(
                float(importance),
                8,
            ),
        }
        for feature_name, importance
        in zip(
            feature_names,
            importances,
            strict=True,
        )
    ]

    ranked = sorted(
        features,
        key=lambda item: (
            item[
                'importance'
            ]
        ),
        reverse=True,
    )

    return {
        'model': (
            'RandomForestClassifier'
        ),
        'configuration': (
            prepared_config
        ),
        'randomState': (
            random_state
        ),
        'firstDecisionOnly': (
            first_decision_only
        ),
        'trainingRows': len(
            train
        ),
        'testRows': len(
            test
        ),
        'transformedFeatureCount': (
            len(features)
        ),
        'importanceSum': round(
            sum(
                item[
                    'importance'
                ]
                for item in features
            ),
            8,
        ),
        'topFeatures': (
            ranked[
                :top_n
            ]
        ),
        'allFeatures': (
            ranked
        ),
    }


def write_random_forest_tuning_report(
    frame,
    output_path,
    *,
    configs=DEFAULT_RF_TUNING_CONFIGS,
    random_states=DEFAULT_BENCHMARK_RANDOM_STATES,
    test_size=DEFAULT_TEST_SIZE,
    first_decision_only=True,
    importance_random_state=DEFAULT_RANDOM_STATE,
    top_n=20,
):
    tuning = (
        run_random_forest_tuning(
            frame,
            configs=configs,
            random_states=random_states,
            test_size=test_size,
            first_decision_only=(
                first_decision_only
            ),
        )
    )

    best_name = (
        tuning[
            'bestByBalancedAccuracy'
        ][
            'configuration'
        ]
    )

    best_config = next(
        config
        for config in (
            tuning[
                'configuration'
            ][
                'candidateConfigurations'
            ]
        )
        if config[
            'name'
        ] == best_name
    )

    importance = (
        build_feature_importance_report(
            frame,
            best_config,
            random_state=(
                importance_random_state
            ),
            test_size=test_size,
            first_decision_only=(
                first_decision_only
            ),
            top_n=top_n,
        )
    )

    report = {
        'tuning': tuning,
        'featureImportance': (
            importance
        ),
    }

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


def _build_random_forest_pipeline(
    config,
    *,
    random_state,
):
    return Pipeline(
        steps=[
            (
                'preprocessor',
                _build_preprocessor(),
            ),
            (
                'model',
                RandomForestClassifier(
                    n_estimators=(
                        config[
                            'n_estimators'
                        ]
                    ),
                    max_depth=(
                        config[
                            'max_depth'
                        ]
                    ),
                    min_samples_leaf=(
                        config[
                            'min_samples_leaf'
                        ]
                    ),
                    max_features=(
                        config[
                            'max_features'
                        ]
                    ),
                    n_jobs=-1,
                    random_state=(
                        random_state
                    ),
                ),
            ),
        ]
    )


def _validate_config(
    config,
):
    required = (
        'name',
        'n_estimators',
        'max_depth',
        'min_samples_leaf',
        'max_features',
    )

    missing = [
        field
        for field in required
        if field not in config
    ]

    if missing:
        raise ValueError(
            'Random Forest configuration missing fields: '
            + ', '.join(
                missing
            )
        )

    if int(
        config[
            'n_estimators'
        ]
    ) < 1:
        raise ValueError(
            'n_estimators must be positive'
        )

    if int(
        config[
            'min_samples_leaf'
        ]
    ) < 1:
        raise ValueError(
            'min_samples_leaf must be positive'
        )

    return {
        'name': str(
            config[
                'name'
            ]
        ),
        'n_estimators': int(
            config[
                'n_estimators'
            ]
        ),
        'max_depth': (
            None
            if config[
                'max_depth'
            ] is None
            else int(
                config[
                    'max_depth'
                ]
            )
        ),
        'min_samples_leaf': int(
            config[
                'min_samples_leaf'
            ]
        ),
        'max_features': (
            config[
                'max_features'
            ]
        ),
    }


def _summarize_configuration(
    runs,
    configuration_name,
):
    return {
        'metrics': {
            metric: (
                _summarize_values(
                    [
                        run[
                            'models'
                        ][
                            configuration_name
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


def _best_configuration(
    summary,
    metric,
    *,
    higher_is_better,
):
    candidates = {
        name: (
            result[
                'metrics'
            ][
                metric
            ][
                'mean'
            ]
        )
        for name, result
        in summary.items()
    }

    selector = (
        max
        if higher_is_better
        else min
    )

    configuration = selector(
        candidates,
        key=candidates.get,
    )

    return {
        'configuration': (
            configuration
        ),
        'metric': metric,
        'value': (
            candidates[
                configuration
            ]
        ),
    }


def _clean_feature_name(
    name,
):
    prefixes = (
        'numeric__',
        'categorical__',
    )

    cleaned = str(
        name
    )

    for prefix in prefixes:
        if cleaned.startswith(
            prefix
        ):
            return cleaned[
                len(
                    prefix
                ):
            ]

    return cleaned


def _round(
    value,
):
    return round(
        float(
            value
        ),
        6,
    )
