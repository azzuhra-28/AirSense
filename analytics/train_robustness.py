"""
Jalankan sekali untuk melatih dan menyimpan RF robustness layer.

Cara pakai:
    cd analytics
    python train_robustness.py
"""

import os

import pandas as pd

from src.run_pipeline import (
    add_current_ispu,
    check_connection,
    fetch_rows,
    supabase_session,
    TABLE_GAS,
)
from src.preprocess import load_to_df
from src.robustness_rf import save_model, train_robustness_rf


def main():
    check_connection()
    session = supabase_session()

    rows = fetch_rows(session, TABLE_GAS)
    raw_df = pd.DataFrame(rows)

    sensor_df = load_to_df(raw_df.to_dict(orient="records"))
    sensor_df = add_current_ispu(sensor_df)

    model = train_robustness_rf(sensor_df)

    model_dir = os.path.join(os.path.dirname(__file__), "models")
    os.makedirs(model_dir, exist_ok=True)

    save_model(
        model,
        os.path.join(model_dir, "robustness_rf.joblib"),
    )

    print("RF robustness layer berhasil dilatih dan disimpan.")


if __name__ == "__main__":
    main()