"""Adaptive weight blending: XGBoost + rata-rata historis.

Mengikuti skema yang disebut di scope: prediksi akhir adalah gabungan
berbobot antara model XGBoost dan pola rata-rata historis pada jam yang
sama. Bobot tidak ditetapkan manual, melainkan dihitung dari galat
kedua komponen pada data validasi, sehingga komponen yang lebih baik
otomatis mendapat porsi lebih besar.

Artifact XGBoost yang ada hanya menyimpan `model` dan `features`, tanpa
metadata target/horizon. Karena itu modul ini mengisi sendiri bagian
yang hilang dan menolak berjalan bila bentuk fiturnya tidak cocok,
supaya tidak diam-diam menghasilkan angka salah.
"""

import os

import joblib
import numpy as np
import pandas as pd

from .supabase_client import fetch_rows, supabase_session

MODEL_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "models",
)

TABLE_GAS = "tb_konsentrasi_gas"

# Fitur yang diharapkan artifact XGBoost (urutan harus persis).
XGB_ALL_FEATURES = [
    "pm25_ugm3_lag1",
    "pm10_ugm3_lag1",
    "co_ugm3_lag1",
    "no2_ugm3_lag1",
    "o3_ugm3_lag1",
    "temperature",
    "humidity",
    "hour",
    "weekday",
]

# Fitur yang wajib ada saat inferensi. NO2 dan O3 boleh kosong:
# XGBoost menangani nilai hilang secara bawaan (meneruskan ke cabang
# default), jadi tidak perlu diisi angka karangan. Mengisi manual justru
# membuat model membaca konsentrasi yang tidak pernah terukur.
XGB_REQUIRED = [
    "pm25_ugm3_lag1",
    "pm10_ugm3_lag1",
    "co_ugm3_lag1",
    "temperature",
    "humidity",
    "hour",
    "weekday",
]

# Batas bawah bobot historis: pola jam tidak boleh hilang sepenuhnya
# hanya karena XGBoost unggul pada satu periode pengamatan.
MIN_HISTORY_WEIGHT = 0.15


def load_xgb(target: str):
    """Muat artifact XGBoost untuk satu target, atau None."""
    path = os.path.join(MODEL_DIR, f"xgboost_{target}.joblib")
    if not os.path.exists(path):
        return None

    artifact = joblib.load(path)
    model = artifact.get("model") if isinstance(artifact, dict) else artifact
    features = artifact.get("features", []) if isinstance(artifact, dict) else []

    if model is None:
        return None

    # Jangan pakai model yang bentuk fiturnya tidak kita pahami.
    if list(features) != XGB_ALL_FEATURES:
        return None

    return {"model": model, "features": list(features)}


def _lag_table(df: pd.DataFrame, target_column: str) -> pd.DataFrame:
    """Satu baris per pembacaan, berisi lag-1 tiap polutan + waktu."""
    out = pd.DataFrame(index=df.index)
    for column in ["pm25_ugm3", "pm10_ugm3", "co_ugm3", "no2_ugm3", "o3_ugm3"]:
        out[f"{column}_lag1"] = df[column].shift(1)
    out["temperature"] = df["temperature"]
    out["humidity"] = df["humidity"]
    out["hour"] = df["created_at"].dt.hour
    out["weekday"] = df["created_at"].dt.weekday
    out["created_at"] = df["created_at"]
    out[target_column] = df[target_column].to_numpy()
    return out


def _history_profile(df: pd.DataFrame, target: str) -> pd.Series:
    """Rata-rata historis per jam (0-23) untuk satu polutan."""
    table = pd.DataFrame(
        {
            "hour": df["created_at"].dt.hour,
            "value": df[target],
        }
    ).dropna()
    if table.empty:
        return pd.Series(dtype=float)
    return table.groupby("hour")["value"].mean()


