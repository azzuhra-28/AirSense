"use client";

import { useMemo } from "react";
import {
  Clock3,
  Flame,
  GitCompareArrows,
  Thermometer,
} from "lucide-react";

import type { KonsentrasiGas } from "@/lib/types";
import { ispuOf } from "@/lib/ispu";

const POLUTAN = [
  { key: "pm25_ugm3", label: "PM2.5" },
  { key: "pm10_ugm3", label: "PM10" },
  { key: "co_ugm3", label: "CO" },
  { key: "no2_ugm3", label: "NO₂" },
  { key: "o3_ugm3", label: "O₃" },
] as const;

const JAM = Array.from({ length: 24 }, (_, i) => i);

function angka(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > -900 ? n : null;
}

function median(nilai: number[]): number {
  if (!nilai.length) return NaN;
  const urut = [...nilai].sort((a, b) => a - b);
  const tengah = Math.floor(urut.length / 2);
  return urut.length % 2 ? urut[tengah] : (urut[tengah - 1] + urut[tengah]) / 2;
}

/** Korelasi Pearson; null bila ragamnya nol. */
function korelasi(x: number[], y: number[]): number | null {
  const n = Math.min(x.length, y.length);
  if (n < 10) return null;
  const mx = x.slice(0, n).reduce((a, b) => a + b, 0) / n;
  const my = y.slice(0, n).reduce((a, b) => a + b, 0) / n;
  let cov = 0;
  let vx = 0;
  let vy = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = x[i] - mx;
    const dy = y[i] - my;
    cov += dx * dy;
    vx += dx * dx;
    vy += dy * dy;
  }
  if (vx === 0 || vy === 0) return null;
  return cov / Math.sqrt(vx * vy);
}

