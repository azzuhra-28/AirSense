"""
AIRLYTICS - Generator Data Dummy (v2 - kalibrasi data riil Yusuf)
=================================================================
Generate data dummy sesuai format sistem Airlytics (dokumentasi:
DOKUMENTASI_FORMAT_DATA_AIRLYTICS.md) untuk 3 tabel Supabase:

  1. tb_konsentrasi_gas          -> dummy_tb_konsentrasi_gas.csv/json/sql
  2. tb_analog_out               -> dummy_tb_analog_out.csv/json/sql
  3. tb_prediksi_kualitas_udara  -> dummy_tb_prediksi_kualitas_udara.csv/json/sql

Plus output tambahan (sesuai laporan PA Yusuf):
  4. dummy_agregasi_per_jam.csv  -> tabel agregasi per jam (avg/max) utk dashboard
  5. dummy_forecast_60menit.json -> output model XGBoost (60 titik, interval 1 menit)

v2 dikalibrasi terhadap STATISTIK DATA RIIL lapangan (Tabel 4.6 laporan):
  PM2.5: mean 16.06, std 3.07, range 8-141      | PM10: mean 17.94 (ratio ~1.12x PM2.5)
  CO   : mean 2923.7, std 493, range 918-8238   | NO2 : mayoritas ~0, spike jarang
  O3   : mean 22.46, sering di floor 19.63      | Suhu: mean 34.68, range 29.6-47.6
  RH   : mean 59.83, range 26-98                | Frekuensi: PER MENIT
Pola diurnal riil: CO puncak 09-11 & 19-21 WIB; PM variatif dini hari;
suhu-kelembapan berkorelasi negatif (r=-0.72); PM2.5-PM10 positif kuat (r=0.70).

Cara pakai:
  python generate_dummy.py                      -> default 7 hari terakhir, per menit
  python generate_dummy.py 30 1                 -> 30 hari, per menit
  python generate_dummy.py 7 60                 -> 7 hari, per jam (ringan)
  python generate_dummy.py 7 1 --seed 42        -> reproducible
  python generate_dummy.py 7 1 --no-sql         -> tanpa file .sql (kalau import via CSV)

Output ada di folder: dummy_data/output/
"""

import csv
import json
import math
import os
import random
import sys
from datetime import datetime, timedelta, timezone

# ----------------------------------------------------------------------------
# Konstanta dari firmware ESP32 (gp2y1010au0fread.ino, mics6814read.ino,
# mq131read.ino) - supaya nilai analog <-> ugm3 <-> ISPU saling konsisten.
# ----------------------------------------------------------------------------
VREF = 3.3
ADC_RES = 4095.0

O3_PPB_PER_VOLT = 341.38
O3_PPB_OFFSET = 126.55
O3_MOLAR_MASS = 48.0
O3_MIN_PPB = 10.0          # clamp firmware -> floor 19.63 ugm3 (terlihat di data riil!)

PM25_SCALE = 218.7
PM25_OFFSET = 9.7854

PM10_SCALE = 288.27
PM10_OFFSET = 15.753

NO2_PPM_PER_VOLT = 0.05
NO2_MOLAR_MASS = 46.01

CO_MOLAR_MASS = 28.01
MOLAR_VOLUME = 24.45

O3_FLOOR_UGM3 = O3_MIN_PPB * O3_MOLAR_MASS / MOLAR_VOLUME  # ~19.63

# ----------------------------------------------------------------------------
# Konversi ugm3 -> ADC (kebalikan rumus firmware, untuk dummy tb_analog_out)
# ----------------------------------------------------------------------------
def clamp_adc(v):
    return max(0, min(4095, int(round(v))))


def ugm3_to_adc_pm25(x):
    v = (x + PM25_OFFSET) / PM25_SCALE
    return clamp_adc(v / VREF * ADC_RES)


def ugm3_to_adc_pm10(x):
    v = (x + PM10_OFFSET) / PM10_SCALE
    return clamp_adc(v / VREF * ADC_RES)


def ugm3_to_adc_o3(x):
    ppb = max(x * MOLAR_VOLUME / O3_MOLAR_MASS, O3_MIN_PPB)
    v = (ppb + O3_PPB_OFFSET) / O3_PPB_PER_VOLT
    return clamp_adc(v / VREF * ADC_RES)


