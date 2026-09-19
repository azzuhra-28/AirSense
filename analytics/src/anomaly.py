# ============================================================
# AirSense - Anomaly Detection
#
# Methods:
# 1. Rolling Z-Score
#    - univariate anomaly detection per pollutant
#    - historical rolling window
#
# 2. Isolation Forest
#    - multivariate anomaly detection
#    - pollutants + temperature + humidity
#
# Important:
# An anomaly is an unusual observation, not automatically
# evidence of dangerous air quality.
# ============================================================

import numpy as np
import pandas as pd

from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler

from .preprocess import (
    BASE_FEATURES,
    POLLUTANTS,
)


# ============================================================
# Configuration
# ============================================================

Z_WINDOW = 60
Z_THRESHOLD = 3.0

IF_CONTAMINATION = 0.01
IF_N_ESTIMATORS = 300
RANDOM_STATE = 42


# ============================================================
# Rolling Z-Score
# ============================================================

def add_rolling_zscore(
    df,
    pollutants=None,
    window=Z_WINDOW,
    threshold=Z_THRESHOLD,
):
    """
    Detect unusual pollutant observations using a historical
    rolling Z-score.

    The current observation is excluded from the rolling
    reference window using shift(1), preventing the observation
    being evaluated from influencing its own baseline.

    Returns
    -------
    pandas.DataFrame
        Original dataframe plus:
        - <pollutant>_rolling_mean
        - <pollutant>_rolling_std
        - <pollutant>_zscore
        - <pollutant>_z_anomaly
        - z_anomaly_count
        - has_z_anomaly
    """

    if pollutants is None:
        pollutants = POLLUTANTS

    result = df.copy()

    for pollutant in pollutants:

        if pollutant not in result.columns:
            raise ValueError(
                f"Kolom pollutant tidak ditemukan: {pollutant}"
            )

        historical = result[pollutant].shift(1)

        rolling_mean = historical.rolling(
            window=window,
            min_periods=window,
        ).mean()

        rolling_std = historical.rolling(
            window=window,
            min_periods=window,
        ).std()

        mean_column = (
            f"{pollutant}_rolling_mean"
        )

        std_column = (
            f"{pollutant}_rolling_std"
        )

        z_column = (
            f"{pollutant}_zscore"
        )

        anomaly_column = (
            f"{pollutant}_z_anomaly"
        )

        result[mean_column] = rolling_mean
        result[std_column] = rolling_std

        # Avoid division by zero.
        safe_std = rolling_std.replace(
            0,
            np.nan,
        )

        result[z_column] = (
            result[pollutant]
            - rolling_mean
        ) / safe_std

        # Rows without sufficient history are not classified
        # as anomalies.
        result[anomaly_column] = (
            result[z_column]
            .abs()
            .gt(threshold)
            .fillna(False)
        )

    anomaly_columns = [
        f"{pollutant}_z_anomaly"
        for pollutant in pollutants
    ]

    result["z_anomaly_count"] = (
        result[anomaly_columns]
        .sum(axis=1)
        .astype(int)
    )

    result["has_z_anomaly"] = (
        result["z_anomaly_count"] > 0
    )

    return result


# ============================================================
# Isolation Forest
# ============================================================

def fit_isolation_forest(
    df,
    feature_columns=None,
    contamination=IF_CONTAMINATION,
    n_estimators=IF_N_ESTIMATORS,
    random_state=RANDOM_STATE,
):
    """
    Fit multivariate Isolation Forest.

    Isolation Forest uses pollutant concentrations together
    with temperature and humidity.

    Returns
    -------
    scaler
        Fitted StandardScaler.

    model
        Fitted IsolationForest.
    """

    if feature_columns is None:
        feature_columns = BASE_FEATURES

    missing_columns = [
        column
        for column in feature_columns
        if column not in df.columns
    ]

    if missing_columns:
        raise ValueError(
            "Kolom untuk Isolation Forest tidak lengkap: "
            f"{missing_columns}"
        )

    valid_data = (
        df[feature_columns]
        .replace(
            [np.inf, -np.inf],
            np.nan,
        )
        .dropna()
    )

    if valid_data.empty:
        raise ValueError(
            "Tidak ada data valid untuk melatih "
            "Isolation Forest."
        )

    scaler = StandardScaler()

    X_scaled = scaler.fit_transform(
        valid_data
    )

    model = IsolationForest(
        n_estimators=n_estimators,
        contamination=contamination,
        random_state=random_state,
        n_jobs=-1,
    )

    model.fit(
        X_scaled
    )

    return scaler, model


