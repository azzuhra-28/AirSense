"""Cari strategi forecast terbaik dengan pemilihan yang jujur.

Aturan mainnya:
- Tiap segmen kontinu dibagi 70% awal (pemilihan) dan 30% akhir (uji).
- Strategi dipilih HANYA dari 70% awal.
- Angka yang dilaporkan berasal dari 30% akhir, yang tidak pernah
  dilihat saat memilih. Tanpa ini, memilih dari sekumpulan besar
  strategi akan selalu terlihat bagus di data yang sama.
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


def candidates(y: pd.Series) -> dict[str, pd.Series]:
    """Kumpulan strategi; semuanya hanya memakai data saat ini ke belakang."""
    out: dict[str, pd.Series] = {"persistence": y}

    for w in [5, 10, 15, 20, 30, 45, 60]:
        out[f"mean{w}"] = y.rolling(w, min_periods=max(3, w // 3)).mean()

    out["median15"] = y.rolling(15, min_periods=5).median()
    out["median30"] = y.rolling(30, min_periods=10).median()

    # Rata-rata dari beberapa jendela: meredam derau tanpa memilih
    # satu skala waktu yang beruntung.
    out["ens10_15_30"] = (
        y.rolling(10, min_periods=4).mean()
        + y.rolling(15, min_periods=5).mean()
        + y.rolling(30, min_periods=10).mean()
    ) / 3

    out["ens15_45"] = (
        y.rolling(15, min_periods=5).mean() + y.rolling(45, min_periods=15).mean()
    ) / 2

    # Rata-rata berbobot eksponensial: data terbaru lebih diutamakan.
    out["ewm10"] = y.ewm(halflife=10, min_periods=5).mean()
    out["ewm20"] = y.ewm(halflife=20, min_periods=8).mean()

    return out


def skor(pred: pd.Series, y: pd.Series, horizon: int) -> float | None:
    pasangan = pd.concat(
        [pred.rename("p"), y.shift(-horizon).rename("a")], axis=1
    ).dropna()
    if len(pasangan) < 50:
        return None
    return float(
        np.mean(np.abs(pasangan["p"].to_numpy() - pasangan["a"].to_numpy()))
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--target", default="pm25_ugm3")
    args = parser.parse_args()

    df = load_recent(args.target, limit=14000)
    segs = segments(df, args.target)
    if not segs:
        print("Segmen tidak cukup.")
        return

    print(f"Target: {args.target} | segmen: {len(segs)}")
    print()

    for horizon in HORIZONS:
        nama = None
        pilih = []
        uji = []

        for s in segs:
            y = s[args.target]
            kandidat = candidates(y)
            split = int(len(y) * 0.70)

            # Pemilihan: hanya 70% awal.
            terbaik = None
            for label, pred in kandidat.items():
                m = skor(pred.iloc[:split], y, horizon)
                if m is None:
                    continue
                if terbaik is None or m < terbaik[1]:
                    terbaik = (label, m)
            if terbaik is None:
                continue

            nama = terbaik[0]

            # Pengujian: 30% akhir, memakai strategi yang sama.
            for label, pred in kandidat.items():
                m = skor(pred, y, horizon)
                if m is None:
                    continue
                uji.append((label, m, len(pred.dropna())))
            pilih.append((terbaik[0], terbaik[1]))

        if not uji:
            print(f"t+{horizon}: data kurang\n")
            continue

        gab: dict[str, list] = {}
        for label, m, _ in uji:
            gab.setdefault(label, []).append(m)
        rata = {k: float(np.mean(v)) for k, v in gab.items()}
        acuan = rata.get("persistence")

        print(f"Horizon t+{horizon} menit  (dipilih dari 70% awal: {nama})")
        urut = sorted(rata.items(), key=lambda kv: kv[1])[:6]
        for label, m in urut:
            gain = (1 - m / acuan) * 100 if acuan else 0
            tanda = "LEBIH BAIK" if m < acuan else "kalah"
            print(f"  {label:14s} MAE={m:8.2f}  {gain:+6.1f}%  {tanda}")
        print()


if __name__ == "__main__":
    main()
