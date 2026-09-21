# ============================================================
# AirSense - Perbandingan Model Forecasting
#
# Membandingkan pendekatan tree-based (XGBoost) dengan
# pendekatan deep learning (LSTM) pada data dan test set yang
# SAMA, sehingga hasilnya apple-to-apple.
#
# Tujuan:
# - menjawab pertanyaan "apa pembeda pemilihan model kami
#   dibandingkan baseline XGBoost"
# - menghasilkan tabel metrik (MAE, RMSE, MAPE) untuk laporan
#
# Cara pakai:
#   python -m src.compare_models
#   python -m src.compare_models --targets pm25_ugm3 pm10_ugm3 co_ugm3
# ============================================================

import argparse
import json
import os
from dataclasses import replace
from datetime import datetime, timezone

# PENTING (Windows): torch dan xgboost masing-masing memuat OpenMP.
# Tanpa flag ini, proses dapat crash saat shutdown
# (0xC0000409). Harus diset SEBELUM import torch/xgboost.
os.environ.setdefault("KMP_DUPLICATE_LIB_OK", "TRUE")

import numpy as np
import pandas as pd

# PENTING: torch harus di-import SEBELUM xgboost.
# Di Windows, meng-import xgboost terlebih dahulu memuat OpenMP
# yang bentrok dengan DLL torch (c10.dll), menyebabkan error
# "DLL initialization routine failed".
import torch  # noqa: F401  (urutan import penting)

from .preprocess import (
    HORIZON_MINUTES,
    MIN_ROWS_FOR_TRAIN,
    TARGETS,
    build_features,
    load_to_df,
)

from .supabase_client import (
    TABLE_GAS,
    check_connection,
    fetch_rows,
    supabase_session,
)

from .model_lstm import (
    LSTMConfig,
    evaluate,
    predict_lstm,
    train_lstm_for_target,
)

from .train_forecast import (
    XGB_CONFIGS,
    build_xgb,
    chronological_split,
)


OUTPUT_DIR = os.path.join(
    os.path.dirname(
        os.path.dirname(
            os.path.abspath(__file__)
        )
    ),
    "outputs",
)


# ============================================================
# Data Loading
# ============================================================

def load_dataframe_from_supabase(days: int | None = None):
    check_connection()
    session = supabase_session()
    rows = fetch_rows(session, TABLE_GAS)

    if not rows:
        raise RuntimeError("Tidak ada data sensor di Supabase.")

    df = pd.DataFrame(rows)

    if days is not None and not df.empty:
        df["created_at"] = pd.to_datetime(
            df["created_at"], utc=True, errors="coerce"
        )
        latest = df["created_at"].max()
        cutoff = latest - pd.Timedelta(days=days)
        df = df.loc[df["created_at"] >= cutoff]

    return df


# ============================================================
# XGBoost Baseline (metode baseline pembanding)
# ============================================================

def train_xgb_baseline(
    train_df,
    val_df,
    feature_columns,
    target_column,
    verbose=True,
):
    """
    Latih XGBoost terbaik (dipilih via validation MAE) lalu
    latih ulang pada train+val. Mengembalikan model & metrik.
    """

    X_train = train_df[feature_columns]
    y_train = train_df[target_column]
    X_val = val_df[feature_columns]
    y_val = val_df[target_column]

    best_config = None
    best_mae = np.inf
    best_model = None

    for config in XGB_CONFIGS:
        model = build_xgb(config)
        model.fit(X_train, y_train, verbose=False)
        metrics = evaluate(y_val, model.predict(X_val))

        if metrics["mae"] < best_mae:
            best_mae = metrics["mae"]
            best_config = config.copy()
            best_model = model

    return best_model, best_config


# ============================================================
# Best (Tuned) Configuration Loader
# ============================================================

BEST_CONFIG_PATH = os.path.join(
    OUTPUT_DIR,
    "lstm_tuning_best.csv",
)


def load_best_configs(device="cpu"):
    """
    Baca konfigurasi RNN terbaik per polutan hasil tuning
    (outputs/lstm_tuning_best.csv). Mengembalikan dict
    {target: LSTMConfig}.
    """

    if not os.path.exists(BEST_CONFIG_PATH):
        raise FileNotFoundError(
            "File konfigurasi terbaik tidak ditemukan: "
            f"{BEST_CONFIG_PATH}. Jalankan "
            "'python -m src.tune_lstm' terlebih dahulu."
        )

    df = pd.read_csv(BEST_CONFIG_PATH)

    configs = {}
    for _, row in df.iterrows():
        configs[row["polutan"]] = LSTMConfig(
            arch=str(row["arch"]),
            window=int(row["window"]),
            hidden_size=int(row["hidden_size"]),
            num_layers=int(row["num_layers"]),
            dropout=float(row["dropout"]),
            device=device,
        )

    return configs


