# ============================================================
# AirSense - Analytics Inference Pipeline
#
# Pipeline:
# 1. Load and validate sensor data
# 2. Calculate current ISPU from 24-hour rolling concentration
# 3. Detect anomalies
# 4. Load trained forecasting models
# 5. Direct forecast t+60 minutes
# 6. Calculate experimental forecast indicator
# 7. Apply alert logic
#
# Notes:
# - Current ISPU uses 24-hour rolling concentration.
# - Forecast indicator is experimental and is NOT an official
#   future ISPU because the required future 24-hour measurement
#   window is not yet available.
# - No database writes are performed here yet.
# ============================================================

import json
import os

import joblib
import numpy as np
import pandas as pd

from .alert_logic import apply_alert_logic
from .anomaly import detect_anomalies

from .ispu import (
    category_of,
    dominant_pollutant_of,
    ispu_total_of,
    ispu_value,
)

from .preprocess import (
    HORIZON_MINUTES,
    POLLUTANTS,
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

ANALYTICS_DIR = os.path.dirname(
    os.path.dirname(
        os.path.abspath(__file__)
    )
)

MODEL_DIR = os.path.join(
    ANALYTICS_DIR,
    "models",
)

FORECAST_METADATA_PATH = os.path.join(
    MODEL_DIR,
    "forecast_models_meta.json",
)


# ============================================================
# Configuration
# ============================================================

ISPU_ROLLING_WINDOW = 1440


# ============================================================
# Current ISPU
# ============================================================

def add_current_ispu(
    sensor_df,
):
    """
    Calculate current ISPU using rolling 24-hour pollutant
    concentrations.

    The current prototype assumes 1-minute sensor intervals,
    therefore 1440 observations represent 24 hours.

    The ISPU value is rounded before category determination
    so the implementation is consistent with Notebook 03.
    """

    result = sensor_df.copy()

    # --------------------------------------------------------
    # 24-hour rolling concentration
    # --------------------------------------------------------

    for pollutant in POLLUTANTS:

        rolling_column = (
            f"{pollutant}"
            "_rolling_24h"
        )

        result[rolling_column] = (
            result[pollutant]
            .rolling(
                window=ISPU_ROLLING_WINDOW,
                min_periods=ISPU_ROLLING_WINDOW,
            )
            .mean()
        )

        ispu_column = (
            pollutant.replace(
                "_ugm3",
                "_ispu",
            )
        )

        result[ispu_column] = (
            result[rolling_column]
            .apply(
                lambda value: (
                    round(
                        ispu_value(
                            pollutant,
                            value,
                        )
                    )
                    if pd.notna(value)
                    else np.nan
                )
            )
        )

    # --------------------------------------------------------
    # Total ISPU
    # --------------------------------------------------------

    def calculate_total(
        row,
    ):

        concentrations = {
            pollutant: row[
                f"{pollutant}_rolling_24h"
            ]
            for pollutant in POLLUTANTS
        }

        if any(
            pd.isna(value)
            for value
            in concentrations.values()
        ):
            return np.nan

        total, _ = ispu_total_of(
            concentrations
        )

        if total is None:
            return np.nan

        return round(
            total
        )

    result["ispu_total"] = (
        result.apply(
            calculate_total,
            axis=1,
        )
    )

    # --------------------------------------------------------
    # Category
    # --------------------------------------------------------

    result["ispu_category"] = (
        result["ispu_total"]
        .apply(
            lambda value: (
                category_of(
                    value
                )
                if pd.notna(value)
                else "Belum tersedia"
            )
        )
    )

    # --------------------------------------------------------
    # Dominant pollutant
    # --------------------------------------------------------

    def calculate_dominant(
        row,
    ):

        concentrations = {
            pollutant: row[
                f"{pollutant}_rolling_24h"
            ]
            for pollutant in POLLUTANTS
        }

        if any(
            pd.isna(value)
            for value
            in concentrations.values()
        ):
            return None

        return dominant_pollutant_of(
            concentrations
        )

    result["dominant_pollutant"] = (
        result.apply(
            calculate_dominant,
            axis=1,
        )
    )

    return result


# ============================================================
# Forecast Metadata
# ============================================================

def load_forecast_metadata():
    """
    Load forecasting metadata generated by train_forecast.py.
    """

    if not os.path.exists(
        FORECAST_METADATA_PATH
    ):
        raise FileNotFoundError(
            "Metadata forecast tidak ditemukan: "
            f"{FORECAST_METADATA_PATH}. "
            "Jalankan training terlebih dahulu."
        )

    with open(
        FORECAST_METADATA_PATH,
        "r",
        encoding="utf-8",
    ) as file:

        metadata = json.load(
            file
        )

    if "models" not in metadata:
        raise KeyError(
            "Metadata forecast tidak memiliki "
            "bagian 'models'."
        )

    if "features" not in metadata:
        raise KeyError(
            "Metadata forecast tidak memiliki "
            "bagian 'features'."
        )

    return metadata


# ============================================================
# Forecast Model Loader
# ============================================================

def load_forecast_models(
    metadata,
):
    """
    Load fitted forecast models according to training metadata.

    Serialized .joblib files contain:
    - model
    - features
    - target
    - horizon_minutes
    - model_family

    Persistence requires no serialized estimator.
    """

    if "models" not in metadata:
        raise KeyError(
            "Metadata forecast tidak memiliki "
            "bagian 'models'."
        )

    metadata_models = metadata[
        "models"
    ]

    metadata_features = metadata.get(
        "features",
        [],
    )

    models = {}

    for pollutant in POLLUTANTS:

        if pollutant not in metadata_models:
            raise KeyError(
                "Metadata forecast tidak memiliki "
                f"target {pollutant}."
            )

        info = metadata_models[
            pollutant
        ]

        model_family = info[
            "selected_family"
        ]

        # ----------------------------------------------------
        # Persistence
        # ----------------------------------------------------

        if model_family == "Persistence":

            models[pollutant] = {
                "family": "Persistence",
                "model": None,
                "features": metadata_features,
            }

            continue

        # ----------------------------------------------------
        # Ridge / XGBoost
        # ----------------------------------------------------

        model_file = info.get(
            "model_file"
        )

        if not model_file:
            raise ValueError(
                f"model_file untuk {pollutant} "
                "tidak tersedia."
            )

        if os.path.isabs(
            model_file
        ):

            model_path = (
                model_file
            )

        else:

            model_path = os.path.join(
                MODEL_DIR,
                model_file,
            )

        if not os.path.exists(
            model_path
        ):
            raise FileNotFoundError(
                f"Model {pollutant} "
                f"tidak ditemukan: "
                f"{model_path}"
            )

        artifact = joblib.load(
            model_path
        )

        if not isinstance(
            artifact,
            dict,
        ):
            raise TypeError(
                f"Artifact {pollutant} "
                "harus berupa dictionary."
            )

        required_keys = {
            "model",
            "features",
            "target",
            "horizon_minutes",
            "model_family",
        }

        missing_keys = (
            required_keys
            - set(
                artifact.keys()
            )
        )

        if missing_keys:
            raise KeyError(
                f"Artifact {pollutant} "
                "tidak lengkap: "
                + ", ".join(
                    sorted(
                        missing_keys
                    )
                )
            )

        if artifact[
            "target"
        ] != pollutant:

            raise ValueError(
                "Target artifact tidak cocok "
                f"untuk {pollutant}."
            )

        if artifact[
            "model_family"
        ] != model_family:

            raise ValueError(
                "Model family artifact "
                f"{pollutant} tidak cocok "
                "dengan metadata."
            )

        if artifact[
            "horizon_minutes"
        ] != HORIZON_MINUTES:

            raise ValueError(
                f"Horizon model {pollutant} "
                "tidak cocok dengan pipeline."
            )

        if (
            metadata_features
            and artifact["features"]
            != metadata_features
        ):
            raise ValueError(
                f"Feature artifact {pollutant} "
                "tidak cocok dengan metadata."
            )

        models[pollutant] = {
            "family": (
                model_family
            ),
            "model": artifact[
                "model"
            ],
            "features": artifact[
                "features"
            ],
        }

    return models


# ============================================================
# Direct Forecast t+60
# ============================================================

def forecast_t60(
    sensor_df,
    metadata,
    models,
):
    """
    Generate one direct forecast exactly 60 minutes after
    the latest available sensor observation.

    Each pollutant uses the model family selected during
    validation:
    - Persistence
    - Ridge
    - XGBoost
    """

    feature_df, feature_columns = (
        build_features(
            sensor_df,
            horizon_minutes=HORIZON_MINUTES,
            include_targets=False,
        )
    )

    if feature_df.empty:
        raise RuntimeError(
            "Feature forecast kosong. "
            "Riwayat sensor belum cukup."
        )

    # --------------------------------------------------------
    # Validate training/inference feature contract
    # --------------------------------------------------------

    expected_features = metadata.get(
        "features",
        [],
    )

    if expected_features:

        if (
            feature_columns
            != expected_features
        ):

            raise ValueError(
                "Feature inference tidak cocok "
                "dengan feature saat training."
            )

    # --------------------------------------------------------
    # Latest inference row
    # --------------------------------------------------------

    latest = feature_df.iloc[
        -1
    ]

    observed_at = pd.to_datetime(
        latest[
            "created_at"
        ],
        utc=True,
    )

    forecast_at = (
        observed_at
        + pd.Timedelta(
            minutes=HORIZON_MINUTES
        )
    )

    X_latest = (
        feature_df.iloc[
            [-1]
        ][
            feature_columns
        ]
    )

    result = {
        "created_at": (
            observed_at
        ),
        "forecast_at": (
            forecast_at
        ),
        "horizon_minutes": (
            HORIZON_MINUTES
        ),
    }

    # --------------------------------------------------------
    # Forecast every pollutant
    # --------------------------------------------------------

    for pollutant in POLLUTANTS:

        if pollutant not in models:
            raise KeyError(
                f"Model {pollutant} "
                "tidak tersedia."
            )

        model_info = models[
            pollutant
        ]

        model_family = model_info[
            "family"
        ]

        # ----------------------------------------------------
        # Persistence
        # ----------------------------------------------------

        if model_family == "Persistence":

            prediction = float(
                latest[
                    pollutant
                ]
            )

        # ----------------------------------------------------
        # Ridge / XGBoost
        # ----------------------------------------------------

        else:

            model = model_info[
                "model"
            ]

            if model is None:
                raise RuntimeError(
                    f"Estimator {pollutant} "
                    "tidak tersedia."
                )

            model_features = (
                model_info.get(
                    "features",
                    feature_columns,
                )
            )

            if (
                model_features
                != feature_columns
            ):
                raise ValueError(
                    f"Feature model {pollutant} "
                    "tidak cocok dengan "
                    "feature inference."
                )

            prediction = float(
                model.predict(
                    X_latest[
                        model_features
                    ]
                )[0]
            )

        # Concentration cannot be negative.
        prediction = max(
            0.0,
            prediction,
        )

        result[
            f"{pollutant}"
            "_forecast_t60"
        ] = prediction

        result[
            f"{pollutant}"
            "_model"
        ] = model_family

    return result


# ============================================================
# Experimental Forecast Indicator
# ============================================================

def add_forecast_indicator(
    forecast,
):
    """
    Calculate an experimental indicator from forecast pollutant
    concentrations.

    IMPORTANT:
    This is NOT an official future ISPU.

    Official current ISPU is based on the required measurement
    / aggregation window. A direct concentration forecast at
    t+60 cannot replace that complete future window.
    """

    concentrations = {}

    for pollutant in POLLUTANTS:

        forecast_column = (
            f"{pollutant}"
            "_forecast_t60"
        )

        if forecast_column not in forecast:
            raise KeyError(
                "Forecast tidak memiliki "
                f"{forecast_column}."
            )

        concentrations[
            pollutant
        ] = forecast[
            forecast_column
        ]

    total, category = (
        ispu_total_of(
            concentrations
        )
    )

    dominant = (
        dominant_pollutant_of(
            concentrations
        )
    )

    if total is not None:
        total = round(
            total
        )

        category = category_of(
            total
        )

    result = forecast.copy()

    result[
        "forecast_indicator_total"
    ] = total

    result[
        "forecast_indicator_category"
    ] = category

    result[
        "forecast_indicator_dominant"
    ] = dominant

    return result


# ============================================================
# Attach Forecast to Latest Sensor Row
# ============================================================

def attach_forecast_to_latest_row(
    sensor_df,
    forecast,
):
    """
    Attach the t+60 forecast fields to the latest sensor row.

    Historical rows intentionally remain unavailable because
    this pipeline produces one forecast from the latest
    observation.
    """

    result = sensor_df.copy()

    forecast_columns = [
        key
        for key in forecast.keys()
        if (
            key.endswith(
                "_forecast_t60"
            )
            or key.endswith(
                "_model"
            )
            or key.startswith(
                "forecast_indicator_"
            )
        )
    ]

    text_columns = {
        "forecast_indicator_category",
        "forecast_indicator_dominant",
    }

    latest_index = (
        result.index[-1]
    )

    for column in forecast_columns:

        # Text/object columns
        if (
            column.endswith("_model")
            or column in text_columns
        ):
            result[column] = pd.Series(
                [None] * len(result),
                index=result.index,
                dtype="object",
            )

        # Numeric columns
        else:
            result[column] = np.nan

        result.loc[
            latest_index,
            column,
        ] = forecast[
            column
        ]

    return result


# ============================================================
# Local / Shared Core Pipeline
# ============================================================

def run_from_dataframe(
    raw_df,
    metadata=None,
    models=None,
):
    """
    Execute the complete analytics pipeline from an in-memory
    DataFrame.

    This function is used for local/dummy testing and can also
    be reused after production data has been retrieved.

    Returns:
    - sensor: complete processed timeline
    - forecast: latest t+60 forecast
    - latest: latest processed sensor row
    - alerts: rows with active unified alerts
    """

    if raw_df is None:
        raise ValueError(
            "raw_df tidak boleh None."
        )

    if not isinstance(
        raw_df,
        pd.DataFrame,
    ):
        raw_df = pd.DataFrame(
            raw_df
        )

    if raw_df.empty:
        raise RuntimeError(
            "Data sensor kosong."
        )

    # --------------------------------------------------------
    # Preprocessing
    # --------------------------------------------------------

    sensor_df = load_to_df(
        raw_df.to_dict(
            orient="records"
        )
    )

    if (
        len(sensor_df)
        < ISPU_ROLLING_WINDOW
    ):
        raise RuntimeError(
            "Riwayat sensor belum cukup "
            "untuk perhitungan ISPU 24 jam. "
            f"Minimal {ISPU_ROLLING_WINDOW} "
            "observasi diperlukan."
        )

    # --------------------------------------------------------
    # Current ISPU
    # --------------------------------------------------------

    sensor_df = (
        add_current_ispu(
            sensor_df
        )
    )

    # --------------------------------------------------------
    # Anomaly Detection
    # --------------------------------------------------------

    anomaly_df, anomaly_artifacts = (
        detect_anomalies(
            sensor_df
        )
    )

    anomaly_columns = [
        column
        for column
        in anomaly_df.columns
        if (
            column.startswith(
                "anomaly_"
            )
            or column.startswith(
                "z_"
            )
            or column
            in {
                "has_z_anomaly",
                "isolation_score",
                "isolation_anomaly",
                "has_anomaly_evidence",
            }
        )
    ]

    for column in anomaly_columns:

        sensor_df[
            column
        ] = anomaly_df[
            column
        ].values

    # --------------------------------------------------------
    # Forecast models
    # --------------------------------------------------------

    if metadata is None:

        metadata = (
            load_forecast_metadata()
        )

    if models is None:

        models = (
            load_forecast_models(
                metadata
            )
        )

    # --------------------------------------------------------
    # Direct forecast t+60
    # --------------------------------------------------------

    forecast = forecast_t60(
        sensor_df,
        metadata,
        models,
    )

    # --------------------------------------------------------
    # Experimental forecast indicator
    # --------------------------------------------------------

    forecast = (
        add_forecast_indicator(
            forecast
        )
    )

    # --------------------------------------------------------
    # Attach latest forecast
    # --------------------------------------------------------

    sensor_df = (
        attach_forecast_to_latest_row(
            sensor_df,
            forecast,
        )
    )

    # --------------------------------------------------------
    # Unified alert logic
    # --------------------------------------------------------

    sensor_df = (
        apply_alert_logic(
            sensor_df
        )
    )

    # --------------------------------------------------------
    # Results
    # --------------------------------------------------------

    latest = (
        sensor_df.iloc[-1]
        .copy()
    )

    alerts = (
        sensor_df[
            sensor_df[
                "has_alert"
            ]
            .fillna(False)
            .astype(bool)
        ]
        .copy()
    )

    return {
        "sensor": sensor_df,
        "forecast": forecast,
        "latest": latest,
        "alerts": alerts,
    }


# ============================================================
# Production Entry Point
# ============================================================

def run():
    """
    Fetch sensor data from Supabase and execute the analytics
    pipeline.

    Database writes are intentionally not performed yet.
    The database schema and write contract must first be
    coordinated with the database/cloud team member.
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
            "yang tersedia."
        )

    raw_df = pd.DataFrame(
        rows
    )

    result = run_from_dataframe(
        raw_df
    )

    forecast = result[
        "forecast"
    ]

    latest = result[
        "latest"
    ]

    alerts = result[
        "alerts"
    ]

    print(
        "\nAirSense analytics pipeline selesai."
    )

    print(
        "Latest sensor timestamp:",
        latest[
            "created_at"
        ],
    )

    print(
        "Current ISPU:",
        latest[
            "ispu_total"
        ],
        "|",
        latest[
            "ispu_category"
        ],
    )

    print(
        "Dominant pollutant:",
        latest[
            "dominant_pollutant"
        ],
    )

    print(
        "Forecast timestamp:",
        forecast[
            "forecast_at"
        ],
    )

    print(
        "Forecast indicator:",
        forecast[
            "forecast_indicator_total"
        ],
        "|",
        forecast[
            "forecast_indicator_category"
        ],
    )

    print(
        "Active alert rows:",
        len(
            alerts
        ),
    )

    return result


# ============================================================
# CLI
# ============================================================

if __name__ == "__main__":
    run()