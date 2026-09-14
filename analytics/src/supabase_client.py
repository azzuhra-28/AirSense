# ============================================================
# AirSense - Konstanta & Koneksi Supabase
# ============================================================
# Kredensial diambil dari file .env (JANGAN di-commit).
# Salin .env.example -> .env lalu isi kunci kamu.
# ============================================================

import os

from dotenv import load_dotenv
import requests

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")

# Nama tabel yang dipakai pipeline
TABLE_GAS = "tb_konsentrasi_gas"
TABLE_FORECAST = "tb_forecast"
TABLE_ALERT = "tb_alert"

# Konstanta firmware (jangan diubah - harus konsisten dgn perangkat)
MOLAR_VOLUME = 24.45
O3_MOLAR_MASS = 48.0
O3_MIN_PPB = 10.0


def supabase_session() -> requests.Session:
    """Session HTTP dengan header auth Supabase (publishable/service key)."""
    s = requests.Session()
    s.headers.update(
        {
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": "application/json",
        }
    )
    return s


def fetch_rows(sess, table, select="*", order="created_at.asc", limit=1000):
    """Ambil semua baris dengan pagination (batch 1000, sesuai laporan)."""
    rows = []
    offset = 0
    while True:
        r = sess.get(
            f"{SUPABASE_URL}/rest/v1/{table}",
            params={"select": select, "order": order, "limit": limit, "offset": offset},
            timeout=30,
        )
        r.raise_for_status()
        batch = r.json()
        rows.extend(batch)
        if len(batch) < limit:
            break
        offset += limit
    return rows


def insert_rows(sess, table, rows):
    """Insert daftar baris (dict). Return response status."""
    r = sess.post(f"{SUPABASE_URL}/rest/v1/{table}", json=rows, timeout=30)
    if r.status_code >= 400:
        raise RuntimeError(
            f"Insert {table} gagal: {r.status_code} {r.text[:400]}"
        )
    return r.status_code


def check_connection():
    """Cek kredensial & koneksi (opsional, untuk debugging)."""
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise RuntimeError(
            "SUPABASE_URL / SUPABASE_KEY kosong. Copy .env.example -> .env dan isi."
        )
    s = supabase_session()
    r = s.get(
        f"{SUPABASE_URL}/rest/v1/{TABLE_GAS}",
        params={"select": "id", "limit": 1},
        timeout=30,
    )
    r.raise_for_status()
    return True
