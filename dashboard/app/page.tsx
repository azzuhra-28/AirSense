"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Wind, ArrowRight, ShieldCheck, Activity, Cpu } from "lucide-react";
import { Audiowide } from "next/font/google";

const audiowideFont = Audiowide({ 
  subsets: ["latin"],
  weight: ["400"],
});

export default function LandingPage() {
  return (
    <div className="relative min-h-screen text-slate-100 flex flex-col justify-between overflow-hidden">
      {/* VIDEO BACKGROUND */}
      <video
        autoPlay
        loop
        muted
        playsInline
        className="absolute inset-0 -z-20 h-full w-full object-cover"
      >
        <source src="/cloud-video.mp4" type="video/mp4" />
        Browser Anda tidak mendukung tag video.
      </video>

      {/* OVERLAY GELAP SEMI-TRANSPARAN */}
      <div aria-hidden className="absolute inset-0 -z-10 bg-slate-950/65" />

      {/* Background Glow Effects */}
      <div className="absolute top-0 left-1/4 -z-10 h-96 w-96 rounded-full bg-sky-500/10 blur-3xl" />
      <div className="absolute bottom-0 right-1/4 -z-10 h-96 w-96 rounded-full bg-blue-500/10 blur-3xl" />

      {/* Header / Navbar */}
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6 relative z-10">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-sky-400/30 bg-sky-500/20 text-sky-300 shadow-sm">
            <Wind className="h-5 w-5" strokeWidth={2.4} />
          </span>
          <span className={`${audiowideFont.className} text-xl tracking-wider text-white`}>
            AirSense
          </span>
        </div>
        <Link
          href="/panel"
          className="rounded-xl border border-sky-400/30 bg-slate-900/60 px-4 py-2 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-800 hover:text-white backdrop-blur-sm"
        >
          Masuk Panel
        </Link>
      </header>

      {/* Konten Utama */}
      <main className="mx-auto flex max-w-4xl flex-col items-center px-6 py-12 text-center relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <span className="inline-flex items-center gap-2 rounded-full border border-sky-400/30 bg-sky-500/15 px-3.5 py-1 text-xs font-semibold text-sky-300 backdrop-blur-sm shadow-sm">
            <ShieldCheck className="h-4 w-4 text-sky-400" /> Sistem Monitoring Kualitas Udara IoT
          </span>
          
          <h1 className={`${audiowideFont.className} mt-6 text-3xl font-normal tracking-tight text-white sm:text-5xl drop-shadow-md leading-tight`}>
            Pantau Udara Bersih, <br />
            <span className="bg-gradient-to-r from-sky-300 to-teal-300 bg-clip-text text-transparent">
              Lindungi Kesehatan Anda.
            </span>
          </h1>

          <p className="mt-6 max-w-2xl text-base leading-relaxed text-slate-300 sm:text-lg drop-shadow">
            AirSense adalah platform cerdas berbasis IoT untuk memantau indeks kualitas udara (ISPU), polutan berbahaya (PM2.5, PM10, CO, NO2, O3), serta prediksi tren udara secara real-time.
          </p>

          <div className="mt-10 flex items-center justify-center">
            <Link
              href="/panel"
              className="flex items-center gap-2 rounded-xl border border-sky-400/40 bg-sky-500 px-8 py-3.5 text-sm font-semibold text-slate-950 shadow-xl shadow-sky-500/20 transition-all hover:bg-sky-400 hover:scale-[1.02]"
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
          <div className="rounded-2xl border border-sky-400/30 bg-slate-900/70 p-5 backdrop-blur-md shadow-xl">
            <Activity className="h-6 w-6 text-sky-400" />
            <h3 className="mt-3 text-sm font-bold text-white">Real-Time Sensor</h3>
            <p className="mt-1 text-xs text-slate-300">Pembaruan data suhu, kelembapan, dan gas polutan secara berkala.</p>
          </div>
          <div className="rounded-2xl border border-sky-400/30 bg-slate-900/70 p-5 backdrop-blur-md shadow-xl">
            <Cpu className="h-6 w-6 text-sky-400" />
            <h3 className="mt-3 text-sm font-bold text-white">Prediksi Cerdas</h3>
            <p className="mt-1 text-xs text-slate-300">Estimasi tren kualitas udara dengan metode analitik data.</p>
          </div>
          <div className="rounded-2xl border border-sky-400/30 bg-slate-900/70 p-5 backdrop-blur-md shadow-xl">
            <ShieldCheck className="h-6 w-6 text-sky-400" />
            <h3 className="mt-3 text-sm font-bold text-white">Rekomendasi Aktif</h3>
            <p className="mt-1 text-xs text-slate-300">Saran kesehatan otomatis berdasarkan tingkat bahaya ISPU.</p>
          </div>
        </motion.div>
      </main>

      {/* Footer */}
      <footer className="py-6 text-center text-xs text-slate-400 relative z-10">
        © {new Date().getFullYear()} AirSense · PENS
      </footer>
    </div>
  );
}