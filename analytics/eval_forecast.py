"""Ukur akurasi forecast nyata: prediksi lampau vs pembacaan aktual.

Menjawab pertanyaan "seberapa bagus forecast-nya" dengan data asli, bukan
metrik training. Setiap baris tb_forecast dicocokkan ke pembacaan sensor
pada waktu forecast_at, lalu dibandingkan dengan baseline persistence
(nilai terakhir saat forecast dibuat).

Pemakaian:
    python eval_forecast.py            # 24 jam terakhir
    python eval_forecast.py --hours 6
    python eval_forecast.py --hours 0  # semua data
"""

import argparse
import sys

sys.path.insert(0, ".")

import numpy as np
import pandas as pd

from src.supabase_client import fetch_rows, supabase_session

HORIZONS = [(1, 10), (11, 30), (31, 60)]
COLS = {
    "pm25_ugm3": "pm25_ugm3_pred",
    "pm10_ugm3": "pm10_ugm3_pred",
    "co_ugm3": "co_ugm3_pred",
}
TOLERANCE = "3min"


def load_forecast() -> pd.DataFrame:
    sess = supabase_session()
    select = "generated_at,forecast_at," + ",".join(COLS.values())
    rows = fetch_rows(
        sess,
        "tb_forecast",
        select=select,
        order="generated_at.asc",
        limit=1000,
    )
    df = pd.DataFrame(rows)
    df["generated_at"] = pd.to_datetime(df["generated_at"], utc=True, format="ISO8601")
    df["forecast_at"] = pd.to_datetime(df["forecast_at"], utc=True, format="ISO8601")
    return df.dropna(subset=["generated_at", "forecast_at"])


def load_actual() -> pd.DataFrame:
    sess = supabase_session()
    rows = fetch_rows(
        sess,
        "tb_konsentrasi_gas",
        select="created_at,pm25_ugm3,pm10_ugm3,co_ugm3",
        order="created_at.asc",
        limit=1000,
    )
    df = pd.DataFrame(rows)
    df["created_at"] = pd.to_datetime(df["created_at"], utc=True, format="ISO8601")
    for c in ["pm25_ugm3", "pm10_ugm3", "co_ugm3"]:
        df[c] = pd.to_numeric(df[c], errors="coerce")
        df.loc[df[c] <= -900, c] = np.nan
        df.loc[df[c] < 0, c] = np.nan
    return df.sort_values("created_at").dropna(subset=["created_at"])


def evaluate(fc: pd.DataFrame, act: pd.DataFrame, target: str) -> dict | None:
    pred_col = COLS[target]
    f = fc.dropna(subset=[pred_col])[["generated_at", "forecast_at", pred_col]].copy()
    if f.empty:
        return None

    # Nilai aktual pada saat prediksi (titik jangkar) dan pada target waktu.
    anchor = pd.merge_asof(
        f[["generated_at"]].drop_duplicates().sort_values("generated_at"),
        act[["created_at", target]].sort_values("created_at"),
        left_on="generated_at",
        right_on="created_at",
        tolerance=pd.Timedelta(TOLERANCE),
        direction="nearest",
    )[["generated_at", target]].rename(columns={target: "baseline"})

    merged = pd.merge_asof(
        f.sort_values("forecast_at"),
        act[["created_at", target]].sort_values("created_at"),
        left_on="forecast_at",
        right_on="created_at",
        tolerance=pd.Timedelta(TOLERANCE),
        direction="nearest",
    ).dropna(subset=[target])

    merged = merged.merge(anchor, on="generated_at", how="left")
    merged = merged.dropna(subset=["baseline"])
    if merged.empty:
        return None

    merged["horizon"] = (
        (merged["forecast_at"] - merged["generated_at"]).dt.total_seconds() / 60
    ).round()
    merged = merged[merged["horizon"] > 0]

    def stats(g: pd.DataFrame) -> dict:
        err = g[pred_col] - g[target]
        base = g["baseline"] - g[target]
        scale = g[target].abs().mean()
        return {
            "n": len(g),
            "mae": err.abs().mean(),
            "rmse": np.sqrt((err ** 2).mean()),
            "nmae": err.abs().mean() / scale * 100 if scale else np.nan,
            "mae_base": base.abs().mean(),
        }

    out = {"all": stats(merged), "buckets": {}}
    for lo, hi in HORIZONS:
        g = merged[(merged["horizon"] >= lo) & (merged["horizon"] <= hi)]
        if len(g):
            out["buckets"][(lo, hi)] = stats(g)
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description="Ukur akurasi forecast nyata.")
    parser.add_argument(
        "--hours",
        type=int,
        default=24,
        help="Hanya nilai siklus N jam terakhir. 0 = semua data.",
    )
    args = parser.parse_args()

    fc = load_forecast()
    act = load_actual()

    if args.hours:
        batas = pd.Timestamp.now(tz="UTC") - pd.Timedelta(hours=args.hours)
        fc = fc[fc["generated_at"] >= batas]
        act = act[act["created_at"] >= batas]

    print(f"Periode        : {args.hours} jam terakhir" if args.hours else "Periode        : semua data")
    print(f"Baris forecast : {len(fc):,}")
    print(f"Baris sensor   : {len(act):,}")
    if len(act):
        print(
            "Rentang sensor : "
            f"{act['created_at'].min():%d %b %H:%M} .. {act['created_at'].max():%d %b %H:%M} UTC"
        )
    print()

    for target, label, unit in [
        ("pm25_ugm3", "PM2.5", "ug/m3"),
        ("pm10_ugm3", "PM10 ", "ug/m3"),
        ("co_ugm3", "CO   ", "ug/m3"),
    ]:
        res = evaluate(fc, act, target)
        print(f"{label}  ({unit})")
        if not res:
            print("  tidak ada pasangan prediksi-aktual yang bisa dinilai\n")
            continue

        a = res["all"]
        verdict = "LEBIH BAIK" if a["mae"] < a["mae_base"] else "KALAH"
        gain = (1 - a["mae"] / a["mae_base"]) * 100 if a["mae_base"] else 0
        print(
            f"  semua horizon : n={a['n']:5d}  MAE={a['mae']:7.2f}  "
            f"RMSE={a['rmse']:7.2f}  nMAE={a['nmae']:5.1f}%  "
            f"baseline={a['mae_base']:7.2f}  -> {verdict} ({gain:+.0f}%)"
        )
        for (lo, hi), b in res["buckets"].items():
            g = (1 - b["mae"] / b["mae_base"]) * 100 if b["mae_base"] else 0
            mark = "OK " if b["mae"] < b["mae_base"] else "!! "
            print(
                f"    {mark}t+{lo:02d}-{hi:02d} mnt : n={b['n']:5d}  "
                f"MAE={b['mae']:7.2f}  baseline={b['mae_base']:7.2f}  ({g:+.0f}%)"
            )
        print()


if __name__ == "__main__":
    main()
