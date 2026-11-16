"""Kirim alert ke Telegram (opsional).

Diaktifkan hanya kalau TELEGRAM_BOT_TOKEN dan TELEGRAM_CHAT_ID diisi di
.env. Tanpa keduanya, fungsi ini tidak melakukan apa pun supaya pipeline
tetap jalan di mesin yang belum dikonfigurasi.
"""

import os

import requests

TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
CHAT_ID = os.getenv("TELEGRAM_CHAT_ID", "").strip()


def telegram_aktif() -> bool:
    return bool(TOKEN and CHAT_ID)


def kirim_telegram(pesan: str) -> bool:
    """Kirim satu pesan. Return True kalau Telegram menerimanya."""
    if not telegram_aktif():
        return False

    try:
        r = requests.post(
            f"https://api.telegram.org/bot{TOKEN}/sendMessage",
            json={
                "chat_id": CHAT_ID,
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