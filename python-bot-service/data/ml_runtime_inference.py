import json
from collections.abc import Mapping
from pathlib import Path

import pandas as pd

from data.ml_model_artifact import (
    _prepare_features,
    load_candidate_model,
)
from data.ml_card_features import (
    derive_raw_card_features,
)
from data.ml_dataset import (
    ML_READY_COLUMNS,
)
from data.ml_primary import (
    PRIMARY_TRAINING_FEATURES,
)


REQUIRED_RUNTIME_FIELDS = (
    'player_hand',
    'vira_rank',
    'score_difference',
    'own_points_to_win',
    'opponent_points_to_win',
    'current_value',
    'pending_value',
    'special_decision_pending',
    'bet_state',
    'special_state',
)


class RuntimeInferenceError(
    ValueError
):
    pass


class CandidateRuntimePredictor:
    def __init__(
        self,
        bundle,
    ):
        self._bundle = bundle

    @classmethod
    def from_model_path(
        cls,
        model_path,
    ):
        return cls(
            load_candidate_model(
                model_path
            )
        )

    @property
    def artifact_version(
        self,
    ):
        return self._bundle[
            'artifactVersion'
        ]

    @property
    def model_type(
        self,
    ):
        return self._bundle[
            'modelType'
        ]

    @property
    def prediction_threshold(
        self,
    ):
        return float(
            self._bundle[
                'predictionThreshold'
            ]
        )

    def predict(
        self,
        state,
    ):
        return predict_runtime_state(
            self._bundle,
            state,
        )


def build_runtime_input_frame(
    state,
):
    if not isinstance(
        state,
        Mapping,
    ):
        raise RuntimeInferenceError(
            'Runtime inference state must be a mapping'
        )

    missing = [
        field
        for field in REQUIRED_RUNTIME_FIELDS
        if field not in state
    ]

    if missing:
        raise RuntimeInferenceError(
            'Runtime inference state missing fields: '
            + ', '.join(
                missing
            )
        )

    player_hand = (
        _normalize_player_hand(
            state[
                'player_hand'
            ]
        )
    )

    if len(
        player_hand
    ) != 3:
        raise RuntimeInferenceError(
            'Candidate model expects exactly three cards '
            'for first-decision inference'
        )

    if not isinstance(
        state[
            'special_decision_pending'
        ],
        bool,
    ):
        raise RuntimeInferenceError(
            'special_decision_pending must be a boolean'
        )

    bet_state = (
        _required_string(
            state[
                'bet_state'
            ],
            'bet_state',
        )
    )

    special_state = (
        _required_string(
            state[
                'special_state'
            ],
            'special_state',
        )
    )

    vira_rank = (
        _required_string(
            state[
                'vira_rank'
            ],
            'vira_rank',
        )
    )

    row = {
        # Compatibility placeholder.
        # The independent model explicitly drops this feature.
        'hand_strength': 0.0,

        'score_difference': (
            _required_number(
                state[
                    'score_difference'
                ],
                'score_difference',
            )
        ),
        'own_points_to_win': (
            _required_number(
                state[
                    'own_points_to_win'
                ],
                'own_points_to_win',
            )
        ),
        'opponent_points_to_win': (
            _required_number(
                state[
                    'opponent_points_to_win'
                ],
                'opponent_points_to_win',
            )
        ),

        # The candidate was validated and trained only
        # on each player's first decision in the hand.
        'round_index': 0,
        'rounds_won_by_me': 0,
        'rounds_won_by_opponent': 0,
        'rounds_tied': 0,

        'current_value': (
            _required_number(
                state[
                    'current_value'
                ],
                'current_value',
            )
        ),
        'pending_value': (
            _optional_number(
                state[
                    'pending_value'
                ],
                'pending_value',
            )
        ),
        'hand_size': len(
            player_hand
        ),
        'special_decision_pending': (
            state[
                'special_decision_pending'
            ]
        ),
        'bet_state': (
            bet_state
        ),
        'special_state': (
            special_state
        ),
        'vira_rank': (
            vira_rank
        ),
        'player_hand_before': (
            json.dumps(
                player_hand,
                separators=(
                    ',',
                    ':',
                ),
            )
        ),
    }

    return pd.DataFrame(
        [
            row
        ]
    )


