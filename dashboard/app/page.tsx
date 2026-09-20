"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { ispuOf, toWIB } from "@/lib/ispu";
import { categoryOf, type KonsentrasiGas } from "@/lib/types";

/* =========================================================
   CONFIG
========================================================= */

const POLLUTANTS = [
  {
    key: "pm25_ugm3",
    label: "PM2.5",
    unit: "µg/m³",
    icon: "🌫️",
    color: "#f97316",
    bg: "bg-orange-50",
    text: "text-orange-600",
  },
  {
    key: "pm10_ugm3",
    label: "PM10",
    unit: "µg/m³",
    icon: "💨",
    color: "#8b5cf6",
    bg: "bg-violet-50",
    text: "text-violet-600",
  },
  {
    key: "co_ugm3",
    label: "CO",
    unit: "µg/m³",
    icon: "🏭",
    color: "#3b82f6",
    bg: "bg-blue-50",
    text: "text-blue-600",
  },
  {
    key: "no2_ugm3",
    label: "NO₂",
    unit: "µg/m³",
    icon: "🧪",
    color: "#10b981",
    bg: "bg-emerald-50",
    text: "text-emerald-600",
  },
  {
    key: "o3_ugm3",
    label: "O₃",
    unit: "µg/m³",
    icon: "☁️",
    color: "#a855f7",
    bg: "bg-purple-50",
    text: "text-purple-600",
  },
] as const;

type Tab = "overview" | "analytics" | "forecast" | "devices";

/* =========================================================
   MAIN PAGE
========================================================= */