def ugm3_to_adc_no2(x):
    ppm = x * MOLAR_VOLUME / NO2_MOLAR_MASS / 1000.0
    v = ppm / NO2_PPM_PER_VOLT
    return clamp_adc(v / VREF * ADC_RES)


def ugm3_to_adc_co(x):
    ppm = x * MOLAR_VOLUME / CO_MOLAR_MASS / 1000.0
    RL, R0 = 10000.0, 7100.0
    if ppm <= 0:
        return 0
    Rs = R0 * (ppm ** (-1.0 / 1.18))
    vout = (VREF * RL) / (Rs + RL)
    return clamp_adc(vout / VREF * ADC_RES)


# ----------------------------------------------------------------------------
# Konversi ugm3 -> ISPU (rumus persis firmware / PermenLHK 14/2020)
# ----------------------------------------------------------------------------
def ispu_linear(x, Xb, Xa, Ib, Ia):
    return ((Ia - Ib) / (Xa - Xb)) * (x - Xb) + Ib


def ispu_pm25(x):
    if x <= 15.5:   return ispu_linear(x, 0, 15.5, 0, 50)
    if x <= 55.4:   return ispu_linear(x, 15.5, 55.4, 50, 100)
    if x <= 150.4:  return ispu_linear(x, 55.4, 150.4, 100, 200)
    if x <= 250.4:  return ispu_linear(x, 150.4, 250.4, 200, 300)
    return 301


def ispu_pm10(x):
    if x <= 50:     return ispu_linear(x, 0, 50, 0, 50)
    if x <= 150:    return ispu_linear(x, 50, 150, 50, 100)
    if x <= 350:    return ispu_linear(x, 150, 350, 100, 200)
    if x <= 420:    return ispu_linear(x, 350, 420, 200, 300)
    return 301


def ispu_co(x):
    if x <= 4000:   return ispu_linear(x, 0, 4000, 0, 50)
    if x <= 8000:   return ispu_linear(x, 4000, 8000, 50, 100)
    if x <= 15000:  return ispu_linear(x, 8000, 15000, 100, 200)
    if x <= 30000:  return ispu_linear(x, 15000, 30000, 200, 300)
    return 301


def ispu_no2(x):
    if x <= 80:     return ispu_linear(x, 0, 80, 0, 50)
    if x <= 200:    return ispu_linear(x, 80, 200, 50, 100)
    if x <= 1130:   return ispu_linear(x, 200, 1130, 100, 200)
    if x <= 2260:   return ispu_linear(x, 1130, 2260, 200, 300)
    return 301


def ispu_o3(x):
    if x <= 120:    return ispu_linear(x, 0, 120, 0, 50)
    if x <= 235:    return ispu_linear(x, 120, 235, 50, 100)
    if x <= 400:    return ispu_linear(x, 235, 400, 100, 200)
    if x <= 800:    return ispu_linear(x, 400, 800, 200, 300)
    return 301


def gauss(x, mu, sigma):
    return math.exp(-((x - mu) ** 2) / (2 * sigma ** 2))


