"use client";

import { motion } from "framer-motion";

import { aqiOf } from "@/lib/brand";

/**
 * Gauge AQI melingkar (SVG).
 *
 * Busur progres mewakili ISPU 0–300. Angka utama diletakkan di
 * bagian bawah busur (bukan di tengah), sehingga tidak
 * bertabrakan dengan titik poros. Busur latar diberi segmen
 * kategori yang sangat redup sebagai acuan halus.
 */
export function RadialGauge({ ispu }: { ispu: number }) {
  const value = Number.isFinite(ispu) ? Math.max(0, ispu) : 0;
  const tone = aqiOf(value);

  const size = 220;
  const stroke = 16;
  const radius = (size - stroke) / 2 - 2;
  const cx = size / 2;
  const cy = size / 2;

  const START = 135;
  const SWEEP = 270;
  const MAX = 300;

  const polar = (deg: number) => {
    const rad = (deg * Math.PI) / 180;
    return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
  };

  const arc = (fromVal: number, toVal: number) => {
    const from = START + (Math.min(fromVal, MAX) / MAX) * SWEEP;
    const to = START + (Math.min(toVal, MAX) / MAX) * SWEEP;
    const p1 = polar(from);
    const p2 = polar(to);
    const large = to - from > 180 ? 1 : 0;
    return `M ${p1.x} ${p1.y} A ${radius} ${radius} 0 ${large} 1 ${p2.x} ${p2.y}`;
  };

  const categories = [
    { key: "g", to: 50, color: "#10B981" },
    { key: "m", to: 100, color: "#F59E0B" },
    { key: "u", to: 200, color: "#EF4444" },
    { key: "v", to: 300, color: "#8B5CF6" },
  ];

  const needleAngle = START + (Math.min(value, MAX) / MAX) * SWEEP;
  const tip = polar(needleAngle);

  return (
    <div className="relative mx-auto flex w-full max-w-[260px] flex-col items-center">
      <svg
        width="100%"
        viewBox={`0 0 ${size} ${size}`}
        className="h-auto w-full"
        role="img"
        aria-label={`ISPU ${Math.round(value)}, kategori ${tone.label}`}
      >
        {/* Track dasar */}
        <path
          d={arc(0, MAX)}
          fill="none"
          stroke="#F1F5F9"
          strokeWidth={stroke}
          strokeLinecap="round"
        />

        {/* Segmen kategori (redup) */}
        {categories.map((c, i) => (
          <path
            key={c.key}
            d={arc(i === 0 ? 0 : categories[i - 1].to, c.to)}
            fill="none"
            stroke={c.color}
            strokeOpacity={0.14}
            strokeWidth={stroke}
          />
        ))}

        {/* Progres nilai saat ini */}
        <motion.path
          d={arc(0, Math.max(value, 0.5))}
          fill="none"
          stroke={tone.dot}
          strokeWidth={stroke}
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
        />

        {/* Titik poros + jarum */}
        <motion.line
          x1={cx}
          y1={cy}
          x2={tip.x}
          y2={tip.y}
          stroke="#0F172A"
          strokeWidth={2.5}
          strokeLinecap="round"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4, duration: 0.35 }}
        />
        <circle cx={cx} cy={cy} r={5.5} fill="#0F172A" />
        <circle cx={cx} cy={cy} r={2.2} fill="#FFFFFF" />
      </svg>

      {/* Blok nilai — diletakkan di bawah, bukan menimpa poros */}
      <div className="-mt-8 flex flex-col items-center">
        <motion.span
          key={Math.round(value)}
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="tabular text-[44px] font-semibold leading-none tracking-tight text-slate-900"
        >
          {Math.round(value)}
        </motion.span>
        <span className="mt-1 text-[10px] font-medium uppercase tracking-[0.18em] text-slate-400">
          ISPU
        </span>
      </div>
    </div>
  );
}
