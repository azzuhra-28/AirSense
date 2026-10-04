# ============================================================
# AirSense - Analytics Inference Pipeline
#
# Pipeline:
# 1. Load and validate sensor data
# 2. Calculate current ISPU from 24-hour rolling concentration
# 3. Detect anomalies (+ RF robustness cross-check)
# 4. Load trained forecasting models
# 5. Direct forecast t+60 minutes
# 6. Build interpolated forecast curve t+1..t+60 for dashboard
# 7. Calculate experimental forecast indicator
# 8. Apply alert logic
# 9. Build automatic insight
# 10. Save forecast curve, alert, and insight to Supabase
#
# Notes:
# - Current ISPU uses 24-hour rolling concentration.
# - Forecast indicator is experimental and is NOT an official
#   future ISPU because the required future 24-hour measurement
#   window is not yet available.
# - Forecast curve t+1..t+59 is LINEAR INTERPOLATION between the
#   latest observation and the t+60 model prediction. Only t+60
#   is a true model output. See build_forecast_curve().
# ============================================================

import json
import os

import joblib
import numpy as np
import pandas as pd

from .alert_logic import apply_alert_logic
from .anomaly import add_rf_robustness_check, detect_anomalies
from .insight import build_insight

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

from .robustness_rf import load_model as load_rf_model

