# ============================================================
# AirSense - Preprocessing & Feature Engineering
# Spesifikasi mengikuti laporan PA Yusuf bab 3.2.5/4.7.6:
#   - fetch pagination 1000 baris/batch, 30 hari
#   - dropna(), outlier IQR
#   - fitur: 5 polutan + suhu + RH + waktu + lag 1 menit
#   - target forecast: t+60 (horizon 60 menit)
# ============================================================

from datetime import datetime, timedelta, timezone

import numpy as np
import pandas as pd

from .ispu import ispu_pm25, ispu_pm10, ispu_co

# Fitur untuk model forecast & klasifikasi
FEATURES = [
    "pm25_ugm3", "pm10_ugm3", "co_ugm3", "no2_ugm3", "o3_ugm3",
    "temperature", "humidity",
]
PREFIX = ["pm25_ugm3", "pm10_ugm3", "co_ugm3", "no2_ugm3", "o3_ugm3"]
TARGETS = ["pm25_ugm3", "pm10_ugm3", "co_ugm3"]
HORIZON_MINUTES = 60

MIN_ROWS_FOR_TRAIN = 60 * 24 * 2  # minimal 2 hari data per-menit


def load_to_df(rows: list[dict]) -> pd.DataFrame:
    """Konversi list dict dari Supabase jadi DataFrame, urut waktu naik."""
    df = pd.DataFrame(rows)
    df["created_at"] = pd.to_datetime(df["created_at"], utc=True, format="ISO8601")
    for c in FEATURES:
        df[c] = pd.to_numeric(df[c], errors="coerce")
    df = df.dropna(subset=FEATURES).sort_values("created_at").reset_index(drop=True)
    df = df.drop_duplicates(subset="created_at")
    return df


def remove_outliers_iqr(df: pd.DataFrame, cols=PREFIX) -> pd.DataFrame:
    """Metode IQR untuk penanganan outlier (per laporan)."""
    clean = df.copy()
    for c in cols:
        q1 = clean[c].quantile(0.25)
        q3 = clean[c].quantile(0.75)
        iqr = q3 - q1
        lo, hi = q1 - 1.5 * iqr, q3 + 1.5 * iqr
        # outlier diganti NaN lalu di-interpolasi (bukan dibuang, biar ts tetap kontinu)
        clean.loc[(clean[c] < lo) | (clean[c] > hi), c] = np.nan
    clean = clean.interpolate(method="linear", limit_direction="both")
    return clean


def build_features(df: pd.DataFrame) -> pd.DataFrame:
    """DataFrame -> matriks fitur + target t+60."""
    df = df.sort_values("created_at").reset_index(drop=True)

    # lag 1 menit (fitur paling dominan dari analisis ACF/PACF laporan)
    for c in PREFIX:
        df[f"{c}_lag1"] = df[c].shift(1)

    # fitur waktu
    df["hour"] = df["created_at"].dt.hour
    df["weekday"] = df["created_at"].dt.weekday

    # target horizon 60 menit (nilai asli, bukan pergeseran langsung)
    for t in TARGETS:
        df[f"y_{t}"] = df[t].shift(-HORIZON_MINUTES)

    # drop baris tanpa lag/target (tidak lengkap)
    feat_cols = [f"{c}_lag1" for c in PREFIX] + ["temperature", "humidity", "hour", "weekday"]
    df = df.dropna(subset=feat_cols + [f"y_{t}" for t in TARGETS]).reset_index(drop=True)
    return df, feat_cols


def filter_last_days(df: pd.DataFrame, days: int = 30) -> pd.DataFrame:
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    return df[df["created_at"] >= cutoff].reset_index(drop=True)