# ----------------------------------------------------------------------------
# Generator baris per-menit, dikalibrasi statistik data riil (Tabel 4.6 laporan)
# ----------------------------------------------------------------------------
class SensorSim:
    """Simulasi stateful: ada event spike PM yang berlangsung beberapa menit."""

    def __init__(self, rng):
        self.rng = rng
        self.pm_spike_until = 0      # timestamp sampai kapan spike aktif
        self.pm_spike_mag = 0.0      # besaran tambahan PM saat spike
        self.no2_spike_min = 0
        self.no2_spike_val = 0.0
        self.co_bump_until = 0       # lonjakan CO mendadak (riil: max 8238)
        self.co_bump_mag = 0.0

    def maybe_start_spikes(self, ts):
        r = self.rng
        # Spike PM simultan (seperti event 30 Mei di data riil): ~1x/2 hari, 20-40 menit
        if ts.timestamp() > self.pm_spike_until and r.random() < 1 / (60 * 24 * 2):
            self.pm_spike_until = ts.timestamp() + r.randint(20, 40) * 60
            self.pm_spike_mag = r.uniform(60, 125)
        # Spike NO2 jarang (data riil: mayoritas ~0, max 309): ~1x/3 hari, 5-15 menit
        if ts.timestamp() > self.no2_spike_min and r.random() < 1 / (60 * 24 * 3):
            self.no2_spike_min = ts.timestamp() + r.randint(5, 15) * 60
            self.no2_spike_val = r.uniform(40, 250)
        # Bump CO: ~1x/1.5 hari, 10-25 menit, +1500-4200 (menghasilkan max ~8000an)
        if ts.timestamp() > self.co_bump_until and r.random() < 1 / (60 * 24 * 1.5):
            self.co_bump_until = ts.timestamp() + r.randint(10, 25) * 60
            self.co_bump_mag = r.uniform(1500, 4200)

    def row(self, ts):
        r = self.rng
        h = ts.hour + ts.minute / 60.0

        # --- CO: mean ~2900, puncak 09-11 & 19-21 (pola diurnal riil) ---
        rush = 850 * gauss(h, 10.0, 1.6) + 650 * gauss(h, 20.0, 2.0)
        co = 2650 + rush * r.uniform(0.85, 1.15) + r.gauss(0, 140)
        if self.co_bump_until > ts.timestamp():
            co += self.co_bump_mag * r.uniform(0.9, 1.1)
        co = max(950, min(8300, co))

        # --- PM2.5: mean ~16, varians lebih besar dini hari (22-03) ---
        night_var = 1.0 + 1.4 * gauss(h, 0.5, 2.5)
        pm25 = 15.2 + 2.6 * r.gauss(0, 1) * night_var
        if ts.timestamp() < self.pm_spike_until:
            decay = 1.0 - 0.5 * abs(math.sin(h * math.pi / 6))  # sedikit bentuk
            pm25 += self.pm_spike_mag * decay * r.uniform(0.9, 1.1)
        pm25 = max(8.0, min(145.0, pm25))

        # --- PM10: ~1.08x PM2.5 + komponen independen (target korelasi ~0.70-0.85) ---
        pm10 = pm25 * r.uniform(1.02, 1.15) + r.gauss(0, 2.0) + abs(r.gauss(0, 3.0)) - 1.4
        pm10 = max(7.5, min(245.0, pm10))

        # --- NO2: mayoritas ~0 (realita sensor), spike jarang ---
        if ts.timestamp() < self.no2_spike_min:
            no2 = self.no2_spike_val * r.uniform(0.85, 1.15)
        else:
            no2 = max(0.0, r.gauss(0.3, 0.5)) if r.random() < 0.35 else 0.0

        # --- O3: sering di floor 19.63, naik siang (fotokimia) ---
        noon = gauss(h, 13.5, 3.0)
        o3 = O3_FLOOR_UGM3 + max(0.0, 75.0 * noon - 12.0) * r.uniform(0.6, 1.1)
        if r.random() < 0.55:
            o3 = O3_FLOOR_UGM3 + r.uniform(0, 1.5)
        o3 = max(O3_FLOOR_UGM3, min(142.0, o3))

        # --- Suhu/RH: mean 34.7 / 59.8, korelasi negatif kuat ---
        daily_t = 4.2 * gauss(h, 14.0, 3.8) + 1.2 * gauss(h, 12.0, 6.0)
        temp = 32.6 + daily_t + r.gauss(0, 0.9)
        humi = 66.0 - 2.6 * (temp - 33.0) + r.gauss(0, 3.0)
        temp = round(max(29.6, min(47.0, temp)), 2)
        humi = round(max(28.0, min(97.0, humi)), 2)

        pm25, pm10 = round(pm25, 2), round(pm10, 2)
        co, no2, o3 = round(co, 2), round(no2, 2), round(o3, 2)

        row_gas = {
            "pm25_ugm3": pm25, "pm10_ugm3": pm10, "co_ugm3": co,
            "no2_ugm3": no2, "o3_ugm3": o3, "temperature": temp, "humidity": humi,
        }
        row_ispu = {
            "pm2_5_ispu": round(ispu_pm25(pm25), 2),
            "pm10_ispu": round(ispu_pm10(pm10), 2),
            "co_ispu": round(ispu_co(co), 2),
            "no2_ispu": round(ispu_no2(no2), 2),
            "o3_ispu": round(ispu_o3(o3), 2),
        }
        row_analog = {
            "o3_analog": ugm3_to_adc_o3(o3) + r.randint(-2, 2),
            "pm25_analog": ugm3_to_adc_pm25(pm25) + r.randint(-2, 2),
            "pm10_analog": ugm3_to_adc_pm10(pm10) + r.randint(-2, 2),
            "no2_analog": ugm3_to_adc_no2(no2) + r.randint(-2, 2),
            "co_analog": ugm3_to_adc_co(co) + r.randint(-5, 5),
        }
        for k in row_analog:
            row_analog[k] = clamp_adc(row_analog[k])

        return row_gas, row_analog, row_ispu


