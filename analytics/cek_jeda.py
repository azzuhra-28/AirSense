"""Laporan kesehatan data per hari: lubang, cakupan, dan segmen kontinu.

Dipakai selama masa pengumpulan data. Jalankan sekali sehari; selesai
dalam beberapa detik.

Pemakaian:
    python cek_jeda.py              # 7 hari terakhir
    python cek_jeda.py --hari 14
"""

import argparse
import sys

sys.path.insert(0, ".")

import pandas as pd

from src.blending import load_recent
from src.run_forecast_rnn import MAX_GAP_MINUTES

# Ambang panjang segmen untuk tiap model (window + horizon + 40).
BUTUH = {"pm25_ugm3": 130, "pm10_ugm3": 130, "co_ugm3": 160}


def main() -> None:
    parser = argparse.ArgumentParser(description="Laporan jeda data sensor.")
    parser.add_argument("--hari", type=int, default=7)
    args = parser.parse_args()

    df = load_recent("pm25_ugm3", limit=20000)
    if df.empty:
        print("Tidak ada data sensor.")
        return

    batas = pd.Timestamp.now(tz="UTC") - pd.Timedelta(days=args.hari)
    df = df[df["created_at"] >= batas].reset_index(drop=True)
    df["tanggal"] = df["created_at"].dt.tz_convert("Asia/Jakarta").dt.date

    print(f"Periode: {args.hari} hari terakhir")
    print(f"Total   : {len(df)} baris")
    print()

    # ---------------------------------------------------------
    # Cakupan per hari. Satu hari penuh = 1440 baris. Untuk hari ini,
    # pembandingnya adalah menit yang sudah berjalan, bukan 1440:
    # kalau dibandingkan dengan sehari penuh, hari yang baru berjalan
    # 15 menit akan selalu tampak bocor.
    # ---------------------------------------------------------
    sekarang = pd.Timestamp.now(tz="Asia/Jakarta")
    hari_ini = sekarang.date()
    menit_berjalan = max(1, int((sekarang - sekarang.normalize()).total_seconds() / 60))

    per_hari = df.groupby("tanggal").size()
    print("Baris per hari (%):")
    for tanggal, jumlah in per_hari.items():
        if tanggal == hari_ini:
            # Hari berjalan: bandingkan dengan menit yang sudah lewat.
            # Toleransi 10 menit dipakai supaya satu jeda pendek tidak
            # langsung dicap bocor padahal hari belum selesai.
            hilang = menit_berjalan - jumlah
            persen = jumlah / menit_berjalan * 100
            status = "berjalan" if hilang <= 10 else "BOCOR"
        elif tanggal == per_hari.index[0]:
            # Hari pertama jendela biasanya terpotong: data baru dimulai
            # di tengah hari, jadi tidak adil dibandingkan 1440.
            persen = jumlah / 1440 * 100
            status = "terpotong"
        else:
            persen = jumlah / 1440 * 100
            status = "ok  " if persen >= 95 else "BOCOR"
        print(f"  {tanggal}  {jumlah:5d} baris  {persen:5.1f}%  {status}")

    # ---------------------------------------------------------
    # Lubang: jeda lebih dari MAX_GAP_MINUTES memutus segmen.
    # ---------------------------------------------------------
    gap = df["created_at"].diff().dt.total_seconds() / 60
    lubang = df[gap > MAX_GAP_MINUTES]
    print()
    print(f"Lubang (jeda > {MAX_GAP_MINUTES:.0f} menit): {len(lubang)} kejadian")
    if len(lubang):
        for i in lubang.index:
            menit = gap.loc[i]
            print(
                f"  {df.loc[i, 'created_at'].tz_convert('Asia/Jakarta'):%d %b %H:%M} WIB"
                f"  jeda {menit:6.0f} menit"
            )
    else:
        print("  tidak ada. Data bersambung penuh.")

    # ---------------------------------------------------------
    # Segmen kontinu terakhir, dibanding kebutuhan tiap model.
    # ---------------------------------------------------------
    seg_id = ((gap > MAX_GAP_MINUTES) | gap.isna()).cumsum()
    terakhir = df[seg_id == seg_id.iloc[-1]]
    print()
    print(f"Segmen kontinu terakhir: {len(terakhir)} baris")
    if len(terakhir):
        mulai = terakhir["created_at"].iloc[0].tz_convert("Asia/Jakarta")
        akhir = terakhir["created_at"].iloc[-1].tz_convert("Asia/Jakarta")
        print(f"  dari {mulai:%d %b %H:%M} sampai {akhir:%d %b %H:%M} WIB")

    print()
    print("Kesiapan model:")
    for target, butuh in BUTUH.items():
        cukup = len(terakhir) >= butuh
        sisa = max(0, butuh - len(terakhir))
        tanda = "siap   " if cukup else f"kurang {sisa:3d}"
        print(f"  {target:10s} butuh {butuh:3d} baris  -> {tanda}")

    # ---------------------------------------------------------
    # Proyeksi: berapa lama lagi sampai seminggu penuh. Hari ini dan
    # hari pertama yang terpotong tidak dihitung.
    # ---------------------------------------------------------
    selesai = {
        t: v
        for t, v in per_hari.items()
        if t != hari_ini and t != per_hari.index[0]
    }
    if selesai:
        penuh = sum(1 for v in selesai.values() if v >= 1368)
        print()
        print(f"Hari penuh dengan cakupan >=95%: {penuh} dari {len(selesai)}")
        if penuh < 7:
            print(f"  perlu {7 - penuh} hari lagi tanpa jeda untuk mencapai seminggu")
        else:
            print("  target seminggu tercapai.")


if __name__ == "__main__":
    main()
