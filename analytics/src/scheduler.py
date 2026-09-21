# ============================================================
# AirSense - Scheduler Operasional
# ============================================================
# Loop ringan yang menjalankan tugas operasional berkala:
#
# 1. DEVICE_OFFLINE - alat tidak mengirim data > 10 menit
# 2. ISPU_HIGH      - ISPU 24 jam masuk kategori tidak sehat
# 3. FORECAST_HIGH  - indikator prediksi RNN melewati ambang
# 4. Re-forecast    - perbarui tb_forecast saat alat online
#
# Semua alert ditulis ke tb_alert dengan deduplikasi waktu
# agar tidak ada spam notifikasi.
#
# Pemakaian:
#   python -m src.scheduler --once              # satu siklus
#   python -m src.scheduler --loop 5            # tiap 5 menit
#   python -m src.scheduler --loop 5 --reforecast 30
# ============================================================

import argparse
import time
from datetime import datetime, timedelta, timezone

import pandas as pd

from .ispu import category_of, ispu_value
from .run_forecast_rnn import (
    forecast_target,
    build_forecast_rows,
    merge_rows,
    load_data,
    TARGETS,
)
from .supabase_client import (
    SUPABASE_URL,
    TABLE_ALERT,
    TABLE_FORECAST,
    fetch_rows,
    insert_rows,
    supabase_session,
)

# ============================================================
# Konfigurasi ambang
# ============================================================

OFFLINE_MINUTES = 10
DELAYED_MINUTES = 3

ISPU_ALERT_CATEGORIES = {
    "Tidak Sehat",
    "Sangat Tidak Sehat",
    "Berbahaya",
}

FORECAST_ALERT_THRESHOLD = 100

# Jeda minimum antar alert sejenis (anti-spam).
OFFLINE_ALERT_COOLDOWN_H = 6
ISPU_ALERT_COOLDOWN_H = 3
FORECAST_ALERT_COOLDOWN_H = 3

POLLUTANTS = ["pm25_ugm3", "pm10_ugm3", "co_ugm3"]
ISPU_COLS = {
    "pm25_ugm3": "pm25_ispu_pred",
    "pm10_ugm3": "pm10_ispu_pred",
    "co_ugm3": "co_ispu_pred",
}


# ============================================================
# Util waktu & dedup alert
# ============================================================

def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def parse_ts(value) -> datetime | None:
    ts = pd.to_datetime(value, utc=True, errors="coerce")
    if pd.isna(ts):
        return None
    return ts.to_pydatetime()


def recent_alerts(
    sess,
    alert_type: str,
    hours: float,
) -> list[dict]:
    """Ambil alert sejenis dalam N jam terakhir (server-side filter)."""
    since = (utcnow() - timedelta(hours=hours)).isoformat()

    url = f"{SUPABASE_URL}/rest/v1/{TABLE_ALERT}"
    r = sess.get(
        url,
        params={
            "select": "id,created_at",
            "alert_type": f"eq.{alert_type}",
            "created_at": f"gte.{since}",
            "order": "created_at.desc",
            "limit": 1,
        },
        timeout=30,
    )
    r.raise_for_status()
    return r.json()


def should_alert(
    sess,
    alert_type: str,
    cooldown_hours: float,
) -> bool:
    """True bila tidak ada alert sejenis dalam periode cooldown."""
    return len(recent_alerts(sess, alert_type, cooldown_hours)) == 0


# ============================================================
# Tugas 1 - Deteksi alat mati
# ============================================================

def check_device(sess, latest_row: dict | None) -> str:
    """
    Evaluasi status alat dan tulis alert bila offline.
    Return: status ('online' | 'delayed' | 'offline').
    """
    if latest_row is None:
        status = "offline"
    else:
        last = parse_ts(latest_row.get("created_at"))
        if last is None:
            status = "offline"
        else:
            age_min = (utcnow() - last).total_seconds() / 60
            if age_min < DELAYED_MINUTES:
                status = "online"
            elif age_min < OFFLINE_MINUTES:
                status = "delayed"
            else:
                status = "offline"

    if status == "offline" and should_alert(
        sess, "DEVICE_OFFLINE", OFFLINE_ALERT_COOLDOWN_H
    ):
        insert_rows(
            sess,
            TABLE_ALERT,
            [
                {
                    "alert_type": "DEVICE_OFFLINE",
                    "severity": "HIGH",
                    "message": (
                        "Alat tidak mengirim data lebih dari "
                        f"{OFFLINE_MINUTES} menit. Periksa daya, "
                        "konektivitas, atau firmware perangkat."
                    ),
                    "payload": {
                        "last_seen": (
                            latest_row.get("created_at")
                            if latest_row
                            else None
                        )
                    },
                }
            ],
        )
        print("  [alert] DEVICE_OFFLINE ditulis.")

    return status


