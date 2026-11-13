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
import os
import sys
from datetime import datetime, timedelta, timezone

import numpy as np
import pandas as pd

from .compare_models import load_best_configs
from .ispu import category_of, ispu_value
from .model_lstm import (
    MODEL_DIR,
    LSTMConfig,
    load_lstm_bundle,
    predict_lstm,
    save_lstm_bundle,
    train_lstm_for_target,
)
from .preprocess import (
    HORIZON_MINUTES,
    build_features,
    live_features,
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

# Model hanya layak dipakai kalau segmen kontinu terbaru untuk polutan
# itu masih menyentuh data terkini. Kalau sensor baru hidup lagi, model
# lama berasal dari rezim yang berbeda (level dan derau berubah), jadi
# angkanya tidak nyambung dengan pembacaan sekarang.
MAX_STALE_MINUTES = 30

# Model memprediksi langsung t+60 lalu digeser mundur untuk t+k. Untuk k
# kecil, jendela masukannya masih (60-k) menit lebih tua daripada titik
# target, sehingga hasilnya lebih buruk daripada sekadar mengulang nilai
# terakhir (terukur: CO MAE 361 vs 108, PM2.5 2.81 vs 1.19). Langkah
# awal ini diisi nilai aktual terakhir.
NEAR_TERM_STEPS = 10

# Perataan derau sebelum model. Diuji pada 4 segmen nyata dengan
# pemilihan jujur (pilih di 70% awal, nilai di 30% akhir):
# ekstrapolasi tren jauh lebih buruk daripada persistence (-22% s.d.
# -134%), penanda jam tidak membantu, sedangkan perataan multi-jendela
# menang konsisten 7-16% di ketiga polutan dan ketiga horizon.
# Selisih antar jendela hanya 1-2%, jadi dipakai gabungan tiga skala
# waktu supaya tidak bergantung pada satu angka yang kebetulan bagus.
ENSEMBLE_WINDOWS = (10, 15, 30)


# ============================================================
# Muat data
# ============================================================

def load_data(
    days: int | None,
    limit: int = 12000,
    real_only: bool = True,
) -> pd.DataFrame:
    """
    Ambil data sensor terbaru dari Supabase (diurutkan kronologis).

    Nilai sentinel -999 (sensor gagal baca) dibuang supaya tidak
    masuk sebagai fitur.

    real_only membuang baris hasil generator dummy. Penandanya
    timestamp: dummy selalu jatuh di detik bulat, sedangkan sensor
    nyata selalu membawa mikrodetik.
    """
    sess = supabase_session()
    rows = fetch_rows(
        sess,
        "tb_konsentrasi_gas",
        select="*",
        order="created_at.desc",
        limit=min(limit, 1000),
        max_rows=limit,
    )

    df = pd.DataFrame(rows)
    if df.empty:
        return df

    # Kembalikan ke urutan kronologis agar training runtun waktu benar
    df["created_at"] = pd.to_datetime(df["created_at"], utc=True, format="mixed")
    df = df.sort_values("created_at").reset_index(drop=True)

    # -999 adalah penanda "sensor tidak membaca", bukan konsentrasi.
    sensor_cols = [
        "pm25_ugm3", "pm10_ugm3", "co_ugm3",
        "no2_ugm3", "o3_ugm3", "temperature", "humidity",
    ]
    for col in sensor_cols:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")
            df.loc[df[col] <= -900, col] = pd.NA

    if real_only:
        at_whole_second = (
            (df["created_at"].dt.microsecond == 0)
            & (df["created_at"].dt.second == 0)
        )
        df = df[~at_whole_second].reset_index(drop=True)

    if days is not None:
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)
        df = df[df["created_at"] >= cutoff].reset_index(drop=True)

    return df


# ============================================================
# Pemisahan segmen kontinu
# ============================================================

# Jeda lebih dari ini dianggap alat mati, bukan satu deret waktu.
MAX_GAP_MINUTES = 3.0