export default function OverviewPage() {
  const [dataList, setDataList] = useState<KonsentrasiGas[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeTab, setActiveTab] = useState<Tab>("overview");

  const [activePollutant, setActivePollutant] = useState<
    "pm25" | "pm10"
  >("pm25");

  useEffect(() => {
    fetch("/data/dummy_tb_konsentrasi_gas.json")
      .then((res) => res.json())
      .then((data: KonsentrasiGas[]) => {
        setDataList(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Gagal load JSON:", err);
        setLoading(false);
      });
  }, []);

  /* =======================================================
     LATEST DATA
  ======================================================= */

  const latest = useMemo(() => {
    if (!dataList.length) return null;
    return dataList[dataList.length - 1];
  }, [dataList]);

  /* =======================================================
     SUMMARY
  ======================================================= */

  const summary = useMemo(() => {
    if (!latest) return null;

    const pollutants = POLLUTANTS.map((p) => {
      const value = Number(
        latest[p.key as keyof KonsentrasiGas]
      );

      const ispu = Number.isFinite(value)
        ? ispuOf(p.key, value)
        : 0;

      return {
        ...p,
        value,
        ispu,
      };
    });

    const maxPollutant = pollutants.reduce((prev, current) =>
      current.ispu > prev.ispu ? current : prev
    );

    const total = Math.round(maxPollutant.ispu);

    const cat =
      categoryOf(total) ?? {
        label: "Baik",
        bg: "bg-emerald-100",
        text: "text-emerald-700",
      };

    return {
      pollutants,
      total,
      cat,
      dominant: maxPollutant,
      temp: Number(latest.temperature) || 29.5,
      hum: Number(latest.humidity) || 68,
    };
  }, [latest]);

  /* =======================================================
     CHART DATA
  ======================================================= */

  const chartData = useMemo(() => {
    return dataList.slice(-30).map((r, i) => ({
      time: r.created_at
        ? toWIB(r.created_at)
        : `Data ${i + 1}`,

      pm25: Number(r.pm25_ugm3) || 0,
      pm10: Number(r.pm10_ugm3) || 0,
      co: Number(r.co_ugm3) || 0,
      no2: Number(r.no2_ugm3) || 0,
      o3: Number(r.o3_ugm3) || 0,
    }));
  }, [dataList]);

  /* =======================================================
     LOADING
  ======================================================= */

  if (loading) {
    return (
      <div className="flex min-h-[600px] items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-slate-200 border-t-emerald-500" />

          <p className="font-bold text-slate-700">
            Memuat AirSense...
          </p>

          <p className="mt-1 text-xs text-slate-400">
            Mengambil data kualitas udara 🌿
          </p>
        </div>
      </div>
    );
  }

  if (!summary || !latest) return null;

  /* =======================================================
     MAIN
  ======================================================= */

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50/30 px-3 pb-12 sm:px-5">

      {/* ===================================================
          HEADER
      =================================================== */}

      <header className="sticky top-2 z-30 mb-5 rounded-3xl border border-white bg-white/90 px-5 py-4 shadow-lg shadow-slate-200/40 backdrop-blur-xl">

        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">

          {/* BRAND */}

          <div className="flex items-center gap-3">

            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-600 text-2xl shadow-lg shadow-emerald-200">
              🌿
            </div>

            <div>
              <h1 className="text-2xl font-black tracking-tight">
                <span className="text-slate-900">
                  Air
                </span>
                <span className="text-emerald-500">
                  Sense
                </span>
              </h1>

              <p className="text-[10px] font-medium text-slate-400">
                Clean Air · Healthier Tomorrow
              </p>
            </div>

          </div>

          {/* NODE + CONNECTION */}

          <div className="flex flex-wrap items-center gap-2">

            <button className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-2 text-xs font-bold text-blue-700 transition hover:bg-blue-100">
              📍 Kampus PENS - Node 01
            </button>

            <div className="flex items-center gap-2 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-2">

              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-500" />

              <span className="text-xs font-bold text-emerald-700">
                Connected
              </span>

              <span className="text-emerald-500">
                ▮▮▮
              </span>

            </div>

          </div>

        </div>

        {/* =================================================
            TABS
        ================================================= */}

        <div className="mt-4 flex gap-1 overflow-x-auto rounded-2xl bg-slate-100 p-1">

          <TabButton
            active={activeTab === "overview"}
            onClick={() => setActiveTab("overview")}
            icon="🏠"
            label="Overview"
          />

          <TabButton
            active={activeTab === "analytics"}
            onClick={() => setActiveTab("analytics")}
            icon="📊"
            label="Analytics"
          />

          <TabButton
            active={activeTab === "forecast"}
            onClick={() => setActiveTab("forecast")}
            icon="🔮"
            label="Forecast"
          />

          <TabButton
            active={activeTab === "devices"}
            onClick={() => setActiveTab("devices")}
            icon="⚙️"
            label="Devices"
          />

        </div>

      </header>

      {/* ===================================================
          ALERT
      =================================================== */}

      <AlertBanner
        category={summary.cat.label}
        value={summary.total}
      />

      {/* ===================================================
          OVERVIEW
      =================================================== */}

      {activeTab === "overview" && (
        <OverviewTab
          summary={summary}
          latest={latest}
          chartData={chartData}
          setActiveTab={setActiveTab}
        />
      )}

      {/* ===================================================
          ANALYTICS
      =================================================== */}

      {activeTab === "analytics" && (
        <AnalyticsTab
          chartData={chartData}
          activePollutant={activePollutant}
          setActivePollutant={setActivePollutant}
        />
      )}

      {/* ===================================================
          FORECAST
      =================================================== */}

      {activeTab === "forecast" && (
        <ForecastTab summary={summary} />
      )}

      {/* ===================================================
          DEVICES
      =================================================== */}

      {activeTab === "devices" && (
        <DevicesTab />
      )}

    </div>
  );
}

/* =========================================================
   TAB BUTTON
========================================================= */

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: string;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex min-w-fit flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-all ${
        active
          ? "bg-white text-emerald-600 shadow-sm"
          : "text-slate-400 hover:text-slate-700"
      }`}
    >
      <span>{icon}</span>
      {label}
    </button>
  );
}

/* =========================================================
   ALERT
========================================================= */

function AlertBanner({
  category,
  value,
}: {
  category: string;
  value: number;
}) {
  const isDanger =
    category.toLowerCase().includes("tidak") ||
    category.toLowerCase().includes("bahaya");

  return (
    <div
      className={`mb-5 overflow-hidden rounded-3xl border p-4 shadow-sm ${
        isDanger
          ? "border-orange-200 bg-gradient-to-r from-orange-50 to-rose-50"
          : "border-emerald-200 bg-gradient-to-r from-emerald-50 to-cyan-50"
      }`}
    >
      <div className="flex items-center gap-4">

        <div
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-2xl ${
            isDanger
              ? "bg-orange-100"
              : "bg-emerald-100"
          }`}
        >
          {isDanger ? "⚠️" : "🌱"}
        </div>

        <div className="flex-1">

          <p
            className={`text-sm font-black ${
              isDanger
                ? "text-orange-700"
                : "text-emerald-700"
            }`}
          >
            {isDanger ? "Peringatan Kualitas Udara" : "Kualitas Udara Baik"}
          </p>

          <p className="mt-0.5 text-xs text-slate-600">
            Kualitas udara saat ini berada pada kategori{" "}
            <strong>{category}</strong> dengan ISPU{" "}
            <strong>{value}</strong>.
          </p>

          {isDanger && (
            <p className="mt-1 text-[11px] font-medium text-orange-600">
              Disarankan menggunakan masker di area terbuka.
            </p>
          )}

        </div>

      </div>
    </div>
  );
}