function Panel({
  icon,
  judul,
  keterangan,
  children,
}: {
  icon: React.ReactNode;
  judul: string;
  keterangan: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-sky-400/30 bg-slate-900/80 p-4 sm:p-5">
      <div className="flex items-center gap-2 text-sky-300">
        {icon}
        <h2 className="text-sm font-bold text-white">{judul}</h2>
      </div>
      <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
        {keterangan}
      </p>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function AdvancedAnalytics({ rows }: { rows: KonsentrasiGas[] }) {
  /**
   * Pola per jam: rata-rata ISPU tiap jam (WIB) dari seluruh data yang
   * tersedia. Dipakai untuk peak-time dan trend harian.
   */
  const perJam = useMemo(() => {
    const keranjang: Record<number, number[]> = {};
    for (const row of rows) {
      const jam = new Date(row.created_at).toLocaleString("en-GB", {
        hour: "2-digit",
        hour12: false,
        timeZone: "Asia/Jakarta",
      });
      const nilai = angka(ispuOf("pm25_ugm3", angka(row.pm25_ugm3)));
      if (nilai === null) continue;
      const k = Number(jam);
      if (!Number.isFinite(k)) continue;
      (keranjang[k] ??= []).push(nilai);
    }

    return JAM.map((jam) => {
      const nilai = keranjang[jam] ?? [];
      return {
        jam,
        rata: nilai.length ? nilai.reduce((a, b) => a + b, 0) / nilai.length : null,
        n: nilai.length,
      };
    });
  }, [rows]);

  const puncak = useMemo(() => {
    const terisi = perJam.filter((p) => p.rata !== null && p.n >= 3);
    if (!terisi.length) return null;
    return terisi.reduce((a, b) => ((b.rata as number) > (a.rata as number) ? b : a));
  }, [perJam]);

  const maksJam = useMemo(() => {
    const nilai = perJam.map((p) => p.rata ?? 0);
    return Math.max(...nilai, 1);
  }, [perJam]);

  /**
   * Polutan dominan: kontribusi ISPU tiap polutan dirata-rata, lalu
   * diurutkan. Memakai median supaya satu lonjakan tidak mendominasi.
   */
  const dominan = useMemo(() => {
    const hasil = POLUTAN.map((polutan) => {
      const nilai = rows
        .map((row) => angka(ispuOf(polutan.key, row[polutan.key])))
        .filter((v): v is number => v !== null);
      return {
        ...polutan,
        median: nilai.length ? median(nilai) : null,
        n: nilai.length,
      };
    });

    const terisi = hasil.filter((h) => h.median !== null);
    const total = terisi.reduce((a, b) => a + (b.median as number), 0);
    return hasil
      .map((h) => ({
        ...h,
        porsi:
          total > 0 && h.median !== null ? ((h.median / total) * 100) : null,
      }))
      .sort((a, b) => (b.median ?? -1) - (a.median ?? -1));
  }, [rows]);

  /**
   * Hubungan suhu/kelembapan dengan konsentrasi PM2.5.
   * Korelasi bukan sebab-akibat; ditampilkan sebagai indikasi awal.
   */
  const lingkungan = useMemo(() => {
    const pasangan = rows
      .map((row) => ({
        suhu: angka(row.temperature),
        lembap: angka(row.humidity),
        pm: angka(row.pm25_ugm3),
      }))
      .filter(
        (p): p is { suhu: number; lembap: number; pm: number } =>
          p.suhu !== null && p.lembap !== null && p.pm !== null && p.pm >= 0
      );

    const suhu = pasangan.map((p) => p.suhu);
    const lembap = pasangan.map((p) => p.lembap);
    const pm = pasangan.map((p) => p.pm);

    return {
      n: pasangan.length,
      suhu: korelasi(suhu, pm),
      lembap: korelasi(lembap, pm),
      suhuRata: suhu.length ? suhu.reduce((a, b) => a + b, 0) / suhu.length : null,
      lembapRata: lembap.length ? lembap.reduce((a, b) => a + b, 0) / lembap.length : null,
    };
  }, [rows]);

  return (
    <div className="space-y-4">
      {/* PEAK TIME */}
      <Panel
        icon={<Clock3 className="h-4 w-4" />}
        judul="Jam puncak"
        keterangan="Rata-rata ISPU per jam (WIB) dari data yang tersedia. Jam dengan batang tertinggi adalah waktu kualitas udara cenderung memburuk."
      >
        <div className="flex h-28 items-end gap-1">
          {perJam.map((item) => {
            const tinggi =
              item.rata === null ? 4 : Math.max(6, (item.rata / maksJam) * 100);
            const puncakIni = puncak?.jam === item.jam;
            return (
              <div
                key={item.jam}
                title={
                  item.rata === null
                    ? `${item.jam}:00 tidak ada data`
                    : `${item.jam}:00 rata ISPU ${item.rata.toFixed(1)} (${item.n} data)`
                }
                className="flex-1 rounded-t"
                style={{
                  height: `${tinggi}%`,
                  background: puncakIni
                    ? "rgba(251, 191, 36, 0.85)"
                    : "rgba(56, 189, 248, 0.42)",
                }}
              />
            );
          })}
        </div>

        <div className="mt-2 flex justify-between text-[9px] text-slate-500">
          <span>00</span>
          <span>06</span>
          <span>12</span>
          <span>18</span>
          <span>23</span>
        </div>

        <p className="mt-3 text-[11px] text-slate-300">
          {puncak ? (
            <>
              Puncak pada{" "}
              <span className="font-semibold text-amber-300">
                {String(puncak.jam).padStart(2, "0")}:00 WIB
              </span>{" "}
              dengan rata-rata ISPU {puncak.rata?.toFixed(1)} ({puncak.n} data).
            </>
          ) : (
            <span className="text-slate-400">
              Belum ada jam dengan data cukup untuk menentukan puncak.
            </span>
          )}
        </p>
      </Panel>

      {/* MULTI POLLUTANT */}
      <Panel
        icon={<GitCompareArrows className="h-4 w-4" />}
        judul="Kontribusi polutan"
        keterangan="Median nilai ISPU tiap polutan dan porsinya terhadap total. Dihitung dari polutan yang benar-benar punya nilai."
      >
        <div className="space-y-2">
          {dominan.map((item) => (
            <div key={item.key} className="flex items-center gap-2">
              <span className="w-14 shrink-0 text-[11px] text-slate-300">
                {item.label}
              </span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/5">
                <div
                  className="h-full rounded-full bg-sky-400/70"
                  style={{ width: `${Math.min(100, item.porsi ?? 0)}%` }}
                />
              </div>
              <span className="w-16 shrink-0 text-right font-mono text-[10px] tabular-nums text-slate-400">
                {item.median === null ? "-" : item.median.toFixed(0)}
              </span>
              <span className="w-10 shrink-0 text-right font-mono text-[10px] tabular-nums text-slate-500">
                {item.porsi === null ? "-" : `${item.porsi.toFixed(0)}%`}
              </span>
            </div>
          ))}
        </div>

        <p className="mt-3 text-[11px] text-slate-300">
          {dominan[0]?.median !== null ? (
            <>
              Polutan dengan kontribusi terbesar:{" "}
              <span className="font-semibold text-sky-300">
                {dominan[0].label}
              </span>
              .
            </>
          ) : (
            <span className="text-slate-400">Belum ada polutan yang terbaca.</span>
          )}
        </p>
      </Panel>

      {/* ENVIRONMENTAL */}
      <Panel
        icon={<Thermometer className="h-4 w-4" />}
        judul="Suhu, kelembapan, dan PM2.5"
        keterangan="Korelasi Pearson antara kondisi lingkungan dan konsentrasi PM2.5. Nilai mendekati -1 atau +1 berarti hubungannya kuat; 0 berarti tidak terlihat."
      >
        <div className="grid gap-2 sm:grid-cols-3">
          {[
            { label: "Suhu rata-rata", nilai: lingkungan.suhuRata, unit: "°C" },
            {
              label: "Kelembapan rata-rata",
              nilai: lingkungan.lembapRata,
              unit: "%",
            },
            { label: "Sampel", nilai: lingkungan.n, unit: "baris" },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-lg border border-white/10 bg-slate-950/40 px-3 py-2"
            >
              <p className="text-[9px] uppercase tracking-wide text-slate-500">
                {item.label}
              </p>
              <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-white">
                {item.nilai === null ? "-" : item.nilai.toFixed(1)}
                <span className="ml-1 text-[9px] font-normal text-slate-500">
                  {item.unit}
                </span>
              </p>
            </div>
          ))}
        </div>

        <div className="mt-3 space-y-1.5 text-[11px] text-slate-300">
          <div className="flex items-center gap-2">
            <Flame className="h-3.5 w-3.5 text-amber-300" />
            <span>
              Suhu vs PM2.5:{" "}
              <span className="font-mono tabular-nums">
                {lingkungan.suhu === null ? "-" : lingkungan.suhu.toFixed(2)}
              </span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Flame className="h-3.5 w-3.5 text-sky-300" />
            <span>
              Kelembapan vs PM2.5:{" "}
              <span className="font-mono tabular-nums">
                {lingkungan.lembap === null ? "-" : lingkungan.lembap.toFixed(2)}
              </span>
            </span>
          </div>
        </div>
      </Panel>
    </div>
  );
}
