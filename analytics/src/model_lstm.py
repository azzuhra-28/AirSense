# ============================================================
# AirSense - LSTM Forecaster (PyTorch)
#
# Pendekatan berbeda dari model tree-based (XGBoost):
# - input berupa SEKUENS (window) berisi riwayat fitur, bukan
#   vektor fitur lag tunggal
# - arsitektur LSTM (recurrent neural network) untuk menangkap
#   ketergantungan temporal non-linear
# - direct forecasting t+60 (konsisten dgn pipeline yang ada)
# - satu model per polutan target
#
# Modul ini bersifat ADDITIVE: tidak mengubah train_forecast.py
# maupun run_pipeline.py milik pipeline utama.
# ============================================================

import os
from dataclasses import dataclass, field

import joblib
import numpy as np
import pandas as pd
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, TensorDataset

from sklearn.metrics import (
    mean_absolute_error,
    mean_squared_error,
)
from sklearn.preprocessing import StandardScaler

from .preprocess import (
    BASE_FEATURES,
    HORIZON_MINUTES,
    TARGETS,
)


# ============================================================
# Configuration
# ============================================================

DEFAULT_WINDOW = 60          # panjang sekuens (menit) yang dilihat LSTM
DEFAULT_HIDDEN = 64          # ukuran hidden state
DEFAULT_LAYERS = 2           # jumlah layer LSTM
DEFAULT_DROPOUT = 0.2        # regularisasi (data relatif pendek)
DEFAULT_LR = 1e-3
DEFAULT_EPOCHS = 60
DEFAULT_BATCH = 128
DEFAULT_PATIENCE = 8         # early stopping

MODEL_DIR = os.path.join(
    os.path.dirname(
        os.path.dirname(
            os.path.abspath(__file__)
        )
    ),
    "models",
)


# ============================================================
# Metrics
# ============================================================

def evaluate(y_true, y_pred):
    """
    Hitung MAE, RMSE, dan MAPE.

    MAPE dihitung hanya pada titik di mana nilai aktual cukup
    besar (>= ambang) untuk menghindari distorsi akibat pembagi
    mendekati nol (mis. NO2 yang banyak bernilai 0).
    """

    y_true = np.asarray(y_true, dtype=float)
    y_pred = np.asarray(y_pred, dtype=float)

    mae = mean_absolute_error(y_true, y_pred)
    rmse = float(
        np.sqrt(
            mean_squared_error(y_true, y_pred)
        )
    )

    mask = np.abs(y_true) >= 1e-6
    if mask.sum() > 0:
        mape = float(
            np.mean(
                np.abs(
                    (y_true[mask] - y_pred[mask])
                    / y_true[mask]
                )
            )
            * 100.0
        )
    else:
        mape = float("nan")

    return {
        "mae": float(mae),
        "rmse": rmse,
        "mape": mape,
    }


# ============================================================
# Model
# ============================================================

class SequenceForecaster(nn.Module):
    """
    Recurrent forecaster many-to-one.

    Mendukung beberapa arsitektur:
    - "lstm"   : LSTM standar (unidirectional)
    - "bilstm" : Bidirectional LSTM
    - "gru"    : GRU

        [batch, window, n_features]
              -> recurrent layer
              -> hidden state terakhir (digabung jika bidirectional)
              -> dropout
              -> linear
              -> [batch, 1]
    """

    SUPPORTED = ("lstm", "bilstm", "gru")

    def __init__(
        self,
        n_features,
        hidden_size=DEFAULT_HIDDEN,
        num_layers=DEFAULT_LAYERS,
        dropout=DEFAULT_DROPOUT,
        arch="lstm",
    ):
        super().__init__()

        arch = arch.lower()
        if arch not in self.SUPPORTED:
            raise ValueError(
                f"arch tidak dikenal: {arch}. "
                f"Pilihan: {self.SUPPORTED}"
            )

        self.arch = arch
        self.bidirectional = arch == "bilstm"

        recurrent_dropout = (
            dropout if num_layers > 1 else 0.0
        )

        if arch in ("lstm", "bilstm"):
            self.recurrent = nn.LSTM(
                input_size=n_features,
                hidden_size=hidden_size,
                num_layers=num_layers,
                batch_first=True,
                dropout=recurrent_dropout,
                bidirectional=self.bidirectional,
            )
        else:  # gru
            self.recurrent = nn.GRU(
                input_size=n_features,
                hidden_size=hidden_size,
                num_layers=num_layers,
                batch_first=True,
                dropout=recurrent_dropout,
                bidirectional=False,
            )

        head_input = (
            hidden_size * 2
            if self.bidirectional
            else hidden_size
        )

        self.dropout = nn.Dropout(dropout)

        self.head = nn.Linear(
            head_input,
            1,
        )

    def forward(self, x):
        output, _ = self.recurrent(x)
        last = output[:, -1, :]
        last = self.dropout(last)
        return self.head(last).squeeze(-1)


