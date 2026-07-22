import json
from pathlib import Path
from statistics import mean, pstdev

import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    balanced_accuracy_score,
    brier_score_loss,
    log_loss,
    roc_auc_score,
)
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import (
    OneHotEncoder,
    StandardScaler,
)

from app.strategy.card_rules import (
    MANILHA_SUIT_STRENGTH,
    RANKS,
    manilha_rank_from_vira,
    split_card,
)
from data.ml_baseline import (
    DEFAULT_RANDOM_STATE,
    DEFAULT_TEST_SIZE,
    grouped_train_test_split,
)
from data.ml_benchmark import (
    DEFAULT_BENCHMARK_RANDOM_STATES,
)
from data.ml_dataset import (
    BOOLEAN_FEATURES,
    CATEGORICAL_FEATURES,
    NUMERIC_FEATURES,
    TRAINING_FEATURES,
    feature_frame,
    split_groups,
    target_series,
    validate_ml_ready_dataset,
)
from data.ml_logistic import _prepare_features
from data.ml_stage_evaluation import (
    first_decision_per_player_hand,
)
from data.pipeline import DatasetValidationError


RAW_CARD_FEATURES = (
    'raw_card_count',
    'raw_manilha_count',
    'raw_strongest_card_power',
    'raw_second_card_power',
    'raw_weakest_card_power',
    'raw_average_card_power',
    'raw_high_card_count',
    'raw_distinct_rank_count',
)

CONTEXT_WITHOUT_HAND_STRENGTH = tuple(
    feature
    for feature in TRAINING_FEATURES
    if feature != 'hand_strength'
)

FEATURE_SETS = {
    'fullCurrentModel': TRAINING_FEATURES,
    'handStrengthOnly': (
        'hand_strength',
    ),
    'rawCardsOnly': RAW_CARD_FEATURES,
    'rawCardsPlusContext': (
        *RAW_CARD_FEATURES,
        *CONTEXT_WITHOUT_HAND_STRENGTH,
    ),
    'contextWithoutHandStrength': (
        CONTEXT_WITHOUT_HAND_STRENGTH
    ),
}

METRIC_NAMES = (
    'accuracy',
    'balancedAccuracy',
    'rocAuc',
    'brierScore',
    'logLoss',
)


def extract_raw_card_features(
    cards,
    vira_rank,
):
    manilha_rank = (
        manilha_rank_from_vira(
            vira_rank
        )
    )

    powers = []
    ranks = []
    manilha_count = 0

    for card in cards:
        rank, suit = split_card(
            card
        )

        ranks.append(rank)

        if rank == manilha_rank:
            manilha_count += 1

            power = (
                len(RANKS)
                + MANILHA_SUIT_STRENGTH[
                    suit
                ]
            )
        else:
            power = RANKS.index(
                rank
            )

        powers.append(
            float(power)
        )

    ordered = sorted(
        powers,
        reverse=True,
    )

    return {
        'raw_card_count': len(cards),
        'raw_manilha_count': (
            manilha_count
        ),
        'raw_strongest_card_power': (
            _ordered_value(
                ordered,
                0,
            )
        ),
        'raw_second_card_power': (
            _ordered_value(
                ordered,
                1,
            )
        ),
        'raw_weakest_card_power': (
            ordered[-1]
            if ordered
            else -1.0
        ),
        'raw_average_card_power': (
            round(
                sum(powers)
                / len(powers),
                6,
            )
            if powers
            else 0.0
        ),
        'raw_high_card_count': sum(
            power >= RANKS.index('A')
            for power in powers
        ),
        'raw_distinct_rank_count': (
            len(
                set(ranks)
            )
        ),
    }


def derive_raw_card_features(
    frame,
):
    validate_ml_ready_dataset(
        frame
    )

    records = []

    for row in frame.itertuples(
        index=False
    ):
        cards = _parse_hand(
            row.player_hand_before
        )

        records.append(
            extract_raw_card_features(
                cards,
                str(row.vira_rank),
            )
        )

    return pd.DataFrame(
        records,
        index=frame.index,
        columns=RAW_CARD_FEATURES,
    )


