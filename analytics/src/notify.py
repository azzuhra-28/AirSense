"""Kirim alert ke Telegram (opsional).

Diaktifkan hanya kalau TELEGRAM_BOT_TOKEN dan TELEGRAM_CHAT_ID diisi di
.env. Tanpa keduanya, fungsi ini tidak melakukan apa pun supaya pipeline
tetap jalan di mesin yang belum dikonfigurasi.
"""

import os
from pathlib import Path

import requests
from dotenv import load_dotenv

# notify.py bisa diimpor sebelum supabase_client.py, jadi .env harus
# dimuat di sini juga. Path eksplisit supaya tidak bergantung pada
# working directory systemd.
load_dotenv(Path(__file__).resolve().parents[1] / ".env")


def _token() -> str:
    return os.getenv("TELEGRAM_BOT_TOKEN", "").strip()


def _chat_id() -> str:
    return os.getenv("TELEGRAM_CHAT_ID", "").strip()


def telegram_aktif() -> bool:
    return bool(_token() and _chat_id())


def kirim_telegram(pesan: str) -> bool:
    """Kirim satu pesan. Return True kalau Telegram menerimanya."""
    token = _token()
    chat_id = _chat_id()
    if not token or not chat_id:
        return False

    try:
        r = requests.post(
            f"https://api.telegram.org/bot{token}/sendMessage",
            json={
                "chat_id": chat_id,
                "text": pesan,
                "parse_mode": "HTML",
                "disable_web_page_preview": True,
            },
            timeout=10,
        )
        return r.ok
    except requests.RequestException:
        # Notifikasi gagal tidak boleh menggagalkan penulisan alert.
        return False