"""Seberapa jauh forecast masih berguna?

Menjawab pertanyaan "bagusnya dalam rentang berapa" dengan angka:
untuk tiap horizon (1 sampai 60 menit), dibandingkan tiga hal:
  1. persistence  : anggap nilai tidak berubah
  2. perataan     : rata-rata 10/15/30 menit terakhir, dianggap datar
  3. perubahan    : seberapa besar nilai memang berubah dalam rentang itu

Kalau perubahan tipikal lebih kecil daripada galat prediksi, artinya
ramalan tidak menambah informasi apa pun pada rentang tersebut.
"""

import argparse
import sys

sys.path.insert(0, ".")

import numpy as np
import pandas as pd

from src.blending import load_recent

HORIZONS = [1, 2, 5, 10, 15, 20, 30, 45, 60]
ENSEMBLE = (10, 15, 30)


def segmen_terpanjang(df: pd.DataFrame, target: str) -> pd.DataFrame:
    valid = df.dropna(subset=[target]).reset_index(drop=True)
    gap = valid["created_at"].diff().dt.total_seconds() / 60
    seg = ((gap > 3) | gap.isna()).cumsum()
    grup = [g.reset_index(drop=True) for _, g in valid.groupby(seg)]
    return max(grup, key=len) if grup else valid


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--target", default="pm25_ugm3")
    args = parser.parse_args()

    df = load_recent(args.target, limit=20000)
    if df.empty:
        print("tidak ada data")
        return

    d = segmen_terpanjang(df, args.target)
    y = d[args.target].astype(float)
    print(f"Target     : {args.target}")
    print(f"Segmen     : {len(d)} baris")
    print(f"Rentang    : {d['created_at'].min():%d %b %H:%M} .. {d['created_at'].max():%d %b %H:%M} UTC")
    print()

    perataan = pd.concat(
        [y.rolling(w, min_periods=max(3, w // 3)).mean() for w in ENSEMBLE], axis=1
    ).mean(axis=1)

    print("horizon |  MAE persistence |  MAE perataan | perubahan tipikal | verdict")
    print("--------+------------------+---------------+-------------------+--------")

    for h in HORIZONS:
        aktual = y.shift(-h)
        pers = pd.concat([y.rename("p"), aktual.rename("a")], axis=1).dropna()
        smo = pd.concat([perataan.rename("p"), aktual.rename("a")], axis=1).dropna()

        if len(pers) < 200 or len(smo) < 200:
            continue

        mae_p = float(np.mean(np.abs(pers["p"] - pers["a"])))
        mae_s = float(np.mean(np.abs(smo["p"] - smo["a"])))

        # Seberapa besar nilai memang berubah: median |x(t+h) - x(t)|.
        ubah = float(np.median(np.abs(pers["a"] - pers["p"])))

        # Perataan hanya berguna kalau lebih baik dari persistence.
        if mae_s < mae_p * 0.97:
            verdict = f"perataan menang {(1 - mae_s / mae_p) * 100:.0f}%"
        elif mae_s > mae_p * 1.03:
            verdict = "persistence lebih baik"
        else:
            verdict = "setara, tidak ada nilai tambah"

        print(
            f"  {h:3d} m | {mae_p:16.2f} | {mae_s:13.2f} | {ubah:17.2f} | {verdict}"
        )

    print()
    print("Catatan: 'perubahan tipikal' adalah median perubahan yang benar-benar")
    print("terjadi. Kalau angkanya jauh lebih kecil dari galat, artinya udara")
    print("memang hampir tidak berubah, dan ramalan tidak bisa lebih baik dari")
    print("sekadar menahan nilai terakhir.")


if __name__ == "__main__":
    main()
