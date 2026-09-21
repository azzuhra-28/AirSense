# ============================================================
# AirSense - Hyperparameter Tuning (RNN / LSTM)
#
# Melakukan grid search ringan untuk mencari konfigurasi RNN
# terbaik per polutan berdasarkan validation MAE.
#
# Ruang pencarian (default):
#   arch        : lstm, bilstm, gru
#   window      : 30, 60, 120
#   hidden_size : 32, 64, 128
#   num_layers  : 1, 2
#
# Untuk menjaga waktu eksekusi, tuning dapat dibatasi dengan
# argumen CLI. Hasil tuning disimpan ke outputs/.
#
# Cara pakai:
#   python -m src.tune_lstm
#   python -m src.tune_lstm --targets pm25_ugm3 --windows 30 60
# ============================================================

import argparse
import itertools
import json
import os
from dataclasses import replace
from datetime import datetime, timezone

# PENTING (Windows): torch harus di-import sebelum xgboost.
os.environ.setdefault("KMP_DUPLICATE_LIB_OK", "TRUE")

import torch  # noqa: F401  (urutan import penting)

import pandas as pd

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

from .train_forecast import chronological_split

from .model_lstm import (
    LSTMConfig,
    train_lstm_for_target,
)


OUTPUT_DIR = os.path.join(
    os.path.dirname(
        os.path.dirname(
            os.path.abspath(__file__)
        )
    ),
    "outputs",
)


def load_dataframe_from_supabase(days=None):
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
        df = df.loc[
            df["created_at"]
            >= latest - pd.Timedelta(days=days)
        ]

    return df


def build_grid(
    architectures,
    windows,
    hidden_sizes,
    num_layers,
    device="cpu",
    epochs=80,
    patience=8,
):
    grid = []
    for arch, window, hidden, layers in itertools.product(
        architectures,
        windows,
        hidden_sizes,
        num_layers,
    ):
        grid.append(
            LSTMConfig(
                arch=arch,
                window=window,
                hidden_size=hidden,
                num_layers=layers,
                epochs=epochs,
                patience=patience,
                device=device,
            )
        )
    return grid


def tune(
    raw_df,
    targets=None,
    architectures=("lstm", "bilstm", "gru"),
    windows=(30, 60, 120),
    hidden_sizes=(32, 64, 128),
    num_layers=(1, 2),
    device="cpu",
    epochs=80,
    patience=8,
    verbose=True,
):
    targets = targets or TARGETS

    rows = raw_df.to_dict(orient="records")
    df = load_to_df(rows)
    df_features, feature_columns = build_features(
        df,
        horizon_minutes=HORIZON_MINUTES,
        include_targets=True,
    )

    if len(df_features) < MIN_ROWS_FOR_TRAIN:
        raise RuntimeError(
            "Data tidak cukup untuk tuning "
            f"({len(df_features)} baris)."
        )

    train_df, val_df, _ = chronological_split(df_features)

    grid = build_grid(
        architectures,
        windows,
        hidden_sizes,
        num_layers,
        device=device,
        epochs=epochs,
        patience=patience,
    )

    print(
        f"\nDevice: {device} | "
        f"Total konfigurasi: {len(grid)} "
        f"x {len(targets)} target"
    )

    tuning_results = {}

    for target in targets:

        target_column = (
            f"{target}_target_t{HORIZON_MINUTES}"
        )

        print(f"\n{'=' * 60}")
        print(f"TUNING TARGET: {target}")
        print(f"{'=' * 60}")

        rows_result = []

        for idx, config in enumerate(grid, 1):

            bundle = train_lstm_for_target(
                train_df,
                val_df,
                feature_columns,
                target_column,
                f"{target}_{config.arch}",
                config=config,
                verbose=False,
            )

            metrics = bundle["validation"]

            rows_result.append(
                {
                    "arch": config.arch,
                    "window": config.window,
                    "hidden_size": config.hidden_size,
                    "num_layers": config.num_layers,
                    "dropout": config.dropout,
                    "validation_mae": metrics["mae"],
                    "validation_rmse": metrics["rmse"],
                    "validation_mape": metrics["mape"],
                }
            )

            if verbose and (
                idx % 6 == 0
                or idx == len(grid)
            ):
                best = min(
                    rows_result,
                    key=lambda r: r["validation_mae"],
                )
                print(
                    f"  {idx:>3}/{len(grid)} selesai | "
                    f"best MAE={best['validation_mae']:.3f} "
                    f"({best['arch']}, w={best['window']}, "
                    f"h={best['hidden_size']}, "
                    f"L={best['num_layers']})"
                )

        best_row = min(
            rows_result,
            key=lambda r: r["validation_mae"],
        )

        tuning_results[target] = {
            "best": best_row,
            "all": rows_result,
        }

        print(
            f"  -> BEST {target}: "
            f"{best_row['arch']} "
            f"window={best_row['window']} "
            f"hidden={best_row['hidden_size']} "
            f"layers={best_row['num_layers']} "
            f"MAE={best_row['validation_mae']:.3f}"
        )

    return {
        "generated_at": datetime.now(
            timezone.utc
        ).isoformat(),
        "horizon_minutes": HORIZON_MINUTES,
        "n_rows_features": len(df_features),
        "grid_size": len(grid),
        "tuning": tuning_results,
    }