# ============================================================
# Tugas 2 - ISPU 24 jam
# ============================================================

def compute_ispu_24h(sensor_df: pd.DataFrame) -> dict | None:
    """
    ISPU resmi memakai konsentrasi rata-rata 24 jam.
    Data diasumsikan kadensi 1 menit (1440 observasi).
    """
    if sensor_df.empty:
        return None

    window = min(1440, len(sensor_df))
    result = {}

    for pollutant in POLLUTANTS:
        mean_24h = sensor_df[pollutant].tail(window).mean()
        if pd.isna(mean_24h):
            continue
        result[pollutant] = {
            "concentration": float(mean_24h),
            "ispu": ispu_value(pollutant, mean_24h) or 0.0,
        }

    if not result:
        return None

    dominant = max(result, key=lambda k: result[k]["ispu"])
    total = result[dominant]["ispu"]

    return {
        "total": round(total, 1),
        "category": category_of(total),
        "dominant": dominant,
        "per_pollutant": result,
    }


def check_ispu(sess, ispu_info: dict | None):
    """Tulis alert bila ISPU masuk kategori tidak sehat."""
    if ispu_info is None:
        return

    if ispu_info["category"] not in ISPU_ALERT_CATEGORIES:
        return

    if not should_alert(
        sess, "ISPU_HIGH", ISPU_ALERT_COOLDOWN_H
    ):
        return

    insert_rows(
        sess,
        TABLE_ALERT,
        [
            {
                "alert_type": "ISPU_HIGH",
                "severity": "HIGH",
                "message": (
                    "Kualitas udara 24 jam berada pada kategori "
                    f"{ispu_info['category']} "
                    f"(ISPU {ispu_info['total']}, dominan "
                    f"{ispu_info['dominant']})."
                ),
                "payload": {
                    "ispu": ispu_info["total"],
                    "category": ispu_info["category"],
                    "dominant_pollutant": ispu_info["dominant"],
                },
            }
        ],
    )
    print("  [alert] ISPU_HIGH ditulis.")


# ============================================================
# Tugas 3 - Indikator forecast dari tb_forecast (RNN)
# ============================================================

def latest_forecast_rows(sess) -> list[dict]:
    """Ambil grup forecast terbaru berdasarkan generated_at."""
    gen = fetch_rows(
        sess,
        TABLE_FORECAST,
        select="generated_at",
        order="generated_at.desc",
        limit=1,
    )
    if not gen:
        return []

    rows = fetch_rows(
        sess,
        TABLE_FORECAST,
        select="*",
        order="forecast_at.asc",
        limit=1000,
    )
    latest_gen = gen[0]["generated_at"]
    return [
        r for r in rows if r.get("generated_at") == latest_gen
    ]


def check_forecast(sess, fc_rows: list[dict]):
    """Tulis alert bila puncak ISPU prediksi melewati ambang."""
    if not fc_rows:
        return

    ispu_vals = [
        r[col]
        for r in fc_rows
        for col in ISPU_COLS.values()
        if r.get(col) is not None
    ]
    if not ispu_vals:
        return

    peak = max(ispu_vals)
    if peak <= FORECAST_ALERT_THRESHOLD:
        return

    if not should_alert(
        sess, "FORECAST_HIGH", FORECAST_ALERT_COOLDOWN_H
    ):
        return

    insert_rows(
        sess,
        TABLE_ALERT,
        [
            {
                "alert_type": "FORECAST_HIGH",
                "severity": "MEDIUM",
                "message": (
                    "Indikator prediksi RNN menunjukkan puncak "
                    f"ISPU {peak:.0f} dalam 60 menit ke depan."
                ),
                "payload": {"peak_ispu": round(peak, 1)},
            }
        ],
    )
    print("  [alert] FORECAST_HIGH ditulis.")


# ============================================================
# Tugas 4 - Re-forecast saat data basi
# ============================================================

def is_forecast_stale(sess, max_age_min: int) -> bool:
    gen = fetch_rows(
        sess,
        TABLE_FORECAST,
        select="generated_at",
        order="generated_at.desc",
        limit=1,
    )
    if not gen:
        return True
    ts = parse_ts(gen[0]["generated_at"])
    if ts is None:
        return True
    age_min = (utcnow() - ts).total_seconds() / 60
    return age_min > max_age_min


