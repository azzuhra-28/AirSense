# ============================================================
# AirSense - Pastikan model sudah ada sebelum pipeline inferensi
# Kalau model belum ditrain, train dulu. Dipakai oleh
# GitHub Actions (cron) supaya jalan otomatis.
# ============================================================

import glob
import os
import sys

MODEL_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models")


def ensure():
    forecast_ok = len(glob.glob(os.path.join(MODEL_DIR, "xgboost_*.joblib"))) == 3
    classifier_ok = os.path.exists(os.path.join(MODEL_DIR, "random_forest_ispu.joblib"))

    if forecast_ok and classifier_ok:
        print("Model sudah ada, lanjut inferensi.")
        return True

    if not forecast_ok:
        print("Training model forecast (XGBoost)...")
        from src.train_forecast import train

        train(verbose=True)
    if not classifier_ok:
        print("Training model klasifikasi (Random Forest)...")
        from src.train_classifier import train

        train(verbose=True)
    return True


if __name__ == "__main__":
    sys.exit(0 if ensure() else 1)
