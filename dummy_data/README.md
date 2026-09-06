# 🎲 Dummy Data Airlytics

Data dummy yang **sudah sesuai format asli** sistem Airlytics (lihat
`../docs/DOKUMENTASI_FORMAT_DATA_AIRLYTICS.md`). Dipakai dulu untuk development,
nanti tinggal ganti sumber ke backend asli.

> **v2 — dikalibrasi statistik data riil** (Tabel 4.6 laporan PA Yusuf,
> 27.986 baris per-menit): PM2.5 mean ~16, CO mean ~2900, NO2 mayoritas 0,
> O3 sering di floor 19.63, suhu ~34.7°C, plus spike acak & pola diurnal
> (CO puncak 09–11 & 19–21 WIB). Generator default sekarang **per menit**
> seperti firmware asli.

## Isi folder `output/`

| File | Tabel Tujuan / Konsumen | Isi |
|---|---|---|
| `dummy_tb_konsentrasi_gas` (.csv/.json/.sql) | `tb_konsentrasi_gas` | PM2.5, PM10, CO, NO2, O3 (µg/m³) + suhu + kelembapan |
| `dummy_tb_analog_out` (.csv/.json/.sql) | `tb_analog_out` | Nilai ADC mentah 0–4095 per sensor |
| `dummy_tb_prediksi_kualitas_udara` (.csv/.json/.sql) | `tb_prediksi_kualitas_udara` | ISPU per polutan (0–301) |
| `dummy_agregasi_per_jam.csv/.json` | tabel agregasi dashboard (baru, lihat Lampiran B) | rata-rata & maksimum per jam |
| `dummy_forecast_60menit.json` | halaman Predict (Anggota 3) | output XGBoost: 60 titik × 3 polutan + ringkasan ISPU/kategori/dominan |

Default: **7 hari terakhir, interval 1 menit** (10.081 baris/tabel) —
persis seperti firmware asli yang kirim tiap 60 detik.
Timestamp UTC (ISO 8601, sama seperti Supabase `TIMESTAMPTZ`).

## Cara pakai (pilih salah satu)

### A. SQL — langsung ke Supabase (paling cepat)
1. Buka Supabase Dashboard → **SQL Editor**
2. Pastikan tabel sudah dibuat (jalankan `db_airlytics.sql` dulu kalau belum)
3. Copy-paste isi `dummy_tb_*.sql` → **Run**
4. Cek: `SELECT * FROM tb_konsentrasi_gas ORDER BY created_at DESC LIMIT 10;`

### B. CSV — import via Table Editor
1. Supabase Dashboard → **Table Editor** → pilih tabel
2. Klik **⋮ (Insert) → Import data from CSV** → pilih file `.csv`
3. Kolom `id` **tidak perlu** diisi (auto identity), `created_at` sudah ada di file

### C. JSON — POST via REST API (ke backend mana pun)
```bash
curl -X POST "https://<PROJECT>.supabase.co/rest/v1/tb_konsentrasi_gas" \
  -H "apikey: <ANON_KEY>" \
  -H "Authorization: Bearer <ANON_KEY>" \
  -H "Content-Type: application/json" \
  -d @dummy_tb_konsentrasi_gas.json
```
(Bisa juga 1 baris saja: `-d '{"pm25_ugm3": 28.43, ...}'` — `created_at` boleh dihilangkan)

## ⚠️ Catatan penting

1. **Nilai antar tabel saling konsisten** — ISPU dihitung dari µg/m³ dan ADC
   dihitung balik dari µg/m³ memakai rumus firmware asli ESP32, jadi aman
   dicek silang antar tabel.
2. **Jalankan SQL/CSV hanya sekali** — kalau diulang akan dobel data.
   Hapus dulu: `DELETE FROM public.tb_konsentrasi_gas;` (dst)
3. **`id` dan `created_at`** dibiarkan/kirim apa adanya — DB akan generate
   kalau tidak dikirim.
4. **RLS**: kalau dashboard membaca pakai anon key dan tabel diaktifkan RLS
   tanpa policy, SELECT akan kosong. Solusi cepat:
   ```sql
   ALTER TABLE public.tb_konsentrasi_gas ENABLE ROW LEVEL SECURITY;
   CREATE POLICY "allow read" ON public.tb_konsentrasi_gas FOR SELECT USING (true);
   CREATE POLICY "allow insert" ON public.tb_konsentrasi_gas FOR INSERT WITH CHECK (true);
   ```
   (ulangi untuk 2 tabel lainnya)

## Regenerate data (ubah periode/kepadatan)

```bash
python generate_dummy.py            # 7 hari, PER MENIT (mirip firmware asli)
python generate_dummy.py 30 1       # 30 hari per menit (~43 ribu baris/tabel)
python generate_dummy.py 30 60      # 30 hari per jam (ringan, utk EDA cepat)
python generate_dummy.py 7 1 --seed 42     # hasil selalu sama (reproducible)
python generate_dummy.py 7 1 --no-sql      # skip file .sql (kalau import via CSV)
```

Pola data v2 (dikalibrasi laporan Yusuf):
- CO mean ~2900 µg/m³, puncak jam 09–11 & 19–21 WIB, kadang bump sampai ~8000
- PM2.5 mean ~16 (varians besar dini hari), spike ekstrem bersama PM10 ~1×/2 hari
- NO2 mayoritas 0 dengan spike jarang sampai ~250
- O3 sering mentok floor 19.63 (perilaku asli clamp firmware), naik siang hari
- Suhu mean ~34.7°C (peak 14.00), RH berkorelasi negatif (r ≈ −0.87)
- Korelasi PM2.5↔PM10 ≈ 0.94 (riil 0.70 — sudah cukup mirip untuk EDA)

## Validasi cepat (Anggota 2, sebelum mulai EDA)

```bash
python -c "import csv,statistics as st; rows=list(csv.DictReader(open('output/dummy_tb_konsentrasi_gas.csv'))); [print(k, round(st.mean(float(r[k]) for r in rows),2)) for k in rows[0] if k!='created_at']"
```
Expected: pm25≈16, pm10≈18, co≈2900, no2≈0–1, o3≈26, temperature≈35, humidity≈61.