/* =========================================================
   OVERVIEW TAB
========================================================= */

function OverviewTab({
  summary,
  latest,
  chartData,
  setActiveTab,
}: any) {
  return (
    <div className="space-y-5">

      {/* =================================================
          ISPU + DOMINANT
      ================================================= */}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">

        {/* ISPU */}

        <div className="rounded-3xl border border-orange-100 bg-white p-5 shadow-sm">

          <SectionTitle
            icon="🌿"
            title="Air Quality Now"
            subtitle="ISPU Utama"
          />

          <div className="mt-5 flex flex-col items-center rounded-3xl bg-gradient-to-b from-orange-50 to-white p-6">

            <div className="relative flex h-32 w-64 items-end justify-center overflow-hidden">

              <div className="absolute bottom-0 h-32 w-64 rounded-t-full border-[18px] border-b-0 border-transparent bg-gradient-to-r from-emerald-400 via-yellow-400 to-rose-500" />

              <div className="relative z-10 mb-1 text-center">
                <p className="text-5xl font-black text-slate-900">
                  {summary.total}
                </p>

                <p className="text-xs font-bold text-slate-400">
                  ISPU
                </p>
              </div>

            </div>

            <span className="mt-3 rounded-full bg-orange-500 px-6 py-2 text-xs font-black text-white shadow-lg shadow-orange-200">
              {summary.cat.label.toUpperCase()}
            </span>

          </div>

        </div>

        {/* DOMINANT */}

        <div className="rounded-3xl border border-emerald-100 bg-gradient-to-br from-white to-emerald-50 p-5 shadow-sm">

          <SectionTitle
            icon="💨"
            title="Polutan Dominan"
            subtitle="Parameter dengan kontribusi terbesar"
          />

          <div className="mt-6 flex items-center gap-5">

            <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-emerald-100 text-4xl">
              {summary.dominant.icon}
            </div>

            <div>
              <p className="text-4xl font-black text-slate-900">
                {summary.dominant.label}
              </p>

              <p className="mt-1 text-sm font-semibold text-slate-500">
                Konsentrasi{" "}
                {Number(summary.dominant.value).toLocaleString("id-ID")}{" "}
                {summary.dominant.unit}
              </p>

              <span className="mt-2 inline-block rounded-full bg-orange-100 px-3 py-1 text-[10px] font-bold text-orange-600">
                ISPU {Math.round(summary.dominant.ispu)}
              </span>
            </div>

          </div>

        </div>

      </div>

      {/* =================================================
          POLLUTANTS
      ================================================= */}

      <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">

        <SectionTitle
          icon="🌡️"
          title="Parameter Polutan"
          subtitle="Real-time monitoring"
        />

        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">

          {summary.pollutants.map((p: any) => (
            <PollutantCard
              key={p.key}
              pollutant={p}
            />
          ))}

          <div className="rounded-2xl border border-cyan-100 bg-cyan-50 p-4">

            <div className="text-xl">
              🌡️💧
            </div>

            <p className="mt-2 text-xs font-bold text-slate-600">
              Suhu & Kelembapan
            </p>

            <p className="mt-3 text-xl font-black text-slate-800">
              {summary.temp.toFixed(1)}°C
            </p>

            <p className="text-xs font-bold text-cyan-600">
              {summary.hum.toFixed(1)}% RH
            </p>

          </div>

        </div>

      </div>

      {/* =================================================
          QUICK TREND
      ================================================= */}

      <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">

        <div className="flex items-center justify-between">

          <SectionTitle
            icon="📈"
            title="Historical Trend"
            subtitle="30 data terakhir"
          />

          <button
            onClick={() => setActiveTab("analytics")}
            className="rounded-xl bg-emerald-50 px-3 py-2 text-[10px] font-bold text-emerald-600 hover:bg-emerald-100"
          >
            Lihat detail →
          </button>

        </div>

        <div className="mt-4 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>

              <defs>
                <linearGradient id="pm25Fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f97316" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                </linearGradient>

                <linearGradient id="pm10Fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                </linearGradient>
              </defs>

              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#eef2f7"
                vertical={false}
              />

              <XAxis
                dataKey="time"
                tick={{ fontSize: 10, fill: "#94a3b8" }}
                axisLine={false}
                tickLine={false}
              />

              <YAxis
                tick={{ fontSize: 10, fill: "#94a3b8" }}
                axisLine={false}
                tickLine={false}
              />

              <Tooltip />

              <Area
                type="monotone"
                dataKey="pm25"
                name="PM2.5"
                stroke="#f97316"
                strokeWidth={2.5}
                fill="url(#pm25Fill)"
              />

              <Area
                type="monotone"
                dataKey="pm10"
                name="PM10"
                stroke="#8b5cf6"
                strokeWidth={2.5}
                fill="url(#pm10Fill)"
              />

            </AreaChart>
          </ResponsiveContainer>
        </div>

      </div>

      {/* =================================================
          INSIGHTS + DEVICES
      ================================================= */}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">

        <InsightCard summary={summary} />

        <DeviceMiniCard setActiveTab={setActiveTab} />

      </div>

    </div>
  );
}

