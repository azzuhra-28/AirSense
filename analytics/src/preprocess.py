# ============================================================
# AirSense - Preprocessing & Feature Engineering
#
# Digunakan untuk forecasting kualitas udara:
# - validasi dan normalisasi data sensor
# - menjaga spike/outlier sebagai informasi
# - membuat lag features
# - membuat rolling statistics
# - membuat cyclical time features
# - membuat direct target t+60 untuk training
# - mendukung feature engineering tanpa target untuk inference
# ============================================================

import numpy as np
import pandas as pd


# ============================================================
# Configuration
# ============================================================

POLLUTANTS = [
    "pm25_ugm3",
    "pm10_ugm3",
    "co_ugm3",
    "no2_ugm3",
    "o3_ugm3",
]

ENVIRONMENTAL_FEATURES = [
    "temperature",
    "humidity",
]

BASE_FEATURES = (
    POLLUTANTS
    + ENVIRONMENTAL_FEATURES
)

TARGETS = POLLUTANTS.copy()

LAGS = [
    1,
    10,
    30,
    60,
]

ROLLING_WINDOWS = [
    10,
    30,
    60,
]

HORIZON_MINUTES = 60

MIN_ROWS_FOR_TRAIN = (
    60 * 24 * 2
)


# ============================================================
# Data Loading & Validation
# ============================================================

def load_to_df(
    rows: list[dict],
    features: list[str] | None = None,
) -> pd.DataFrame:
    """
    Convert sensor records into a clean chronological DataFrame.

    `features` membatasi kanal mana yang wajib lengkap. Kalau tidak
    diberikan, seluruh BASE_FEATURES dipakai seperti sebelumnya.

    Processing:
    - validate required columns
    - parse timestamp as UTC
    - convert sensor measurements to numeric
    - remove invalid timestamps
    - remove duplicate timestamps
    - mark negative pollutant concentrations as invalid
    - remove rows with incomplete base measurements

    Statistical outliers are NOT automatically removed because
    extreme values may contain meaningful air-quality information.
    """

    # Kanal yang tidak melaporkan data (mis. NO2 mengirim -999) tidak
    # boleh membuang seluruh baris. Pemanggil bisa menentukan kanal yang
    # benar-benar hidup; default tetap seluruh fitur dasar.
    feat = list(features) if features else list(BASE_FEATURES)

    if not rows:
        return pd.DataFrame(
            columns=[
                "created_at",
                *feat,
            ]
        )

    df = pd.DataFrame(
        rows
    )

    required_columns = [
        "created_at",
        *feat,
    ]

    missing_columns = [
        column
        for column in required_columns
        if column not in df.columns
    ]

    if missing_columns:
        raise ValueError(
            "Kolom wajib tidak ditemukan: "
            + ", ".join(
                missing_columns
            )
        )

    # --------------------------------------------------------
    # Timestamp
    # --------------------------------------------------------

    df["created_at"] = (
        pd.to_datetime(
            df["created_at"],
            utc=True,
            format="mixed",
            errors="coerce",
        )
    )

    # --------------------------------------------------------
    # Numeric sensor values
    # --------------------------------------------------------

    for column in feat:

        df[column] = (
            pd.to_numeric(
                df[column],
                errors="coerce",
            )
        )

    # --------------------------------------------------------
    # Invalid timestamp
    # --------------------------------------------------------

    df = df.dropna(
        subset=[
            "created_at",
        ]
    )

    # --------------------------------------------------------
    # Sort and remove duplicate timestamp
    # --------------------------------------------------------

    df = (
        df
        .sort_values(
            "created_at"
        )
        .drop_duplicates(
            subset="created_at",
            keep="last",
        )
        .reset_index(
            drop=True
        )
    )

    # --------------------------------------------------------
    # Invalid pollutant concentrations
    # --------------------------------------------------------

    for column in [c for c in POLLUTANTS if c in df.columns]:

        df.loc[
            df[column] < 0,
            column,
        ] = np.nan

    # --------------------------------------------------------
    # Complete base measurements
    # --------------------------------------------------------

    df = (
        df
        .dropna(
            subset=feat
        )
        .reset_index(
            drop=True
        )
    )

    return df


# ============================================================
# Forecast Feature Engineering
# ============================================================

