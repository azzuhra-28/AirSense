# ============================================================
# AirSense - Alert Logic
#
# Alert sources:
# 1. Anomaly evidence
# 2. Current air-quality category
# 3. Experimental forecast indicator
#
# Important:
# - anomaly != dangerous air quality
# - forecast indicator != official future ISPU
# - device offline is handled separately by the pipeline
# ============================================================

import numpy as np
import pandas as pd


# ============================================================
# Configuration
# ============================================================

AIR_QUALITY_ALERT_CATEGORIES = {
    "Tidak Sehat",
    "Sangat Tidak Sehat",
    "Berbahaya",
}

FORECAST_ALERT_THRESHOLD = 100


# ============================================================
# Anomaly Level
# ============================================================

def add_anomaly_level(df):
    """
    Convert anomaly evidence into an interpretation level.

    Rules:
    - None:
        no anomaly evidence

    - Observation:
        only one method detects anomaly

    - Moderate:
        Z-Score detects anomalies in >= 2 pollutants,
        but Isolation Forest does not agree

    - Strong:
        Z-Score and Isolation Forest both detect anomaly

    Only Moderate and Strong generate anomaly alerts.
    """

    required_columns = [
        "z_anomaly_count",
        "has_z_anomaly",
        "isolation_anomaly",
        "anomaly_method",
    ]

    missing = [
        column
        for column in required_columns
        if column not in df.columns
    ]

    if missing:
        raise ValueError(
            "Kolom anomaly tidak lengkap: "
            f"{missing}"
        )

    result = df.copy()

    z_count = (
        result["z_anomaly_count"]
        .fillna(0)
        .astype(int)
    )

    isolation = (
        result["isolation_anomaly"]
        .fillna(False)
        .astype(bool)
    )

    conditions = [
        (z_count >= 1) & isolation,
        (z_count >= 2) & ~isolation,
        ((z_count == 1) & ~isolation)
        | ((z_count == 0) & isolation),
    ]

    choices = [
        "Strong",
        "Moderate",
        "Observation",
    ]

    result["anomaly_level"] = np.select(
        conditions,
        choices,
        default="None",
    )

    result["anomaly_alert"] = (
        result["anomaly_level"]
        .isin(
            [
                "Moderate",
                "Strong",
            ]
        )
    )

    return result


# ============================================================
# Current Air Quality Alert
# ============================================================

def add_air_quality_alert(
    df,
    category_column="ispu_category",
):
    """
    Generate an alert from the current official ISPU category.

    Alert is triggered for:
    - Tidak Sehat
    - Sangat Tidak Sehat
    - Berbahaya
    """

    if category_column not in df.columns:
        raise ValueError(
            f"Kolom {category_column} tidak ditemukan."
        )

    result = df.copy()

    result["air_quality_alert"] = (
        result[category_column]
        .isin(
            AIR_QUALITY_ALERT_CATEGORIES
        )
    )

    return result


# ============================================================
# Forecast Alert
# ============================================================

def add_forecast_alert(
    df,
    indicator_column="forecast_indicator_total",
    threshold=FORECAST_ALERT_THRESHOLD,
):
    """
    Generate an experimental forecast warning.

    IMPORTANT:
    forecast_indicator_total is NOT treated as an official
    future ISPU value.

    Missing forecast remains missing and must not be interpreted
    as "no alert".
    """

    if indicator_column not in df.columns:
        raise ValueError(
            f"Kolom {indicator_column} tidak ditemukan."
        )

    result = df.copy()

    indicator = pd.to_numeric(
        result[indicator_column],
        errors="coerce",
    )

    # Boolean dtype allows:
    # True  = forecast available and exceeds threshold
    # False = forecast available and does not exceed threshold
    # <NA>  = forecast unavailable
    forecast_alert = pd.Series(
        pd.NA,
        index=result.index,
        dtype="boolean",
    )

    available = indicator.notna()

    forecast_alert.loc[available] = (
        indicator.loc[available]
        > threshold
    )

    result["forecast_alert"] = (
        forecast_alert
    )

    return result


# ============================================================
# Unified Alert
# ============================================================

