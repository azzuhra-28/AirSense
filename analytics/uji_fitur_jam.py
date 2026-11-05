"""Uji apakah fitur jam (siklus harian) membuat forecast mengalahkan persistence.

Dijalankan pada segmen kontinu nyata, bukan data dummy. Tujuannya
menjawab pertanyaan "bagaimana memperbaiki forecast" dengan angka,
bukan dugaan.

Pemakaian:
    python uji_fitur_jam.py
    python uji_fitur_jam.py --target co_ugm3
"""

import argparse
import sys

sys.path.insert(0, ".")

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor

from src.blending import load_recent

HORIZONS = [10, 30, 60]


def segments(df: pd.DataFrame, target: str, min_rows: int = 300):
    valid = df.dropna(subset=[target, "temperature", "humidity"])
    gap = valid["created_at"].diff().dt.total_seconds() / 60
    seg = ((gap > 3) | gap.isna()).cumsum()
    return [g.reset_index(drop=True) for _, g in valid.groupby(seg) if len(g) >= min_rows]


def feats(df: pd.DataFrame, target: str, with_hour: bool) -> pd.DataFrame:
    """Fitur dasar (lag + lingkungan) dengan/tanpa penanda jam."""
    out = pd.DataFrame(index=df.index)
    for col in ["pm25_ugm3", "pm10_ugm3", "co_ugm3"]:
        out[f"{col}_lag1"] = df[col].shift(1)
        out[f"{col}_lag5"] = df[col].shift(5)
    out["temperature"] = df["temperature"]
    out["humidity"] = df["humidity"]

    if with_hour:
        jam = df["created_at"].dt.hour + df["created_at"].dt.minute / 60
        out["sin_jam"] = np.sin(2 * np.pi * jam / 24)
        out["cos_jam"] = np.cos(2 * np.pi * jam / 24)

    return out


def run(df: pd.DataFrame, target: str, horizon: int, with_hour: bool) -> dict | None:
    X = feats(df, target, with_hour)
    y = df[target].shift(-horizon)

    data = pd.concat([X, y.rename("y"), df["created_at"]], axis=1).dropna(
        subset=["y"]
    )
    data = data.dropna(subset=[c for c in X.columns])

    if len(data) < 200:
        return None

    # Urutan waktu: 70% latih, 30% uji (tidak diacak).
    split = int(len(data) * 0.70)
    train, test = data.iloc[:split], data.iloc[split:]

    cols = list(X.columns)
    model = HistGradientBoostingRegressor(max_iter=200, random_state=42)
    model.fit(train[cols], train["y"])
    pred = np.clip(model.predict(test[cols]), 0, None)

    actual = test["y"].to_numpy()
    # Baseline persistence: nilai pada saat prediksi dibuat, yaitu
    # konsentrasi di baris asal (bukan t+horizon).
    baseline = df[target].reindex(test.index).to_numpy()

    mae = float(np.mean(np.abs(pred - actual)))
    mae_base = float(np.mean(np.abs(baseline - actual)))

    return {
        "n": len(test),
        "mae": mae,
        "mae_base": mae_base,
        "gain": (1 - mae / mae_base) * 100,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--target", default="pm25_ugm3")
    args = parser.parse_args()

    df = load_recent(args.target, limit=14000)
    if df.empty:
        print("Tidak ada data.")
        return

    segs = segments(df, args.target)
    print(f"Target        : {args.target}")
    print(f"Segmen >= 300 : {len(segs)}")
    for s in segs:
        print(
            f"   {len(s):5d} baris  "
            f"{s['created_at'].min():%d %b %H:%M} .. {s['created_at'].max():%d %b %H:%M}"
        )
    print()

    for horizon in HORIZONS:
        print(f"Horizon t+{horizon} menit")
        for label, with_hour in [("tanpa jam", False), ("dengan jam", True)]:
            hasil = [run(s, args.target, horizon, with_hour) for s in segs]
            hasil = [h for h in hasil if h]
            if not hasil:
                print(f"  {label:12s}: data kurang")
                continue
            n = sum(h["n"] for h in hasil)
            mae = sum(h["mae"] * h["n"] for h in hasil) / n
            base = sum(h["mae_base"] * h["n"] for h in hasil) / n
            gain = (1 - mae / base) * 100
            tanda = "LEBIH BAIK" if mae < base else "kalah"
            print(
                f"  {label:12s}: MAE={mae:7.2f}  baseline={base:7.2f}  "
                f"({gain:+6.0f}%)  -> {tanda}"
            )
        print()


if __name__ == "__main__":
    main()
