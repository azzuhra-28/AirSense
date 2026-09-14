// Perhitungan ISPU (TS) - konsisten dgn firmware ESP32 & modul Python
// Rumus: I = ((Ia - Ib)/(Xa - Xb)) * (Xx - Xb) + Ib

function num(x: unknown): number {
  const v = typeof x === "string" ? Number(x) : (x as number);
  return Number.isFinite(v) ? v : NaN;
}

function linear(x: number, xb: number, xa: number, ib: number, ia: number) {
  if (!Number.isFinite(x)) return NaN;
  return ((ia - ib) / (xa - xb)) * (x - xb) + ib;
}

const clamp301 = (v: number) => (Number.isFinite(v) ? (v > 300 ? 301 : v) : NaN);

export function ispuPM25(x: unknown) {
  const v = num(x);
  if (v <= 15.5) return linear(v, 0, 15.5, 0, 50);
  if (v <= 55.4) return linear(v, 15.5, 55.4, 50, 100);
  if (v <= 150.4) return linear(v, 55.4, 150.4, 100, 200);
  if (v <= 250.4) return linear(v, 150.4, 250.4, 200, 300);
  return clamp301(v);
}

export function ispuPM10(x: unknown) {
  const v = num(x);
  if (v <= 50) return linear(v, 0, 50, 0, 50);
  if (v <= 150) return linear(v, 50, 150, 50, 100);
  if (v <= 350) return linear(v, 150, 350, 100, 200);
  if (v <= 420) return linear(v, 350, 420, 200, 300);
  return clamp301(v);
}

export function ispuCO(x: unknown) {
  const v = num(x);
  if (v <= 4000) return linear(v, 0, 4000, 0, 50);
  if (v <= 8000) return linear(v, 4000, 8000, 50, 100);
  if (v <= 15000) return linear(v, 8000, 15000, 100, 200);
  if (v <= 30000) return linear(v, 15000, 30000, 200, 300);
  return clamp301(v);
}

export function ispuNO2(x: unknown) {
  const v = num(x);
  if (v <= 80) return linear(v, 0, 80, 0, 50);
  if (v <= 200) return linear(v, 80, 200, 50, 100);
  if (v <= 1130) return linear(v, 200, 1130, 100, 200);
  if (v <= 2260) return linear(v, 1130, 2260, 200, 300);
  return clamp301(v);
}

export function ispuO3(x: unknown) {
  const v = num(x);
  if (v <= 120) return linear(v, 0, 120, 0, 50);
  if (v <= 235) return linear(v, 120, 235, 50, 100);
  if (v <= 400) return linear(v, 235, 400, 100, 200);
  if (v <= 800) return linear(v, 400, 800, 200, 300);
  return clamp301(v);
}

export function ispuOf(pollutant: string, x: unknown) {
  switch (pollutant) {
    case "pm25_ugm3": return ispuPM25(x);
    case "pm10_ugm3": return ispuPM10(x);
    case "co_ugm3": return ispuCO(x);
    case "no2_ugm3": return ispuNO2(x);
    case "o3_ugm3": return ispuO3(x);
    default: return NaN;
  }
}

// Format bantu waktu (UTC -> WIB). Pakai timeZone Asia/Jakarta
// supaya konsisten apa pun zona waktu browser pengguna.
const WIB_TZ = { timeZone: "Asia/Jakarta" } as const;

export function toWIB(iso: string) {
  return new Date(iso).toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    ...WIB_TZ,
  });
}
