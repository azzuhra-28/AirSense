"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion, useReducedMotion } from "framer-motion";
import { Wind, ArrowRight, ShieldCheck, Activity, Cpu } from "lucide-react";

export default function LandingPage() {
  const reduceMotion = useReducedMotion();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoReady, setVideoReady] = useState(false);

  // Autoplay bisa diblokir kebijakan browser. Kalau gagal, gambar
  // statis tetap tampil supaya latar tidak jadi kosong.
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (reduceMotion) {
      el.pause();
      return;
    }
    const attempt = el.play();
    if (attempt) attempt.catch(() => setVideoReady(false));
  }, [reduceMotion]);

  return (
    <div className="relative min-h-screen text-slate-100 flex flex-col justify-between overflow-hidden">
      {/* Lapisan dasar: gambar statis, selalu ada. */}
      <Image
        src="/cloud-bg.jpg"
        alt=""
        aria-hidden
        fill
        priority
        className="absolute inset-0 -z-20 object-cover"
      />

      {/* Video menimpa gambar hanya setelah benar-benar berjalan. */}
      <video
        ref={videoRef}
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        poster="/cloud-bg.jpg"
        onPlaying={() => setVideoReady(true)}
        className={`absolute inset-0 -z-20 h-full w-full object-cover transition-opacity duration-700 ${
          videoReady ? "opacity-100" : "opacity-0"
        }`}
      >
        <source src="/cloud-video.mp4" type="video/mp4" />
      </video>

      {/* OVERLAY GELAP SEMI-TRANSPARAN */}
      <div aria-hidden className="absolute inset-0 -z-10 bg-slate-950/65" />

      {/* Header / Navbar */}
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6 relative z-10">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-sky-400/30 bg-sky-500/20 text-sky-300 shadow-sm">
            <Wind className="h-5 w-5" strokeWidth={2.4} />
          </span>
          <span className="font-display text-xl tracking-wider text-white">
            AirSense
          </span>
        </div>
        <Link
          href="/panel"
          className="rounded-lg border border-sky-400/30 bg-slate-900/80 px-4 py-2 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-800 hover:text-white"
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
          <span className="inline-flex items-center gap-2 rounded-lg border border-sky-400/30 bg-slate-900/70 px-3.5 py-1 text-xs font-semibold text-sky-300">
            <ShieldCheck className="h-4 w-4 text-sky-400" /> Sistem Monitoring Kualitas Udara IoT
          </span>
          
          <h1 className="mt-6 text-3xl font-semibold tracking-tight text-white sm:text-5xl leading-[1.1]">
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
              className="flex items-center gap-2 rounded-lg bg-sky-500 px-8 py-3.5 text-sm font-semibold text-slate-950 transition-colors hover:bg-sky-400"
            >
              Lihat pembacaan sensor
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </motion.div>

        {/* Tiga kemampuan sistem, disusun menurut bobotnya: forecast
            adalah inti proyek, jadi mendapat kartu lebar. */}
        <motion.div
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-16 grid w-full grid-cols-1 gap-3 text-left sm:grid-cols-3"
        >
          <div className="rounded-lg border border-sky-400/25 bg-slate-900/85 p-5 sm:col-span-2">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-sky-400" />
              <h3 className="text-sm font-semibold text-white">
                Sensor tiap 60 detik
              </h3>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-slate-300">
              ESP32 mengirim lima polutan (PM2.5, PM10, CO, NO2, O3) plus suhu
              dan kelembapan ke Supabase. Dashboard memperbarui angka lewat
              realtime, bukan polling manual.
            </p>
          </div>

          <div className="rounded-lg border border-sky-400/25 bg-slate-900/85 p-5">
            <div className="flex items-center gap-2">
              <Cpu className="h-4 w-4 text-sky-400" />
              <h3 className="text-sm font-semibold text-white">
                Forecast 60 menit
              </h3>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-slate-300">
              LSTM dan GRU memproyeksikan tren per menit ke depan.
            </p>
          </div>

          <div className="rounded-lg border border-sky-400/25 bg-slate-900/85 p-5 sm:col-span-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-sky-400" />
              <h3 className="text-sm font-semibold text-white">
                Peringatan berbasis aturan
              </h3>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-slate-300">
              Ambang ISPU dan deteksi anomali memicu catatan otomatis di halaman
              Peringatan, lengkap dengan alasan yang bisa ditelusuri.
            </p>
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