def build_features(
    df: pd.DataFrame,
    horizon_minutes: int = HORIZON_MINUTES,
    include_targets: bool = True,
    features: list[str] | None = None,
) -> tuple[pd.DataFrame, list[str]]:
    """
    Build forecasting features.

    Training mode:
        include_targets=True

        Creates direct forecasting targets at t+horizon.
        Rows without future targets are removed.

    Inference mode:
        include_targets=False

        Does not create future targets.
        The newest valid feature row remains available for
        direct t+horizon prediction.

    The model predicts pollutant concentrations directly at
    t+60. This function does NOT construct recursive
    t+1 ... t+60 predictions.
    """

    if df.empty:
        return (
            df.copy(),
            [],
        )

    if horizon_minutes <= 0:
        raise ValueError(
            "horizon_minutes harus lebih dari 0."
        )

    # Fitur dibatasi ke kanal yang benar-benar melaporkan data. Kanal
    # mati (mis. NO2) tidak boleh menyumbang kolom lag yang seluruhnya
    # kosong, karena barisnya akan terbuang di dropna.
    feat = list(features) if features else list(BASE_FEATURES)
    pol = [column for column in feat if column in POLLUTANTS]

    df = (
        df
        .sort_values(
            "created_at"
        )
        .reset_index(
            drop=True
        )
        .copy()
    )

    feature_columns = []

    # ========================================================
    # Current measurements
    # ========================================================

    feature_columns.extend(
        feat
    )

    # ========================================================
    # Lag features
    # ========================================================

    for column in pol:

        for lag in LAGS:

            feature_name = (
                f"{column}_lag_{lag}"
            )

            df[feature_name] = (
                df[column]
                .shift(lag)
            )

            feature_columns.append(
                feature_name
            )

    # ========================================================
    # Rolling statistics
    #
    # shift(1) ensures that rolling statistics only contain
    # observations available before the current timestamp.
    # ========================================================

    for column in pol:

        historical = (
            df[column]
            .shift(1)
        )

        for window in ROLLING_WINDOWS:

            mean_name = (
                f"{column}_roll_mean_{window}"
            )

            std_name = (
                f"{column}_roll_std_{window}"
            )

            df[mean_name] = (
                historical
                .rolling(
                    window=window,
                    min_periods=window,
                )
                .mean()
            )

            df[std_name] = (
                historical
                .rolling(
                    window=window,
                    min_periods=window,
                )
                .std()
            )

            feature_columns.extend(
                [
                    mean_name,
                    std_name,
                ]
            )

    # ========================================================
    # Local cyclical time features
    # ========================================================

    local_time = (
        df["created_at"]
        .dt.tz_convert(
            "Asia/Jakarta"
        )
    )

    hour = (
        local_time.dt.hour
        + (
            local_time.dt.minute
            / 60
        )
    )

    weekday = (
        local_time.dt.weekday
    )

    df["hour_sin"] = np.sin(
        2
        * np.pi
        * hour
        / 24
    )

    df["hour_cos"] = np.cos(
        2
        * np.pi
        * hour
        / 24
    )

    df["dow_sin"] = np.sin(
        2
        * np.pi
        * weekday
        / 7
    )

    df["dow_cos"] = np.cos(
        2
        * np.pi
        * weekday
        / 7
    )

    feature_columns.extend(
        [
            "hour_sin",
            "hour_cos",
            "dow_sin",
            "dow_cos",
        ]
    )

    # ========================================================
    # Direct targets t+horizon
    # ========================================================

    target_columns = []

    if include_targets:

        for target in TARGETS:

            target_name = (
                f"{target}"
                f"_target_t"
                f"{horizon_minutes}"
            )

            df[target_name] = (
                df[target]
                .shift(
                    -horizon_minutes
                )
            )

            target_columns.append(
                target_name
            )

    # ========================================================
    # Keep complete rows
    # ========================================================

    required_complete_columns = (
        feature_columns.copy()
    )

    if include_targets:

        required_complete_columns.extend(
            target_columns
        )

    df = (
        df
        .dropna(
            subset=required_complete_columns
        )
        .reset_index(
            drop=True
        )
    )

    return (
        df,
        feature_columns,
    )


# ============================================================
# Historical Window
# ============================================================

def filter_last_days(
    df: pd.DataFrame,
    days: int = 30,
) -> pd.DataFrame:
    """
    Keep records from the most recent requested time window.

    The cutoff is based on the latest timestamp available in
    the dataset rather than the computer's current clock.
    """

    if df.empty:
        return df.copy()

    if days <= 0:
        raise ValueError(
            "days harus lebih dari 0."
        )

    latest_timestamp = (
        df["created_at"]
        .max()
    )

    cutoff = (
        latest_timestamp
        - pd.Timedelta(
            days=days
        )
    )

    return (
        df.loc[
            df["created_at"]
            >= cutoff
        ]
        .reset_index(
            drop=True
        )
    )