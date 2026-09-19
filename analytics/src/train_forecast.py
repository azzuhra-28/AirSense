# ============================================================
# AirSense - Forecast Model Training
#
# Methodology:
# - direct forecasting t+60 minutes
# - five pollutant targets
# - chronological 70/15/15 split
# - persistence baseline
# - Ridge candidate models
# - XGBoost candidate models
# - model selection using validation MAE
# - final evaluation on untouched test set
#
# Supports:
# - local DataFrame / dummy-data training
# - Supabase production training
# ============================================================

import json
import os
from datetime import datetime, timezone

import joblib
import numpy as np
import pandas as pd
import xgboost as xgb

from sklearn.linear_model import Ridge
from sklearn.metrics import (
    mean_absolute_error,
    mean_squared_error,
)
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from .preprocess import (
    HORIZON_MINUTES,
    MIN_ROWS_FOR_TRAIN,
    TARGETS,
    build_features,
    load_to_df,
)

from .supabase_client import (
    TABLE_GAS,
    check_connection,
    fetch_rows,
    supabase_session,
)


# ============================================================
# Paths
# ============================================================

MODEL_DIR = os.path.join(
    os.path.dirname(
        os.path.dirname(
            os.path.abspath(__file__)
        )
    ),
    "models",
)


# ============================================================
# Candidate Configurations
# ============================================================

RIDGE_ALPHAS = [
    0.01,
    0.1,
    1.0,
    10.0,
    100.0,
]


XGB_CONFIGS = [
    {
        "name": "XGB1",
        "n_estimators": 200,
        "max_depth": 3,
        "learning_rate": 0.05,
    },
    {
        "name": "XGB2",
        "n_estimators": 300,
        "max_depth": 4,
        "learning_rate": 0.05,
    },
    {
        "name": "XGB3",
        "n_estimators": 300,
        "max_depth": 6,
        "learning_rate": 0.05,
    },
    {
        "name": "XGB4",
        "n_estimators": 500,
        "max_depth": 4,
        "learning_rate": 0.03,
    },
]


# ============================================================
# Metrics
# ============================================================

def evaluate(
    y_true,
    y_pred,
):
    """
    Calculate MAE and RMSE.

    MAPE is intentionally not used because pollutant values,
    especially NO2, may contain zeros.
    """

    mae = mean_absolute_error(
        y_true,
        y_pred,
    )

    rmse = np.sqrt(
        mean_squared_error(
            y_true,
            y_pred,
        )
    )

    return {
        "mae": float(mae),
        "rmse": float(rmse),
    }


# ============================================================
# Chronological Split
# ============================================================

def chronological_split(
    df,
):
    """
    Split data chronologically into:
    70% train
    15% validation
    15% test
    """

    n = len(df)

    train_end = int(
        n * 0.70
    )

    val_end = int(
        n * 0.85
    )

    train_df = (
        df.iloc[:train_end]
        .copy()
    )

    val_df = (
        df.iloc[
            train_end:val_end
        ]
        .copy()
    )

    test_df = (
        df.iloc[val_end:]
        .copy()
    )

    return (
        train_df,
        val_df,
        test_df,
    )


# ============================================================
# Persistence Baseline
# ============================================================

def persistence_prediction(
    df,
    target,
):
    """
    Persistence baseline:
    predicted concentration at t+60 =
    concentration observed at time t.
    """

    return (
        df[target]
        .to_numpy()
    )


# ============================================================
# Ridge
# ============================================================

def build_ridge(
    alpha,
):
    """
    Ridge regression with standardized features.
    """

    return Pipeline(
        [
            (
                "scaler",
                StandardScaler(),
            ),
            (
                "model",
                Ridge(
                    alpha=alpha
                ),
            ),
        ]
    )


def select_ridge(
    X_train,
    y_train,
    X_val,
    y_val,
):
    """
    Select Ridge alpha using validation MAE.
    """

    results = []

    best_model = None
    best_alpha = None
    best_mae = np.inf

    for alpha in RIDGE_ALPHAS:

        model = build_ridge(
            alpha
        )

        model.fit(
            X_train,
            y_train,
        )

        prediction = (
            model.predict(
                X_val
            )
        )

        metrics = evaluate(
            y_val,
            prediction,
        )

        results.append(
            {
                "alpha": alpha,
                **metrics,
            }
        )

        if metrics["mae"] < best_mae:

            best_mae = (
                metrics["mae"]
            )

            best_alpha = alpha

            best_model = model

    return (
        best_model,
        best_alpha,
        results,
    )


# ============================================================
# XGBoost
# ============================================================