# ----------------------------------------------------------------------------
# Writer helpers
# ----------------------------------------------------------------------------
def write_csv(path, rows, fieldnames):
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(rows)


def write_json(path, rows):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(rows, f, indent=2, ensure_ascii=False)


def sql_quote(v):
    if v is None:
        return "NULL"
    if isinstance(v, str):
        return "'" + v.replace("'", "''") + "'"
    return str(v)


def write_sql(path, table, rows, fieldnames):
    lines = [
        f"-- Dummy data untuk {table} (dibuat otomatis oleh generate_dummy.py)",
        f"-- Jalankan sekali saja! Kalau ulang, hapus dulu:",
        f"-- DELETE FROM public.{table};",
        "",
    ]
    for r in rows:
        cols = ", ".join(fieldnames)
        vals = ", ".join(sql_quote(r[c]) for c in fieldnames)
        lines.append(f"INSERT INTO public.{table} ({cols}) VALUES ({vals});")
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")


# ----------------------------------------------------------------------------
# Agregasi per jam (konsep tabel agregasi dari laporan Yusuf, Gambar 3.4)
# ----------------------------------------------------------------------------
AGG_FIELDS = [
    "hour_bucket", "pm25_avg", "pm25_max", "pm10_avg", "pm10_max",
    "co_avg", "co_max", "no2_avg", "o3_avg", "temperature_avg", "humidity_avg",
]


def aggregate_hourly(rows_gas):
    buckets = {}
    for r in rows_gas:
        hour = r["created_at"][:13] + ":00:00+00:00"
        b = buckets.setdefault(hour, {"pm25": [], "pm10": [], "co": [], "no2": [],
                                      "o3": [], "t": [], "rh": []})
        b["pm25"].append(r["pm25_ugm3"]); b["pm10"].append(r["pm10_ugm3"])
        b["co"].append(r["co_ugm3"]);     b["no2"].append(r["no2_ugm3"])
        b["o3"].append(r["o3_ugm3"]);     b["t"].append(r["temperature"])
        b["rh"].append(r["humidity"])
    out = []
    for hour in sorted(buckets):
        b = buckets[hour]
        avg = lambda k: round(sum(b[k]) / len(b[k]), 2)
        out.append({
            "hour_bucket": hour,
            "pm25_avg": avg("pm25"), "pm25_max": round(max(b["pm25"]), 2),
            "pm10_avg": avg("pm10"), "pm10_max": round(max(b["pm10"]), 2),
            "co_avg": avg("co"), "co_max": round(max(b["co"]), 2),
            "no2_avg": avg("no2"),
            "o3_avg": avg("o3"),
            "temperature_avg": avg("t"),
            "humidity_avg": avg("rh"),
        })
    return out


# ----------------------------------------------------------------------------
# Dummy output model forecast (format sesuai dashboard laporan:
# area chart ISPU 60 titik, interval 1 menit, + kartu ringkasan)
# ----------------------------------------------------------------------------
FORECAST_TARGETS = ["pm2_5_ispu", "pm10_ispu", "co_ispu"]


