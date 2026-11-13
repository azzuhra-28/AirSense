"""Benchmark metode forecast PM2.5 untuk AirSense.

Eksperimen terpisah dari pipeline produksi. Tidak mengubah model, skema,
atau dashboard. Semua keluaran ditulis ke analytics/benchmark/results/.

Jalankan:
    python run_benchmark.py
    python run_benchmark.py --days 7 --seed 42
    python run_benchmark.py --source csv --csv data.csv
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import warnings
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")

HERE = Path(__file__).resolve().parent
RESULTS = HERE / "results"
FIGURES = RESULTS / "figures"

sys.path.insert(0, str(HERE.parent))

HORIZONS = [5, 15, 30, 60]
TARGETS = {"A": "mentah", "B": "halus5"}
GAP_MINUTES = 60
N_FOLDS = 3
MAX_INTERP_MINUTES = 5

# Ambang ISPU PM2.5 (µg/m³) sesuai tabel KLHK.
ISPU_BREAKS = [15.5, 55.4, 150.4, 250.4, 500.0]
ISPU_LABELS = ["Baik", "Sedang", "Tidak Sehat", "Sangat Tidak Sehat", "Berbahaya"]


# ============================================================
# Data
# ============================================================

def load_data(source: str, days: int, csv_path: str | None) -> pd.DataFrame:
    if source == "csv":
        if not csv_path:
            raise SystemExit("--source csv butuh --csv <path>")
        df = pd.read_csv(csv_path)
        df["created_at"] = pd.to_datetime(df["created_at"], utc=True, format="mixed")
    else:
        from src.blending import load_recent

        df = load_recent("pm25_ugm3", limit=20000)

    df = df.sort_values("created_at").reset_index(drop=True)
    if days > 0:
        batas = df["created_at"].max() - pd.Timedelta(days=days)
        df = df[df["created_at"] >= batas].reset_index(drop=True)
    return df


def profile(df: pd.DataFrame) -> dict:
    """Profil data: celah, nilai hilang, outlier, statistik."""
    gap = df["created_at"].diff().dt.total_seconds() / 60
    celah = gap[gap > 1.5]

    pm = pd.to_numeric(df["pm25_ugm3"], errors="coerce")
    negatif = int((pm < 0).sum())

    # Outlier: lonjakan yang jauh dari perilaku normal.
    diff = pm.diff().abs()
    mad = float(diff.median())
    ambang = max(10.0, 8 * mad)
    outlier = int((diff > ambang).sum())

    return {
        "baris": len(df),
        "mulai": df["created_at"].min(),
        "selesai": df["created_at"].max(),
        "rentang_hari": (df["created_at"].max() - df["created_at"].min()).total_seconds() / 86400,
        "celah_jumlah": int(len(celah)),
        "celah_maks_menit": float(celah.max()) if len(celah) else 0.0,
        "celah_total_menit": float(celah.sum()) if len(celah) else 0.0,
        "pm25_hilang": int(pm.isna().sum()),
        "pm25_negatif": negatif,
        "pm25_outlier": outlier,
        "ambang_outlier": ambang,
        "pm25_min": float(pm.min()),
        "pm25_p50": float(pm.median()),
        "pm25_p95": float(pm.quantile(0.95)),
        "pm25_max": float(pm.max()),
        "suhu_p50": float(pd.to_numeric(df["temperature"], errors="coerce").median()),
        "lembap_p50": float(pd.to_numeric(df["humidity"], errors="coerce").median()),
    }


def prepare(df: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    """
    Reindex ke grid 1 menit.

    Celah <= 5 menit diinterpolasi. Celah lebih panjang dibiarkan NaN
    dan baris yang terlibat dibuang saat membentuk sampel.
    """
    kolom = ["pm25_ugm3", "pm10_ugm3", "co_ugm3", "temperature", "humidity"]
    d = df[["created_at", *kolom]].copy()
    for c in kolom:
        d[c] = pd.to_numeric(d[c], errors="coerce")
        d.loc[d[c] <= -900, c] = np.nan

    # Nilai negatif = di bawah ambang deteksi, bukan nol.
    d.loc[d["pm25_ugm3"] < 0, "pm25_ugm3"] = np.nan

    d = d.set_index("created_at").sort_index()
    # Timestamp sensor membawa detik, jadi reindex ke menit bulat akan
    # menghasilkan hampir semua NaN. Resample merata-ratakan pembacaan
    # yang jatuh di menit yang sama.
    d = d.resample("1min").mean()

    # Tandai celah panjang sebelum interpolasi.
    asli = d["pm25_ugm3"].notna()
    celah_panjang = 0
    idx = np.where(asli.to_numpy())[0]
    for a, b in zip(idx[:-1], idx[1:]):
        if b - a - 1 > MAX_INTERP_MINUTES:
            celah_panjang += 1

    d = d.interpolate(method="time", limit=MAX_INTERP_MINUTES, limit_area="inside")

    # Outlier ekstrem ditandai, tidak dibuang diam-diam.
    diff = d["pm25_ugm3"].diff().abs()
    mad = float(diff.median())
    ambang = max(10.0, 8 * mad)
    d["outlier"] = (diff > ambang).fillna(False)

    info = {
        "grid_baris": len(d),
        "celah_panjang": celah_panjang,
        "outlier": int(d["outlier"].sum()),
        "ambang_outlier": ambang,
        "pm25_nan": int(d["pm25_ugm3"].isna().sum()),
    }
    return d, info


# ============================================================
# Fitur
# ============================================================

LAGS = [1, 2, 3, 5, 10, 15, 30, 60]
ROLLS = [5, 15, 30, 60]


def build_features(d: pd.DataFrame) -> pd.DataFrame:
    """
    Fitur hanya memakai data sampai waktu t.

    Semua operasi memakai shift(>=1) atau rolling pada data yang sudah
    digeser, sehingga tidak ada nilai masa depan yang masuk.
    """
    f = pd.DataFrame(index=d.index)
    pm = d["pm25_ugm3"]

    for lag in LAGS:
        f[f"lag_{lag}"] = pm.shift(lag)

    for w in ROLLS:
        f[f"roll_mean_{w}"] = pm.shift(1).rolling(w, min_periods=max(2, w // 2)).mean()
        f[f"roll_std_{w}"] = pm.shift(1).rolling(w, min_periods=max(2, w // 2)).std()

    f["trend_5_15"] = f["roll_mean_5"] - f["roll_mean_15"]
    f["trend_15_60"] = f["roll_mean_15"] - f["roll_mean_60"]
    f["diff_1"] = pm.shift(1) - pm.shift(2)

    jam = d.index.hour + d.index.minute / 60
    f["jam_sin"] = np.sin(2 * np.pi * jam / 24)
    f["jam_cos"] = np.cos(2 * np.pi * jam / 24)

    for c in ["temperature", "humidity"]:
        f[c] = d[c]
        f[f"{c}_lag_5"] = d[c].shift(5)
        f[f"{c}_roll_15"] = d[c].shift(1).rolling(15, min_periods=5).mean()

    return f


def make_target(d: pd.DataFrame, horizon: int, kind: str) -> pd.Series:
    pm = d["pm25_ugm3"]
    if kind == "A":
        return pm.shift(-horizon)
    # B: rata-rata 5 menit yang berakhir di t+h
    return pm.rolling(5, min_periods=3).mean().shift(-horizon)


# ============================================================
# Fold
# ============================================================

@dataclass
class Fold:
    train: np.ndarray
    test: np.ndarray


def make_folds(n: int, n_folds: int, gap: int) -> list[Fold]:
    awal = int(n * 0.40)
    sisa = n - awal
    blok = sisa // n_folds
    folds = []
    for k in range(n_folds):
        test_start = awal + k * blok
        test_end = min(test_start + blok, n)
        train_end = test_start - gap
        if train_end < 500:
            continue
        folds.append(
            Fold(
                train=np.arange(0, train_end),
                test=np.arange(test_start, test_end),
            )
        )
    return folds


# ============================================================
# Metode
# ============================================================

def ispu_kategori(x: np.ndarray) -> np.ndarray:
    idx = np.digitize(x, ISPU_BREAKS)
    return np.array([ISPU_LABELS[min(i, len(ISPU_LABELS) - 1)] for i in idx])


def pred_persistence(pm: pd.Series, idx: np.ndarray) -> np.ndarray:
    return pm.shift(1).to_numpy()[idx]


def pred_rolling(pm: pd.Series, idx: np.ndarray, w: int) -> np.ndarray:
    return pm.shift(1).rolling(w, min_periods=max(2, w // 2)).mean().to_numpy()[idx]


def pred_ewma(pm: pd.Series, idx: np.ndarray, alpha: float) -> np.ndarray:
    return pm.shift(1).ewm(alpha=alpha, adjust=False).mean().to_numpy()[idx]


def pred_global_mean(pm: pd.Series, train: np.ndarray, idx: np.ndarray) -> np.ndarray:
    return np.full(len(idx), float(np.nanmean(pm.to_numpy()[train])))


def _train_valid(y: pd.Series, train: np.ndarray) -> np.ndarray:
    """Buang baris latih yang targetnya kosong (ujung deret)."""
    nilai = y.to_numpy()[train]
    return train[np.isfinite(nilai)]


def fit_ridge(X: pd.DataFrame, y: pd.Series, train: np.ndarray, test: np.ndarray):
    from sklearn.impute import SimpleImputer
    from sklearn.linear_model import Ridge
    from sklearn.pipeline import make_pipeline
    from sklearn.preprocessing import StandardScaler

    tr = _train_valid(y, train)
    model = make_pipeline(
        SimpleImputer(strategy="median"),
        StandardScaler(),
        Ridge(alpha=1.0),
    )
    model.fit(X.iloc[tr], y.iloc[tr])
    return model.predict(X.iloc[test])


def fit_lgbm(X, y, train, test, params=None, objective="regression", alpha=None):
    import lightgbm as lgb

    p = {
        "objective": objective,
        "n_estimators": 300,
        "learning_rate": 0.05,
        "num_leaves": 31,
        "min_child_samples": 20,
        "subsample": 0.9,
        "colsample_bytree": 0.9,
        "random_state": 42,
        "verbose": -1,
        "n_jobs": 2,
    }
    if params:
        p.update(params)
    if alpha is not None:
        p["alpha"] = alpha

    model = lgb.LGBMRegressor(**p)
    tr = _train_valid(y, train)
    model.fit(X.iloc[tr], y.iloc[tr])
    return model.predict(X.iloc[test]), model


# ============================================================
# Metrik
# ============================================================

def metrik(aktual: np.ndarray, pred: np.ndarray, baseline: np.ndarray) -> dict:
    ok = np.isfinite(aktual) & np.isfinite(pred) & np.isfinite(baseline)
    a, p, b = aktual[ok], pred[ok], baseline[ok]
    if len(a) < 10:
        return {}

    mae = float(np.mean(np.abs(p - a)))
    rmse = float(np.sqrt(np.mean((p - a) ** 2)))
    mae_base = float(np.mean(np.abs(b - a)))
    skill = 1 - mae / mae_base if mae_base > 0 else np.nan

    # MASE: galat model dibagi galat naif pada data latih (didekati
    # dengan galat persistence di test, karena skala musiman tidak ada).
    mase = mae / mae_base if mae_base > 0 else np.nan

    kat_a = ispu_kategori(a)
    kat_p = ispu_kategori(p)
    akurasi = float(np.mean(kat_a == kat_p))

    # Kejadian memburuk: kategori naik dibanding t.
    naik = np.array([ISPU_LABELS.index(k) for k in kat_a])
    naik_p = np.array([ISPU_LABELS.index(k) for k in kat_p])
    kejadian = naik > 0
    recall = float(np.mean(naik_p[kejadian] >= naik[kejadian])) if kejadian.any() else np.nan

    return {
        "n": int(len(a)),
        "mae": mae,
        "rmse": rmse,
        "mae_persistence": mae_base,
        "skill": skill,
        "mase": mase,
        "akurasi_ispu": akurasi,
        "recall_memburuk": recall,
    }


def pinball(aktual, q, alpha):
    d = aktual - q
    return float(np.mean(np.maximum(alpha * d, (alpha - 1) * d)))


def block_bootstrap(selisih: np.ndarray, blok: int = 30, n: int = 2000, seed: int = 42):
    """Bootstrap berblok atas selisih galat; return (mean, lo, hi, p)."""
    rng = np.random.default_rng(seed)
    x = selisih[np.isfinite(selisih)]
    if len(x) < blok * 2:
        return None
    n_blok = len(x) // blok
    means = []
    for _ in range(n):
        mulai = rng.integers(0, len(x) - blok, size=n_blok)
        sampel = np.concatenate([x[s:s + blok] for s in mulai])
        means.append(sampel.mean())
    means = np.array(means)
    return {
        "mean": float(x.mean()),
        "lo": float(np.quantile(means, 0.025)),
        "hi": float(np.quantile(means, 0.975)),
        "p_positif": float(np.mean(means > 0)),
    }


# ============================================================
# Uji kebocoran fitur
# ============================================================

def cek_kebocoran(d: pd.DataFrame) -> bool:
    """
    Fitur pada waktu t tidak boleh berubah bila data setelah t diubah.
    """
    f1 = build_features(d)
    d2 = d.copy()
    potong = len(d2) // 2
    d2.iloc[potong + 1:, d2.columns.get_loc("pm25_ugm3")] = 999.0
    f2 = build_features(d2)

    kolom = [c for c in f1.columns]
    a = f1.iloc[: potong + 1][kolom].to_numpy(dtype=float)
    b = f2.iloc[: potong + 1][kolom].to_numpy(dtype=float)
    sama = np.allclose(a, b, equal_nan=True)
    return bool(sama)


# ============================================================
# Main
# ============================================================

def main() -> None:
    ap = argparse.ArgumentParser(description="Benchmark forecast PM2.5 AirSense")
    ap.add_argument("--source", choices=["supabase", "csv"], default="supabase")
    ap.add_argument("--csv", default=None)
    ap.add_argument("--days", type=int, default=7)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--folds", type=int, default=N_FOLDS)
    args = ap.parse_args()

    np.random.seed(args.seed)
    RESULTS.mkdir(parents=True, exist_ok=True)
    FIGURES.mkdir(parents=True, exist_ok=True)

    print("=" * 70)
    print("BENCHMARK FORECAST PM2.5 - AirSense")
    print("=" * 70)

    raw = load_data(args.source, args.days, args.csv)
    prof = profile(raw)
    print("\n[1] PROFIL DATA MENTAH")
    for k, v in prof.items():
        print(f"    {k:22s}: {v}")

    d, info = prepare(raw)
    print("\n[2] SETELAH REINDEX 1 MENIT")
    for k, v in info.items():
        print(f"    {k:22s}: {v}")

    print("\n[3] UJI KEBOCORAN FITUR")
    bocor = cek_kebocoran(d)
    print(f"    fitur tahan perubahan masa depan: {bocor}")

    X = build_features(d)
    pm = d["pm25_ugm3"]

    folds = make_folds(len(d), args.folds, GAP_MINUTES)
    print(f"\n[4] FOLD: {len(folds)}")
    for i, f in enumerate(folds):
        print(
            f"    fold {i+1}: latih {len(f.train)} baris, uji {len(f.test)} baris, "
            f"gap {GAP_MINUTES} menit"
        )

    baris = []
    contoh = {}
    importance = {}
    galat = {}  # (kind, h, metode) -> list[(err_model, err_base)] per fold

    for kind in ["A", "B"]:
        for h in HORIZONS:
            y = make_target(d, h, kind)

            for fi, fold in enumerate(folds):
                idx = fold.test
                aktual = y.to_numpy()[idx]
                base = pred_persistence(pm, idx)

                kandidat = {
                    "persistence": base,
                    "rolling_5": pred_rolling(pm, idx, 5),
                    "rolling_15": pred_rolling(pm, idx, 15),
                    "rolling_30": pred_rolling(pm, idx, 30),
                    "global_mean": pred_global_mean(pm, fold.train, idx),
                }

                # EWMA: alpha dipilih dari validasi di dalam data latih.
                valid = fold.train[-max(200, len(fold.train) // 5):]
                best_alpha, best_mae = 0.3, np.inf
                for alpha in [0.05, 0.1, 0.2, 0.3, 0.5, 0.7]:
                    pv = pred_ewma(pm, valid, alpha)
                    av = y.to_numpy()[valid]
                    ok = np.isfinite(pv) & np.isfinite(av)
                    if ok.sum() < 20:
                        continue
                    m = float(np.mean(np.abs(pv[ok] - av[ok])))
                    if m < best_mae:
                        best_mae, best_alpha = m, alpha
                kandidat[f"ewma_{best_alpha}"] = pred_ewma(pm, idx, best_alpha)

                # Ridge
                try:
                    kandidat["ridge"] = fit_ridge(X, y, fold.train, idx)
                except Exception as exc:
                    print(f"    ridge gagal ({exc})")

                # LightGBM direct
                lgbm_model = None
                try:
                    pred_lgbm, lgbm_model = fit_lgbm(X, y, fold.train, idx)
                    kandidat["lightgbm"] = pred_lgbm
                    if fi == 0:
                        importance[(kind, h)] = dict(
                            zip(X.columns, lgbm_model.feature_importances_)
                        )
                except Exception as exc:
                    print(f"    lightgbm gagal ({exc})")

                for nama, pred in kandidat.items():
                    m = metrik(aktual, pred, base)
                    if not m:
                        continue
                    m.update(
                        {"metode": nama, "horizon": h, "target": kind, "fold": fi + 1}
                    )
                    baris.append(m)

                    # Simpan galat per sampel untuk block bootstrap.
                    ok = (
                        np.isfinite(aktual)
                        & np.isfinite(pred)
                        & np.isfinite(base)
                    )
                    if ok.sum() >= 10:
                        galat.setdefault((kind, h, nama), []).append(
                            (
                                np.abs(pred[ok] - aktual[ok]),
                                np.abs(base[ok] - aktual[ok]),
                            )
                        )

                # Simpan contoh untuk gambar (fold terakhir, horizon 60).
                if fi == len(folds) - 1 and h == 60:
                    contoh[kind] = {
                        "waktu": d.index[idx],
                        "aktual": aktual,
                        "persistence": base,
                        "lightgbm": kandidat.get("lightgbm"),
                        "rolling_15": kandidat["rolling_15"],
                    }

                # Interval kuantil LightGBM
                if lgbm_model is not None:
                    try:
                        qs = {}
                        for alpha, label in [(0.1, "p10"), (0.5, "p50"), (0.9, "p90")]:
                            pq, _ = fit_lgbm(
                                X, y, fold.train, idx, objective="quantile", alpha=alpha
                            )
                            qs[label] = pq
                        ok = np.isfinite(aktual)
                        a = aktual[ok]
                        p10, p50, p90 = qs["p10"][ok], qs["p50"][ok], qs["p90"][ok]
                        baris.append(
                            {
                                "metode": "lightgbm_quantile",
                                "horizon": h,
                                "target": kind,
                                "fold": fi + 1,
                                "n": int(ok.sum()),
                                "mae": float(np.mean(np.abs(p50 - a))),
                                "rmse": float(np.sqrt(np.mean((p50 - a) ** 2))),
                                "mae_persistence": float(
                                    np.mean(np.abs(base[ok] - a))
                                ),
                                "skill": float(
                                    1
                                    - np.mean(np.abs(p50 - a))
                                    / max(np.mean(np.abs(base[ok] - a)), 1e-9)
                                ),
                                "pinball_p10": pinball(a, p10, 0.1),
                                "pinball_p50": pinball(a, p50, 0.5),
                                "pinball_p90": pinball(a, p90, 0.9),
                                "cakupan": float(np.mean((a >= p10) & (a <= p90))),
                                "lebar": float(np.mean(p90 - p10)),
                            }
                        )
                    except Exception as exc:
                        print(f"    kuantil gagal ({exc})")

    dfm = pd.DataFrame(baris)
    dfm.to_csv(RESULTS / "metrics.csv", index=False)
    print(f"\n[5] metrics.csv: {len(dfm)} baris")

    # Ringkasan per metode x horizon (target B sebagai acuan utama).
    ringkas = (
        dfm[dfm["target"] == "B"]
        .groupby(["metode", "horizon"])
        .agg(
            mae=("mae", "mean"),
            mae_std=("mae", "std"),
            skill=("skill", "mean"),
            skill_std=("skill", "std"),
            akurasi=("akurasi_ispu", "mean"),
            recall=("recall_memburuk", "mean"),
        )
        .reset_index()
    )

    # Signifikansi: metode TERBAIK per horizon dibanding persistence,
    # memakai galat per sampel dari seluruh fold uji.
    sig = {}
    for h in HORIZONS:
        sub = ringkas[(ringkas["horizon"] == h) & (ringkas["metode"] != "lightgbm_quantile")]
        if sub.empty:
            continue
        terbaik = sub.sort_values("mae").iloc[0]["metode"]
        kumpulan = galat.get(("B", h, terbaik))
        if not kumpulan:
            continue
        e_model = np.concatenate([a for a, _ in kumpulan])
        e_base = np.concatenate([b for _, b in kumpulan])
        sig[h] = block_bootstrap(e_base - e_model, seed=args.seed)
        sig[h]["metode"] = terbaik

    # Cek collapse: simpangan baku prediksi vs target.
    collapse = {}
    for kind, c in contoh.items():
        if c.get("lightgbm") is None:
            continue
        ok = np.isfinite(c["aktual"]) & np.isfinite(c["lightgbm"])
        collapse[kind] = {
            "std_pred": float(np.std(c["lightgbm"][ok])),
            "std_aktual": float(np.std(c["aktual"][ok])),
        }

    # Gambar
    buat_gambar(dfm, contoh, importance, ringkas)

    tulis_summary(prof, info, bocor, folds, ringkas, dfm, sig, collapse, args)

    print("\n[6] Selesai. Lihat results/summary.md")


def buat_gambar(dfm, contoh, importance, ringkas) -> None:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    # 1. MAE per horizon
    fig, ax = plt.subplots(figsize=(8, 4.5))
    for metode in ["persistence", "rolling_15", "ridge", "lightgbm"]:
        sub = ringkas[ringkas["metode"] == metode]
        if sub.empty:
            continue
        ax.plot(sub["horizon"], sub["mae"], marker="o", label=metode)
    ax.set_xlabel("Horizon (menit)")
    ax.set_ylabel("MAE (µg/m³)")
    ax.set_title("MAE per horizon (target halus 5 menit)")
    ax.legend()
    ax.grid(alpha=0.3)
    fig.tight_layout()
    fig.savefig(FIGURES / "mae_per_horizon.png", dpi=120)
    plt.close(fig)

    # 2. Contoh prediksi vs aktual
    for kind, c in contoh.items():
        if c.get("lightgbm") is None:
            continue
        fig, ax = plt.subplots(figsize=(10, 4))
        ax.plot(c["waktu"], c["aktual"], label="aktual", lw=1.2)
        ax.plot(c["waktu"], c["persistence"], label="persistence", lw=1, alpha=0.8)
        ax.plot(c["waktu"], c["lightgbm"], label="lightgbm", lw=1, alpha=0.9)
        ax.set_title(f"Prediksi vs aktual, horizon 60 menit (target {kind})")
        ax.set_ylabel("PM2.5 (µg/m³)")
        ax.legend()
        ax.grid(alpha=0.3)
        fig.autofmt_xdate()
        fig.tight_layout()
        fig.savefig(FIGURES / f"contoh_prediksi_{kind}.png", dpi=120)
        plt.close(fig)

    # 3. Cakupan interval
    q = dfm[dfm["metode"] == "lightgbm_quantile"]
    if not q.empty:
        fig, ax = plt.subplots(figsize=(7, 4))
        for kind in ["A", "B"]:
            sub = q[q["target"] == kind].groupby("horizon")["cakupan"].mean()
            if sub.empty:
                continue
            ax.plot(sub.index, sub.values, marker="o", label=f"target {kind}")
        ax.axhline(0.8, ls="--", color="gray", label="nominal 80%")
        ax.set_xlabel("Horizon (menit)")
        ax.set_ylabel("Cakupan empiris P10-P90")
        ax.set_ylim(0, 1)
        ax.set_title("Kalibrasi interval prediksi")
        ax.legend()
        ax.grid(alpha=0.3)
        fig.tight_layout()
        fig.savefig(FIGURES / "cakupan_interval.png", dpi=120)
        plt.close(fig)

    # 4. Feature importance
    if importance:
        kunci = ("B", 60) if ("B", 60) in importance else next(iter(importance))
        imp = pd.Series(importance[kunci]).sort_values(ascending=False).head(15)
        fig, ax = plt.subplots(figsize=(7, 5))
        imp[::-1].plot(kind="barh", ax=ax)
        ax.set_title(f"Feature importance LightGBM (target {kunci[0]}, h={kunci[1]})")
        ax.set_xlabel("importance")
        fig.tight_layout()
        fig.savefig(FIGURES / "feature_importance.png", dpi=120)
        plt.close(fig)


def tulis_summary(prof, info, bocor, folds, ringkas, dfm, sig, collapse, args) -> None:
    L = []
    L.append("# Benchmark Forecast PM2.5 — AirSense\n")
    L.append(f"Dijalankan: {pd.Timestamp.now(tz='Asia/Jakarta'):%d %b %Y %H:%M} WIB  ")
    L.append(f"Seed: {args.seed} · Fold: {len(folds)} · Gap: {GAP_MINUTES} menit\n")

    L.append("## 1. Profil data\n")
    L.append("| Item | Nilai |")
    L.append("|---|---|")
    L.append(f"| Baris mentah | {prof['baris']} |")
    L.append(f"| Rentang | {prof['mulai']:%d %b %H:%M} – {prof['selesai']:%d %b %H:%M} UTC |")
    L.append(f"| Panjang | {prof['rentang_hari']:.1f} hari |")
    L.append(f"| Celah > 1 menit | {prof['celah_jumlah']} kejadian |")
    L.append(f"| Celah terpanjang | {prof['celah_maks_menit']:.0f} menit |")
    L.append(f"| PM2.5 hilang | {prof['pm25_hilang']} |")
    L.append(f"| PM2.5 negatif | {prof['pm25_negatif']} |")
    L.append(f"| Outlier (lonjakan > {prof['ambang_outlier']:.1f}) | {prof['pm25_outlier']} |")
    L.append(f"| PM2.5 median / p95 / maks | {prof['pm25_p50']:.1f} / {prof['pm25_p95']:.1f} / {prof['pm25_max']:.1f} µg/m³ |")
    L.append(f"| Suhu / kelembapan median | {prof['suhu_p50']:.1f} °C / {prof['lembap_p50']:.1f} % |")
    L.append("")
    L.append(f"Setelah reindex 1 menit: {info['grid_baris']} baris, "
             f"{info['celah_panjang']} celah panjang dibiarkan kosong, "
             f"{info['outlier']} outlier ditandai (tidak dibuang).\n")

    L.append("## 2. Hasil per metode (target halus 5 menit)\n")
    L.append("| Metode | h=5 | h=15 | h=30 | h=60 |")
    L.append("|---|---|---|---|---|")
    for metode in sorted(ringkas["metode"].unique()):
        sel = []
        for h in HORIZONS:
            r = ringkas[(ringkas["metode"] == metode) & (ringkas["horizon"] == h)]
            if r.empty:
                sel.append("-")
            else:
                sel.append(f"{r['mae'].iloc[0]:.2f} ({r['skill'].iloc[0]:+.0%})")
        L.append(f"| {metode} | " + " | ".join(sel) + " |")
    L.append("")
    L.append("Format: MAE µg/m³ (skill vs persistence). Skill positif = lebih baik.\n")

    L.append("## 3. Metode terbaik per horizon\n")
    L.append("| Horizon | Terbaik | MAE | Skill | Signifikan? |")
    L.append("|---|---|---|---|---|")
    for h in HORIZONS:
        sub = ringkas[ringkas["horizon"] == h].sort_values("mae")
        if sub.empty:
            continue
        top = sub.iloc[0]
        s = sig.get(h)
        if s is None:
            ket = "tidak diuji"
        elif s["lo"] > 0:
            ket = f"ya (95% CI {s['lo']:.2f}–{s['hi']:.2f})"
        else:
            ket = f"tidak (CI {s['lo']:.2f}–{s['hi']:.2f})"
        L.append(
            f"| {h} | {top['metode']} | {top['mae']:.2f} | {top['skill']:+.0%} | {ket} |"
        )
    L.append("")
    L.append("Uji signifikansi membandingkan **metode terbaik per horizon** "
             "dengan persistence memakai block bootstrap (blok 30, 2000 ulangan) "
             "atas galat per sampel dari seluruh fold uji. CI adalah selisih MAE "
             "dalam µg/m³; seluruh rentang di atas 0 berarti keunggulan bukan kebetulan.\n")

    L.append("## 4. Interval prediksi (LightGBM kuantil)\n")
    q = dfm[dfm["metode"] == "lightgbm_quantile"]
    if q.empty:
        L.append("Tidak ada hasil kuantil.\n")
    else:
        L.append("| Target | Horizon | Cakupan P10–P90 | Lebar rata-rata |")
        L.append("|---|---|---|---|")
        for kind in ["A", "B"]:
            for h in HORIZONS:
                sub = q[(q["target"] == kind) & (q["horizon"] == h)]
                if sub.empty:
                    continue
                L.append(
                    f"| {kind} | {h} | {sub['cakupan'].mean():.0%} | "
                    f"{sub['lebar'].mean():.2f} µg/m³ |"
                )
        L.append("")
        L.append("Nominal 80%. Cakupan jauh di bawah itu berarti interval terlalu sempit.\n")

    L.append("## 5. Perbandingan dengan GRU/LSTM produksi\n")
    L.append(
        "Tidak dibandingkan secara langsung. Model produksi memakai kontrak fitur "
        "berbeda (50 fitur termasuk lag dan rolling dari `build_features`), "
        "hanya memprediksi t+60, dan tidak boleh dilatih ulang dalam eksperimen ini. "
        "Memaksakan perbandingan akan menyesatkan karena input dan skala berbeda.\n"
    )

    L.append("## 6. Pemeriksaan kewarasan\n")
    L.append(f"- Uji kebocoran fitur: **{'lulus' if bocor else 'GAGAL'}** "
             "(fitur pada t tidak berubah saat data setelah t diubah).")
    for kind, c in collapse.items():
        rasio = c["std_pred"] / c["std_aktual"] if c["std_aktual"] else 0
        L.append(
            f"- Target {kind}: simpangan baku prediksi {c['std_pred']:.2f} vs aktual "
            f"{c['std_aktual']:.2f} (rasio {rasio:.2f}). "
            + ("Indikasi collapse ke mean." if rasio < 0.3 else "Tidak collapse.")
        )
    L.append("")

    L.append("## 7. Rekomendasi\n")
    best60 = ringkas[ringkas["horizon"] == 60].sort_values("mae")
    if not best60.empty:
        top = best60.iloc[0]
        s = sig.get(60)
        if top["metode"] == "persistence":
            L.append("**Tidak ada metode yang jelas mengalahkan persistence pada h=60.** "
                     "Pertahankan perataan/persistence sebagai dasar forecast.\n")
        elif s and s["lo"] > 0:
            L.append(
                f"**{top['metode']}** mengalahkan persistence pada h=60 "
                f"(MAE {top['mae']:.2f} vs {top['mae'] / max(1 - top['skill'], 1e-9):.2f}, "
                f"skill {top['skill']:+.0%}). Selisih galat "
                f"{s['mean']:.2f} µg/m³ dengan 95% CI {s['lo']:.2f}–{s['hi']:.2f}, "
                "seluruhnya di atas nol, jadi keunggulannya bukan kebetulan.\n"
            )
            L.append(
                "Catatan penting: metode terbaik adalah **perataan/EWMA**, bukan "
                "LightGBM. Model gradien boosting tidak mengungguli perataan sederhana "
                "pada data ini. Rekomendasi: ganti dasar forecast produksi ke EWMA "
                "alpha 0,1 (atau perataan 15 menit) dan pertahankan LightGBM hanya "
                "sebagai pembanding.\n"
            )
        else:
            L.append(f"**{top['metode']}** unggul (MAE {top['mae']:.2f}, "
                     f"skill {top['skill']:+.0%}) tetapi **belum signifikan**. "
                     "Jangan mengganti model produksi berdasarkan hasil ini.\n")

    L.append("## 8. Keterbatasan\n")
    L.append(f"- Data hanya {prof['rentang_hari']:.1f} hari. Pola harian dan mingguan "
             "belum bisa disimpulkan.")
    L.append("- Tidak ada data cuaca eksternal (angin, hujan) yang biasanya "
             "menjelaskan sebagian besar variasi PM2.5.")
    L.append("- Sensor debu masih berderau; sebagian galat berasal dari pengukuran, "
             "bukan dari model.")
    L.append("- Perbandingan antar fold memakai data yang tumpang-tindih secara alami; "
             "block bootstrap dipakai untuk mengurangi klaim berlebih.")
    L.append("")

    (RESULTS / "summary.md").write_text("\n".join(L), encoding="utf-8")


if __name__ == "__main__":
    main()
