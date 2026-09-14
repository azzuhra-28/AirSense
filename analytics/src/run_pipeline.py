# ============================================================
# AirSense - Pipeline Inferensi (hilang satunya, jalanin ini)
# ============================================================
# 1. Ambil data terbaru dari tb_konsentrasi_gas
# 2. XGBoost -> forecast 60 menit (3 polutan) -> tb_forecast
# 3. Random Forest -> klasifikasi kategori ISPU kondisi terkini
# 4. Logika alert (ISPU tinggi / anomali / device offline) -> tb_alert
#
# Jalankan manual:  python -m src.run_pipeline
# (atau otomatis tiap jam via GitHub Actions, lihat .github/workflows)
# ============================================================

import json
import os
from datetime import datetime, timedelta, timezone

import joblib
import numpy as np
import pandas as pd

from .ispu import category_of, ispu_co, ispu_pm10, ispu_pm25
from .preprocess import HORIZON_MINUTES, TARGETS, load_to_df
from .supabase_client import (
    SUPABASE_URL,
    TABLE_ALERT,
    TABLE_FORECAST,
    TABLE_GAS,
    fetch_rows,
    insert_rows,
    supabase_session,
    check_connection,
)

MODEL_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "models")

# Ambang alert
ALERT_ISPU_LEVEL = 100           # bunyi alert kalau ISPU total > "Sedang" (>= Tidak Sehat)
DEVICE_OFFLINE_MINUTES = 3       # device dianggap offline kalau > 3 menit tidak kirim


def load_models():
    f_models, meta = {}, {}
    f_meta = os.path.join(MODEL_DIR, "models_meta.json")
    for t in TARGETS:
        p = os.path.join(MODEL_DIR, f"xgboost_{t}.joblib")
        f_models[t] = joblib.load(p)
    cls_p = os.path.join(MODEL_DIR, "random_forest_ispu.joblib")
    clf = joblib.load(cls_p)
    if os.path.exists(f_meta):
        meta = json.load(open(f_meta, encoding="utf-8"))
    return f_models, clf, meta


def rolling_predict(f_models, last_row, n_steps=HORIZON_MINUTES):
    """Forecast 60 menit ke depan secara rekursif (1 baris per menit).
    Base waktu = SEKARANG (jan: device offline basi, prediksi tetap untuk
    menit mendatang). Nilai state awal = data sensor terakhir yang terbaca."""
    feat_cols = f_models[TARGETS[0]]["features"]
    state = dict(last_row)
    base_ts = datetime.now(timezone.utc)
    out = []

    for i in range(1, n_steps + 1):
        ts = base_ts + timedelta(minutes=i)
        # lag 1 = nilai state terakhir (yang baru diprediksi / terbaca)
        feats = {
            f"{p}_lag1": state[p] for p in ["pm25_ugm3", "pm10_ugm3", "co_ugm3", "no2_ugm3", "o3_ugm3"]
        }
        feats.update(
            {
                "temperature": state.get("temperature") or last_row.get("temperature"),
                "humidity": state.get("humidity") or last_row.get("humidity"),
                "hour": ts.hour,
                "weekday": ts.weekday(),
            }
        )
        X = np.array([[feats[c] for c in feat_cols]])

        pred = {}
        for t in TARGETS:
            pred[t] = float(f_models[t]["model"].predict(X)[0])

        # update state jadi nilai prediksi (recursive multi-step forecast)
        state["pm25_ugm3"], state["pm10_ugm3"], state["co_ugm3"] = pred["pm25_ugm3"], pred["pm10_ugm3"], pred["co_ugm3"]

        out.append({"forecast_at": ts.isoformat(), **pred})
    return out


def to_ispu(pred_row: dict) -> dict:
    pm25 = max(0.0, pred_row["pm25_ugm3"])
    pm10 = max(0.0, pred_row["pm10_ugm3"])
    co = max(0.0, pred_row["co_ugm3"])
    return {
        "pm25_ispu_pred": ispu_pm25(pm25),
        "pm10_ispu_pred": ispu_pm10(pm10),
        "co_ispu_pred": ispu_co(co),
    }