def run_reforecast(device_status: str, steps: int) -> int:
    """Jalankan forecast RNN penuh; return jumlah langkah."""
    if device_status != "online":
        print("  [forecast] dilewati — alat tidak online.")
        return 0

    print("  [forecast] menjalankan RNN forecast...")
    raw_df = load_data(None)
    if raw_df.empty:
        print("  [forecast] tidak ada data.")
        return 0

    from .compare_models import load_best_configs
    from .model_lstm import LSTMConfig

    configs = load_best_configs(device="cpu")
    generated_at = utcnow()
    last_time = pd.to_datetime(raw_df["created_at"].iloc[-1])
    if last_time.tzinfo is None:
        last_time = last_time.tz_localize("UTC")

    per_target: dict[str, list[dict]] = {}

    for target in TARGETS:
        if target not in configs:
            continue

        cfg = configs[target]
        config = LSTMConfig(
            arch=cfg.arch,
            window=cfg.window,
            hidden_size=cfg.hidden_size,
            num_layers=cfg.num_layers,
            dropout=cfg.dropout,
            device="cpu",
        )

        preds = forecast_target(raw_df, target, config, steps=steps)
        if not preds:
            continue

        per_target[target] = build_forecast_rows(
            target, preds, last_time, generated_at
        )

    if not per_target:
        print("  [forecast] tidak menghasilkan prediksi.")
        return 0

    rows = merge_rows(per_target)
    sess = supabase_session()
    written = 0
    for i in range(0, len(rows), 500):
        insert_rows(sess, TABLE_FORECAST, rows[i:i + 500])
        written += len(rows[i:i + 500])

    print(f"  [forecast] {written} baris ditulis.")
    return written


# ============================================================
# Satu siklus
# ============================================================

def run_cycle(reforecast_minutes: int | None, steps: int):
    print(f"\n=== siklus {utcnow().isoformat()} ===")
    sess = supabase_session()

    rows = fetch_rows(
        sess,
        "tb_konsentrasi_gas",
        select="*",
        order="created_at.desc",
        limit=1440,
    )
    latest_row = rows[0] if rows else None

    sensor_df = pd.DataFrame(rows)
    if not sensor_df.empty:
        sensor_df["created_at"] = pd.to_datetime(
            sensor_df["created_at"], utc=True, format="mixed"
        )
        for p in POLLUTANTS:
            sensor_df[p] = pd.to_numeric(
                sensor_df[p], errors="coerce"
            )
        sensor_df = sensor_df.sort_values("created_at")

    # 1. Device monitoring
    status = check_device(sess, latest_row)
    print(f"  device: {status}")

    # 2. ISPU 24 jam
    ispu_info = compute_ispu_24h(sensor_df)
    if ispu_info:
        print(
            f"  ISPU 24 jam: {ispu_info['total']} "
            f"({ispu_info['category']})"
        )
    check_ispu(sess, ispu_info)

    # 3. Forecast indicator
    fc_rows = latest_forecast_rows(sess)
    check_forecast(sess, fc_rows)

    # 4. Re-forecast bila diminta dan data basi
    if reforecast_minutes is not None:
        if is_forecast_stale(sess, reforecast_minutes):
            run_reforecast(status, steps)
        else:
            print("  [forecast] masih segar — dilewati.")


# ============================================================
# CLI
# ============================================================

def parse_args():
    parser = argparse.ArgumentParser(
        description="Scheduler operasional AirSense."
    )
    parser.add_argument(
        "--once",
        action="store_true",
        help="Jalankan satu siklus lalu keluar.",
    )
    parser.add_argument(
        "--loop",
        type=int,
        default=None,
        metavar="MENIT",
        help="Ulangi siklus setiap N menit.",
    )
    parser.add_argument(
        "--reforecast",
        type=int,
        default=None,
        metavar="MENIT",
        help="Jalankan ulang RNN forecast bila forecast basi "
        "lebih dari N menit (butuh device online).",
    )
    parser.add_argument(
        "--steps",
        type=int,
        default=60,
        help="Jumlah langkah prediksi (default 60).",
    )
    return parser.parse_args()


def main():
    args = parse_args()

    if args.once:
        run_cycle(args.reforecast, args.steps)
        return

    if not args.loop:
        print(
            "Tentukan --once atau --loop N. "
            "Contoh: python -m src.scheduler --loop 5"
        )
        return

    print(
        f"Scheduler berjalan tiap {args.loop} menit. "
        "Ctrl+C untuk berhenti."
    )

    while True:
        try:
            run_cycle(args.reforecast, args.steps)
        except Exception as exc:  # noqa: BLE001
            print(f"  siklus gagal: {exc}")

        time.sleep(args.loop * 60)


if __name__ == "__main__":
    main()
