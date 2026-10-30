"""Jalankan forecast lokal tiap N menit, berhenti sendiri kalau alat offline.

Dipakai selama GitHub Actions tidak bisa menjalankan inferensi per menit.
Model dibaca dari cache, jadi setiap siklus hanya inferensi (detik), bukan
training ulang.
"""

import argparse
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

from src.supabase_client import SUPABASE_URL, supabase_session

HERE = Path(__file__).resolve().parent
OFFLINE_MINUTES = 10


def sensor_age_minutes() -> float | None:
    """Usia pembacaan sensor terakhir, dalam menit."""
    s = supabase_session()
    r = s.get(
        f"{SUPABASE_URL}/rest/v1/tb_konsentrasi_gas",
        params={"select": "created_at", "order": "created_at.desc", "limit": 1},
        timeout=30,
    ).json()
    if not r:
        return None
    last = pd.to_datetime(r[0]["created_at"], utc=True, format="ISO8601")
    return (pd.Timestamp.now(tz="UTC") - last).total_seconds() / 60


def run_once(device: str) -> int:
    cmd = [sys.executable, "-m", "src.run_forecast_rnn", "--device", device]
    return subprocess.call(cmd, cwd=HERE)


def main() -> None:
    parser = argparse.ArgumentParser(description="Loop forecast lokal.")
    parser.add_argument("--interval", type=int, default=5, help="Jeda antar siklus (menit).")
    parser.add_argument("--device", default="cpu", help="cpu atau cuda.")
    parser.add_argument("--max-cycles", type=int, default=0, help="0 = tanpa batas.")
    args = parser.parse_args()

    cycle = 0
    while True:
        cycle += 1
        stamp = datetime.now(timezone.utc).astimezone().strftime("%H:%M:%S")
        print(f"\n{'=' * 60}\n[Siklus {cycle}] {stamp}\n{'=' * 60}", flush=True)

        age = sensor_age_minutes()
        if age is None:
            print("Tidak ada data sensor. Berhenti.", flush=True)
            return
        if age > OFFLINE_MINUTES:
            print(
                f"Sensor terakhir {age:.0f} menit lalu (ambang {OFFLINE_MINUTES}). "
                "Forecast akan mengulang data basi, jadi loop berhenti.",
                flush=True,
            )
            return

        rc = run_once(args.device)
        if rc != 0:
            print(f"Pipeline keluar dengan kode {rc}; lanjut siklus berikutnya.", flush=True)

        if args.max_cycles and cycle >= args.max_cycles:
            print(f"\nSelesai setelah {cycle} siklus.", flush=True)
            return

        print(f"\nMenunggu {args.interval} menit...", flush=True)
        time.sleep(args.interval * 60)


if __name__ == "__main__":
    main()