def check_device_offline(rows) -> dict | None:
    if not rows:
        return {"alert_type": "DEVICE_OFFLINE", "severity": "HIGH", "payload": None,
                "message": "Tidak ada data sensor sama sekali."}
    last = pd.to_datetime(rows[-1]["created_at"], utc=True)
    if datetime.now(timezone.utc) - last > timedelta(minutes=DEVICE_OFFLINE_MINUTES):
        mins = int((datetime.now(timezone.utc) - last).total_seconds() // 60)
        return {"alert_type": "DEVICE_OFFLINE", "severity": "HIGH", "payload": None,
                "message": f"Device tidak mengirim data selama ±{mins} menit (terakhir {last.isoformat()})."}
    return None


def build_alerts(rows, latest_forecast_info, clf_out) -> list[dict]:
    alerts = []

    # 1. ISPU tinggi (kondisi terkini)
    latest = rows[-1]
    ispu = max(ispu_pm25(latest["pm25_ugm3"]), ispu_pm10(latest["pm10_ugm3"]), ispu_co(latest["co_ugm3"]))
    cat = category_of(ispu)
    payload = {"ispu_total": round(ispu, 2), "category": cat}
    if ispu > ALERT_ISPU_LEVEL:
        alerts.append({
            "alert_type": "ISPU_HIGH", "severity": "HIGH" if ispu > 200 else "MEDIUM",
            "message": f"ISPU saat ini {ispu:.0f} ({cat}). Waspada bagi kelompok sensitif.",
            "payload": payload,
        })

    # 2. Anomali: lonjakan PM2.5 vs baseline 24 jam (mean + 3*std)
    hist24 = pd.Series([r["pm25_ugm3"] for r in rows[-1440:]]).dropna()
    if len(hist24) > 30:
        mean, std = hist24.mean(), hist24.std()
        if std > 0 and latest["pm25_ugm3"] > mean + 3 * std:
            alerts.append({
                "alert_type": "ANOMALY", "severity": "MEDIUM",
                "message": f"Lonjakan PM2.5 ({latest['pm25_ugm3']:.1f} µg/m³) di atas baseline 24 jam.",
                "payload": {"value": latest["pm25_ugm3"], "mean": round(mean, 2), "std3": round(3 * std, 2)},
            })

    # 3. Kategori prediksi memburuk (dari akhir series forecast)
    if latest_forecast_info["ispu_total"] > ALERT_ISPU_LEVEL:
        alerts.append({
            "alert_type": "ISPU_HIGH", "severity": "LOW",
            "message": f"Prediksi 60 menit: ISPU {latest_forecast_info['ispu_total']:.0f} ({latest_forecast_info['category']}).",
            "payload": {"forecast": True, **latest_forecast_info},
        })

    # log hasil klasifikasi RF (kondisi terkini)
    alerts.append({
        "alert_type": "CLASSIFICATION", "severity": "LOW",
        "message": f"Kategori ISPU model: {clf_out['category']} (conf {clf_out['confidence']:.0%}).",
        "payload": clf_out,
    })
    return alerts


def validate_schema():
    """Cek tabel tb_forecast & tb_alert ada (kalau 404, jalankan migrasi SQL)."""
    s = supabase_session()
    for t in [TABLE_FORECAST, TABLE_ALERT]:
        r = s.get(
            f"{SUPABASE_URL}/rest/v1/{t}",
            params={"select": "id", "limit": 1},
            timeout=30,
        )
        if r.status_code == 404:
            raise RuntimeError(
                f"Tabel {t} tidak ada. Jalankan database/migrasi_forecast_alert.sql di Supabase SQL Editor."
            )


def run(verbose=True):
    check_connection()
    validate_schema()
    sess = supabase_session()

    rows = fetch_rows(sess, TABLE_GAS)
    if len(rows) < 60:
        raise RuntimeError(f"Data terlalu sedikit ({len(rows)} baris). Import dummy dulu / tunggu ESP32 mengirim.")

    df = load_to_df(rows)
    latest_row = df.iloc[-1].to_dict()

    # --- forecast ---
    f_models, clf, meta = load_models()
    forecast = rolling_predict(f_models, latest_row)
    forecast_rows = []
    for f in forecast:
        ispu = to_ispu(f)
        total = max(ispu["pm25_ispu_pred"], ispu["pm10_ispu_pred"], ispu["co_ispu_pred"])
        forecast_rows.append(
            {
                "forecast_at": f["forecast_at"],
                "pm25_ugm3_pred": round(f["pm25_ugm3"], 3),
                "pm10_ugm3_pred": round(f["pm10_ugm3"], 3),
                "co_ugm3_pred": round(f["co_ugm3"], 3),
                **{k: round(v, 3) for k, v in ispu.items()},
                "category": category_of(total),
            }
        )
    if verbose:
        print(f"[forecast] {len(forecast_rows)} titik (t+1..t+60) -> {TABLE_FORECAST}")
    insert_rows(sess, TABLE_FORECAST, forecast_rows)

    # --- klasifikasi kondisi terkini ---
    feats = [[
        latest_row["pm25_ugm3"], latest_row["pm10_ugm3"],
        latest_row["co_ugm3"], latest_row["no2_ugm3"], latest_row["o3_ugm3"],
    ]]
    proba = clf["model"].predict_proba(np.array(feats))[0]
    idx = int(np.argmax(proba))
    clf_out = {
        "category": clf["classes"][idx],
        "confidence": round(float(proba[idx]), 4),
        "probabilities": {c: round(float(p), 4) for c, p in zip(clf["classes"], proba)},
    }
    if verbose:
        print(f"[klasifikasi] {clf_out['category']} (conf {clf_out['confidence']:.0%})")

    # --- alert ---
    offline = check_device_offline(rows)
    last_total = max(
        ispu_pm25(latest_row["pm25_ugm3"]),
        ispu_pm10(latest_row["pm10_ugm3"]),
        ispu_co(latest_row["co_ugm3"]),
    )
    latest_forecast_info = {"ispu_total": last_total, "category": category_of(last_total)}
    alerts = build_alerts(rows, latest_forecast_info, clf_out)
    if offline:
        alerts.insert(0, offline)
    if alerts:
        insert_rows(sess, TABLE_ALERT, alerts)
    if verbose:
        print(f"[alert] {len(alerts)} entry -> {TABLE_ALERT}")

    print("\nPipeline selesai [OK]")


if __name__ == "__main__":
    run()