# ============================================================
# Main Comparison
# ============================================================

def run_comparison(
    raw_df: pd.DataFrame,
    targets=None,
    lstm_config: LSTMConfig | None = None,
    architectures=None,
    best_configs=None,
    verbose: bool = True,
):
    targets = targets or TARGETS
    lstm_config = lstm_config or LSTMConfig()
    architectures = architectures or ["lstm"]

    # Validation set kecil (15%) dipakai untuk tuning; model final
    # RNN dilatih ulang pada train+val sebelum dievaluasi test.
    rows = raw_df.to_dict(orient="records")
    df = load_to_df(rows)

    df_features, feature_columns = build_features(
        df,
        horizon_minutes=HORIZON_MINUTES,
        include_targets=True,
    )

    if len(df_features) < MIN_ROWS_FOR_TRAIN:
        raise RuntimeError(
            f"Data setelah feature engineering hanya "
            f"{len(df_features)} baris (minimal "
            f"{MIN_ROWS_FOR_TRAIN})."
        )

    train_df, val_df, test_df = chronological_split(df_features)

    train_val_df = df_features.iloc[
        : len(train_df) + len(val_df)
    ].copy()

    results = []

    for target in targets:

        target_column = (
            f"{target}_target_t{HORIZON_MINUTES}"
        )

        if verbose:
            print(f"\n{'=' * 60}")
            print(f"TARGET: {target}")
            print(f"{'=' * 60}")

        y_test = test_df[target_column].to_numpy()

        # ----------------------------------------------------
        # XGBoost (baseline tree-based)
        # ----------------------------------------------------

        xgb_model, xgb_config = train_xgb_baseline(
            train_df,
            val_df,
            feature_columns,
            target_column,
            verbose=verbose,
        )

        xgb_test_pred = np.clip(
            xgb_model.predict(
                test_df[feature_columns]
            ),
            0,
            None,
        )

        xgb_metrics = evaluate(y_test, xgb_test_pred)

        if verbose:
            print(
                f"[XGBoost] MAE={xgb_metrics['mae']:.3f} "
                f"RMSE={xgb_metrics['rmse']:.3f} "
                f"MAPE={xgb_metrics['mape']:.2f}%"
            )

        # ----------------------------------------------------
        # Recurrent variants (lstm / bilstm / gru)
        #
        # Jika best_configs tersedia (hasil tuning), konfigurasi
        # terbaik per polutan dipakai. Jika tidak, semua varian
        # dijalankan dengan konfigurasi default.
        # ----------------------------------------------------

        rnn_results = {}

        # Jika memakai konfigurasi terbaik per polutan, cukup
        # jalankan sekali (konfigurasi sudah spesifik per target).
        if best_configs and target in best_configs:
            variants = [best_configs[target]]
        else:
            variants = [
                replace(lstm_config, arch=arch)
                for arch in architectures
            ]

        for arch_config in variants:

            label = f"{target}_{arch_config.arch}"

            bundle = train_lstm_for_target(
                train_df,
                val_df,
                feature_columns,
                target_column,
                label,
                config=arch_config,
                verbose=verbose,
            )

            window = bundle["window"]
            test_pred = predict_lstm(bundle, test_df)

            y_test_rnn = test_df[
                target_column
            ].to_numpy()[window - 1:]

            metrics = evaluate(y_test_rnn, test_pred)

            key = arch_config.arch

            if verbose:
                print(
                    f"[{key.upper():<6}] "
                    f"MAE={metrics['mae']:.3f} "
                    f"RMSE={metrics['rmse']:.3f} "
                    f"MAPE={metrics['mape']:.2f}% "
                    f"(w={window}, h={arch_config.hidden_size}, "
                    f"L={arch_config.num_layers})"
                )

            rnn_results[key] = {
                "arch": key,
                "window": window,
                "hidden_size": arch_config.hidden_size,
                "num_layers": arch_config.num_layers,
                **metrics,
                "validation": bundle["validation"],
            }

        results.append(
            {
                "target": target,
                "n_test": len(y_test),
                "xgboost": {
                    "config": xgb_config,
                    **xgb_metrics,
                },
                "rnn": rnn_results,
                # Kompatibilitas: 'lstm' = varian pertama.
                "lstm": rnn_results.get(
                    architectures[0],
                    {},
                ),
            }
        )

    return {
        "generated_at": datetime.now(
            timezone.utc
        ).isoformat(),
        "horizon_minutes": HORIZON_MINUTES,
        "n_rows_features": len(df_features),
        "architectures": list(architectures),
        "split": {
            "train": len(train_df),
            "validation": len(val_df),
            "test": len(test_df),
        },
        "results": results,
    }


# ============================================================
# Reporting
# ============================================================

