# ============================================================
# AirSense - Forecast RNN ke Supabase (tb_forecast)
# ============================================================
# Melatih ulang model RNN terbaik per polutan (hasil
# tune_lstm -> outputs/lstm_tuning_best.csv), lalu menulis
# prediksi t+1..t+60 menit ke tabel tb_forecast.
#
# Metode prediksi iteratif:
# Model dilatih sebagai direct forecaster t+60. Untuk
# menghasilkan kurva t+1..t+60, jendela input digeser mundur
# satu menit per langkah; tiap langkah memakai data historis
# asli (bukan hasil prediksi) sehingga error tidak menumpuk.
#
# Pemakaian:
#   python -m src.run_forecast_rnn
#   python -m src.run_forecast_rnn --device cuda
#   python -m src.run_forecast_rnn --days 60 --steps 60
# ============================================================

import argparse
from datetime import datetime, timedelta, timezone

import numpy as np
import pandas as pd

from .compare_models import load_best_configs
from .ispu import category_of, ispu_value
from .model_lstm import (
    LSTMConfig,
    predict_lstm,
    train_lstm_for_target,
)
from .preprocess import (
    HORIZON_MINUTES,
    build_features,
    load_to_df,
)
from .supabase_client import (
    TABLE_FORECAST,
    fetch_rows,
    insert_rows,
    supabase_session,
)

# Polutan yang diramalkan (sesuai konfigurasi terbaik hasil tuning).
TARGETS = ["pm25_ugm3", "pm10_ugm3", "co_ugm3"]

BATCH_SIZE = 500


# ============================================================
# Muat data
# ============================================================

def load_data(days: int | None) -> pd.DataFrame:
    """Ambil data sensor dari Supabase (opsional dibatasi N hari)."""
    sess = supabase_session()
    rows = fetch_rows(
        sess,
        "tb_konsentrasi_gas",
        select="*",
        order="created_at.asc",
        limit=1000,
    )

    df = pd.DataFrame(rows)

    if days is not None and not df.empty:
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)
        df["created_at"] = pd.to_datetime(
            df["created_at"], utc=True
        )
        df = df[df["created_at"] >= cutoff].reset_index(drop=True)

    return df


# ============================================================
# Latih + prediksi satu polutan
# ============================================================

def forecast_target(
    raw_df: pd.DataFrame,
    target: str,
    config: LSTMConfig,
    steps: int,
    verbose: bool = True,
) -> list[float]:
    """
    Latih model RNN untuk satu polutan, lalu hasilkan prediksi
    t+1..t+steps menit dari titik data terakhir.

    Model direct t+60 dijalankan berulang pada jendela yang
    digeser mundur: prediksi untuk t+k memakai data historis
    hingga t+k-60. Untuk k < 60, jendela memakan data terbaru
    yang benar-benar ada; untuk k > 60... tidak terjadi karena
    steps <= 60 dan horizon = 60.
    """
    df = load_to_df(raw_df.to_dict(orient="records"))

    # Fitur TRAINING: memuat target t+60 sehingga 60 baris
    # terakhir terbuang (tidak punya nilai masa depan).
    df_train, feature_columns = build_features(
        df,
        horizon_minutes=HORIZON_MINUTES,
        include_targets=True,
    )

    # Fitur INFERENSI: tanpa target, baris terakhir tetap
    # tersedia sehingga jendela bisa berakhir di data terbaru.
    df_inf, _ = build_features(
        df,
        horizon_minutes=HORIZON_MINUTES,
        include_targets=False,
    )

    target_column = f"{target}_target_t{HORIZON_MINUTES}"

    n = len(df_train)
    if n < 100:
        raise RuntimeError(
            f"Data terlalu pendek untuk {target}: {n} baris."
        )

    train_end = int(n * 0.70)
    val_end = int(n * 0.85)
    train_df = df_train.iloc[:train_end]
    val_df = df_train.iloc[train_end:val_end]

    bundle = train_lstm_for_target(
        train_df,
        val_df,
        feature_columns,
        target_column,
        target,
        config=config,
        verbose=verbose,
    )

    # --------------------------------------------------------
    # Prediksi direct t+60 dengan jendela bergeser.
    #
    # Model memprediksi nilai 60 menit setelah akhir jendela.
    # Untuk langkah k (t_last + k), jendela harus berakhir di
    # t_last + k - 60. Jendela dikirim dengan panjang
    # window + 1 baris karena _build_sequences menuntut lebih
    # dari `window` baris; prediksi terakhir dipakai.
    # --------------------------------------------------------

    inf_array = df_inf[feature_columns].to_numpy(
        dtype=np.float64
    )

    n_inf = len(inf_array)
    window = config.window
    predictions: list[float] = []

    for k in range(1, steps + 1):
        end_idx = n_inf - (HORIZON_MINUTES - k)
        if end_idx > n_inf:
            end_idx = n_inf
        if end_idx < window + 1:
            break

        segment = inf_array[end_idx - window - 1:end_idx]
        segment_df = pd.DataFrame(
            segment,
            columns=feature_columns,
        )

        pred = predict_lstm(bundle, segment_df)
        if len(pred) == 0:
            break

        predictions.append(float(pred[-1]))

    return predictions


# ============================================================
# Susun baris untuk tb_forecast
# ============================================================