def add_unified_alert(df):
    """
    Combine anomaly, current air-quality, and forecast alerts.

    Priority:
    1. Current unhealthy air quality
    2. Strong/Moderate anomaly
    3. Forecast warning

    The priority determines the main alert_type/severity/message.
    """

    required_columns = [
        "anomaly_level",
        "anomaly_alert",
        "air_quality_alert",
        "forecast_alert",
    ]

    missing = [
        column
        for column in required_columns
        if column not in df.columns
    ]

    if missing:
        raise ValueError(
            "Kolom alert belum lengkap: "
            f"{missing}"
        )

    result = df.copy()

    anomaly_alert = (
        result["anomaly_alert"]
        .fillna(False)
        .astype(bool)
    )

    air_quality_alert = (
        result["air_quality_alert"]
        .fillna(False)
        .astype(bool)
    )

    # Missing forecast means unavailable, not False.
    forecast_alert = (
        result["forecast_alert"]
        .fillna(False)
        .astype(bool)
    )

    result["has_alert"] = (
        anomaly_alert
        | air_quality_alert
        | forecast_alert
    )

    result["alert_type"] = "None"
    result["severity"] = "None"
    result["alert_message"] = ""

    # --------------------------------------------------------
    # Forecast
    # --------------------------------------------------------

    mask = forecast_alert

    result.loc[
        mask,
        "alert_type",
    ] = "Forecast"

    result.loc[
        mask,
        "severity",
    ] = "Low"

    result.loc[
        mask,
        "alert_message",
    ] = (
        "Indikator prediksi menunjukkan potensi "
        "penurunan kualitas udara dalam 60 menit ke depan."
    )

    # --------------------------------------------------------
    # Anomaly
    # --------------------------------------------------------

    moderate = (
        result["anomaly_level"]
        == "Moderate"
    )

    result.loc[
        moderate,
        "alert_type",
    ] = "Anomaly"

    result.loc[
        moderate,
        "severity",
    ] = "Low"

    result.loc[
        moderate,
        "alert_message",
    ] = (
        "Perubahan tidak biasa terdeteksi pada beberapa "
        "parameter kualitas udara."
    )

    strong = (
        result["anomaly_level"]
        == "Strong"
    )

    result.loc[
        strong,
        "alert_type",
    ] = "Anomaly"

    result.loc[
        strong,
        "severity",
    ] = "Medium"

    result.loc[
        strong,
        "alert_message",
    ] = (
        "Perubahan tidak biasa terdeteksi oleh dua "
        "metode anomaly detection."
    )

    # --------------------------------------------------------
    # Current air quality
    # Highest priority
    # --------------------------------------------------------

    unhealthy = air_quality_alert

    result.loc[
        unhealthy,
        "alert_type",
    ] = "Air Quality"

    result.loc[
        unhealthy,
        "severity",
    ] = "High"

    if "ispu_category" in result.columns:

        result.loc[
            unhealthy,
            "alert_message",
        ] = (
            "Kualitas udara saat ini berada pada kategori "
            + result.loc[
                unhealthy,
                "ispu_category",
            ].astype(str)
            + "."
        )

    else:

        result.loc[
            unhealthy,
            "alert_message",
        ] = (
            "Kualitas udara saat ini memerlukan perhatian."
        )

    return result


# ============================================================
# Complete Alert Logic
# ============================================================

def apply_alert_logic(
    df,
    ispu_category_column="ispu_category",
    forecast_indicator_column="forecast_indicator_total",
):
    """
    Run the complete AirSense alert interpretation.

    Expected input:
    - anomaly detection results
    - current ISPU category
    - experimental forecast indicator

    Returns dataframe with:
    - anomaly_level
    - anomaly_alert
    - air_quality_alert
    - forecast_alert
    - has_alert
    - alert_type
    - severity
    - alert_message
    """

    result = add_anomaly_level(
        df
    )

    result = add_air_quality_alert(
        result,
        category_column=ispu_category_column,
    )

    result = add_forecast_alert(
        result,
        indicator_column=forecast_indicator_column,
    )

    result = add_unified_alert(
        result
    )

    return result