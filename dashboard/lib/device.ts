// ============================================================
// Status kesehatan perangkat.
//
// Sensor mengirim data tiap 1 menit. Status diturunkan dari
// usia pembacaan terakhir — bukan dari ping langsung ke alat —
// sehingga bekerja untuk semua topologi jaringan.
// ============================================================

export type DeviceStatus = "online" | "delayed" | "offline";

export const DEVICE_STATUS_META: Record<
  DeviceStatus,
  { label: string; dot: string; soft: string; ring: string; text: string }
> = {
  online: {
    label: "Online",
    dot: "#10B981",
    soft: "#ECFDF5",
    ring: "#A7F3D0",
    text: "#047857",
  },
  delayed: {
    label: "Terlambat",
    dot: "#F59E0B",
    soft: "#FFFBEB",
    ring: "#FDE68A",
    text: "#B45309",
  },
  offline: {
    label: "Offline",
    dot: "#EF4444",
    soft: "#FEF2F2",
    ring: "#FECACA",
    text: "#B91C1C",
  },
};

export function deviceStatusFrom(
  lastSeen: string | undefined,
  now: number = Date.now()
): DeviceStatus {
  if (!lastSeen) return "offline";
  const t = new Date(lastSeen).getTime();
  if (!Number.isFinite(t)) return "offline";

  const ageMin = (now - t) / 60_000;
  if (ageMin < 3) return "online";
  if (ageMin < 10) return "delayed";
  return "offline";
}

export const DEVICE_DESCRIPTION: Record<DeviceStatus, string> = {
  online: "Data mengalir sesuai kadensi (1 menit sekali).",
  delayed: "Tidak ada data baru dalam 3–10 menit terakhir.",
  offline:
    "Tidak ada data lebih dari 10 menit. Alat kemungkinan mati atau terputus.",
};
