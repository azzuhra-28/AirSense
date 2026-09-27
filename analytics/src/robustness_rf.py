"""
AirSense - Random Forest Robustness Layer

Random Forest (500 pohon), dilatih dari 5 konsentrasi polutan
mentah, dengan noise injection saat training supaya model
tahan terhadap gangguan/fluktuasi sensor IoT.
"""

import os

import joblib
import numpy as np

from sklearn.ensemble import RandomForestClassifier

RF_FEATURES = [
    "pm25_ugm3",
    "pm10_ugm3",
    "co_ugm3",
    "no2_ugm3",
    "o3_ugm3",
]

RF_N_ESTIMATORS = 500
RF_NOISE_FRACTION = 0.10


def _inject_noise(X, noise_fraction=RF_NOISE_FRACTION, random_state=42):
    rng = np.random.default_rng(random_state)
    noise = rng.normal(
        loc=0.0,
        scale=X.std(axis=0) * noise_fraction,
        size=X.shape,
    )
    return X + noise


def train_robustness_rf(sensor_df, random_state=42):
    """
    Input : 5 konsentrasi polutan mentah (RF_FEATURES).
    Label : kolom ispu_category (harus sudah dihitung lebih
            dulu lewat add_current_ispu() di run_pipeline.py).
    """
    required = RF_FEATURES + ["ispu_category"]
    data = sensor_df.dropna(subset=required)

    if data.empty:
        raise RuntimeError(
            "Tidak ada baris dengan ISPU lengkap untuk training RF."
        )

    X = data[RF_FEATURES].to_numpy()
    y = data["ispu_category"].to_numpy()

    X_noisy = _inject_noise(X, random_state=random_state)

    X_train = np.vstack([X, X_noisy])
    y_train = np.concatenate([y, y])

    model = RandomForestClassifier(
        n_estimators=RF_N_ESTIMATORS,
        random_state=random_state,
        n_jobs=-1,
    )

    model.fit(X_train, y_train)

    return model


def predict_category(model, concentrations):
    """
    concentrations: dict {pollutant: value} untuk 5 polutan di
    RF_FEATURES.
    """
    X = np.array([[concentrations[p] for p in RF_FEATURES]])
    return model.predict(X)[0]


def save_model(model, path):
    joblib.dump(model, path)


def load_model(path):
    if not os.path.exists(path):
        return None
    return joblib.load(path)