import { IBM_Plex_Sans, IBM_Plex_Mono, Audiowide } from "next/font/google";
import "./panel/globals.css";

// Plex Sans: antarmuka data teknis, terbaca di 10-12px, punya tabular figures.
const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex-sans",
  display: "swap",
});

// Plex Mono: angka pembacaan sensor supaya tidak bergeser saat realtime.
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
  display: "swap",
});

// Audiowide hanya untuk wordmark AirSense, bukan teks isi.
const audiowide = Audiowide({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-audiowide",
  display: "swap",
});

export const metadata = {
  title: "AirSense - Kualitas Udara",
  description: "Monitoring dan prediksi kualitas udara",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="id"
      className={`${plexSans.variable} ${plexMono.variable} ${audiowide.variable}`}
    >
      <body className="font-sans min-h-screen bg-slate-100 text-slate-950 antialiased">
        {children}
      </body>
    </html>
  );
}