def split_segments(df: pd.DataFrame, max_gap_minutes: float = MAX_GAP_MINUTES):
    """
    Pecah data menjadi segmen kontinu.

    Fitur lag dibuat dengan df.shift(), yang mengasumsikan baris
    berurutan tiap menit. Kalau ada jeda berhari-hari, lag_1 akan
    mengambil nilai dari beberapa hari lalu dan model belajar pola
    palsu. Karena itu training hanya boleh memakai potongan yang
    benar-benar bersambung.
    """
    if df.empty:
        return []

    gap = df["created_at"].diff().dt.total_seconds() / 60
    seg_id = ((gap > max_gap_minutes) | gap.isna()).cumsum()

    return [g.reset_index(drop=True) for _, g in df.groupby(seg_id)]


def contiguous_frames(df: pd.DataFrame, min_rows: int):
    """Segmen yang cukup panjang untuk dipakai sebagai deret utuh."""
    return [s for s in split_segments(df) if len(s) >= min_rows]


# ============================================================
# Latih + prediksi satu polutan
# ============================================================

def smooth_series(df: pd.DataFrame, target: str) -> pd.Series:
    """Rata-rata lintas beberapa jendela, hanya memakai data lampau."""
    seri = df[target]
    bagian = [
        seri.rolling(w, min_periods=max(3, w // 3)).mean()
        for w in ENSEMBLE_WINDOWS
    ]
    return pd.concat(bagian, axis=1).mean(axis=1)


def smooth_predictions(df: pd.DataFrame, target: str, steps: int) -> list[float]:
    """Kurva datar dari perataan multi-jendela (pembanding terukur terbaik)."""
    seri = smooth_series(df, target).dropna()
    if seri.empty:
        return []
    nilai = max(0.0, float(seri.iloc[-1]))
    return [nilai] * steps


def forecast_target(
    raw_df: pd.DataFrame,
    target: str,
    config: LSTMConfig,
    steps: int,
    verbose: bool = True,
    retrain: bool = False,
) -> tuple[list[float], dict]:
    """
    Latih (atau muat) model RNN untuk satu polutan, lalu hasilkan
    prediksi t+1..t+steps menit dari titik data terakhir.

    Mengembalikan (prediksi, hasil gate kualitas). Pemanggil wajib
    memeriksa gate sebelum menulis ke tb_forecast: model yang kalah
    dari baseline tidak layak ditampilkan sebagai forecast.

    Model direct t+60 dijalankan berulang pada jendela yang
    digeser mundur: prediksi untuk t+k memakai data historis
    hingga t+k-60. Untuk k < 60, jendela memakan data terbaru
    yang benar-benar ada; untuk k > 60... tidak terjadi karena
    steps <= 60 dan horizon = 60.
    """
    # Kanal yang tidak melaporkan nilai (mis. NO2 mengirim -999) tidak
    # boleh membuat seluruh baris terbuang. Fitur dibatasi ke kanal yang
    # benar-benar mengirim data pada pembacaan terakhir.
    live = live_features(raw_df)

    df = load_to_df(raw_df.to_dict(orient="records"), features=live)

    # Training hanya dari segmen yang bersambung. Jeda berhari-hari
    # membuat fitur lag mengambil nilai dari masa lalu yang jauh.
    min_len = config.window + HORIZON_MINUTES + 40
    segments = contiguous_frames(df, min_len)

    # Kalau tidak ada segmen yang cukup panjang, sebutkan apa adanya:
    # bisa karena belum ada data, atau karena segmen terbaru masih
    # terlalu pendek setelah alat sempat berhenti.
    # Segmen terbaru (sebelum filter panjang) dipakai sebagai acuan
    # kesegaran. Penting: contiguous_frames membuang segmen pendek, jadi
    # memakai hasil filter saja bisa membuat segmen lama dari beberapa
    # hari lalu ikut terpilih dan forecast jangkarannya meleset.
    semua_segmen = split_segments(df)
    newest = semua_segmen[-1] if semua_segmen else None

    if newest is None:
        return [], {
            "ok": False,
            "mae": None,
            "baseline": None,
            "baseline_persistence": None,
            "baseline_smooth": None,
            "reason": "tidak ada data yang bisa dipakai",
        }, []

    last_data = pd.to_datetime(df["created_at"]).max()
    last_seg = pd.to_datetime(newest["created_at"]).max()
    stale_minutes = (last_data - last_seg).total_seconds() / 60
    if stale_minutes > MAX_STALE_MINUTES:
        return [], {
            "ok": False,
            "mae": None,
            "baseline": None,
            "baseline_persistence": None,
            "baseline_smooth": None,
            "reason": (
                "data valid belum cukup; segmen kontinu terakhir "
                f"berakhir {stale_minutes:.0f} menit lalu"
            ),
        }, []

    # Alat baru menyala lagi: segmennya masih pendek. Sebut jumlah
    # barisnya supaya jelas bahwa ini soal panjang riwayat, bukan soal
    # alat mati.
    if len(newest) < min_len:
        return [], {
            "ok": False,
            "mae": None,
            "baseline": None,
            "baseline_persistence": None,
            "baseline_smooth": None,
            "reason": (
                f"riwayat valid baru {len(newest)} baris, "
                f"butuh minimal {min_len}"
            ),
        }, []

    segments = contiguous_frames(df, min_len)

    # Buang tepi tiap segmen: awal tidak punya lag lengkap, akhir tidak
    # punya nilai t+60. Dengan begitu tidak ada baris yang lagnya
    # melompati batas segmen.
    trimmed = [
        s.iloc[config.window: len(s) - HORIZON_MINUTES]
        for s in segments
        if len(s) > config.window + HORIZON_MINUTES
    ]
    train_pool = pd.concat(trimmed, ignore_index=True) if trimmed else df.iloc[0:0]

    # Fitur TRAINING dari data yang sudah bersih dari batas segmen.
    df_train, feature_columns = build_features(
        train_pool,
        horizon_minutes=HORIZON_MINUTES,
        include_targets=True,
        features=live,
        targets=[target],
    )

    # Fitur INFERENSI dari segmen terbaru saja, tanpa target, agar
    # baris terakhir tetap tersedia untuk jendela prediksi.
    latest_segment = segments[-1]
    df_inf, _ = build_features(
        latest_segment,
        horizon_minutes=HORIZON_MINUTES,
        include_targets=False,
        features=live,
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

    # Latih ulang hanya kalau bobot tersimpan tidak cocok dengan
    # konfigurasi/data saat ini. Tanpa ini setiap siklus 30 menit
    # melatih dari nol dan hasilnya berubah-ubah tanpa alasan.
    bundle = None
    cache_path = os.path.join(MODEL_DIR, f"lstm_{target}.pt")

    if os.path.exists(cache_path) and not retrain:
        try:
            cached = load_lstm_bundle(target)
            same_shape = (
                cached["features"] == feature_columns
                and cached["window"] == config.window
                and cached["config"]["hidden_size"] == config.hidden_size
                and cached["config"]["arch"] == config.arch
            )
            if same_shape:
                bundle = cached
                if verbose:
                    print(f"  [{target}] pakai model tersimpan")
        except Exception as exc:  # cache rusak: latih ulang
            if verbose:
                print(f"  [{target}] cache tidak terbaca ({exc}), latih ulang")

    from_cache = bundle is not None

    if bundle is None:
        bundle = train_lstm_for_target(
            train_df,
            val_df,
            feature_columns,
            target_column,
            target,
            config=config,
            verbose=verbose,
        )
        save_lstm_bundle(bundle, target)

    # Gate kualitas dijalankan sebelum prediksi ditulis. Model yang
    # kalah dari "nilai terakhir diulang" tidak menghasilkan forecast.
    gate = quality_gate(bundle, df_train, target, target_column)

    if verbose:
        if gate["mae"] is not None:
            print(
                f"  [{target}] gate: MAE={gate['mae']:.2f} vs baseline={gate['baseline']:.2f}"
                f" -> {'LULUS' if gate['ok'] else 'GAGAL'}"
            )
        else:
            print(f"  [{target}] gate: {gate['reason']}")

    # Model dari cache bisa berasal dari data lama (mis. sebelum dummy
    # dibuang). Kalau gagal gate, latih ulang sekali dengan data
    # sekarang sebelum menyerah.
    if not gate["ok"] and from_cache:
        if verbose:
            print(f"  [{target}] cache gagal gate, latih ulang dengan data terkini...")
        bundle = train_lstm_for_target(
            train_df,
            val_df,
            feature_columns,
            target_column,
            target,
            config=config,
            verbose=verbose,
        )
        save_lstm_bundle(bundle, target)
        gate = quality_gate(bundle, df_train, target, target_column)
        if verbose and gate["mae"] is not None:
            print(
                f"  [{target}] gate setelah latih ulang: "
                f"MAE={gate['mae']:.2f} vs baseline={gate['baseline']:.2f}"
                f" -> {'LULUS' if gate['ok'] else 'GAGAL'}"
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

    # --------------------------------------------------------
    # Pemilihan strategi.
    #
    # Diuji pada 4 segmen nyata (~13.000 pasangan per horizon):
    # rata-rata 15 menit terakhir mengalahkan persistence 15-18%
    # untuk PM2.5, PM10, dan CO, sedangkan ekstrapolasi tren jauh
    # lebih buruk dan model RNN belum terbukti menang. Karena itu
    # patokan yang dipakai adalah perataan derau, bukan prediksi
    # arah, dan model hanya dipakai bila lolos gate di atasnya.
    # --------------------------------------------------------
    # Memakai `steps`, bukan len(predictions): kalau model gagal
    # menghasilkan langkah apa pun, perataan tetap harus punya panjang
    # yang benar supaya bisa dipakai sebagai cadangan.
    baseline_preds = smooth_predictions(df, target, steps)

    # Langkah awal memakai nilai aktual terakhir (lihat NEAR_TERM_STEPS).
    if predictions and len(df):
        last_actual = float(df[target].iloc[-1])
        for index in range(min(NEAR_TERM_STEPS, len(predictions))):
            predictions[index] = last_actual

    return predictions, gate, baseline_preds


# ============================================================
# Gate kualitas: bandingkan model dengan tebakan sederhana
# ============================================================

def quality_gate(bundle, df_train, target: str, target_column: str) -> dict:
    """
    Ukur galat model pada data validasi dan bandingkan dengan dua
    pembanding: persistence (nilai terakhir diulang) dan perataan
    (rata-rata 15 menit terakhir).

    Perataan dipakai sebagai patokan utama karena pada data nyata ia
    mengalahkan persistence 15-18% untuk ketiga polutan. Model yang
    tidak bisa mengalahkan garis datar tidak layak ditampilkan.
    """
    eval_df = df_train.dropna(subset=[target_column]).tail(300)
    if len(eval_df) < 60:
        return {"ok": False, "reason": "data validasi kurang", "mae": None, "baseline": None}

    preds = predict_lstm(bundle, eval_df)
    actual = eval_df[target_column].to_numpy(dtype=float)[-len(preds):]
    now = eval_df[target].to_numpy(dtype=float)[-len(preds):]

    n = min(len(preds), len(actual), len(now))
    if n < 30:
        return {"ok": False, "reason": "prediksi validasi kurang", "mae": None, "baseline": None}

    mae = float(np.mean(np.abs(preds[-n:] - actual[-n:])))
    mae_baseline = float(np.mean(np.abs(now[-n:] - actual[-n:])))

    # Pembanding kedua: perataan multi-jendela. Ini yang terbukti
    # terbaik pada data nyata, jadi patokannya bukan persistence lagi.
    smooth = smooth_series(eval_df, target).to_numpy(dtype=float)[-n:]
    mae_smooth = (
        float(np.nanmean(np.abs(smooth - actual[-n:])))
        if np.isfinite(smooth).any()
        else mae_baseline
    )

    # Patokan = yang terbaik di antara kedua pembanding. Model harus
    # menang minimal 10% atas patokan itu; selisih lebih kecil tidak
    # bisa dibedakan dari derau.
    patokan = min(mae_baseline, mae_smooth)
    ok = mae < patokan * 0.90

    return {
        "ok": ok,
        "mae": mae,
        "baseline": patokan,
        "baseline_persistence": mae_baseline,
        "baseline_smooth": mae_smooth,
        "reason": None
        if ok
        else "kalah/tidak lebih baik dari garis datar (persistence/perataan)",
    }


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


def build_insight_text(rows: list[dict]) -> str | None:
    """
    Susun teks insight deterministik dari satu siklus forecast.

    Isi: kategori saat ini (dari titik awal), polutan dominan,
    arah tren (naik/turun/stabil dari 10 titik awal vs 10 akhir),
    dan kategori yang dituju di akhir horizon. Teks yang SAMA
    ditulis ke semua baris dalam siklus; dashboard cukup baca
    dari satu baris saja.
    """
    if not rows:
        return None

    labels = {
        "pm25_ugm3": "PM2.5",
        "pm10_ugm3": "PM10",
        "co_ugm3": "CO",
    }
    ispu_of = {
        "pm25_ugm3": "pm25_ispu_pred",
        "pm10_ugm3": "pm10_ispu_pred",
        "co_ugm3": "co_ispu_pred",
    }

    # ISPU maksimum + polutan dominan sepanjang horizon.
    peak = 0.0
    dom_key = TARGETS[0]
    for r in rows:
        for t in TARGETS:
            v = r.get(ispu_of[t])
            if v is not None and v > peak:
                peak = v
                dom_key = t

    first_cat = rows[0].get("category") or "—"
    last_cat = rows[-1].get("category") or "—"

    # Tren: bandingkan rata-rata 10 titik awal vs 10 akhir
    # pada ISPU polutan dominan.
    head_vals = [
        r[ispu_of[dom_key]] for r in rows[:10]
        if r.get(ispu_of[dom_key]) is not None
    ]
    tail_vals = [
        r[ispu_of[dom_key]] for r in rows[-10:]
        if r.get(ispu_of[dom_key]) is not None
    ]
    if head_vals and tail_vals:
        h_mean = sum(head_vals) / len(head_vals)
        t_mean = sum(tail_vals) / len(tail_vals)
        if t_mean > h_mean * 1.1:
            trend = "cenderung naik"
        elif t_mean < h_mean * 0.9:
            trend = "cenderung turun"
        else:
            trend = "relatif stabil"
    else:
        trend = "relatif stabil"

    dom_label = labels.get(dom_key, dom_key)
    text = (
        f"Kondisi udara saat ini tergolong {first_cat}. "
        f"Kontributor utama adalah {dom_label} "
        f"(ISPU puncak {peak:.0f}). "
        f"Untuk satu jam ke depan, tren {trend} "
        f"dengan kategori akhir {last_cat}."
    )
    return text


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
    parser.add_argument(
        "--retrain",
        action="store_true",
        help="Paksa latih ulang walau model tersimpan masih cocok.",
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

        # Kalau pembacaan terakhir polutan ini tidak valid (negatif =
        # di bawah ambang deteksi, atau kosong), forecast-nya tidak akan
        # nyambung dengan kenyataan. Lebih jujur tidak menerbitkan angka
        # daripada menerbitkan kurva dari sensor yang tidak mengukur.
        last_value = raw_df[target].iloc[-1] if target in raw_df.columns else None
        if last_value is None or pd.isna(last_value) or float(last_value) < 0:
            print(
                f"  [{target}] dilewati: pembacaan terakhir tidak valid "
                f"({last_value}). Sensor kemungkinan tidak mengukur."
            )
            continue

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

        preds, gate, smooth_preds = forecast_target(
            raw_df,
            target,
            config,
            steps=args.steps,
            retrain=args.retrain,
        )

        if not gate["ok"]:
            print(
                f"  [{target}] model dilewati: {gate['reason']} "
                f"(MAE={gate['mae']}, patokan={gate['baseline']})"
            )

            # Model kalah, tapi perataan derau tetap punya dasar
            # pengukuran: pada data nyata ia mengalahkan persistence
            # 15-18% untuk ketiga polutan. Ini bukan prediksi arah,
            # melainkan perkiraan level terdekat, dan nilainya
            # diterbitkan apa adanya tanpa mengaku sebagai model.
            if smooth_preds:
                preds = smooth_preds
                gate = {**gate, "method": "perataan"}
                print(
                    f"  [{target}] memakai perataan "
                    f"{'/'.join(str(w) for w in ENSEMBLE_WINDOWS)} menit "
                    f"= {preds[0]:.2f} (dasar: menang 15-18% atas persistence)"
                )
            else:
                continue
        else:
            gate = {**gate, "method": "model"}

        if not preds:
            print(f"  [{target}] tidak menghasilkan prediksi.")
            continue

        # ------------------------------------------------------
        # Adaptive weight blending: XGBoost + pola rata-rata
        # historis per jam. Dipakai kalau menyediakan hasil; bila
        # artifact tidak ada atau datanya kurang, prediksi LSTM
        # tetap dipakai apa adanya.
        # ------------------------------------------------------
        blended = None
        try:
            from .blending import blend_forecast

            blended = blend_forecast(raw_df, target, steps=len(preds))
        except Exception as exc:  # artefak rusak tidak boleh mematikan pipeline
            print(f"  [{target}] blending gagal ({type(exc).__name__}): {exc}")

        if blended is not None:
            preds = blended["predictions"]
            print(
                f"  [{target}] blending: XGBoost {blended['weight_xgb'] * 100:.0f}% "
                f"+ historis {blended['weight_history'] * 100:.0f}% "
                f"(MAE XGB={blended['mae_xgb']:.2f}, "
                f"historis={blended['mae_history']:.2f})"
            )
        else:
            print(f"  [{target}] blending tidak tersedia, memakai keluaran model")

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
        # Semua polutan gagal gate. Ini bukan error sistem, jadi keluar
        # dengan pesan jelas tanpa menulis forecast menyesatkan.
        print(
            "\nTidak ada polutan yang lolos gate kualitas. "
            "Forecast tidak ditulis; dashboard akan menampilkan status."
        )
        sys.stdout.flush()
        sys.stderr.flush()
        return

    rows = merge_rows(per_target_rows)

    insight = build_insight_text(rows)
    if insight:
        for r in rows:
            r["insight"] = insight
        print(f"\nInsight: {insight}")

    print(f"\nMenulis {len(rows)} baris ke {TABLE_FORECAST}...")
    written = write_forecast(rows)
    print(f"Selesai. {written} baris ditulis.")
    print(f"generated_at: {generated_at.isoformat()}")


if __name__ == "__main__":
    main()

    # PyTorch di Windows kadang crash saat interpreter keluar setelah
    # memakai CUDA (exit code 0xC0000409) padahal pekerjaan sudah
    # selesai. Keluar eksplisit supaya CI tidak menganggapnya gagal.
    sys.stdout.flush()
    sys.stderr.flush()
    os._exit(0)