# Alias kompatibilitas mundur.
LSTMForecaster = SequenceForecaster


# ============================================================
# Sequence Builder
# ============================================================

def _build_sequences(
    df: pd.DataFrame,
    feature_columns: list[str],
    target_column: str | None,
    window: int,
):
    """
    Susun sekuens [window, n_features] untuk setiap baris.

    Target (jika ada) adalah nilai target pada baris terakhir
    window tersebut (direct t+horizon).
    """

    feature_array = df[
        feature_columns
    ].to_numpy(dtype=np.float32)

    targets = None
    if target_column is not None:
        targets = df[
            target_column
        ].to_numpy(dtype=np.float32)

    n = len(df)
    if n <= window:
        return (
            np.empty(
                (0, window, len(feature_columns)),
                dtype=np.float32,
            ),
            np.empty((0,), dtype=np.float32)
            if target_column is not None
            else None,
        )

    n_seq = n - window + 1

    sequences = np.empty(
        (n_seq, window, len(feature_columns)),
        dtype=np.float32,
    )

    for i in range(n_seq):
        sequences[i] = feature_array[
            i:i + window
        ]

    if target_column is not None:
        seq_targets = targets[
            window - 1:
        ]
    else:
        seq_targets = None

    return sequences, seq_targets


# ============================================================
# Training
# ============================================================

@dataclass
class LSTMConfig:
    window: int = DEFAULT_WINDOW
    hidden_size: int = DEFAULT_HIDDEN
    num_layers: int = DEFAULT_LAYERS
    dropout: float = DEFAULT_DROPOUT
    learning_rate: float = DEFAULT_LR
    epochs: int = DEFAULT_EPOCHS
    batch_size: int = DEFAULT_BATCH
    patience: int = DEFAULT_PATIENCE
    seed: int = 42
    device: str | None = None
    arch: str = "lstm"
    extra: dict = field(default_factory=dict)


def _resolve_device(config: LSTMConfig):
    if config.device:
        return torch.device(config.device)
    return torch.device(
        "cuda"
        if torch.cuda.is_available()
        else "cpu"
    )


def _fit_scaler(
    train_df: pd.DataFrame,
    feature_columns: list[str],
):
    scaler = StandardScaler()
    scaler.fit(
        train_df[feature_columns]
        .to_numpy(dtype=np.float64)
    )
    return scaler


def _fit_target_scaler(
    train_df: pd.DataFrame,
    target_column: str,
):
    """
    Standarisasi TARGET juga (bukan hanya fitur).

    Penting untuk polutan dengan magnitudo besar seperti CO
    (~2900 µg/m³): tanpa ini, loss validasi tidak konvergen dan
    model cenderung jatuh ke prediksi nilai rata-rata.
    """

    scaler = StandardScaler()
    scaler.fit(
        train_df[target_column]
        .to_numpy(dtype=np.float64)
        .reshape(-1, 1)
    )
    return scaler


def _scale(
    df: pd.DataFrame,
    feature_columns: list[str],
    scaler: StandardScaler,
):
    out = df.copy()
    out[feature_columns] = scaler.transform(
        df[feature_columns]
        .to_numpy(dtype=np.float64)
    )
    return out