def build_xgb(
    config,
):
    """
    Build an XGBoost regressor from a candidate configuration.
    """

    return xgb.XGBRegressor(
        objective="reg:squarederror",
        n_estimators=config[
            "n_estimators"
        ],
        max_depth=config[
            "max_depth"
        ],
        learning_rate=config[
            "learning_rate"
        ],
        subsample=0.8,
        colsample_bytree=0.8,
        random_state=42,
        n_jobs=-1,
    )


def select_xgb(
    X_train,
    y_train,
    X_val,
    y_val,
):
    """
    Select XGBoost configuration using validation MAE.
    """

    results = []

    best_model = None
    best_config = None
    best_mae = np.inf

    for config in XGB_CONFIGS:

        model = build_xgb(
            config
        )

        model.fit(
            X_train,
            y_train,
            verbose=False,
        )

        prediction = (
            model.predict(
                X_val
            )
        )

        metrics = evaluate(
            y_val,
            prediction,
        )

        results.append(
            {
                "name": config["name"],
                "n_estimators": config[
                    "n_estimators"
                ],
                "max_depth": config[
                    "max_depth"
                ],
                "learning_rate": config[
                    "learning_rate"
                ],
                **metrics,
            }
        )

        if metrics["mae"] < best_mae:

            best_mae = (
                metrics["mae"]
            )

            best_config = (
                config.copy()
            )

            best_model = model

    return (
        best_model,
        best_config,
        results,
    )


# ============================================================
# Core Training
# ============================================================