def run_raw_card_feature_benchmark(
    frame,
    *,
    random_states=DEFAULT_BENCHMARK_RANDOM_STATES,
    test_size=DEFAULT_TEST_SIZE,
    first_decision_only=True,
):
    validate_ml_ready_dataset(
        frame
    )

    states = tuple(
        int(state)
        for state in random_states
    )

    if not states:
        raise ValueError(
            'Raw-card benchmark requires at least one random state'
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
            _prepare_combined_features(
                train
            )
        )

        x_test = (
            _prepare_combined_features(
                test
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

        models = {
            name: _evaluate_feature_set(
                x_train,
                x_test,
                y_train,
                y_test,
                columns,
                random_state=(
                    random_state
                ),
            )
            for name, columns
            in FEATURE_SETS.items()
        }

        runs.append(
            {
                'randomState': (
                    random_state
                ),
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
        name: _summarize_feature_set(
            runs,
            name,
        )
        for name in FEATURE_SETS
    }

    return {
        'configuration': {
            'randomStates': list(
                states
            ),
            'testSize': test_size,
            'firstDecisionOnly': (
                first_decision_only
            ),
            'featureSets': {
                name: list(columns)
                for name, columns
                in FEATURE_SETS.items()
            },
        },
        'dataset': {
            'sourceRows': len(frame),
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
        'changeVsFullCurrentModel': (
            _changes_vs_reference(
                summary,
                'fullCurrentModel',
            )
        ),
        'changeVsHandStrengthOnly': (
            _changes_vs_reference(
                summary,
                'handStrengthOnly',
            )
        ),
    }


def write_raw_card_feature_report(
    frame,
    output_path,
    *,
    random_states=DEFAULT_BENCHMARK_RANDOM_STATES,
    test_size=DEFAULT_TEST_SIZE,
    first_decision_only=True,
):
    report = (
        run_raw_card_feature_benchmark(
            frame,
            random_states=random_states,
            test_size=test_size,
            first_decision_only=(
                first_decision_only
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


def _prepare_combined_features(
    frame,
):
    context = _prepare_features(
        feature_frame(frame)
    )

    raw_cards = (
        derive_raw_card_features(
            frame
        )
    )

    return pd.concat(
        [
            context.reset_index(
                drop=True
            ),
            raw_cards.reset_index(
                drop=True
            ),
        ],
        axis=1,
    )


def _evaluate_feature_set(
    x_train,
    x_test,
    y_train,
    y_test,
    feature_columns,
    *,
    random_state=DEFAULT_RANDOM_STATE,
):
    if y_train.nunique() < 2:
        raise ValueError(
            'Raw-card benchmark requires both target classes'
        )

    columns = list(
        feature_columns
    )

    model = _build_pipeline(
        columns,
        random_state=(
            random_state
        ),
    )

    model.fit(
        x_train.loc[
            :,
            columns,
        ],
        y_train,
    )

    predictions = model.predict(
        x_test.loc[
            :,
            columns,
        ]
    )

    probabilities = (
        model.predict_proba(
            x_test.loc[
                :,
                columns,
            ]
        )[:, 1]
    )

    return {
        'features': columns,
        'featureCount': len(
            columns
        ),
        'metrics': _metrics(
            y_test,
            predictions,
            probabilities,
        ),
    }


def _build_pipeline(
    feature_columns,
    *,
    random_state,
):
    numeric_columns = [
        feature
        for feature in feature_columns
        if (
            feature in NUMERIC_FEATURES
            or feature
            in RAW_CARD_FEATURES
        )
    ]

    categorical_columns = [
        feature
        for feature in feature_columns
        if feature in (
            *BOOLEAN_FEATURES,
            *CATEGORICAL_FEATURES,
        )
    ]

    transformers = []

    if numeric_columns:
        transformers.append(
            (
                'numeric',
                StandardScaler(),
                numeric_columns,
            )
        )

    if categorical_columns:
        transformers.append(
            (
                'categorical',
                OneHotEncoder(
                    handle_unknown='ignore',
                ),
                categorical_columns,
            )
        )

    return Pipeline(
        steps=[
            (
                'preprocessor',
                ColumnTransformer(
                    transformers=(
                        transformers
                    )
                ),
            ),
            (
                'model',
                LogisticRegression(
                    max_iter=1000,
                    random_state=(
                        random_state
                    ),
                ),
            ),
        ]
    )


def _parse_hand(value):
    if isinstance(value, list):
        cards = value
    else:
        try:
            cards = json.loads(
                str(value)
            )
        except (
            TypeError,
            ValueError,
            json.JSONDecodeError,
        ) as error:
            raise DatasetValidationError(
                'Invalid player_hand_before JSON'
            ) from error

    if not isinstance(
        cards,
        list,
    ):
        raise DatasetValidationError(
            'player_hand_before must contain a card list'
        )

    if not all(
        isinstance(card, str)
        for card in cards
    ):
        raise DatasetValidationError(
            'player_hand_before contains an invalid card'
        )

    return cards


def _ordered_value(
    values,
    index,
):
    if index >= len(values):
        return -1.0

    return values[index]


def _metrics(
    target,
    predictions,
    probabilities,
):
    roc_auc = None

    if target.nunique() > 1:
        roc_auc = _round(
            roc_auc_score(
                target,
                probabilities,
            )
        )

    return {
        'accuracy': _round(
            accuracy_score(
                target,
                predictions,
            )
        ),
        'balancedAccuracy': _round(
            balanced_accuracy_score(
                target,
                predictions,
            )
        ),
        'rocAuc': roc_auc,
        'brierScore': _round(
            brier_score_loss(
                target,
                probabilities,
            )
        ),
        'logLoss': _round(
            log_loss(
                target,
                probabilities,
                labels=[
                    0,
                    1,
                ],
            )
        ),
    }


def _summarize_feature_set(
    runs,
    feature_set_name,
):
    return {
        'metrics': {
            metric: _summarize_values(
                [
                    run[
                        'models'
                    ][
                        feature_set_name
                    ][
                        'metrics'
                    ][
                        metric
                    ]
                    for run in runs
                ]
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
        'count': len(valid),
        'mean': _round(
            mean(valid)
        ),
        'standardDeviation': _round(
            pstdev(valid)
        ),
        'minimum': _round(
            min(valid)
        ),
        'maximum': _round(
            max(valid)
        ),
    }


def _changes_vs_reference(
    summary,
    reference_name,
):
    reference_metrics = (
        summary[
            reference_name
        ][
            'metrics'
        ]
    )

    return {
        name: {
            metric: _difference(
                summary[
                    name
                ][
                    'metrics'
                ][
                    metric
                ][
                    'mean'
                ],
                reference_metrics[
                    metric
                ][
                    'mean'
                ],
            )
            for metric in METRIC_NAMES
        }
        for name in FEATURE_SETS
        if name != reference_name
    }


def _difference(
    candidate,
    reference,
):
    if (
        candidate is None
        or reference is None
    ):
        return None

    return _round(
        candidate
        - reference
    )


def _round(value):
    return round(
        float(value),
        6,
    )