def predict_runtime_state(
    bundle,
    state,
):
    frame = (
        build_runtime_input_frame(
            state
        )
    )

    feature_frame = (
        _build_runtime_feature_frame(
            frame
        )
    )

    prepared_features, _ = (
        _prepare_features(
            feature_frame,
            fill_values=(
                bundle[
                    'numericFillValues'
                ]
            ),
        )
    )

    probability = float(
        bundle[
            'model'
        ]
        .predict_proba(
            prepared_features
        )[0, 1]
    )

    threshold = float(
        bundle[
            'predictionThreshold'
        ]
    )

    return {
        'winProbability': (
            probability
        ),
        'predictedHandWin': int(
            probability
            >= threshold
        ),
        'threshold': (
            threshold
        ),
        'artifactVersion': (
            bundle[
                'artifactVersion'
            ]
        ),
        'modelType': (
            bundle[
                'modelType'
            ]
        ),
    }


def _build_runtime_feature_frame(
    frame,
):
    ml_compatible_frame = (
        _build_ml_ready_compatibility_frame(
            frame
        )
    )

    raw_card_features = (
        derive_raw_card_features(
            ml_compatible_frame
        )
    )

    context_columns = [
        column
        for column in PRIMARY_TRAINING_FEATURES
        if column
        not in raw_card_features.columns
    ]

    context = (
        frame.loc[
            :,
            context_columns,
        ]
        .copy()
    )

    combined = pd.concat(
        [
            raw_card_features,
            context,
        ],
        axis=1,
    )

    return combined.loc[
        :,
        list(
            PRIMARY_TRAINING_FEATURES
        ),
    ]


def _build_ml_ready_compatibility_frame(
    frame,
):
    compatible = frame.copy()

    defaults = {
        'simulation_run_id': (
            'runtime-inference'
        ),
        'match_id': (
            'runtime-match'
        ),
        'hand_id': (
            'runtime-hand'
        ),
        'decision_id': (
            'runtime-decision'
        ),
        'player_id': (
            'runtime-player'
        ),
        'profile': (
            'runtime'
        ),
        'action': (
            'runtime'
        ),
        'strategy': (
            'runtime'
        ),
        'selected_card': None,
        'own_round_card': None,
        'opponent_round_card': None,
        'requested_by': None,
        'hand_won': False,
    }

    for column in ML_READY_COLUMNS:
        if column in compatible.columns:
            continue

        if column in defaults:
            compatible[
                column
            ] = defaults[
                column
            ]
            continue

        if column.endswith(
            '_id'
        ):
            compatible[
                column
            ] = (
                'runtime'
            )
            continue

        compatible[
            column
        ] = None

    return compatible.loc[
        :,
        list(
            ML_READY_COLUMNS
        ),
    ]


def runtime_state_from_ml_row(
    row,
):
    return {
        'player_hand': (
            row[
                'player_hand_before'
            ]
        ),
        'vira_rank': (
            row[
                'vira_rank'
            ]
        ),
        'score_difference': (
            row[
                'score_difference'
            ]
        ),
        'own_points_to_win': (
            row[
                'own_points_to_win'
            ]
        ),
        'opponent_points_to_win': (
            row[
                'opponent_points_to_win'
            ]
        ),
        'current_value': (
            row[
                'current_value'
            ]
        ),
        'pending_value': (
            row[
                'pending_value'
            ]
        ),
        'special_decision_pending': bool(
            row[
                'special_decision_pending'
            ]
        ),
        'bet_state': (
            row[
                'bet_state'
            ]
        ),
        'special_state': (
            row[
                'special_state'
            ]
        ),
    }


def _normalize_player_hand(
    value,
):
    if isinstance(
        value,
        str,
    ):
        try:
            parsed = json.loads(
                value
            )
        except json.JSONDecodeError as error:
            raise RuntimeInferenceError(
                'player_hand must contain valid JSON '
                'when provided as a string'
            ) from error
    else:
        parsed = value

    if not isinstance(
        parsed,
        (
            list,
            tuple,
        ),
    ):
        raise RuntimeInferenceError(
            'player_hand must be a list or tuple of cards'
        )

    return list(
        parsed
    )


def _required_string(
    value,
    field_name,
):
    if value is None:
        raise RuntimeInferenceError(
            f'{field_name} cannot be null'
        )

    normalized = str(
        value
    ).strip()

    if not normalized:
        raise RuntimeInferenceError(
            f'{field_name} cannot be empty'
        )

    return normalized


def _required_number(
    value,
    field_name,
):
    if value is None:
        raise RuntimeInferenceError(
            f'{field_name} cannot be null'
        )

    try:
        numeric = float(
            value
        )
    except (
        TypeError,
        ValueError,
    ) as error:
        raise RuntimeInferenceError(
            f'{field_name} must be numeric'
        ) from error

    if pd.isna(
        numeric
    ):
        raise RuntimeInferenceError(
            f'{field_name} cannot be NaN'
        )

    return numeric


def _optional_number(
    value,
    field_name,
):
    if (
        value is None
        or pd.isna(
            value
        )
    ):
        return None

    return _required_number(
        value,
        field_name,
    )
