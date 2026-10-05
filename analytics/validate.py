# ============================================================
# AirSense - Skrip Validasi
#
# Mencakup:
# 1. ISPU breakpoint sanity check
# 2. Anomaly detection -- uji dengan lonjakan sintetis
# 3. RF robustness layer -- evaluasi out-of-sample (chronological)
#
# Validasi forecast (MAE/RMSE, chronological 70/15/15 split)
# SUDAH dilakukan otomatis di train_forecast.py setiap training
# jalan -- lihat log "Training" di GitHub Actions. MAPE sengaja
# tidak dipakai karena NO2 kadang bernilai 0 (lihat komentar di
# train_forecast.py).
#
# Cara pakai:
#     cd analytics
#     python validate.py
# ============================================================

import numpy as np
import pandas as pd

from src.anomaly import detect_anomalies
from src.ispu import ISPU_BREAKPOINTS, category_of, ispu_value
from src.preprocess import POLLUTANTS, load_to_df
from src.robustness_rf import RF_FEATURES, train_robustness_rf

from src.run_pipeline import (
    ISPU_ROLLING_WINDOW,
    add_current_ispu,
    check_connection,
    fetch_rows,
    supabase_session,
    TABLE_GAS,
)


# ============================================================
# 1. ISPU breakpoint sanity check
# ============================================================

def validate_ispu():

    print("=" * 60)
    print("1. VALIDASI ISPU -- breakpoint sanity check")
    print("=" * 60)

    passed = 0
    failed = 0

    for pollutant, breakpoints in ISPU_BREAKPOINTS.items():

        for (xb, xa, ib, ia) in breakpoints:

            result_lower = ispu_value(pollutant, xb)
            ok_lower = abs(result_lower - ib) < 0.01

            if ok_lower:
                passed += 1
            else:
                failed += 1
                print(
                    f"  GAGAL {pollutant} @ {xb}: "
                    f"expected {ib}, got {result_lower}"
                )

            result_upper = ispu_value(pollutant, xa)
            ok_upper = abs(result_upper - ia) < 0.01

            if ok_upper:
                passed += 1
            else:
                failed += 1
                print(
                    f"  GAGAL {pollutant} @ {xa}: "
                    f"expected {ia}, got {result_upper}"
                )

    print(
        f"Hasil breakpoint: {passed} titik sesuai, "
        f"{failed} gagal."
    )

    category_checks = [
        (0, "Baik"),
        (50, "Baik"),
        (51, "Sedang"),
        (100, "Sedang"),
        (101, "Tidak Sehat"),
        (200, "Tidak Sehat"),
        (201, "Sangat Tidak Sehat"),
        (300, "Sangat Tidak Sehat"),
        (301, "Berbahaya"),
    ]

    category_passed = 0

    for value, expected in category_checks:

        got = category_of(value)
        ok = got == expected

        if ok:
            category_passed += 1
        else:
            print(
                f"  GAGAL kategori @ ISPU={value}: "
                f"expected {expected}, got {got}"
            )

    print(
        f"Hasil kategori: {category_passed}/"
        f"{len(category_checks)} sesuai.\n"
    )

    return failed == 0 and category_passed == len(category_checks)


# ============================================================
# 2. Anomaly detection -- uji dengan lonjakan sintetis
# ============================================================

def validate_anomaly(sensor_df, n_injections=20, spike_multiplier=5):

    print("=" * 60)
    print("2. VALIDASI ANOMALY DETECTION -- lonjakan sintetis")
    print("=" * 60)

    df = sensor_df.copy().reset_index(drop=True)

    rng = np.random.default_rng(42)

    injection_indices = rng.choice(
        range(2000, len(df) - 10),
        size=n_injections,
        replace=False,
    )

    for idx in injection_indices:

        pollutant = rng.choice(POLLUTANTS)

        df.loc[idx, pollutant] = (
            df.loc[idx, pollutant] * spike_multiplier
        )

    anomaly_df, _ = detect_anomalies(df)

    detected_z = (
        anomaly_df.loc[injection_indices, "has_z_anomaly"]
        .fillna(False)
        .sum()
    )

    detected_iso = (
        anomaly_df.loc[injection_indices, "isolation_anomaly"]
        .fillna(False)
        .sum()
    )

    detected_any = (
        anomaly_df.loc[injection_indices, "has_z_anomaly"]
        .fillna(False)
        | anomaly_df.loc[injection_indices, "isolation_anomaly"]
        .fillna(False)
    ).sum()

    print(
        f"Lonjakan disuntikkan: {n_injections} titik "
        f"(dikali {spike_multiplier})"
    )
    print(f"Terdeteksi Z-Score         : {detected_z}/{n_injections}")
    print(f"Terdeteksi Isolation Forest: {detected_iso}/{n_injections}")
    print(f"Terdeteksi minimal 1 metode: {detected_any}/{n_injections}")

    false_positive_rate = (
        anomaly_df["has_z_anomaly"].fillna(False).sum()
        / len(df)
    )

    print(
        "False positive rate (Z-Score, data normal): "
        f"{false_positive_rate:.2%}\n"
    )

    return {
        "n_injections": n_injections,
        "detected_any": int(detected_any),
        "detection_rate": detected_any / n_injections,
    }


