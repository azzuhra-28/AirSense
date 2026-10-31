"""Cek ukuran tb_forecast sebelum dan sesudah retensi dijalankan."""

import sys

sys.path.insert(0, ".")

import pandas as pd

from src.supabase_client import SUPABASE_URL, supabase_session

s = supabase_session()

head = s.get(
    f"{SUPABASE_URL}/rest/v1/tb_forecast",
    params={"select": "id", "limit": 1},
    headers={"Prefer": "count=exact"},
    timeout=30,
)
total = head.headers.get("content-range", "").split("/")[-1]

old = s.get(
    f"{SUPABASE_URL}/rest/v1/tb_forecast",
    params={"select": "generated_at", "order": "generated_at.asc", "limit": 1},
    timeout=30,
).json()

new = s.get(
    f"{SUPABASE_URL}/rest/v1/tb_forecast",
    params={"select": "generated_at", "order": "generated_at.desc", "limit": 1},
    timeout=30,
).json()

print("Total baris : %s" % total)
if old and new:
    o = pd.to_datetime(old[0]["generated_at"], utc=True)
    n = pd.to_datetime(new[0]["generated_at"], utc=True)
    print("Data tertua : %s" % o.strftime("%d %b %Y %H:%M"))
    print("Data terbaru: %s" % n.strftime("%d %b %Y %H:%M"))
    print("Rentang     : %.1f hari" % ((n - o).total_seconds() / 86400))

    if total.isdigit():
        mb = int(total) * 395 / 1024 / 1024
        print("Perkiraan ukuran: %.1f MB" % mb)