def make_forecast(last_rows_ispu, end_ts):
    rng = random.Random(hash(end_ts.minute) + 7)
    series = {}
    for target in FORECAST_TARGETS:
        base = last_rows_ispu[-1][target]
        pts = []
        val = base
        for i in range(60):
            ts = end_ts + timedelta(minutes=i + 1)
            val = base + (val - base) * 0.92 + rng.gauss(0, base * 0.012)
            pts.append({"ts": ts.strftime("%Y-%m-%dT%H:%M:%S+00:00"),
                        "value": round(max(0.0, val), 2)})
        series[target] = pts

    # ringkasan: total ISPU = max antar polutan (aturan ISPU resmi)
    ispu_values = {t: series[t][-1]["value"] for t in FORECAST_TARGETS}
    dominant = max(ispu_values, key=ispu_values.get)
    total = ispu_values[dominant]
    if total <= 50: cat = "Baik"
    elif total <= 100: cat = "Sedang"
    elif total <= 200: cat = "Tidak Sehat"
    elif total <= 300: cat = "Sangat Tidak Sehat"
    else: cat = "Berbahaya"
    label = {"pm2_5_ispu": "PM2.5", "pm10_ispu": "PM10", "co_ispu": "CO"}

    return {
        "model": "xgboost",
        "model_params": {"n_estimators": 300, "max_depth": 6, "learning_rate": 0.05},
        "horizon_minutes": 60,
        "interval_minutes": 1,
        "generated_at": end_ts.strftime("%Y-%m-%dT%H:%M:%S+00:00"),
        "series": series,
        "summary": {
            "ispu_total": round(total, 2),
            "category": cat,
            "pollutan_dominan": label[dominant],
        },
    }


# ----------------------------------------------------------------------------
# Main
# ----------------------------------------------------------------------------
FIELDS = {
    "tb_konsentrasi_gas": [
        "created_at", "pm25_ugm3", "pm10_ugm3", "co_ugm3", "no2_ugm3",
        "o3_ugm3", "temperature", "humidity",
    ],
    "tb_analog_out": [
        "created_at", "o3_analog", "pm25_analog", "pm10_analog",
        "no2_analog", "co_analog",
    ],
    "tb_prediksi_kualitas_udara": [
        "created_at", "pm2_5_ispu", "pm10_ispu", "co_ispu",
        "no2_ispu", "o3_ispu",
    ],
}


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    days = int(args[0]) if len(args) > 0 else 7
    interval_min = int(args[1]) if len(args) > 1 else 1   # DEFAULT PER MENIT (sesuai firmware)
    seed = None
    if "--seed" in sys.argv:
        seed = int(sys.argv[sys.argv.index("--seed") + 1])
    make_sql = "--no-sql" not in sys.argv

    rng = random.Random(seed)
    sim = SensorSim(rng)

    end = datetime.now(timezone.utc).replace(second=0, microsecond=0)
    start = end - timedelta(days=days)

    rows_gas, rows_analog, rows_ispu = [], [], []
    ts = start
    while ts <= end:
        sim.maybe_start_spikes(ts)
        gas, analog, ispu = sim.row(ts)
        iso = ts.strftime("%Y-%m-%dT%H:%M:%S+00:00")
        rows_gas.append({"created_at": iso, **gas})
        rows_analog.append({"created_at": iso, **analog})
        rows_ispu.append({"created_at": iso, **ispu})
        ts += timedelta(minutes=interval_min)

    outdir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "output")
    os.makedirs(outdir, exist_ok=True)

    datasets = {
        "tb_konsentrasi_gas": rows_gas,
        "tb_analog_out": rows_analog,
        "tb_prediksi_kualitas_udara": rows_ispu,
    }

    for table, rows in datasets.items():
        base = os.path.join(outdir, f"dummy_{table}")
        write_csv(base + ".csv", rows, FIELDS[table])
        write_json(base + ".json", rows)
        if make_sql:
            write_sql(base + ".sql", table, rows, FIELDS[table])

    # --- agregasi per jam (utk dashboard/chart) ---
    agg = aggregate_hourly(rows_gas)
    write_csv(os.path.join(outdir, "dummy_agregasi_per_jam.csv"), agg, AGG_FIELDS)
    write_json(os.path.join(outdir, "dummy_agregasi_per_jam.json"), agg)

    # --- dummy forecast 60 menit (utk halaman Predict) ---
    fc = make_forecast(rows_ispu, end)
    with open(os.path.join(outdir, "dummy_forecast_60menit.json"), "w", encoding="utf-8") as f:
        json.dump(fc, f, indent=2, ensure_ascii=False)

    print(f"{days} hari, interval {interval_min} menit, seed={seed}")
    for table in datasets:
        print(f"  {table:32s} -> {len(datasets[table]):6d} rows")
    print(f"  dummy_agregasi_per_jam.csv       -> {len(agg):6d} rows")
    print(f"  dummy_forecast_60menit.json      -> 60 titik x 3 polutan")
    print(f"Output: {outdir}")


if __name__ == "__main__":
    main()
