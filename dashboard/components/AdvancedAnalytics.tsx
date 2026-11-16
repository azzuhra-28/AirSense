"use client";

import { useMemo } from "react";
import { GitCompareArrows } from "lucide-react";

import type { KonsentrasiGas } from "@/lib/types";
import { ispuOf } from "@/lib/ispu";

const POLUTAN = [
  { key: "pm25_ugm3", label: "PM2.5" },
  { key: "pm10_ugm3", label: "PM10" },
  { key: "co_ugm3", label: "CO" },
] as const;

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

/**
 * Porsi ISPU tiap polutan.
 *
 * Hanya ini yang tersisa dari panel analitik lanjutan: jam puncak dan
 * korelasi suhu/kelembapan dibuang karena datanya terlalu pendek untuk
 * menyimpulkan pola, dan panel anomali hanya mengulang boilerplate yang
 * sama di setiap kartu.
 */
export function AdvancedAnalytics({ rows }: { rows: KonsentrasiGas[] }) {
  const dominan = useMemo(() => {
    const hasil = POLUTAN.map((polutan) => {
      const nilai = rows
        .map((row) => angka(ispuOf(polutan.key, row[polutan.key])))
        .filter((v): v is number => v !== null);
      return {
        ...polutan,
        median: nilai.length ? median(nilai) : null,
      };
    });

    const terisi = hasil.filter((h) => h.median !== null);
    const total = terisi.reduce((a, b) => a + (b.median as number), 0);
    return hasil
      .map((h) => ({
        ...h,
        porsi:
          total > 0 && h.median !== null ? (h.median / total) * 100 : null,
      }))
      .sort((a, b) => (b.median ?? -1) - (a.median ?? -1));
  }, [rows]);

  return (
    <section className="rounded-2xl border border-sky-400/30 bg-slate-900/80 p-4 sm:p-5">
      <div className="flex items-center gap-2 text-sky-300">
        <GitCompareArrows className="h-4 w-4" />
        <h2 className="text-sm font-bold text-white">Kontribusi polutan</h2>
      </div>
      <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
        Median nilai ISPU tiap polutan dan porsinya terhadap total. Dihitung
        dari polutan yang benar-benar punya nilai.
      </p>

      <div className="mt-4 space-y-2">
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
    </section>
  );
}