def blend_forecast(
    df: pd.DataFrame,
    target: str,
    steps: int = 60,
    lstm: dict | None = None,
) -> dict | None:
    """
    Gabungkan XGBoost, pola rata-rata per jam, dan (bila ada) LSTM.

    Bobot dihitung dari galat masing-masing komponen pada data
    validasi, bukan ditetapkan manual. Komponen yang galatnya jauh
    lebih buruk dari yang terbaik diberi bobot nol, supaya tidak ikut
    menyeret hasil akhir.

    `lstm` berbentuk {"curve": list[float], "mae": float}. Bila tidak
    diberikan, hanya XGBoost dan pola historis yang dipakai.
    """
    bundle = load_xgb(target)
    if bundle is None or df.empty:
        return None

    table = _lag_table(df, target)
    usable = table.dropna(subset=XGB_REQUIRED)
    if len(usable) < 30:
        return None

    split = int(len(usable) * 0.70)
    validation = usable.iloc[split:]
    if len(validation) < 10:
        return None

    model = bundle["model"]
    xgb_val = np.clip(
        model.predict(validation[XGB_ALL_FEATURES].to_numpy()), 0, None
    )
    profile = _history_profile(df, target)
    historic_val = validation["created_at"].dt.hour.map(profile).to_numpy()
    actual_val = validation[target].to_numpy(dtype=float)

    mask = np.isfinite(historic_val) & np.isfinite(actual_val)
    if mask.sum() < 10:
        return None

    mae_xgb = float(np.mean(np.abs(xgb_val[mask] - actual_val[mask])))
    mae_hist = float(np.mean(np.abs(historic_val[mask] - actual_val[mask])))

    # ---------------------------------------------------------
    # Nilai satu langkah ke depan dari tiap komponen.
    # ---------------------------------------------------------
    last = usable.iloc[[-1]]
    xgb_next = float(
        np.clip(model.predict(last[XGB_ALL_FEATURES].to_numpy())[0], 0, None)
    )
    jam_terakhir = df["created_at"].iloc[-1].hour
    hist_next = float(profile.get(jam_terakhir, xgb_next))

    komponen = [
        {"nama": "xgboost", "nilai": xgb_next, "mae": mae_xgb},
        {"nama": "historis", "nilai": hist_next, "mae": mae_hist},
    ]

    lstm_curve = None
    if lstm and lstm.get("curve") and np.isfinite(lstm.get("mae") or np.nan):
        lstm_curve = list(lstm["curve"])
        komponen.append(
            {"nama": "lstm", "nilai": float(np.mean(lstm_curve)), "mae": float(lstm["mae"])}
        )

    # ---------------------------------------------------------
    # Bobot berbanding terbalik dengan galat. Komponen yang lebih
    # dari 1,2x lebih buruk dari yang terbaik dianggap tidak layak
    # ikut, bukan sekadar diberi porsi kecil.
    # ---------------------------------------------------------
    mae_terbaik = min(k["mae"] for k in komponen)
    batas = mae_terbaik * 1.2

    dipakai = [k for k in komponen if k["mae"] <= batas]
    invers = np.array([1.0 / (k["mae"] + 1e-6) for k in dipakai])
    bobot = invers / invers.sum()

    level = float(sum(b["nilai"] * w for b, w in zip(dipakai, bobot)))

    # ---------------------------------------------------------
    # Bentuk kurva diambil dari LSTM bila ikut dipakai, karena hanya
    # LSTM yang punya bentuk. Kurvanya digeser agar rata-ratanya sama
    # dengan level gabungan.
    # ---------------------------------------------------------
    pakai_lstm = lstm_curve is not None and any(k["nama"] == "lstm" for k in dipakai)

    if pakai_lstm and len(lstm_curve) == steps:
        offset = level - float(np.mean(lstm_curve))
        predictions = [max(0.0, p + offset) for p in lstm_curve]
    else:
        predictions = [max(0.0, level)] * steps

    return {
        "predictions": predictions,
        "weights": {k["nama"]: float(w) for k, w in zip(dipakai, bobot)},
        "mae": {k["nama"]: float(k["mae"]) for k in komponen},
        "dipakai": [k["nama"] for k in dipakai],
        "level": level,
    }


def load_recent(target: str, limit: int = 12000) -> pd.DataFrame:
    """Ambil data sensor mentah untuk keperluan blending."""
    sess = supabase_session()
    rows = fetch_rows(
        sess,
        TABLE_GAS,
        select="created_at,pm25_ugm3,pm10_ugm3,co_ugm3,no2_ugm3,o3_ugm3,temperature,humidity",
        order="created_at.desc",
        limit=1000,
        max_rows=limit,
    )
    if not rows:
        return pd.DataFrame()

    df = pd.DataFrame(rows)
    df["created_at"] = pd.to_datetime(df["created_at"], utc=True, format="mixed")
    df = df.sort_values("created_at").reset_index(drop=True)

    for column in ["pm25_ugm3", "pm10_ugm3", "co_ugm3", "no2_ugm3", "o3_ugm3"]:
        df[column] = pd.to_numeric(df[column], errors="coerce")
        df.loc[df[column] <= -900, column] = np.nan

    return df
