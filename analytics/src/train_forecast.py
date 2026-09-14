# ============================================================
# AirSense - Training Model Forecast (XGBoost)
# Per laporan: target PM2.5/PM10/CO terpisah, horizon 60 menit,
# n_estimators=300, max_depth=6, learning_rate=0.05,
# subsample=0.8, colsample_bytree=0.8, reg_alpha=0.1, reg_lambda=1.0
# Metrik evaluasi: MAE, RMSE, MAPE
# ============================================================

import json
import os
from datetime import datetime, timezone

import joblib
import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.metrics import mean_absolute_error, mean_squared_error, mean_absolute_percentage_error
from sklearn.model_selection import train_test_split

from .preprocess import TARGETS, build_features, load_to_df, remove_outliers_iqr
from .supabase_client import TABLE_GAS, fetch_rows, supabase_session, check_connection

MODEL_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "models")

XGB_PARAMS = {
    "objective": "reg:squarederror",
    "n_estimators": 300,
    "max_depth": 6,
    "learning_rate": 0.05,
    "subsample": 0.8,
    "colsample_bytree": 0.8,
    "reg_alpha": 0.1,
    "reg_lambda": 1.0,
    "random_state": 42,
}


def train(verbose=True):
    """Ambil data dari Supabase -> train 3 model XGB -> simpan .joblib + .json log."""
    check_connection()
    sess = supabase_session()
    rows = fetch_rows(sess, TABLE_GAS)
    if len(rows) < 60 * 60:
        raise RuntimeError(
            f"Data belum cukup ({len(rows)} baris). Minimal ±2 hari (>2880 baris) untuk training."
        )

    df = load_to_df(rows)
    df = remove_outliers_iqr(df)
    df_feat, feat_cols = build_features(df)

    os.makedirs(MODEL_DIR, exist_ok=True)
    summary = {"n_rows": len(df_feat), "trained_at": datetime.now(timezone.utc).isoformat(), "models": {}}

    for t in TARGETS:
        y = df_feat[f"y_{t}"]
        X = df_feat[feat_cols]
        X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.2, shuffle=False)

        model = xgb.XGBRegressor(**XGB_PARAMS)
        model.fit(X_tr, y_tr, verbose=False)

        pred = model.predict(X_te)
        mae = mean_absolute_error(y_te, pred)
        rmse = np.sqrt(mean_squared_error(y_te, pred))
        mape = mean_absolute_percentage_error(y_te, pred) * 100

        path = os.path.join(MODEL_DIR, f"xgboost_{t}.joblib")
        joblib.dump({"model": model, "features": feat_cols}, path)

        summary["models"][t] = {"mae": round(mae, 3), "rmse": round(rmse, 3), "mape_pct": round(mape, 3)}
        if verbose:
            print(f"[XGBoost] target={t:10s} MAE={mae:.3f} RMSE={rmse:.3f} MAPE={mape:.2f}% -> {os.path.basename(path)}")

    meta_path = os.path.join(MODEL_DIR, "models_meta.json")
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)
    if verbose:
        print(f"\nRingkasan: {summary['n_rows']} baris training -> {meta_path}")
    return summary


if __name__ == "__main__":
    train()