def print_comparison_table(summary):
    print("\n")
    print("=" * 72)
    print("TABEL PERBANDINGAN MODEL FORECASTING (test set)")
    print("=" * 72)
    print(
        f"{'Polutan':<12}"
        f"{'Model':<12}"
        f"{'MAE':>10}"
        f"{'RMSE':>10}"
        f"{'MAPE':>10}"
    )
    print("-" * 72)

    for item in summary["results"]:
        t = item["target"]
        xgb = item["xgboost"]

        print(
            f"{t:<12}{'XGBoost':<12}"
            f"{xgb['mae']:>10.3f}"
            f"{xgb['rmse']:>10.3f}"
            f"{xgb['mape']:>9.2f}%"
        )

        rnn = item.get("rnn", {})
        for arch, metrics in rnn.items():
            print(
                f"{'':<12}{arch.upper():<12}"
                f"{metrics['mae']:>10.3f}"
                f"{metrics['rmse']:>10.3f}"
                f"{metrics['mape']:>9.2f}%"
            )

        print("-" * 72)


def save_comparison(summary):
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    json_path = os.path.join(
        OUTPUT_DIR,
        "model_comparison.json",
    )
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)

    csv_rows = []
    for item in summary["results"]:
        csv_rows.append(
            {
                "polutan": item["target"],
                "model": "XGBoost",
                "mae": item["xgboost"]["mae"],
                "rmse": item["xgboost"]["rmse"],
                "mape": item["xgboost"]["mape"],
            }
        )

        for arch, metrics in item.get("rnn", {}).items():
            csv_rows.append(
                {
                    "polutan": item["target"],
                    "model": arch.upper(),
                    "mae": metrics["mae"],
                    "rmse": metrics["rmse"],
                    "mape": metrics["mape"],
                }
            )

    csv_path = os.path.join(
        OUTPUT_DIR,
        "model_comparison.csv",
    )
    pd.DataFrame(csv_rows).to_csv(
        csv_path,
        index=False,
    )

    return json_path, csv_path


# ============================================================
# Entry Point
# ============================================================

def main():
    parser = argparse.ArgumentParser(
        description="Bandingkan XGBoost vs LSTM.",
    )
    parser.add_argument(
        "--targets",
        nargs="+",
        default=["pm25_ugm3", "pm10_ugm3", "co_ugm3"],
    )
    parser.add_argument(
        "--window",
        type=int,
        default=60,
    )
    parser.add_argument(
        "--epochs",
        type=int,
        default=60,
    )
    parser.add_argument(
        "--days",
        type=int,
        default=None,
    )
    parser.add_argument(
        "--device",
        type=str,
        default="cpu",
        help=(
            "cpu / cuda (default: cpu). Catatan: pada sebagian "
            "setup Windows, shutdown CUDA dapat memicu crash "
            "0xC0000409, sehingga default CPU dipakai."
        ),
    )
    parser.add_argument(
        "--architectures",
        nargs="+",
        default=["lstm", "bilstm", "gru"],
        help="Varian RNN yang dibandingkan.",
    )
    parser.add_argument(
        "--best-config",
        action="store_true",
        help=(
            "Pakai konfigurasi RNN terbaik per polutan dari "
            "outputs/lstm_tuning_best.csv (hasil tune_lstm)."
        ),
    )

    args = parser.parse_args()

    print("Mengambil data dari Supabase...")
    raw_df = load_dataframe_from_supabase(
        days=args.days
    )
    print(f"Total baris mentah: {len(raw_df)}")

    config = LSTMConfig(
        window=args.window,
        epochs=args.epochs,
        device=args.device,
    )

    best_configs = None
    if args.best_config:
        best_configs = load_best_configs(
            device=args.device
        )
        print(
            f"Memakai konfigurasi terbaik untuk: "
            f"{', '.join(best_configs)}"
        )

    summary = run_comparison(
        raw_df,
        targets=args.targets,
        lstm_config=config,
        architectures=args.architectures,
        best_configs=best_configs,
    )

    print_comparison_table(summary)

    json_path, csv_path = save_comparison(summary)
    print(f"\nOutput JSON: {json_path}")
    print(f"Output CSV : {csv_path}")


def _safe_exit():
    """
    Keluar paksa tanpa menjalankan destructor CUDA/OpenMP.

    Di Windows, kombinasi PyTorch (CUDA) + OpenMP terkadang
    menyebabkan crash saat shutdown interpreter
    (0xC0000409 / STATUS_STACK_BUFFER_OVERRUN) meskipun seluruh
    perhitungan dan penulisan file sudah selesai. Karena semua
    output sudah di-flush ke disk, keluar paksa aman dilakukan.
    """

    import sys

    sys.stdout.flush()
    sys.stderr.flush()
    os._exit(0)


if __name__ == "__main__":
    main()
    _safe_exit()