def save_tuning(summary):
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    json_path = os.path.join(
        OUTPUT_DIR,
        "lstm_tuning.json",
    )
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)

    # CSV ringkas: hanya baris terbaik per target.
    best_rows = []
    for target, data in summary["tuning"].items():
        best = data["best"]
        best_rows.append(
            {
                "polutan": target,
                **best,
            }
        )

    csv_path = os.path.join(
        OUTPUT_DIR,
        "lstm_tuning_best.csv",
    )
    pd.DataFrame(best_rows).to_csv(
        csv_path,
        index=False,
    )

    return json_path, csv_path


def main():
    parser = argparse.ArgumentParser(
        description="Tuning hyperparameter RNN.",
    )
    parser.add_argument(
        "--targets",
        nargs="+",
        default=["pm25_ugm3", "pm10_ugm3", "co_ugm3"],
    )
    parser.add_argument(
        "--architectures",
        nargs="+",
        default=["lstm", "bilstm", "gru"],
    )
    parser.add_argument(
        "--windows",
        nargs="+",
        type=int,
        default=[30, 60, 120],
    )
    parser.add_argument(
        "--hidden",
        nargs="+",
        type=int,
        default=[32, 64, 128],
    )
    parser.add_argument(
        "--layers",
        nargs="+",
        type=int,
        default=[1, 2],
    )
    parser.add_argument(
        "--device",
        type=str,
        default="cpu",
        help="cpu / cuda (default: cpu).",
    )
    parser.add_argument(
        "--epochs",
        type=int,
        default=80,
    )
    parser.add_argument(
        "--patience",
        type=int,
        default=8,
    )

    args = parser.parse_args()

    print("Mengambil data dari Supabase...")
    raw_df = load_dataframe_from_supabase()
    print(f"Total baris mentah: {len(raw_df)}")

    summary = tune(
        raw_df,
        targets=args.targets,
        architectures=args.architectures,
        windows=args.windows,
        hidden_sizes=args.hidden,
        num_layers=args.layers,
        device=args.device,
        epochs=args.epochs,
        patience=args.patience,
    )

    json_path, csv_path = save_tuning(summary)
    print(f"\nOutput JSON: {json_path}")
    print(f"Output CSV : {csv_path}")


def _safe_exit():
    import sys

    sys.stdout.flush()
    sys.stderr.flush()
    os._exit(0)


if __name__ == "__main__":
    main()
    _safe_exit()