/* =========================================================
   POLLUTANT CARD
========================================================= */

function PollutantCard({ pollutant }: any) {
  return (
    <div
      className={`group rounded-2xl border border-slate-100 ${pollutant.bg} p-4 transition-all hover:-translate-y-1 hover:shadow-md`}
    >

      <div className="flex items-center justify-between">

        <span className="text-2xl">
          {pollutant.icon}
        </span>

        <span
          className="h-2 w-2 rounded-full"
          style={{
            backgroundColor: pollutant.color,
          }}
        />

      </div>

      <p className={`mt-3 text-xs font-black ${pollutant.text}`}>
        {pollutant.label}
      </p>

      <p className="mt-2 text-2xl font-black text-slate-800">
        {Number(pollutant.value).toLocaleString("id-ID")}
      </p>

      <p className="text-[10px] font-medium text-slate-400">
        {pollutant.unit}
      </p>

    </div>
  );
}

/* =========================================================
   ANALYTICS
========================================================= */

function AnalyticsTab({
  chartData,
  activePollutant,
  setActivePollutant,
}: any) {
  return (
    <div className="space-y-5">

      <PageHeading
        icon="📊"
        title="Historical Trend & Analytics"
        description="Analisis perubahan konsentrasi polutan dari waktu ke waktu."
      />

      <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">

        <div className="flex flex-wrap gap-2">

          {[
            ["pm25", "PM2.5", "#f97316"],
            ["pm10", "PM10", "#8b5cf6"],
          ].map(([key, label, color]) => (

            <button
              key={key}
              onClick={() =>
                setActivePollutant(key)
              }
              className={`rounded-xl px-4 py-2 text-xs font-bold transition ${
                activePollutant === key
                  ? "text-white shadow-md"
                  : "bg-slate-100 text-slate-500"
              }`}
              style={
                activePollutant === key
                  ? { backgroundColor: color }
                  : {}
              }
            >
              {label}
            </button>

          ))}

        </div>

        <div className="mt-5 h-80">

          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>

              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#eef2f7"
              />

              <XAxis
                dataKey="time"
                tick={{ fontSize: 10 }}
              />

              <YAxis
                tick={{ fontSize: 10 }}
              />

              <Tooltip />

              <Line
                type="monotone"
                dataKey={activePollutant}
                stroke={
                  activePollutant === "pm25"
                    ? "#f97316"
                    : "#8b5cf6"
                }
                strokeWidth={3}
                dot={false}
                animationDuration={800}
              />

            </LineChart>
          </ResponsiveContainer>

        </div>

      </div>

      <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">

        <SectionTitle
          icon="⏰"
          title="Peak-Time Analysis"
          subtitle="Jam dengan konsentrasi tertinggi"
        />

        <div className="mt-5 h-64">

          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={[
                { time: "06:00", value: 89 },
                { time: "07:00", value: 112 },
                { time: "08:00", value: 98 },
                { time: "17:00", value: 76 },
                { time: "18:00", value: 63 },
                { time: "19:00", value: 54 },
              ]}
            >

              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="#eef2f7"
              />

              <XAxis dataKey="time" />

              <YAxis />

              <Tooltip />

              <Bar
                dataKey="value"
                fill="#f97316"
                radius={[8, 8, 0, 0]}
              />

            </BarChart>
          </ResponsiveContainer>

        </div>

      </div>

    </div>
  );
}

