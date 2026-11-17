"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { fetchSkill, type Skill } from "@/lib/forecast-skill";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  Database,
  RefreshCw,
} from "lucide-react";

import { DashboardHeader } from "@/components/DashboardHeader";
import { useSensorData } from "@/components/SensorProvider";
import { getLatestForecast, subscribeForecast } from "@/lib/api";
import { aqiOf, AQI, POLLUTANT_COLOR } from "@/lib/brand";
import { bandFor, usingQuantiles, BAND_META } from "@/lib/forecastChart";
import {
  chartLimitMinutes,
  FORECAST_HORIZONS,
  hasReliableHorizon,
  maxReliableMinutes,
  reliableHorizons,
} from "@/lib/forecastHorizons";
import { ispuOf, toWIB } from "@/lib/ispu";
import type { ForecastRow } from "@/lib/types";

const DEVICES = ["Auditorium Lantai 6 Gedung PS PENS"];

/**
 * Kolom konsentrasi untuk tiap seri grafik.
 * CO memakai µg/m³ karena breakpoint ISPU memakai satuan itu.
 */
const ISPU_COLUMN = {
  pm25: "pm25_ugm3",
  pm10: "pm10_ugm3",
  co: "co_ugm3",
} as const;

/**
 * Ubah nilai seri ke ISPU.
 *
 * CO masuk dalam mg/m³ (sudah dibagi 1000), sedangkan breakpoint ISPU
 * memakai µg/m³, jadi dikalikan 1000 lebih dulu.
 */
function toIspu(key: "pm25" | "pm10" | "co", value: number | null) {
  if (value == null || !Number.isFinite(value)) return null;
  const ugm3 = key === "co" ? value * 1000 : value;
  const ispu = ispuOf(ISPU_COLUMN[key], ugm3);
  return Number.isFinite(ispu) ? ispu : null;
}

/**
 * Saran tindakan per kategori ISPU. Satu tempat supaya mudah diubah
 * tanpa menyentuh JSX.
 */
const SARAN_KATEGORI: Record<string, string> = {
  Baik: "Aman beraktivitas di luar ruangan.",
  Sedang: "Aman untuk aktivitas luar, kelompok sensitif tetap waspada.",
  "Tidak Sehat": "Batasi aktivitas luar, pertimbangkan masker.",
  "Sangat Tidak Sehat": "Hindari aktivitas luar, tutup jendela.",
  Berbahaya: "Tetap di dalam ruangan, nyalakan penyaring udara.",
};

const SERIES = [
  { key: "pm25", label: "PM2.5", unit: "µg/m³", color: POLLUTANT_COLOR.pm25 },
  { key: "pm10", label: "PM10", unit: "µg/m³", color: POLLUTANT_COLOR.pm10 },
  { key: "co", label: "CO", unit: "mg/m³", color: POLLUTANT_COLOR.co },
] as const;