def train_lstm_for_target(
    train_df: pd.DataFrame,
    val_df: pd.DataFrame,
    feature_columns: list[str],
    target_column: str,
    target_name: str,
    config: LSTMConfig | None = None,
    verbose: bool = True,
):
    """
    Latih satu LSTM untuk satu target polutan.

    Return dict berisi model, scaler, konfigurasi, dan metrik
    validasi terbaik.
    """

    config = config or LSTMConfig()

    torch.manual_seed(config.seed)
    np.random.seed(config.seed)

    device = _resolve_device(config)
    config.device = str(device)

    scaler = _fit_scaler(
        train_df,
        feature_columns,
    )

    target_scaler = _fit_target_scaler(
        train_df,
        target_column,
    )

    train_scaled = _scale(
        train_df,
        feature_columns,
        scaler,
    )

    val_scaled = _scale(
        val_df,
        feature_columns,
        scaler,
    )

    # Standarisasi target agar skala loss seragam antar polutan.
    train_scaled[target_column] = (
        target_scaler.transform(
            train_df[target_column]
            .to_numpy(dtype=np.float64)
            .reshape(-1, 1)
        )
        .ravel()
    )

    val_scaled[target_column] = (
        target_scaler.transform(
            val_df[target_column]
            .to_numpy(dtype=np.float64)
            .reshape(-1, 1)
        )
        .ravel()
    )

    X_train, y_train = _build_sequences(
        train_scaled,
        feature_columns,
        target_column,
        config.window,
    )

    X_val, y_val = _build_sequences(
        val_scaled,
        feature_columns,
        target_column,
        config.window,
    )

    if len(X_train) == 0 or len(X_val) == 0:
        raise RuntimeError(
            f"Data sekuens tidak cukup untuk target "
            f"{target_name} (window={config.window})."
        )

    train_ds = TensorDataset(
        torch.from_numpy(X_train),
        torch.from_numpy(y_train),
    )

    train_loader = DataLoader(
        train_ds,
        batch_size=config.batch_size,
        shuffle=True,
    )

    X_val_t = torch.from_numpy(X_val).to(device)
    y_val_t = torch.from_numpy(y_val).to(device)

    model = LSTMForecaster(
        n_features=len(feature_columns),
        hidden_size=config.hidden_size,
        num_layers=config.num_layers,
        dropout=config.dropout,
        arch=config.arch,
    ).to(device)

    criterion = nn.SmoothL1Loss()
    optimizer = torch.optim.Adam(
        model.parameters(),
        lr=config.learning_rate,
    )

    best_val_loss = np.inf
    best_state = None
    epochs_no_improve = 0

    for epoch in range(1, config.epochs + 1):

        model.train()
        for xb, yb in train_loader:
            xb = xb.to(device)
            yb = yb.to(device)

            optimizer.zero_grad()
            prediction = model(xb)
            loss = criterion(prediction, yb)
            loss.backward()
            optimizer.step()

        model.eval()
        with torch.no_grad():
            val_pred = model(X_val_t)
            val_loss = float(
                criterion(val_pred, y_val_t).item()
            )

        if val_loss < best_val_loss - 1e-6:
            best_val_loss = val_loss
            best_state = {
                k: v.detach().cpu().clone()
                for k, v in model.state_dict().items()
            }
            epochs_no_improve = 0
        else:
            epochs_no_improve += 1
            if epochs_no_improve >= config.patience:
                if verbose:
                    print(
                        f"  [{target_name}] early stop @ epoch {epoch}"
                    )
                break

        if verbose and epoch % 10 == 0:
            print(
                f"  [{target_name}] epoch {epoch:>3} "
                f"val_loss={val_loss:.5f}"
            )

    if best_state is not None:
        model.load_state_dict(best_state)

    model.eval()
    with torch.no_grad():
        val_pred_scaled = (
            model(X_val_t)
            .cpu()
            .numpy()
        )

    # Kembalikan ke skala asli (µg/m³) sebelum evaluasi.
    val_pred = (
        target_scaler.inverse_transform(
            val_pred_scaled.reshape(-1, 1)
        )
        .ravel()
    )

    y_val_original = (
        target_scaler.inverse_transform(
            y_val.reshape(-1, 1)
        )
        .ravel()
    )

    val_metrics = evaluate(
        y_val_original,
        np.clip(val_pred, 0, None),
    )

    return {
        "model": model,
        "scaler": scaler,
        "target_scaler": target_scaler,
        "features": feature_columns,
        "target": target_name,
        "target_column": target_column,
        "window": config.window,
        "horizon_minutes": HORIZON_MINUTES,
        "config": {
            "arch": config.arch,
            "hidden_size": config.hidden_size,
            "num_layers": config.num_layers,
            "dropout": config.dropout,
            "learning_rate": config.learning_rate,
            "epochs": config.epochs,
            "batch_size": config.batch_size,
            "patience": config.patience,
            "seed": config.seed,
            "device": config.device,
        },
        "validation": val_metrics,
    }