/* =========================================================
   FORECAST
========================================================= */

function ForecastTab({ summary }: any) {
  const base25 = Number(
    summary.pollutants.find(
      (p: any) => p.key === "pm25_ugm3"
    )?.value || 0
  );

  const base10 = Number(
    summary.pollutants.find(
      (p: any) => p.key === "pm10_ugm3"
    )?.value || 0
  );

  const forecast = Array.from({ length: 7 }, (_, i) => ({
    minute: i * 10,
    pm25: Math.round(base25 + i * 2),
    pm10: Math.round(base10 + i * 3),
  }));

  return (
    <div className="space-y-5">

      <PageHeading
        icon="🔮"
        title="Forecasting 60 Menit"
        description="Perkiraan perubahan PM2.5 dan PM10 dalam 1 jam mendatang."
      />

      <div className="rounded-3xl border border-violet-100 bg-white p-5 shadow-sm">

        <div className="rounded-2xl bg-violet-50 p-4">

          <p className="text-xs font-black text-violet-700">
            🔮 Prediksi 60 Menit ke Depan
          </p>

          <p className="mt-1 text-[11px] text-violet-500">
            Nilai berikut merupakan visualisasi forecasting
            berdasarkan data dummy.
          </p>

        </div>

        <div className="mt-5 h-80">

          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={forecast}>

              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#eef2f7"
              />

              <XAxis
                dataKey="minute"
                tickFormatter={(v) => `${v}m`}
              />

              <YAxis />

              <Tooltip
                labelFormatter={(v) =>
                  `${v} menit ke depan`
                }
              />

              <Legend />

              <Line
                type="monotone"
                dataKey="pm25"
                name="PM2.5 Prediksi"
                stroke="#f97316"
                strokeWidth={3}
                strokeDasharray="8 5"
                dot={false}
              />

              <Line
                type="monotone"
                dataKey="pm10"
                name="PM10 Prediksi"
                stroke="#8b5cf6"
                strokeWidth={3}
                strokeDasharray="8 5"
                dot={false}
              />

            </LineChart>
          </ResponsiveContainer>

        </div>

      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">

        <ForecastInfo
          icon="📈"
          title="PM2.5"
          value={`${Math.round(base25)} → ${Math.round(base25 + 12)} µg/m³`}
          description="Estimasi kenaikan"
        />

        <ForecastInfo
          icon="💨"
          title="PM10"
          value={`${Math.round(base10)} → ${Math.round(base10 + 18)} µg/m³`}
          description="Estimasi kenaikan"
        />

        <ForecastInfo
          icon="💡"
          title="Insight"
          value="Monitor"
          description="Perhatikan perubahan tren"
        />

      </div>

    </div>
  );
}

/* =========================================================
   DEVICES
========================================================= */

function DevicesTab() {
  const devices = [
    {
      icon: "🔲",
      name: "ESP32",
      type: "Microcontroller",
    },
    {
      icon: "🌫️",
      name: "Sensor GP2Y1010",
      type: "PM2.5",
    },
    {
      icon: "🧪",
      name: "Sensor MiCS-6814",
      type: "VOC / CO",
    },
    {
      icon: "🌡️",
      name: "Sensor DHT22",
      type: "Temperature & Humidity",
    },
  ];

  return (
    <div className="space-y-5">

      <PageHeading
        icon="⚙️"
        title="Status Perangkat"
        description="Monitoring koneksi dan status sensor AirSense."
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">

        {devices.map((device) => (

          <div
            key={device.name}
            className="group rounded-3xl border border-slate-100 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
          >

            <div className="flex items-center gap-4">

              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-2xl">
                {device.icon}
              </div>

              <div className="flex-1">

                <p className="text-sm font-black text-slate-800">
                  {device.name}
                </p>

                <p className="text-xs text-slate-400">
                  {device.type}
                </p>

              </div>

              <div className="text-right">

                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />

                  <span className="text-xs font-bold text-emerald-600">
                    Aktif
                  </span>
                </div>

              </div>

            </div>

          </div>

        ))}

      </div>

      <div className="rounded-3xl border border-emerald-100 bg-gradient-to-r from-emerald-50 to-cyan-50 p-5">

        <div className="flex gap-4">

          <div className="text-3xl">
            📡
          </div>

          <div>
            <p className="text-sm font-black text-emerald-800">
              Semua perangkat terhubung
            </p>

            <p className="mt-1 text-xs text-emerald-700/70">
              AirSense Node 01 sedang mengirimkan data
              kualitas udara.
            </p>
          </div>

        </div>

      </div>

    </div>
  );
}