def build_forecast_rows(
    target: str,
    preds: list[float],
    last_time: pd.Timestamp,
    generated_at: datetime,
) -> list[dict]:
    """
    Susun baris tb_forecast untuk satu polutan.

    Skema kolom tabel: pm25_ugm3_pred & pm25_ispu_pred —
    kolom ISPU tidak mengulang satuan _ugm3.
    """
    pred_col = f"{target}_pred"
    ispu_col = f"{target.replace('_ugm3', '')}_ispu_pred"

    rows = []
    for k, value in enumerate(preds, start=1):
        forecast_at = last_time + timedelta(minutes=k)
        rows.append(
            {
                "forecast_at": forecast_at.isoformat(),
                pred_col: round(float(value), 3),
                ispu_col: round(
                    ispu_value(target, value) or 0.0, 2
                ),
                "generated_at": generated_at.isoformat(),
            }
        )
    return rows


def merge_rows(per_target_rows: dict[str, list[dict]]) -> list[dict]:
    """
    Gabungkan baris per polutan menjadi baris gabungan per
    forecast_at (satu baris memuat prediksi semua polutan).
    """
    merged: dict[str, dict] = {}

    for target, rows in per_target_rows.items():
        for r in rows:
            key = r["forecast_at"]
            if key not in merged:
                merged[key] = {
                    "forecast_at": key,
                    "generated_at": r["generated_at"],
                }
            for field, val in r.items():
                if field in ("forecast_at", "generated_at"):
                    continue
                merged[key][field] = val

    # Kategori ISPU total dari polutan yang tersedia.
    ispu_fields = [
        f"{t.replace('_ugm3', '')}_ispu_pred" for t in TARGETS
    ]

    out = []
    for key in sorted(merged):
        row = merged[key]
        ispu_vals = [
            row.get(f)
            for f in ispu_fields
            if row.get(f) is not None
        ]
        row["category"] = (
            category_of(max(ispu_vals))
            if ispu_vals
            else None
        )
        out.append(row)

    return out


# ============================================================
# Tulis ke Supabase
# ============================================================

def write_forecast(rows: list[dict]) -> int:
    """Tulis baris forecast ke tb_forecast (batch)."""
    sess = supabase_session()
    written = 0

    for i in range(0, len(rows), BATCH_SIZE):
        batch = rows[i:i + BATCH_SIZE]
        insert_rows(sess, TABLE_FORECAST, batch)
        written += len(batch)

    return written


# ============================================================
# CLI
# ============================================================

def parse_args():
    parser = argparse.ArgumentParser(
        description="Tulis prediksi RNN ke tb_forecast."
    )
    parser.add_argument(
        "--device",
        type=str,
        default="cpu",
        help="cpu / cuda (default: cpu).",
    )
    parser.add_argument(
        "--days",
        type=int,
        default=None,
        help="Batasi data ke N hari terakhir (default: semua).",
    )
    parser.add_argument(
        "--steps",
        type=int,
        default=60,
        help="Jumlah langkah prediksi dalam menit (default 60).",
    )
    parser.add_argument(
        "--epochs",
        type=int,
        default=80,
        help="Maksimum epoch training (early stop tetap aktif).",
    )
    return parser.parse_args()


def main():
    args = parse_args()

    print("Memuat konfigurasi terbaik hasil tuning...")
    configs = load_best_configs(device=args.device)

    print("Mengambil data dari Supabase...")
    raw_df = load_data(args.days)
    if raw_df.empty:
        raise RuntimeError("Tidak ada data sensor di Supabase.")
    print(f"Total baris: {len(raw_df)}")

    generated_at = datetime.now(timezone.utc)

    per_target_rows: dict[str, list[dict]] = {}

    for target in TARGETS:
        if target not in configs:
            print(
                f"  [{target}] dilewati — tidak ada konfigurasi "
                "terbaik (jalankan tune_lstm dulu)."
            )
            continue

        config = configs[target]
        config = LSTMConfig(
            arch=config.arch,
            window=config.window,
            hidden_size=config.hidden_size,
            num_layers=config.num_layers,
            dropout=config.dropout,
            epochs=args.epochs,
            device=args.device,
        )

        print(
            f"\n[{target}] training "
            f"({config.arch}, w={config.window}, "
            f"h={config.hidden_size}, L={config.num_layers})..."
        )

        preds = forecast_target(
            raw_df,
            target,
            config,
            steps=args.steps,
        )

        if not preds:
            print(f"  [{target}] tidak menghasilkan prediksi.")
            continue

        print(
            f"  [{target}] {len(preds)} langkah, "
            f"contoh t+1={preds[0]:.2f}, "
            f"t+{len(preds)}={preds[-1]:.2f}"
        )

        # Waktu terakhir data mentah sebagai anchor forecast.
        last_time = pd.to_datetime(
            raw_df["created_at"].iloc[-1]
        )
        if last_time.tzinfo is None:
            last_time = last_time.tz_localize("UTC")

        per_target_rows[target] = build_forecast_rows(
            target,
            preds,
            last_time,
            generated_at,
        )

    if not per_target_rows:
        raise RuntimeError(
            "Tidak ada polutan yang berhasil diprediksi."
        )

    rows = merge_rows(per_target_rows)

    print(f"\nMenulis {len(rows)} baris ke {TABLE_FORECAST}...")
    written = write_forecast(rows)
    print(f"Selesai. {written} baris ditulis.")
    print(f"generated_at: {generated_at.isoformat()}")


if __name__ == "__main__":
    main()
