import { EB_Garamond } from "next/font/google";
import "./panel/globals.css";

const garamond = EB_Garamond({ 
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata = {
  title: "AirSense — Kualitas Udara",
  description: "Monitoring dan prediksi kualitas udara",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body className={`${garamond.className} min-h-screen bg-slate-100 text-slate-950 antialiased`}>
        {children}
      </body>
    </html>
  );
}