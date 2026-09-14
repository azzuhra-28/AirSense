# ============================================================
# AirSense - Training Model Klasifikasi (Random Forest)
# "Robustness layer" untuk menstabilkan kategori ISPU.
# Per laporan: n_estimators=500, max_depth=14, min_samples_leaf=2,
# input 5 polutan mentah (µg/m³) TANPA feature engineering,
# Gaussian noise injection 10%, split 75:25 stratified.
# ============================================================

import json
import os
from datetime import datetime, timezone

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, f1_score
from sklearn.model_selection import train_test_split

from .ispu import CATEGORIES, category_of, ispu_pm25, ispu_pm10, ispu_co
from .preprocess import load_to_df, remove_outliers_iqr
from .supabase_client import TABLE_GAS, fetch_rows, supabase_session, check_connection

MODEL_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "models")

RF_PARAMS = {"n_estimators": 500, "max_depth": 14, "min_samples_leaf": 2, "n_jobs": -1, "random_state": 42}
NOISE_STD = 0.10  # noise injection 10%


def _label(row):
    """Kategori ISPU per baris = ISPU tertinggi antar polutan utama (PM2.5, PM10, CO)."""
    ispu = max(
        ispu_pm25(row["pm25_ugm3"]),
        ispu_pm10(row["pm10_ugm3"]),
        ispu_co(row["co_ugm3"]),
    )
    return category_of(ispu)


def train(verbose=True):
    check_connection()
    sess = supabase_session()
    rows = fetch_rows(sess, TABLE_GAS)
    if len(rows) < 60 * 60:
        raise RuntimeError("Data belum cukup untuk training klasifikasi.")

    df = load_to_df(rows)
    df = remove_outliers_iqr(df)

    FEAT = ["pm25_ugm3", "pm10_ugm3", "co_ugm3", "no2_ugm3", "o3_ugm3"]
    df["label"] = df.apply(_label, axis=1)
    df = df.dropna(subset=FEAT + ["label"])

    X = df[FEAT].values
    y = df["label"].values

    X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.25, stratify=y, random_state=42)

    # --- noise injection 10% pada data LATIH (per laporan) ---
    X_tr_noise = X_tr * np.random.normal(1.0, NOISE_STD, X_tr.shape)

    model = RandomForestClassifier(**RF_PARAMS)
    model.fit(X_tr_noise, y_tr)

    # --- evaluasi pada test set yang juga diberi noise 10% (skenario sensor riel) ---
    X_te_noise = X_te * np.random.normal(1.0, NOISE_STD, X_te.shape)
    pred = model.predict(X_te_noise)
    acc = accuracy_score(y_te, pred)
    f1m = f1_score(y_te, pred, average="macro", labels=CATEGORIES)

    os.makedirs(MODEL_DIR, exist_ok=True)
    path = os.path.join(MODEL_DIR, "random_forest_ispu.joblib")
    joblib.dump({"model": model, "features": FEAT, "classes": CATEGORIES}, path)

    meta = {
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "n_train": len(X_tr),
        "n_test": len(X_te),
        "accuracy": round(acc, 4),
        "f1_macro": round(f1m, 4),
        "noise_injection_pct": int(NOISE_STD * 100),
    }
    with open(os.path.join(MODEL_DIR, "models_meta.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2, ensure_ascii=False)

    if verbose:
        print(f"[RandomForest] accuracy={acc:.4f}  f1_macro={f1m:.4f}  ({len(X_tr)} train rows)")
    return meta


if __name__ == "__main__":
    train()