# ============================================================
# Inference
# ============================================================

def predict_lstm(
    bundle: dict,
    df: pd.DataFrame,
):
    """
    Prediksi untuk setiap baris pada df (yang sudah memiliki
    fitur lengkap). Mengembalikan array prediksi yang sejajar
    dengan baris valid (setelah window).
    """

    model = bundle["model"]
    scaler = bundle["scaler"]
    target_scaler = bundle["target_scaler"]
    feature_columns = bundle["features"]
    window = bundle["window"]

    device = torch.device(
        "cuda"
        if torch.cuda.is_available()
        else "cpu"
    )

    scaled = _scale(
        df,
        feature_columns,
        scaler,
    )

    X, _ = _build_sequences(
        scaled,
        feature_columns,
        None,
        window,
    )

    if len(X) == 0:
        return np.empty((0,), dtype=float)

    model = model.to(device)
    model.eval()

    predictions = []
    with torch.no_grad():
        for i in range(0, len(X), 512):
            batch = torch.from_numpy(
                X[i:i + 512]
            ).to(device)
            out = model(batch).cpu().numpy()
            predictions.append(out)

    prediction = np.concatenate(predictions)

    prediction = (
        target_scaler.inverse_transform(
            prediction.reshape(-1, 1)
        )
        .ravel()
    )

    return np.clip(prediction, 0, None)


def save_lstm_bundle(bundle: dict, target_name: str):
    os.makedirs(MODEL_DIR, exist_ok=True)

    path = os.path.join(
        MODEL_DIR,
        f"lstm_{target_name}.pt",
    )

    torch.save(
        {
            "state_dict": bundle["model"].state_dict(),
            "scaler": bundle["scaler"],
            "target_scaler": bundle["target_scaler"],
            "features": bundle["features"],
            "target": bundle["target"],
            "target_column": bundle["target_column"],
            "window": bundle["window"],
            "horizon_minutes": bundle["horizon_minutes"],
            "config": bundle["config"],
            "validation": bundle["validation"],
        },
        path,
    )

    return path


def load_lstm_bundle(target_name: str):
    path = os.path.join(
        MODEL_DIR,
        f"lstm_{target_name}.pt",
    )

    payload = torch.load(
        path,
        map_location="cpu",
        weights_only=False,
    )

    model = LSTMForecaster(
        n_features=len(payload["features"]),
        hidden_size=payload["config"]["hidden_size"],
        num_layers=payload["config"]["num_layers"],
        dropout=payload["config"]["dropout"],
        arch=payload["config"].get("arch", "lstm"),
    )

    model.load_state_dict(
        payload["state_dict"]
    )

    return {
        "model": model,
        "scaler": payload["scaler"],
        "target_scaler": payload["target_scaler"],
        "features": payload["features"],
        "target": payload["target"],
        "target_column": payload["target_column"],
        "window": payload["window"],
        "horizon_minutes": payload["horizon_minutes"],
        "config": payload["config"],
        "validation": payload["validation"],
    }