def train_from_dataframe(
    raw_df: pd.DataFrame,
    verbose: bool = True,
):
    """
    Train forecasting models from an in-memory DataFrame.

    This is the shared training implementation for:
    - local/dummy testing
    - production data retrieved from Supabase
    """

    # --------------------------------------------------------
    # Input
    # --------------------------------------------------------

    if raw_df.empty:
        raise RuntimeError(
            "Dataset training kosong."
        )

    rows = raw_df.to_dict(
        orient="records"
    )

    if len(rows) < MIN_ROWS_FOR_TRAIN:
        raise RuntimeError(
            f"Data belum cukup "
            f"({len(rows)} baris). "
            f"Minimal {MIN_ROWS_FOR_TRAIN} "
            "baris diperlukan."
        )

    # --------------------------------------------------------
    # Preprocessing
    # --------------------------------------------------------

    df = load_to_df(
        rows
    )

    df_features, feature_columns = (
        build_features(
            df,
            horizon_minutes=HORIZON_MINUTES,
            include_targets=True,
        )
    )

    if len(df_features) < MIN_ROWS_FOR_TRAIN:
        raise RuntimeError(
            "Data setelah feature engineering "
            f"hanya {len(df_features)} baris. "
            f"Minimal {MIN_ROWS_FOR_TRAIN} "
            "baris diperlukan."
        )

    # --------------------------------------------------------
    # Chronological split
    # --------------------------------------------------------

    (
        train_df,
        val_df,
        test_df,
    ) = chronological_split(
        df_features
    )

    os.makedirs(
        MODEL_DIR,
        exist_ok=True,
    )

    summary = {
        "trained_at": (
            datetime.now(
                timezone.utc
            ).isoformat()
        ),
        "forecast_horizon_minutes": (
            HORIZON_MINUTES
        ),
        "n_rows": len(
            df_features
        ),
        "split": {
            "train": len(
                train_df
            ),
            "validation": len(
                val_df
            ),
            "test": len(
                test_df
            ),
        },
        "features": feature_columns,
        "models": {},
    }

    # --------------------------------------------------------
    # One forecast model per pollutant
    # --------------------------------------------------------

    for target in TARGETS:

        target_column = (
            f"{target}"
            f"_target_t"
            f"{HORIZON_MINUTES}"
        )

        X_train = train_df[
            feature_columns
        ]

        y_train = train_df[
            target_column
        ]

        X_val = val_df[
            feature_columns
        ]

        y_val = val_df[
            target_column
        ]

        X_test = test_df[
            feature_columns
        ]

        y_test = test_df[
            target_column
        ]

        # ----------------------------------------------------
        # Persistence
        # ----------------------------------------------------

        persistence_val = (
            persistence_prediction(
                val_df,
                target,
            )
        )

        persistence_val_metrics = (
            evaluate(
                y_val,
                persistence_val,
            )
        )

        persistence_test = (
            persistence_prediction(
                test_df,
                target,
            )
        )

        persistence_test_metrics = (
            evaluate(
                y_test,
                persistence_test,
            )
        )

        # ----------------------------------------------------
        # Ridge
        # ----------------------------------------------------

        (
            _,
            best_ridge_alpha,
            ridge_validation_results,
        ) = select_ridge(
            X_train,
            y_train,
            X_val,
            y_val,
        )

        # ----------------------------------------------------
        # XGBoost
        # ----------------------------------------------------

        (
            _,
            best_xgb_config,
            xgb_validation_results,
        ) = select_xgb(
            X_train,
            y_train,
            X_val,
            y_val,
        )

        # ----------------------------------------------------
        # Select using VALIDATION MAE
        # ----------------------------------------------------

        best_ridge_validation = min(
            ridge_validation_results,
            key=lambda item: item[
                "mae"
            ],
        )

        best_xgb_validation = min(
            xgb_validation_results,
            key=lambda item: item[
                "mae"
            ],
        )

        validation_candidates = {
            "Persistence": (
                persistence_val_metrics[
                    "mae"
                ]
            ),
            "Ridge": (
                best_ridge_validation[
                    "mae"
                ]
            ),
            "XGBoost": (
                best_xgb_validation[
                    "mae"
                ]
            ),
        }

        selected_family = min(
            validation_candidates,
            key=validation_candidates.get,
        )

        # ----------------------------------------------------
        # Retrain selected model on train + validation
        # ----------------------------------------------------

        train_val_df = (
            df_features.iloc[
                :(
                    len(train_df)
                    + len(val_df)
                )
            ]
            .copy()
        )

        X_train_val = train_val_df[
            feature_columns
        ]

        y_train_val = train_val_df[
            target_column
        ]

        final_model = None

        if selected_family == "Ridge":

            final_model = build_ridge(
                best_ridge_alpha
            )

            final_model.fit(
                X_train_val,
                y_train_val,
            )

            test_prediction = (
                final_model.predict(
                    X_test
                )
            )

        elif selected_family == "XGBoost":

            final_model = build_xgb(
                best_xgb_config
            )

            final_model.fit(
                X_train_val,
                y_train_val,
                verbose=False,
            )

            test_prediction = (
                final_model.predict(
                    X_test
                )
            )

        else:

            # Persistence requires no fitted model.
            test_prediction = (
                persistence_test
            )

        # Concentrations cannot be negative.
        test_prediction = np.clip(
            np.asarray(
                test_prediction
            ),
            a_min=0,
            a_max=None,
        )

        final_test_metrics = (
            evaluate(
                y_test,
                test_prediction,
            )
        )

        # ----------------------------------------------------
        # Save fitted model
        # ----------------------------------------------------

        model_filename = None

        if final_model is not None:

            model_filename = (
                f"forecast_{target}.joblib"
            )

            model_path = os.path.join(
                MODEL_DIR,
                model_filename,
            )

            joblib.dump(
                {
                    "model": final_model,
                    "features": (
                        feature_columns
                    ),
                    "target": target,
                    "horizon_minutes": (
                        HORIZON_MINUTES
                    ),
                    "model_family": (
                        selected_family
                    ),
                },
                model_path,
            )

        # ----------------------------------------------------
        # Metadata
        # ----------------------------------------------------

        summary["models"][target] = {
            "selected_family": (
                selected_family
            ),
            "model_file": (
                model_filename
            ),
            "validation_mae": (
                validation_candidates
            ),
            "persistence": {
                "validation": (
                    persistence_val_metrics
                ),
                "test": (
                    persistence_test_metrics
                ),
            },
            "ridge": {
                "best_alpha": (
                    best_ridge_alpha
                ),
                "validation_results": (
                    ridge_validation_results
                ),
            },
            "xgboost": {
                "best_config": (
                    best_xgb_config
                ),
                "validation_results": (
                    xgb_validation_results
                ),
            },
            "final_test": (
                final_test_metrics
            ),
        }

        if verbose:

            print(
                f"[{target}] "
                f"selected={selected_family} | "
                f"Test MAE="
                f"{final_test_metrics['mae']:.3f} | "
                f"Test RMSE="
                f"{final_test_metrics['rmse']:.3f}"
            )

    # --------------------------------------------------------
    # Save metadata
    # --------------------------------------------------------

    metadata_path = os.path.join(
        MODEL_DIR,
        "forecast_models_meta.json",
    )

    with open(
        metadata_path,
        "w",
        encoding="utf-8",
    ) as file:

        json.dump(
            summary,
            file,
            indent=2,
        )

    if verbose:

        print(
            "\nTraining selesai."
        )

        print(
            f"Metadata: {metadata_path}"
        )

    return summary


# ============================================================
# Supabase Training Entry Point
# ============================================================

def train(
    verbose: bool = True,
):
    """
    Fetch production sensor data from Supabase and use the same
    training implementation used for local testing.
    """

    check_connection()

    session = (
        supabase_session()
    )

    rows = fetch_rows(
        session,
        TABLE_GAS,
    )

    if not rows:
        raise RuntimeError(
            "Tidak ada data sensor "
            "yang tersedia untuk training."
        )

    raw_df = pd.DataFrame(
        rows
    )

    return train_from_dataframe(
        raw_df,
        verbose=verbose,
    )


if __name__ == "__main__":
    train()