export default function SummaryPage() {
  const data = useSensorData();
  const { refreshing, source, reload } = data;

  const [forecast, setForecast] = useState<ForecastRow[]>([]);
  const [forecastError, setForecastError] = useState<string | null>(null);
  const [forecastLoading, setForecastLoading] = useState(true);
  const [activeSeries, setActiveSeries] = useState<string[]>(["pm25"]);
  const reduceMotion = useReducedMotion();

  // Waktu sekarang disimpan di state agar render tetap murni.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const loadForecast = useCallback(async () => {
    setForecastError(null);
    try {
      const rows = await getLatestForecast();
      setForecast(rows);
    } catch (e) {
      setForecastError(e instanceof Error ? e.message : String(e));
    } finally {
      setForecastLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadForecast();
    const unsubscribe = subscribeForecast(() => {
      void loadForecast();
    });
    return unsubscribe;
  }, [loadForecast]);

  // Pilih seri yang benar-benar punya data, supaya grafik tidak kosong
  // hanya karena polutan default kebetulan tidak diproyeksikan.
  useEffect(() => {
    if (!forecast.length) return;
    const available: string[] = SERIES.filter((s) =>
      forecast.some((r) => r[`${s.key}_ugm3_pred` as keyof ForecastRow] != null)
    ).map((s) => s.key);
    if (!available.length) return;

    setActiveSeries((prev) => {
      const masihAda = prev.filter((k) => available.includes(k));
      return masihAda.length ? masihAda : [available[0]];
    });
  }, [forecast]);

  const chart = useMemo(() => {
    const terakhir = data.rows.length
      ? new Date(data.rows[data.rows.length - 1].created_at).getTime()
      : 0;
    return forecast
      .filter((r) => new Date(r.forecast_at).getTime() > terakhir)
      .map((r) => ({
        t: toWIB(r.forecast_at),
        pm25: r.pm25_ugm3_pred,
        pm10: r.pm10_ugm3_pred,
        co: r.co_ugm3_pred != null ? r.co_ugm3_pred / 1000 : null,
      }));
  }, [forecast, data.rows]);

  // Seri utama untuk ringkasan: yang pertama aktif dan punya data.
  const primaryKey = useMemo<"pm25" | "pm10" | "co">(() => {
    const first = SERIES.find((s) => activeSeries.includes(s.key));
    return (first?.key ?? "pm25") as "pm25" | "pm10" | "co";
  }, [activeSeries]);

  /** ISPU puncak sepanjang horizon forecast. */
  const peakIspu = useMemo(() => {
    let max = 0;
    for (const r of forecast) {
      for (const k of ["pm25_ispu_pred", "pm10_ispu_pred", "co_ispu_pred"] as const) {
        const v = Number(r[k]);
        if (Number.isFinite(v) && v > max) max = v;
      }
    }
    return max > 0 ? Math.round(max) : null;
  }, [forecast]);

  // Gabungan riwayat aktual dan forecast dalam satu deret waktu.
  // Ketidakpastian terukur, dipakai sebagai pita di sekitar forecast.
  const [skill, setSkill] = useState<Record<string, Skill>>({});

  useEffect(() => {
    let batal = false;
    fetchSkill(3)
      .then((s) => {
        if (!batal) setSkill(s);
      })
      .catch(() => {
        // Tanpa data evaluasi, pita tidak digambar. Garis tetap tampil.
      });
    return () => {
      batal = true;
    };
  }, []);

  /**
   * Jangkar waktu forecast.
   *
   * Pipeline menulis `forecast_at = pembacaan terakhir + k menit`, k = 1..60,
   * sehingga titik pertama selalu tepat 1 menit setelah jangkar. Memakai
   * pembacaan terakhir dari dashboard tidak akurat: sensor terus mengirim
   * setelah siklus forecast dibuat, jadi jangkar bergeser beberapa menit dan
   * titik ke-60 tidak lagi cocok dengan kartu.
   */
  const anchorTs = useMemo(() => {
    if (forecast.length) {
      return new Date(forecast[0].forecast_at).getTime() - 60_000;
    }

    const rows = data.rows;
    return rows.length
      ? new Date(rows[rows.length - 1].created_at).getTime()
      : null;
  }, [forecast, data.rows]);

  /**
   * Pita kuantil benchmark hanya dihitung untuk PM2.5. PM10 dan CO memakai
   * galat rata-rata terukur; untuk CO, MAE dibagi 1000 agar satuannya
   * mg/m³ seperti sumbu, bukan µg/m³.
   */
  const pakaiKuantil = primaryKey === "pm25";
  const maeTampil = useMemo(() => {
    const mae = skill[primaryKey]?.mae ?? null;
    if (mae == null || !Number.isFinite(mae)) return null;
    return primaryKey === "co" ? mae / 1000 : mae;
  }, [skill, primaryKey]);

  /** Kartu per horizon: nilai, selisih, rentang, kategori. */
  const horizonCards = useMemo(() => {
    const kunci = `${primaryKey}_ugm3` as "pm25_ugm3" | "pm10_ugm3" | "co_ugm3";
    const mentah = Number(data.latest?.[kunci]);
    const aktual = Number.isFinite(mentah)
      ? primaryKey === "co"
        ? mentah / 1000
        : mentah
      : null;

    // ISPU saat ini, dipakai untuk selisih tiap horizon.
    const ispuSekarang = toIspu(primaryKey, aktual);

    // Semua horizon yang dikonfigurasi tetap tampil. Yang belum andal
    // diberi lencana dan diredupkan, bukan disembunyikan diam-diam.
    const dipakai = FORECAST_HORIZONS;

    return dipakai.map((h) => {
      // Titik forecast pada menit ke-h, dihitung dari pembacaan terakhir.
      const titik = forecast.find((r) => {
        if (anchorTs == null) return false;
        const menit =
          (new Date(r.forecast_at).getTime() - anchorTs) / 60_000;
        return Math.round(menit) === h.minutes;
      });

      const predKey = `${primaryKey}_ugm3_pred` as keyof ForecastRow;
      const nilaiMentah = titik ? Number(titik[predKey]) : NaN;
      const level = Number.isFinite(nilaiMentah)
        ? primaryKey === "co"
          ? nilaiMentah / 1000
          : nilaiMentah
        : null;

      const pita =
        level == null
          ? { low: null, high: null, label: "", detail: null }
          : bandFor(level, h.minutes, maeTampil, pakaiKuantil);

      // Kategori ISPU memakai ambang polutan yang sedang dilihat. CO
      // dihitung dari µg/m³, sedangkan nilai tampilannya mg/m³.
      const ispu = toIspu(primaryKey, level);
      const tone = ispu == null ? null : aqiOf(ispu);

      // Rentang dihitung dalam konsentrasi, lalu dikonversi ke ISPU.
      const lowIspu = toIspu(primaryKey, pita.low);
      const highIspu = toIspu(primaryKey, pita.high);

      return {
        minutes: h.minutes,
        status: h.status,
        catatan: h.note,
        jamTujuan: titik ? toWIB(titik.forecast_at) : "-",
        ispu: ispu == null ? null : Math.round(ispu),
        delta:
          ispu == null || ispuSekarang == null
            ? null
            : Math.round(ispu - ispuSekarang),
        low: lowIspu == null ? null : Math.round(lowIspu),
        high: highIspu == null ? null : Math.round(highIspu),
        bandLabel: pita.label,
        bandDetail: pita.detail,
        kategori: tone?.label ?? null,
        warna: tone?.dot ?? null,
      };
    });
  }, [forecast, primaryKey, data.latest, maeTampil, pakaiKuantil, anchorTs]);

  /** Ringkasan satu kalimat, tanpa menyiratkan arah. */
  const kesimpulan = useMemo(() => {
    const andal = horizonCards.filter((c) => c.status === "andal");
    const dipakai = andal.length ? andal : horizonCards;
    const terjauh = dipakai[dipakai.length - 1];
    if (!terjauh) return null;

    // Tidak ada horizon tervalidasi: tetap tampilkan kalimat jujur,
    // jangan sembunyikan kartu.
    if (!andal.length) {
      return "Perkiraan berupa level, bukan arah. Akurasi belum tervalidasi.";
    }

    if (terjauh.kategori == null || terjauh.ispu == null) {
      return "Perkiraan berupa level, bukan arah.";
    }

    const semuaDatar = horizonCards.every(
      (c) => c.ispu != null && Math.abs(c.ispu - terjauh.ispu!) < 1
    );

    if (semuaDatar) {
      return `Perkiraan berupa level, bukan arah. Sekitar ${terjauh.ispu} ISPU dalam ${terjauh.minutes} menit ke depan.`;
    }

    return `Dalam ${terjauh.minutes} menit ke depan diperkirakan berada pada kategori ${terjauh.kategori}.`;
  }, [horizonCards]);

  const currentIspu = useMemo(() => {
    const tone = aqiOf(data.ispu);
    return { value: data.ispu, ...tone };
  }, [data.ispu]);

  // Aktual = garis padat di kiri, forecast = area transparan di kanan.
  const combined = useMemo(() => {
    // Nilai negatif berarti sensor membaca di bawah ambang deteksi,
    // bukan nol. Dibiarkan kosong supaya garis terputus, bukan
    // digambar rata di 0 yang menyesatkan.
    const valid = (v: number | null): number | null =>
      v == null || v < 0 ? null : v;

    const coMg = (v: number | null): number | null => {
      const c = valid(v);
      return c == null ? null : c / 1000;
    };

    const actualRows = data.rows.slice(-60);
    const actual = actualRows.map((r) => ({
      iso: r.created_at,
      ts: new Date(r.created_at).getTime(),
      t: toWIB(r.created_at),
      pm25: toIspu("pm25", valid(r.pm25_ugm3)),
      pm10: toIspu("pm10", valid(r.pm10_ugm3)),
      co: toIspu("co", coMg(r.co_ugm3)),
      isForecast: false,
      // Pita hanya digambar pada bagian forecast. Nilai null di sini
      // mencegah pita menanjak dari garis aktual (efek "tangga").
      bandLow: null as number | null,
      bandSpan: null as number | null,
    }));

    const terakhirMs = actualRows.length
      ? new Date(actualRows[actualRows.length - 1].created_at).getTime()
      : 0;

    const jangkar = anchorTs ?? terakhirMs;

    const fc = forecast
      // Hanya titik yang benar-benar di masa depan. Kalau siklus sudah
      // basi, sebagian forecast-nya jatuh di belakang pembacaan terakhir
      // dan akan tergambar menumpuk dengan garis aktual.
      .filter((r) => new Date(r.forecast_at).getTime() > terakhirMs)
      // Sumbu X berhenti di horizon andal terjauh.
      .filter((r) => {
        const menit = (new Date(r.forecast_at).getTime() - jangkar) / 60_000;
        return menit <= chartLimitMinutes();
      })
      .map((r) => ({
        iso: r.forecast_at,
        ts: new Date(r.forecast_at).getTime(),
        t: toWIB(r.forecast_at),
        pm25: toIspu("pm25", valid(r.pm25_ugm3_pred)),
        pm10: toIspu("pm10", valid(r.pm10_ugm3_pred)),
        co: toIspu("co", coMg(r.co_ugm3_pred)),
        // Konsentrasi untuk menghitung pita; dikonversi ke ISPU setelahnya.
        conc:
          primaryKey === "co"
            ? coMg(r.co_ugm3_pred)
            : valid(
                r[`${primaryKey}_ugm3_pred` as keyof ForecastRow] as number | null
              ),
        isForecast: true,
        menit: (new Date(r.forecast_at).getTime() - jangkar) / 60_000,
        bandLow: null as number | null,
        bandSpan: null as number | null,
        bandLabel: null as string | null,
      }))
      // Resolusi grafik 5 menit. Nilai forecast pada menit ke-k adalah
      // level yang sama, jadi menampilkan tiap menit hanya menambah
      // kerapatan tanpa informasi baru.
      .filter((r) => Math.round(r.menit) % 5 === 0);

    // Pita ketidakpastian per horizon: kuantil residual benchmark bila
    // tersedia, selain itu galat rata-rata dengan label berbeda.
    // Dihitung dalam satuan konsentrasi, lalu dikonversi ke ISPU.
    for (const row of fc) {
      if (row.conc == null) continue;
      const pita = bandFor(row.conc, row.menit, maeTampil, pakaiKuantil);
      const low = toIspu(primaryKey, pita.low);
      const high = toIspu(primaryKey, pita.high);
      if (low == null || high == null) continue;
      row.bandLow = low;
      row.bandSpan = Math.max(0, high - low);
      row.bandLabel = pita.label;
    }

    const semua = [...actual, ...fc];

    // Urutkan menurut waktu asli; label "HH.mm" tidak bisa dipakai
    // mengurutkan karena tidak membawa tanggal.
    return semua.sort(
      (a, b) => new Date(a.iso).getTime() - new Date(b.iso).getTime()
    );
  }, [data.rows, forecast, primaryKey, anchorTs, maeTampil, pakaiKuantil]);

  /**
   * Batas atas sumbu ISPU.
   *
   * Minimal 300 supaya keempat zona kategori selalu terlihat, lalu
   * dibulatkan ke 50 terdekat bila ada nilai di atasnya.
   */
  const yMax = useMemo(() => {
    let max = 300;
    for (const row of combined) {
      for (const s of SERIES) {
        if (!activeSeries.includes(s.key)) continue;
        const v = row[s.key];
        if (typeof v === "number" && Number.isFinite(v)) {
          max = Math.max(max, v);
        }
      }
      if (typeof row.bandLow === "number" && typeof row.bandSpan === "number") {
        max = Math.max(max, row.bandLow + row.bandSpan);
      }
    }
    return Math.ceil(max / 50) * 50;
  }, [combined, activeSeries]);

  /** Garis penghubung saat ada lompatan nyata ke level forecast. */
  const connectorSegment = useMemo(() => {
    const aktual = combined.filter((r) => !r.isForecast);
    const fc = combined.filter((r) => r.isForecast);
    if (!aktual.length || !fc.length) return null;

    const a = aktual[aktual.length - 1];
    const f = fc[0];
    const ya = a[primaryKey];
    const yf = f[primaryKey];
    if (typeof ya !== "number" || typeof yf !== "number") return null;
    if (Math.abs(ya - yf) < 0.05) return null;

    return [
      { x: a.ts, y: ya },
      { x: f.ts, y: yf },
    ];
  }, [combined, primaryKey]);

  /** Penanda vertikal di setiap horizon yang ditampilkan. */
  const horizonMarkers = useMemo(() => {
    if (anchorTs == null) return [];
    const batas = chartLimitMinutes();
    return reliableHorizons()
      .filter((h) => h.minutes <= batas)
      .map((h) => ({ minutes: h.minutes, ts: anchorTs + h.minutes * 60_000 }));
  }, [anchorTs]);

  /** Titik "sekarang" dalam epoch ms: akhir data aktual. */
  const nowTs = useMemo(() => {
    const aktual = combined.filter((r) => !r.isForecast);
    if (aktual.length) return aktual[aktual.length - 1].ts;
    const fc = combined.find((r) => r.isForecast);
    return fc ? fc.ts : null;
  }, [combined]);

  /** Tick sumbu X tiap 15 menit, dalam epoch ms. */
  const xTicks = useMemo(() => {
    if (!combined.length) return [];
    const awal = combined[0].ts;
    const akhir = combined[combined.length - 1].ts;
    const langkah = 15 * 60_000;
    const ticks: number[] = [];
    for (let v = Math.ceil(awal / langkah) * langkah; v <= akhir; v += langkah) {
      ticks.push(v);
    }
    return ticks;
  }, [combined]);

  // Berapa banyak pembacaan terakhir yang di bawah ambang deteksi.
  const belowDetection = useMemo(() => {
    const recent = data.rows.slice(-30);
    if (!recent.length) return null;
    const count = (key: "pm25_ugm3" | "pm10_ugm3") =>
      recent.filter((r) => {
        const v = Number(r[key]);
        return Number.isFinite(v) && v < 0;
      }).length;
    return { pm25: count("pm25_ugm3"), pm10: count("pm10_ugm3"), total: recent.length };
  }, [data.rows]);

  const hasActual = data.rows.length > 0;
  const toggleSeries = (key: string) => {
    setActiveSeries((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  return (
    <div className="space-y-5 text-slate-100 sm:space-y-6">
      <DashboardHeader
        lastSynced={data.at}
        devices={DEVICES}
        onRefresh={() => {
          reload();
          void loadForecast();
        }}
        refreshing={refreshing}
        source={source}
      />

      {/* Kondisi terkini: angka nyata dari sensor terakhir. */}
      <section className="rounded-xl border border-sky-400/25 bg-slate-900/85 p-5 backdrop-blur-sm">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)] sm:items-stretch">
          <div className="sm:border-r sm:border-white/10 sm:pr-5">
            <p className="text-[12px] font-medium text-slate-300">ISPU saat ini</p>
            <p className="mt-1 flex items-baseline gap-2">
              <span className="text-4xl font-bold font-mono tabular-nums text-white">
                {data.latest ? currentIspu.value : "-"}
              </span>
              <span
                className="text-base font-semibold"
                style={{ color: currentIspu.dot }}
              >
                {data.latest ? currentIspu.label : "Belum ada data"}
              </span>
            </p>
            <p className="mt-1 text-[12px] text-slate-300">
              {data.latest
                ? `Polutan dominan ${data.dominant?.label ?? "-"}`
                : "Menunggu pembacaan sensor"}
            </p>
          </div>

          <div>
            <p className="text-[12px] font-medium text-slate-300">Suhu</p>
            <p className="mt-1 text-2xl font-semibold font-mono tabular-nums text-white">
              {Number.isFinite(data.temp) ? data.temp.toFixed(1) : "-"}
              <span className="ml-1 text-sm font-normal text-slate-300">°C</span>
            </p>
            <p className="mt-1 text-[12px] text-slate-300">pembacaan terakhir</p>
          </div>

          <div>
            <p className="text-[12px] font-medium text-slate-300">Kelembapan</p>
            <p className="mt-1 text-2xl font-semibold font-mono tabular-nums text-white">
              {Number.isFinite(data.hum) ? data.hum.toFixed(1) : "-"}
              <span className="ml-1 text-sm font-normal text-slate-300">%</span>
            </p>
            <p className="mt-1 text-[12px] text-slate-300">relatif terhadap ruang</p>
          </div>
        </div>
      </section>

      {/* Forecast: data asli dari tb_forecast, bukan placeholder. */}
      <section className="rounded-xl border border-sky-400/25 bg-slate-900/85 p-5 backdrop-blur-sm">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-bold text-white">
              Perkiraan {maxReliableMinutes() || chartLimitMinutes()} menit ke depan
            </h2>
            <p className="mt-0.5 text-[12px] text-slate-300">
              {forecastLoading
                ? "Memuat siklus forecast"
                : !forecast.length
                  ? "Belum ada siklus forecast"
                  : `Perkiraan ${maxReliableMinutes() || chartLimitMinutes()} menit ke depan · diperbarui ${toWIB(forecast[0].generated_at)}`}
            </p>
            {(() => {
              // Horizon forecast hanya 60 menit. Kalau siklusnya lebih
              // tua dari itu, isinya sudah kedaluwarsa dan tidak boleh
              // ditampilkan seolah masih berlaku.
              if (!forecast.length) return null;
              const umur =
                (nowMs - new Date(forecast[0].generated_at).getTime()) / 60_000;
              if (!Number.isFinite(umur) || umur <= 60) return null;

              return (
                <p className="mt-1.5 rounded-lg border border-amber-400/25 bg-amber-500/10 px-2 py-1.5 text-[10px] leading-snug text-amber-200">
                  Siklus ini berumur {Math.round(umur)} menit, sedangkan
                  horizonnya hanya 60 menit. Isinya sudah kedaluwarsa; garis
                  aktual tetap ditampilkan.
                </p>
              );
            })()}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {SERIES.map((s) => {
              const on = activeSeries.includes(s.key);
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => toggleSeries(s.key)}
                  aria-pressed={on}
                  className={`flex min-h-[36px] items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 ${
                    on
                      ? "border-sky-400/40 bg-sky-500/15 text-sky-200"
                      : "border-white/10 bg-slate-800/60 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: on ? s.color : "#64748b" }}
                  />
                  {s.label}
                </button>
              );
            })}
          </div>
        </header>

        {forecastError ? (
          <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-rose-400/30 bg-rose-500/10 px-4 py-3">
            <p className="text-[12px] text-rose-200">
              Gagal memuat forecast: {forecastError}
            </p>
            <button
              type="button"
              onClick={() => void loadForecast()}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-rose-400/30 px-3 text-[11px] font-semibold text-rose-100 hover:bg-rose-500/20"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Coba lagi
            </button>
          </div>
        ) : forecastLoading ? (
          <div className="mt-4 h-64 animate-pulse rounded-lg bg-slate-800/60" />
        ) : (
          <>
            <div className="mt-4 h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={combined} margin={{ top: 26, right: 12, bottom: 0, left: -14 }}>
                  <defs>
                    {SERIES.map((s) => (
                      <linearGradient key={s.key} id={`fc-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={s.color} stopOpacity={0.22} />
                        <stop offset="100%" stopColor={s.color} stopOpacity={0} />
                      </linearGradient>
                    ))}
                  </defs>

                  <CartesianGrid strokeDasharray="2 6" stroke="#1e293b" vertical={false} />
                  <XAxis
                    dataKey="ts"
                    type="number"
                    domain={["dataMin", "dataMax"]}
                    ticks={xTicks}
                    tickFormatter={(v: number) =>
                      toWIB(new Date(v).toISOString())
                    }
                    tick={{ fontSize: 12, fill: "#cbd5e1" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    domain={[0, yMax]}
                    ticks={[0, 50, 100, 200, 300]}
                    tick={{ fontSize: 12, fill: "#cbd5e1" }}
                    axisLine={false}
                    tickLine={false}
                    width={46}
                    label={{
                      value: "ISPU",
                      position: "insideTopLeft",
                      fill: "#94a3b8",
                      fontSize: 11,
                      offset: 8,
                    }}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 8,
                      border: "1px solid #334155",
                      backgroundColor: "#0f172a",
                      fontSize: 12,
                    }}
                    labelStyle={{ color: "#e2e8f0", fontWeight: 600 }}
                    labelFormatter={(v) =>
                      toWIB(new Date(Number(v)).toISOString())
                    }
                    formatter={(value, name, item) => {
                      const s = SERIES.find((x) => x.key === name);
                      const ispu = Number(value);
                      const tone = aqiOf(ispu);
                      const phase = item?.payload?.isForecast
                        ? "perkiraan"
                        : "aktual";
                      return [
                        `ISPU ${Math.round(ispu)} (${tone.label}) · ${phase}`,
                        s?.label ?? name,
                      ];
                    }}
                  />

                  {/* Zona kategori ISPU sebagai latar berwarna. */}
                  <ReferenceArea
                    y1={0}
                    y2={50}
                    fill={AQI.good.dot}
                    fillOpacity={0.08}
                    stroke="none"
                  />
                  <ReferenceArea
                    y1={50}
                    y2={100}
                    fill={AQI.moderate.dot}
                    fillOpacity={0.08}
                    stroke="none"
                  />
                  <ReferenceArea
                    y1={100}
                    y2={200}
                    fill={AQI.unhealthy.dot}
                    fillOpacity={0.08}
                    stroke="none"
                  />
                  <ReferenceArea
                    y1={200}
                    y2={300}
                    fill={AQI.veryUnhealthy.dot}
                    fillOpacity={0.08}
                    stroke="none"
                  />

                  {/* Penanda "Sekarang" dan garis penghubung lompatan.
                      Sumbu X kini numerik, jadi ReferenceLine bekerja. */}
                  {nowTs != null && (
                    <ReferenceLine
                      x={nowTs}
                      stroke="#94a3b8"
                      strokeOpacity={0.7}
                      label={{
                        value: "Sekarang",
                        position: "top",
                        fill: "#e2e8f0",
                        fontSize: 11,
                      }}
                    />
                  )}

                  {connectorSegment && (
                    <ReferenceLine
                      segment={connectorSegment}
                      stroke="#94a3b8"
                      strokeWidth={1}
                      strokeDasharray="2 2"
                    />
                  )}

                  {/* Penanda vertikal di setiap horizon yang ditampilkan. */}
                  {horizonMarkers.map((m) => (
                    <ReferenceLine
                      key={`h-${m.minutes}`}
                      x={m.ts}
                      stroke="#38bdf8"
                      strokeOpacity={0.35}
                      strokeDasharray="3 4"
                      label={{
                        value: `${m.minutes}m`,
                        position: "insideTopRight",
                        fill: "#7dd3fc",
                        fontSize: 10,
                      }}
                    />
                  ))}

                  {/* Pita ketidakpastian sebagai satu area rentang. */}
                  <Area
                    dataKey={(d: (typeof combined)[number]) =>
                      d.bandLow != null && d.bandSpan != null
                        ? [d.bandLow, d.bandLow + d.bandSpan]
                        : null
                    }
                    stroke="none"
                    fill={SERIES.find((s) => s.key === primaryKey)?.color ?? "#38bdf8"}
                    fillOpacity={0.25}
                    isAnimationActive={false}
                    activeDot={false}
                    tooltipType="none"
                  />

                  {/* Garis penghubung digambar bersama penanda "Sekarang". */}

                  {SERIES.filter((s) => activeSeries.includes(s.key)).flatMap((s) => [
                    // Garis padat: pembacaan sensor nyata.
                    <Area
                      key={`actual-${s.key}`}
                      type="monotone"
                      dataKey={(d: (typeof combined)[number]) =>
                        d.isForecast ? null : d[s.key]
                      }
                      name={s.key}
                      stroke={s.color}
                      strokeWidth={2}
                      fill="none"
                      dot={false}
                      connectNulls={false}
                      isAnimationActive={false}
                    />,
                    // Garis putus-putus: forecast. Tanpa area isian supaya
                    // tidak terbaca sebagai kepastian.
                    <Area
                      key={`fc-${s.key}`}
                      type="monotone"
                      dataKey={(d: (typeof combined)[number]) =>
                        d.isForecast ? d[s.key] : null
                      }
                      name={s.key}
                      stroke={s.color}
                      strokeWidth={2}
                      strokeDasharray="5 4"
                      fill="none"
                      dot={false}
                      connectNulls
                      isAnimationActive={false}
                    />,
                  ])}
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Legenda fase + pita ketidakpastian */}
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px] text-slate-300">
              <span className="flex items-center gap-2">
                <span className="h-0.5 w-6 rounded bg-slate-200" />
                Aktual (60 menit terakhir)
              </span>
              <span className="flex items-center gap-2">
                <span
                  className="h-0.5 w-6 rounded"
                  style={{
                    backgroundImage:
                      "repeating-linear-gradient(90deg, #cbd5e1 0 5px, transparent 5px 9px)",
                  }}
                />
                Perkiraan level
              </span>
              <span className="flex items-center gap-2">
                <span
                  className="h-3 w-6 rounded"
                  style={{
                    backgroundColor: `${SERIES.find((s) => s.key === primaryKey)?.color ?? "#38bdf8"}29`,
                  }}
                />
                {pakaiKuantil && usingQuantiles()
                  ? "Rentang ±, cakupan sekitar 80%"
                  : "Galat rata-rata"}
              </span>
            </div>

            <p className="mt-2 text-[12px] leading-relaxed text-slate-300">
              Garis putus-putus adalah{" "}
              <strong className="text-white">perkiraan level</strong>, bukan
              ramalan naik-turun. Pita menunjukkan rentang ketidakpastian yang
              melebar seiring horizon.
            </p>

            {(() => {
              const missing = SERIES.filter(
                (s) => !forecast.some((r) => r[`${s.key}_ugm3_pred` as keyof ForecastRow] != null)
              );
              if (!missing.length) return null;

              const lastActual = data.latest;
              const sensorDead = missing.filter((s) => {
                const key = `${s.key}_ugm3` as keyof typeof lastActual;
                const v = Number(lastActual?.[key]);
                return Number.isFinite(v) && v < 0;
              });
              const modelWeak = missing.filter((s) => !sensorDead.includes(s));

              return (
                <p className="mt-3 rounded-lg border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-200">
                  {sensorDead.length > 0 && (
                    <>
                      {sensorDead.map((s) => s.label).join(", ")} tidak memiliki
                      forecast karena sensor tidak menghasilkan nilai valid.{" "}
                    </>
                  )}
                  {modelWeak.length > 0 && (
                    <>
                      {modelWeak.map((s) => s.label).join(", ")} tidak memiliki
                      forecast karena riwayat data validnya belum cukup panjang
                      atau model belum lebih akurat dari sekadar mengulang nilai
                      terakhir.
                    </>
                  )}
                </p>
              );
            })()}

            {belowDetection && belowDetection.pm25 + belowDetection.pm10 > 0 && (
              <p className="mt-3 rounded-lg border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-[11px] leading-relaxed text-rose-200">
                Sensor debu membaca di bawah ambang deteksi pada{" "}
                {belowDetection.total} pembacaan terakhir
                {belowDetection.pm25 > 0 && ` (PM2.5: ${belowDetection.pm25}x`}
                {belowDetection.pm10 > 0 && `, PM10: ${belowDetection.pm10}x`}
                {belowDetection.pm25 + belowDetection.pm10 > 0 && ")"}.
                Garis aktualnya terputus karena nilainya tidak valid, bukan karena
                udaranya nol.
              </p>
            )}

            {/* Kesimpulan ringkas, tanpa menyiratkan arah. */}
            {kesimpulan && (
              <div className="mt-4 rounded-lg border border-sky-400/30 bg-sky-500/10 px-3 py-2.5">
                <p className="text-[12px] font-medium text-sky-200">
                  Kesimpulan
                </p>
                <p className="mt-1 text-[14px] font-semibold leading-snug text-white">
                  {kesimpulan}
                </p>
              </div>
            )}

            {/* Satu kartu per horizon andal. */}
            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {horizonCards.map((c) => {
                const redup = c.status === "belum_andal";
                return (
                  <article
                    key={c.minutes}
                    title={c.catatan}
                    className={`rounded-lg border px-3 py-2.5 ${
                      redup
                        ? "border-white/10 bg-slate-900/50 opacity-70"
                        : "border-white/10"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[12px] font-medium text-slate-300">
                        {c.minutes} menit
                      </p>
                      <span className="font-mono text-[11px] tabular-nums text-slate-400">
                        {c.jamTujuan}
                      </span>
                    </div>

                    <p className="mt-1 text-[18px] font-semibold font-mono tabular-nums text-white">
                      {c.ispu == null ? "–" : c.ispu}
                      <span className="ml-1 text-[11px] font-normal text-slate-400">
                        ISPU
                      </span>
                    </p>

                    <p className="mt-0.5 text-[12px] text-slate-300">
                      {c.delta == null
                        ? "tanpa pembanding"
                        : `${c.delta > 0 ? "+" : ""}${c.delta} dari sekarang`}
                    </p>

                    <p
                      className="mt-1 text-[12px] leading-snug text-slate-300"
                      title={c.bandDetail ?? undefined}
                    >
                      {c.low == null || c.high == null
                        ? "Rentang tidak tersedia"
                        : `${c.low}–${c.high} ISPU`}
                      <span className="block text-[11px] text-slate-400">
                        {c.bandLabel}
                      </span>
                    </p>

                    <div className="mt-2 flex items-center gap-1.5">
                      {c.warna && (
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: c.warna }}
                        />
                      )}
                      <span className="text-[12px] font-medium text-slate-200">
                        {c.kategori ?? "kategori tidak tersedia"}
                      </span>
                    </div>

                    {redup && (
                      <span className="mt-2 inline-block rounded border border-amber-400/30 bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-semibold text-amber-200">
                        Belum andal
                      </span>
                    )}
                  </article>
                );
              })}
            </div>

            {/* Batas keandalan dan asal angka pita. */}
            <p className="mt-3 text-[12px] leading-relaxed text-slate-300">
              {hasReliableHorizon()
                ? `Perkiraan hanya ditampilkan sampai ${maxReliableMinutes()} menit karena itu batas yang terbukti andal.`
                : "Akurasi perkiraan belum divalidasi."}{" "}
              {pakaiKuantil && usingQuantiles()
                ? BAND_META.catatan
                : "Polutan ini memakai galat rata-rata terukur, bukan kuantil benchmark PM2.5."}
            </p>
          </>
        )}
      </section>

      {/* Saran tindakan + disclaimer. Kalimat yang mengulang kartu lain
          dihapus supaya tidak bertele-tele. */}
      {(() => {
        const saran = SARAN_KATEGORI[currentIspu.label] ?? null;
        if (!saran) return null;

        return (
          <motion.section
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-start gap-3 rounded-xl border border-sky-400/25 bg-slate-900/85 p-4 backdrop-blur-sm"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" />
            <div className="space-y-1">
              <p className="text-[13px] leading-relaxed text-white">{saran}</p>
              <p className="text-[12px] leading-relaxed text-slate-300">
                {data.dominant?.label
                  ? `Polutan dominan ${data.dominant.label}${peakIspu ? ` · ISPU puncak ${peakIspu}` : ""}. `
                  : ""}
                Forecast bersifat indikatif, bukan ISPU resmi.
              </p>
            </div>
          </motion.section>
        );
      })()}
    </div>
  );
}
