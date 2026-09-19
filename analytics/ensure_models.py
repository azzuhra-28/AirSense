# ============================================================
# AirSense - Forecast Model Availability Check
#
# Memastikan artifact model forecasting tersedia sebelum
# pipeline inferensi dijalankan.
#
# Jika artifact belum tersedia, training forecast dijalankan.
#
# Catatan:
# - Forecast mencakup PM2.5, PM10, CO, NO2, dan O3.
# - Model setiap polutan dapat berbeda:
#   Persistence, Ridge, atau XGBoost.
# - Persistence tidak membutuhkan file .joblib.
# - ISPU tidak membutuhkan model klasifikasi ML.
# ============================================================

import json
import os
import sys


MODEL_DIR = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "models",
)

METADATA_PATH = os.path.join(
    MODEL_DIR,
    "forecast_models_meta.json",
)

EXPECTED_TARGETS = {
    "pm25_ugm3",
    "pm10_ugm3",
    "co_ugm3",
    "no2_ugm3",
    "o3_ugm3",
}


def forecast_models_available():
    """
    Periksa apakah metadata dan seluruh artifact forecast
    yang dibutuhkan tersedia.

    Model Persistence tidak membutuhkan file .joblib.
    """

    if not os.path.exists(METADATA_PATH):
        return False

    try:
        with open(
            METADATA_PATH,
            "r",
            encoding="utf-8",
        ) as file:
            metadata = json.load(file)

    except (
        OSError,
        json.JSONDecodeError,
    ):
        return False

    models = metadata.get("models")

    if not isinstance(models, dict):
        return False

    if not EXPECTED_TARGETS.issubset(models.keys()):
        return False

    for target in EXPECTED_TARGETS:

        info = models[target]

        model_family = info.get(
            "selected_family"
        )

        if not model_family:
            return False

        # Persistence tidak membutuhkan estimator tersimpan.
        if model_family == "Persistence":
            continue

        model_file = info.get(
            "model_file"
        )

        if not model_file:
            return False

        if os.path.isabs(model_file):
            model_path = model_file
        else:
            model_path = os.path.join(
                MODEL_DIR,
                model_file,
            )

        if not os.path.exists(model_path):
            return False

    return True


def ensure():
    """
    Pastikan model forecasting tersedia sebelum inferensi.
    """

    if forecast_models_available():

        print(
            "Model forecast sudah tersedia, "
            "lanjut inferensi."
        )

        return True

    print(
        "Model forecast belum tersedia. "
        "Menjalankan training..."
    )

    from src.train_forecast import train

    train(verbose=True)

    if not forecast_models_available():
        raise RuntimeError(
            "Training selesai, tetapi artifact "
            "forecast belum lengkap."
        )

    print(
        "Training forecast selesai dan "
        "artifact model sudah tersedia."
    )

    return True


if __name__ == "__main__":

    sys.exit(
        0 if ensure() else 1
    )