from .supabase_client import (
    SUPABASE_URL,
    TABLE_ALERT,
    TABLE_FORECAST,
    TABLE_GAS,
    check_connection,
    fetch_rows,
    insert_rows,
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

RF_MODEL_PATH = os.path.join(
    MODEL_DIR,
    "robustness_rf.joblib",
)


# ============================================================
# Configuration
# ============================================================

ISPU_ROLLING_WINDOW = 1440

ALERT_COOLDOWN_HOURS = 6


class InsufficientHistoryError(RuntimeError):
    """Riwayat sensor belum cukup untuk perhitungan ISPU 24 jam."""


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
# Multi-step Forecast Curve (interpolated t+1..t+59, model t+60)
#
# CATATAN METODOLOGI:
# Model forecast dilatih khusus untuk prediksi langsung di
# t+60 (direct forecasting), bukan model per-menit. Titik
# t+1 s.d. t+59 di bawah ini adalah INTERPOLASI LINEAR antara
# observasi terakhir (t+0) dan prediksi model di t+60, dibuat
# semata untuk kebutuhan visualisasi kurva di dashboard.
# Titik t+60 tetap murni hasil model. Titik selain t+60 TIDAK
# untuk dipakai sebagai dasar keputusan presisi.
# ============================================================

def build_forecast_curve(
    sensor_df,
    forecast,
    steps=60,
):
    """
    forecast: hasil forecast_t60().
    Return: list of dict, satu dict per menit (t+1..t+steps).
    """

    latest_row = sensor_df.iloc[-1]

    curve = []

    for step in range(1, steps + 1):

        fraction = step / steps

        point = {
            "created_at": forecast["created_at"],
            "forecast_at": (
                forecast["created_at"]
                + pd.Timedelta(minutes=step)
            ),
            "horizon_minutes": step,
        }

        for pollutant in POLLUTANTS:

            start_value = float(
                latest_row[pollutant]
            )

            end_value = forecast[
                f"{pollutant}_forecast_t60"
            ]

            interpolated = (
                start_value
                + (end_value - start_value) * fraction
            )

            interpolated = max(
                0.0,
                interpolated,
            )

            point[
                f"{pollutant}_forecast_t60"
            ] = interpolated

        curve.append(point)

    # Titik terakhir (t+60) diganti dengan hasil model asli,
    # bukan hasil interpolasi, supaya tidak ada informasi yang
    # hilang/terdistorsi di endpoint yang paling penting.
    for pollutant in POLLUTANTS:

        curve[-1][
            f"{pollutant}_forecast_t60"
        ] = forecast[
            f"{pollutant}_forecast_t60"
        ]

    return curve


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
    - forecast: latest t+60 forecast (single point, model output)
    - latest: latest processed sensor row
    - alerts: rows with active unified alerts
    - insight: automatic insight text (string)
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
        raise InsufficientHistoryError(
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
    # RF Robustness Cross-Check (opsional, jalan kalau model ada)
    # --------------------------------------------------------

    rf_model = load_rf_model(RF_MODEL_PATH)

    if rf_model is not None:

        sensor_df = add_rf_robustness_check(
            sensor_df,
            rf_model,
        )

    else:

        sensor_df["rf_predicted_category"] = None
        sensor_df["has_rf_mismatch"] = False

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
    # Automatic Insight
    # --------------------------------------------------------

    insight_text = build_insight(
        sensor_df.iloc[-1],
        forecast,
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
        "insight": insight_text,
    }


# ============================================================
# Simpan Hasil ke Supabase
# ============================================================

ALERT_TYPE_MAP = {
    "Air Quality": "ISPU_HIGH",
    "Anomaly": "ANOMALY",
    "Forecast": "FORECAST_HIGH",
}

SEVERITY_MAP = {
    "Low": "LOW",
    "Medium": "MEDIUM",
    "High": "HIGH",
}


def build_forecast_rows(
    sensor_df,
    forecast,
    insight=None,
):
    """
    Bentuk 60 baris untuk tb_forecast: 1 per menit dari t+1
    sampai t+60, dengan generated_at yang sama (otomatis dari
    DEFAULT NOW() di Supabase, karena tidak dikirim eksplisit).

    Catatan: skema saat ini hanya punya kolom untuk PM2.5,
    PM10, dan CO. Forecast NO2 dan O3 dihitung juga oleh
    model tapi belum ada kolomnya di tb_forecast -- perlu
    dikoordinasikan dengan Anggota 1 (Database) kalau mau
    ikut disimpan.
    """

    curve = build_forecast_curve(
        sensor_df,
        forecast,
    )

    rows = []

    for point in curve:

        pm25 = point["pm25_ugm3_forecast_t60"]
        pm10 = point["pm10_ugm3_forecast_t60"]
        co = point["co_ugm3_forecast_t60"]

        concentrations = {
            "pm25_ugm3": pm25,
            "pm10_ugm3": pm10,
            "co_ugm3": co,
            "no2_ugm3": point["no2_ugm3_forecast_t60"],
            "o3_ugm3": point["o3_ugm3_forecast_t60"],
        }

        total, category = ispu_total_of(
            concentrations
        )

        if total is not None:
            category = category_of(
                round(total)
            )

        rows.append(
            {
                "forecast_at": point[
                    "forecast_at"
                ].isoformat(),
                "pm25_ugm3_pred": pm25,
                "pm10_ugm3_pred": pm10,
                "co_ugm3_pred": co,
                "pm25_ispu_pred": ispu_value(
                    "pm25_ugm3", pm25
                ),
                "pm10_ispu_pred": ispu_value(
                    "pm10_ugm3", pm10
                ),
                "co_ispu_pred": ispu_value(
                    "co_ugm3", co
                ),
                "category": category,
                "insight": insight,
            }
        )

    return rows


def build_alert_row(latest_row):
    """
    Bentuk satu baris untuk tb_alert dari BARIS SENSOR
    TERBARU SAJA (bukan seluruh histori alert).
    """

    alert_type_raw = latest_row["alert_type"]
    severity_raw = latest_row["severity"]

    rf_predicted = latest_row.get(
        "rf_predicted_category"
    )

    rf_predicted = (
        None
        if pd.isna(rf_predicted)
        else str(rf_predicted)
    )

    return {
        "alert_type": ALERT_TYPE_MAP.get(
            alert_type_raw,
            alert_type_raw.upper(),
        ),
        "severity": SEVERITY_MAP.get(
            severity_raw,
            severity_raw.upper(),
        ),
        "message": latest_row["alert_message"],
        "is_active": True,
        "payload": {
            "ispu_category": latest_row.get(
                "ispu_category"
            ),
            "dominant_pollutant": latest_row.get(
                "dominant_pollutant"
            ),
            "anomaly_level": latest_row.get(
                "anomaly_level"
            ),
            "rf_predicted_category": rf_predicted,
            "rf_mismatch": bool(
                latest_row.get(
                    "has_rf_mismatch", False
                )
            ),
        },
    }


def forecast_exists(session, forecast_at_iso):
    """
    True kalau forecast untuk waktu target yang sama sudah
    tersimpan (misalnya karena belum ada data sensor baru).
    """

    response = session.get(
        f"{SUPABASE_URL}/rest/v1/{TABLE_FORECAST}",
        params={
            "select": "id",
            "forecast_at": f"eq.{forecast_at_iso}",
            "limit": 1,
        },
        timeout=30,
    )

    response.raise_for_status()

    return len(response.json()) > 0


def recent_alert_exists(session, alert_type, severity):
    """
    True kalau alert dengan tipe dan severity yang sama sudah
    dibuat dalam ALERT_COOLDOWN_HOURS terakhir. Kalau severity
    naik (misal MEDIUM jadi HIGH), alert baru tetap dibuat.
    """

    since = (
        pd.Timestamp.now(tz="UTC")
        - pd.Timedelta(hours=ALERT_COOLDOWN_HOURS)
    ).isoformat()

    response = session.get(
        f"{SUPABASE_URL}/rest/v1/{TABLE_ALERT}",
        params={
            "select": "id",
            "alert_type": f"eq.{alert_type}",
            "severity": f"eq.{severity}",
            "created_at": f"gte.{since}",
            "limit": 1,
        },
        timeout=30,
    )

    response.raise_for_status()

    return len(response.json()) > 0


def save_results_to_supabase(
    session,
    sensor_df,
    forecast,
    latest_row,
    insight=None,
):
    """
    Simpan kurva forecast (60 baris, t+1..t+60) dan alert ke
    Supabase tanpa duplikasi.

    - Satu siklus forecast dilewati seluruhnya kalau titik t+60
      (forecast_at paling akhir di siklus itu) sudah ada --
      artinya observasi sensor sumbernya belum berubah.
    - Alert dilewati kalau alert dengan tipe + severity yang sama
      sudah dibuat dalam ALERT_COOLDOWN_HOURS terakhir.
    """

    forecast_rows = build_forecast_rows(
        sensor_df,
        forecast,
        insight,
    )

    forecast_saved = False

    last_forecast_at = forecast_rows[-1]["forecast_at"]

    if not forecast_exists(session, last_forecast_at):

        insert_rows(
            session,
            TABLE_FORECAST,
            forecast_rows,
        )

        forecast_saved = True

    alert_saved = False

    if bool(latest_row.get("has_alert", False)):

        alert_row = build_alert_row(latest_row)

        if not recent_alert_exists(
            session,
            alert_row["alert_type"],
            alert_row["severity"],
        ):

            insert_rows(
                session,
                TABLE_ALERT,
                [alert_row],
            )

            alert_saved = True

    return {
        "forecast_saved": forecast_saved,
        "alert_saved": alert_saved,
    }


# ============================================================
# Production Entry Point
# ============================================================

def run():
    """
    Fetch sensor data from Supabase, run the analytics
    pipeline, and save the forecast curve, alert, and
    automatic insight back to Supabase.
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

    try:
        result = run_from_dataframe(
            raw_df
        )

    except InsufficientHistoryError as error:

        print("SKIP: pipeline dilewati.")
        print(error)

        return None

    forecast = result["forecast"]
    latest = result["latest"]
    alerts = result["alerts"]

    save_status = save_results_to_supabase(
        session,
        result["sensor"],
        result["forecast"],
        result["latest"],
        result["insight"],
    )

    print(
        "Forecast tersimpan:",
        save_status["forecast_saved"],
    )

    print(
        "Alert tersimpan   :",
        save_status["alert_saved"],
    )

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
        "RF predicted category:",
        latest["rf_predicted_category"],
    )

    print(
        "RF mismatch:",
        latest["has_rf_mismatch"],
    )

    print(
        "Forecast timestamp (t+60):",
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

    print(
        "\nInsight:",
        result["insight"],
    )

    return result


# ============================================================
# CLI
# ============================================================

if __name__ == "__main__":
    run()