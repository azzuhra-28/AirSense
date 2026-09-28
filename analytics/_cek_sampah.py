"""Lihat isi siklus 1-baris (apakah sampah atau data valid)."""

import sys

sys.path.insert(0, ".")

from src.supabase_client import SUPABASE_URL, supabase_session

s = supabase_session()
rows = s.get(
    f"{SUPABASE_URL}/rest/v1/tb_forecast",
    params={"select": "*",
            "generated_at": "gte.2026-09-28T15:06:18",
            "generated_at": "lt.2026-09-28T15:06:19",
            "limit": 5},
    timeout=30,
).json()
# gte+lt tidak bisa dobel key di dict params; pakai order desc + filter manual
rows = s.get(
    f"{SUPABASE_URL}/rest/v1/tb_forecast",
    params={"select": "*",
            "order": "generated_at.desc", "limit": 5},
    timeout=30,
).json()
for r in rows:
    print("---")
    for k in sorted(r.keys()):
        v = r[k]
        s2 = str(v)[:60] if v is not None else None
        print(f"  {k}: {s2}")