/* =========================================================
   INSIGHT
========================================================= */

function InsightCard({ summary }: any) {
  return (
    <div className="rounded-3xl border border-violet-100 bg-gradient-to-br from-white to-violet-50 p-5 shadow-sm">

      <SectionTitle
        icon="💡"
        title="Automatic Insight"
        subtitle="Analisis otomatis"
      />

      <div className="mt-5 space-y-3">

        <InsightRow
          icon="⬆️"
          text={`Polutan dominan saat ini adalah ${summary.dominant.label}.`}
        />

        <InsightRow
          icon="🌡️"
          text={`Suhu ruangan tercatat ${summary.temp.toFixed(1)}°C.`}
        />

        <InsightRow
          icon="💧"
          text={`Kelembapan berada pada ${summary.hum.toFixed(1)}% RH.`}
        />

        <InsightRow
          icon="⚠️"
          text={`ISPU maksimum saat ini adalah ${summary.total}.`}
        />

      </div>

    </div>
  );
}

function InsightRow({
  icon,
  text,
}: {
  icon: string;
  text: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-white/80 p-3">

      <span className="text-lg">
        {icon}
      </span>

      <p className="text-xs font-medium leading-relaxed text-slate-600">
        {text}
      </p>

    </div>
  );
}

/* =========================================================
   DEVICE MINI
========================================================= */

function DeviceMiniCard({
  setActiveTab,
}: {
  setActiveTab: (tab: Tab) => void;
}) {
  return (
    <div className="rounded-3xl border border-blue-100 bg-gradient-to-br from-white to-blue-50 p-5 shadow-sm">

      <div className="flex items-center justify-between">

        <SectionTitle
          icon="⚙️"
          title="Status Perangkat"
          subtitle="AirSense Node 01"
        />

        <button
          onClick={() => setActiveTab("devices")}
          className="rounded-xl bg-white px-3 py-2 text-[10px] font-bold text-blue-600 shadow-sm"
        >
          Detail →
        </button>

      </div>

      <div className="mt-5 space-y-2">

        {[
          "ESP32",
          "Sensor GP2Y1010",
          "Sensor MiCS-6814",
          "Sensor DHT22",
        ].map((device) => (

          <div
            key={device}
            className="flex items-center justify-between rounded-xl bg-white px-3 py-2.5"
          >

            <span className="text-xs font-semibold text-slate-600">
              {device}
            </span>

            <span className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-600">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Aktif
            </span>

          </div>

        ))}

      </div>

    </div>
  );
}

/* =========================================================
   SMALL COMPONENTS
========================================================= */

function SectionTitle({
  icon,
  title,
  subtitle,
}: {
  icon: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex items-center gap-3">

      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-100 text-lg">
        {icon}
      </div>

      <div>

        <h2 className="text-sm font-black text-slate-900">
          {title}
        </h2>

        {subtitle && (
          <p className="text-[10px] text-slate-400">
            {subtitle}
          </p>
        )}

      </div>

    </div>
  );
}

function PageHeading({
  icon,
  title,
  description,
}: {
  icon: string;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-3xl border border-white bg-white p-5 shadow-sm">

      <div className="flex items-center gap-3">

        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-2xl">
          {icon}
        </div>

        <div>

          <h2 className="text-xl font-black text-slate-900">
            {title}
          </h2>

          <p className="mt-1 text-xs text-slate-400">
            {description}
          </p>

        </div>

      </div>

    </div>
  );
}

function ForecastInfo({
  icon,
  title,
  value,
  description,
}: {
  icon: string;
  title: string;
  value: string;
  description: string;
}) {
  return (
    <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">

      <div className="text-2xl">
        {icon}
      </div>

      <p className="mt-3 text-xs font-bold text-slate-400">
        {title}
      </p>

      <p className="mt-1 text-lg font-black text-slate-800">
        {value}
      </p>

      <p className="mt-1 text-[10px] text-slate-400">
        {description}
      </p>

    </div>
  );
}