def add_isolation_forest_result(
    df,
    scaler,
    model,
    feature_columns=None,
):
    """
    Apply a fitted Isolation Forest to a dataframe.

    Adds:
    - isolation_score
    - isolation_anomaly
    """

    if feature_columns is None:
        feature_columns = BASE_FEATURES

    result = df.copy()

    missing_columns = [
        column
        for column in feature_columns
        if column not in result.columns
    ]

    if missing_columns:
        raise ValueError(
            "Kolom untuk Isolation Forest tidak lengkap: "
            f"{missing_columns}"
        )

    valid_mask = (
        result[feature_columns]
        .replace(
            [np.inf, -np.inf],
            np.nan,
        )
        .notna()
        .all(axis=1)
    )

    result["isolation_score"] = np.nan

    result["isolation_anomaly"] = False

    if not valid_mask.any():
        return result

    X = result.loc[
        valid_mask,
        feature_columns
    ]

    X_scaled = scaler.transform(
        X
    )

    scores = model.decision_function(
        X_scaled
    )

    predictions = model.predict(
        X_scaled
    )

    result.loc[
        valid_mask,
        "isolation_score"
    ] = scores

    result.loc[
        valid_mask,
        "isolation_anomaly"
    ] = (
        predictions == -1
    )

    result["isolation_anomaly"] = (
        result["isolation_anomaly"]
        .astype(bool)
    )

    return result


# ============================================================
# Combined Anomaly Evidence
# ============================================================

def add_anomaly_evidence(
    df
):
    """
    Combine Rolling Z-Score and Isolation Forest evidence.

    anomaly_method:
    - None
    - Z-Score
    - Isolation Forest
    - Both

    This is evidence only. Alert severity is handled separately
    in alert_logic.py.
    """

    required_columns = [
        "has_z_anomaly",
        "isolation_anomaly",
    ]

    missing_columns = [
        column
        for column in required_columns
        if column not in df.columns
    ]

    if missing_columns:
        raise ValueError(
            "Hasil anomaly detection belum lengkap: "
            f"{missing_columns}"
        )

    result = df.copy()

    z_flag = (
        result["has_z_anomaly"]
        .fillna(False)
        .astype(bool)
    )

    isolation_flag = (
        result["isolation_anomaly"]
        .fillna(False)
        .astype(bool)
    )

    conditions = [
        z_flag & isolation_flag,
        z_flag & ~isolation_flag,
        ~z_flag & isolation_flag,
    ]

    choices = [
        "Both",
        "Z-Score",
        "Isolation Forest",
    ]

    result["anomaly_method"] = np.select(
        conditions,
        choices,
        default="None",
    )

    result["has_anomaly_evidence"] = (
        result["anomaly_method"] != "None"
    )

    return result


# ============================================================
# Complete Detection
# ============================================================

def detect_anomalies(
    df,
    z_window=Z_WINDOW,
    z_threshold=Z_THRESHOLD,
    contamination=IF_CONTAMINATION,
):
    """
    Run the complete AirSense anomaly detection process.

    1. Rolling Z-Score
    2. Isolation Forest
    3. Combine anomaly evidence

    Returns
    -------
    result
        Dataframe containing anomaly results.

    artifacts
        Fitted scaler and Isolation Forest model.
    """

    result = add_rolling_zscore(
        df,
        window=z_window,
        threshold=z_threshold,
    )

    scaler, model = fit_isolation_forest(
        result,
        contamination=contamination,
    )

    result = add_isolation_forest_result(
        result,
        scaler,
        model,
    )

    result = add_anomaly_evidence(
        result
    )

    artifacts = {
        "scaler": scaler,
        "model": model,
    }

    return result, artifacts