"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Wind, ArrowRight, ShieldCheck, Activity, Cpu } from "lucide-react";
import { Quicksand } from "next/font/google";

const logoFont = Quicksand({ 
  subsets: ["latin"],
  weight: ["700"],
});

export default function LandingPage() {
  return (
    <div className="relative min-h-screen bg-slate-900 text-slate-100 flex flex-col justify-between overflow-hidden">
      {/* Background Glow Effects */}
      <div className="absolute top-0 left-1/4 -z-10 h-96 w-96 rounded-full bg-emerald-500/10 blur-3xl" />
      <div className="absolute bottom-0 right-1/4 -z-10 h-96 w-96 rounded-full bg-teal-500/10 blur-3xl" />

      {/* Header / Navbar */}
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/10 ring-1 ring-emerald-500/30">
            <Wind className="h-5 w-5 text-emerald-400" strokeWidth={2.4} />
          </span>
          <span className={`${logoFont.className} text-xl font-bold tracking-wider text-white`}>
            AirSense
          </span>
        </div>
        <Link
          href="/panel"
          className="rounded-xl border border-slate-700 bg-slate-800/60 px-4 py-2 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
        >
          Masuk Panel
        </Link>
      </header>

      {/* Konten Utama */}
      <main className="mx-auto flex max-w-4xl flex-col items-center px-6 py-12 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-400">
            <ShieldCheck className="h-4 w-4" /> Sistem Monitoring Kualitas Udara IoT
          </span>
          
          <h1 className={`${logoFont.className} mt-6 text-4xl font-bold tracking-tight text-white sm:text-6xl`}>
            Pantau Udara Bersih, <br />
            <span className="bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent">
              Lindungi Kesehatan Anda.
            </span>
          </h1>

          <p className="mt-6 max-w-2xl text-base leading-relaxed text-slate-400 sm:text-lg">
            AirSense adalah platform cerdas berbasis IoT untuk memantau indeks kualitas udara (ISPU), polutan berbahaya (PM2.5, PM10, CO), serta prediksi tren udara secara real-time.
          </p>

          <div className="mt-10 flex items-center justify-center">
            <Link
              href="/panel"
              className="flex items-center gap-2 rounded-xl bg-emerald-600 px-8 py-3.5 text-sm font-semibold text-white shadow-lg shadow-emerald-600/20 transition-all hover:bg-emerald-500 hover:scale-[1.02]"
            >
              Mulai Pantau Sekarang
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </motion.div>

        {/* Fitur Cards */}
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mt-20 grid grid-cols-1 gap-4 sm:grid-cols-3 text-left w-full"
        >
          <div className="rounded-2xl border border-slate-800 bg-slate-800/40 p-5 backdrop-blur-sm">
            <Activity className="h-6 w-6 text-emerald-400" />
            <h3 className="mt-3 text-sm font-semibold text-white">Real-Time Sensor</h3>
            <p className="mt-1 text-xs text-slate-400">Pembaruan data suhu, kelembapan, dan gas polutan secara berkala.</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-800/40 p-5 backdrop-blur-sm">
            <Cpu className="h-6 w-6 text-teal-400" />
            <h3 className="mt-3 text-sm font-semibold text-white">Prediksi Cerdas</h3>
            <p className="mt-1 text-xs text-slate-400">Estimasi tren kualitas udara dengan metode analitik data.</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-800/40 p-5 backdrop-blur-sm">
            <ShieldCheck className="h-6 w-6 text-emerald-400" />
            <h3 className="mt-3 text-sm font-semibold text-white">Rekomendasi Aktif</h3>
            <p className="mt-1 text-xs text-slate-400">Saran kesehatan otomatis berdasarkan tingkat bahaya ISPU.</p>
          </div>
        </motion.div>
      </main>

      {/* Footer */}
      <footer className="py-6 text-center text-xs text-slate-500">
        © {new Date().getFullYear()} AirSense · PENS
      </footer>
    </div>
  );
}