# ============================================================
# 3. RF robustness layer -- evaluasi out-of-sample
# ============================================================

def validate_rf(sensor_df):

    print("=" * 60)
    print("3. VALIDASI RF ROBUSTNESS LAYER -- out-of-sample")
    print("=" * 60)

    required = RF_FEATURES + ["ispu_category"]

    df = (
        sensor_df
        .dropna(subset=required)
    )

    df = df[df["ispu_category"] != "Belum tersedia"].reset_index(drop=True)

    n = len(df)
    train_end = int(n * 0.70)

    train_df = df.iloc[:train_end]
    test_df = df.iloc[train_end:]

    print(
        f"Data latih: {len(train_df)} baris | "
        f"Data uji: {len(test_df)} baris (belum pernah dilihat model)"
    )

    model = train_robustness_rf(train_df)

    X_test = test_df[RF_FEATURES].to_numpy()
    y_test = test_df["ispu_category"].to_numpy()

    y_pred = model.predict(X_test)

    accuracy = (y_pred == y_test).mean()

    print(f"Akurasi RF di data uji: {accuracy:.1%}\n")
    
    from collections import Counter

    majority_class = Counter(y_test).most_common(1)[0][0]
    baseline_accuracy = (y_test == majority_class).mean()

    print(
        f"Baseline (selalu tebak '{majority_class}'): "
        f"{baseline_accuracy:.1%}"
    )

    if accuracy < baseline_accuracy:
        print(
            "CATATAN: RF saat ini masih kalah dari baseline "
            "tebak-mayoritas pada data dummy ini. Kemungkinan "
            "besar karena distribusi nilai konsentrasi bergeser "
            "antara data latih dan data uji (drift pada data "
            "dummy). Evaluasi ulang direncanakan setelah data "
            "sensor asli tersedia.\n"
        )
    else:
        print(
            "RF mengungguli baseline tebak-mayoritas.\n"
        )

    return {
        "accuracy": float(accuracy),
        "n_test": len(test_df),
    }


# ============================================================
# Main
# ============================================================

def main():

    check_connection()

    session = supabase_session()

    rows = fetch_rows(session, TABLE_GAS)

    raw_df = pd.DataFrame(rows)

    sensor_df = load_to_df(
        raw_df.to_dict(orient="records")
    )

    if len(sensor_df) < ISPU_ROLLING_WINDOW:
        print(
            "Data belum cukup untuk validasi ISPU 24 jam "
            f"(minimal {ISPU_ROLLING_WINDOW} baris)."
        )
        return

    sensor_df = add_current_ispu(sensor_df)

    ispu_ok = validate_ispu()
    anomaly_result = validate_anomaly(sensor_df)
    rf_result = validate_rf(sensor_df)

    print("=" * 60)
    print("RINGKASAN VALIDASI")
    print("=" * 60)

    print(
        f"ISPU breakpoint    : "
        f"{'LULUS' if ispu_ok else 'GAGAL'}"
    )

    print(
        "Anomaly detection  : "
        f"{anomaly_result['detection_rate']:.0%} "
        "lonjakan sintetis terdeteksi"
    )

    print(
        f"RF out-of-sample   : "
        f"{rf_result['accuracy']:.1%} akurasi"
    )

    print(
        "Forecast (MAE/RMSE): lihat log training "
        "(train_forecast.py, chronological 70/15/15 split)"
    )


if __name__ == "__main__":
    main()