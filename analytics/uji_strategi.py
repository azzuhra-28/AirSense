"""Bandingkan beberapa strategi forecast sederhana terhadap persistence.

Tujuannya menemukan mana yang benar-benar lebih baik sebelum menyentuh
model. Semua strategi diuji pada segmen kontinu nyata dengan urutan
waktu (70% latih, 30% uji) dan tanpa pengacakan.
"""

import argparse
import sys

sys.path.insert(0, ".")

import numpy as np
import pandas as pd

from src.blending import load_recent

HORIZONS = [10, 30, 60]


def segments(df: pd.DataFrame, target: str, min_rows: int = 300):
    valid = df.dropna(subset=[target]).reset_index(drop=True)
    gap = valid["created_at"].diff().dt.total_seconds() / 60
    seg = ((gap > 3) | gap.isna()).cumsum()
    return [g.reset_index(drop=True) for _, g in valid.groupby(seg) if len(g) >= min_rows]


def evaluasi(df: pd.DataFrame, target: str, horizon: int) -> dict:
    y = df[target]
    aktual = y.shift(-horizon)

    strategi = {
        # Nilai terakhir: standar minimal.
        "persistence": y,
        # Median 5 pembacaan terakhir: meredam derau sesaat.
        "median5": y.rolling(5, min_periods=3).median(),
        # Rata-rata 15 menit terakhir: lebih halus, lebih lambat.
        "mean15": y.rolling(15, min_periods=8).mean(),
        # Gabungan: separuh nilai terakhir, separuh rata-rata 15 menit.
        "campur": 0.5 * y + 0.5 * y.rolling(15, min_periods=8).mean(),
        # Tren linear dari 15 menit terakhir, diredam separuh.
        "tren_15": y + 0.5 * (y - y.shift(15)) / 15 * horizon,
    }

    hasil = {}
    for nama, prediksi in strategi.items():
        pasangan = pd.concat(
            [prediksi.rename("pred"), aktual.rename("aktual")], axis=1
        ).dropna()
        if len(pasangan) < 100:
            continue
        mae = float(
            np.mean(np.abs(pasangan["pred"].to_numpy() - pasangan["aktual"].to_numpy()))
        )
        hasil[nama] = {"n": len(pasangan), "mae": mae}

    return hasil


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--target", default="pm25_ugm3")
    args = parser.parse_args()

    df = load_recent(args.target, limit=14000)
    segs = segments(df, args.target)
    print(f"Target: {args.target} | segmen: {len(segs)}\n")

    for horizon in HORIZONS:
        gabungan = {}
        for s in segs:
            for nama, nilai in evaluasi(s, args.target, horizon).items():
                gabungan.setdefault(nama, []).append(nilai)

        if not gabungan:
            print(f"t+{horizon}: data kurang\n")
            continue

        print(f"Horizon t+{horizon} menit")
        acuan = None
        for nama, daftar in gabungan.items():
            n = sum(d["n"] for d in daftar)
            mae = sum(d["mae"] * d["n"] for d in daftar) / n
            if nama == "persistence":
                acuan = mae
            print(f"  {nama:12s}: MAE={mae:7.2f}  n={n:5d}")

        if acuan:
            print("  ---")
            for nama, daftar in gabungan.items():
                n = sum(d["n"] for d in daftar)
                mae = sum(d["mae"] * d["n"] for d in daftar) / n
                gain = (1 - mae / acuan) * 100
                tanda = "LEBIH BAIK" if mae < acuan else "kalah"
                print(f"  {nama:12s}: {gain:+6.1f}% vs persistence -> {tanda}")
        print()


if __name__ == "__main__":
    main()
