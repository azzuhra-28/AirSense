# ============================================================
# AirSense - Perhitungan ISPU (rumus PermenLHK No. 14 Tahun 2020,
# konsisten dengan rumus di firmware ESP32)
# ============================================================

CATEGORIES = ["Baik", "Sedang", "Tidak Sehat", "Sangat Tidak Sehat", "Berbahaya"]


def _linear(x, xb, xa, ib, ia):
    return ((ia - ib) / (xa - xb)) * (x - xb) + ib


def ispu_pm25(x):
    if x <= 15.5:
        return _linear(x, 0, 15.5, 0, 50)
    if x <= 55.4:
        return _linear(x, 15.5, 55.4, 50, 100)
    if x <= 150.4:
        return _linear(x, 55.4, 150.4, 100, 200)
    if x <= 250.4:
        return _linear(x, 150.4, 250.4, 200, 300)
    return 301


def ispu_pm10(x):
    if x <= 50:
        return _linear(x, 0, 50, 0, 50)
    if x <= 150:
        return _linear(x, 50, 150, 50, 100)
    if x <= 350:
        return _linear(x, 150, 350, 100, 200)
    if x <= 420:
        return _linear(x, 350, 420, 200, 300)
    return 301


def ispu_co(x):
    if x <= 4000:
        return _linear(x, 0, 4000, 0, 50)
    if x <= 8000:
        return _linear(x, 4000, 8000, 50, 100)
    if x <= 15000:
        return _linear(x, 8000, 15000, 100, 200)
    if x <= 30000:
        return _linear(x, 15000, 30000, 200, 300)
    return 301


def ispu_no2(x):
    if x <= 80:
        return _linear(x, 0, 80, 0, 50)
    if x <= 200:
        return _linear(x, 80, 200, 50, 100)
    if x <= 1130:
        return _linear(x, 200, 1130, 100, 200)
    if x <= 2260:
        return _linear(x, 1130, 2260, 200, 300)
    return 301


def ispu_o3(x):
    if x <= 120:
        return _linear(x, 0, 120, 0, 50)
    if x <= 235:
        return _linear(x, 120, 235, 50, 100)
    if x <= 400:
        return _linear(x, 235, 400, 100, 200)
    if x <= 800:
        return _linear(x, 400, 800, 200, 300)
    return 301


def ispu_value(pollutant, x):
    return {
        "pm25_ugm3": ispu_pm25,
        "pm10_ugm3": ispu_pm10,
        "co_ugm3": ispu_co,
        "no2_ugm3": ispu_no2,
        "o3_ugm3": ispu_o3,
    }[pollutant](x)


def category_of(ispu_total: float) -> str:
    """Kategori dari nilai ISPU gabungan (ISPU total = ISPU tertinggi antar polutan)."""
    if ispu_total <= 50:
        return "Baik"
    if ispu_total <= 100:
        return "Sedang"
    if ispu_total <= 200:
        return "Tidak Sehat"
    if ispu_total <= 300:
        return "Sangat Tidak Sehat"
    return "Berbahaya"


def ispu_total_of(row: dict) -> tuple[float, str]:
    """ISPU total dari satu row data sensor (max antar polutan) + kategori."""
    polls = ["pm25_ugm3", "pm10_ugm3", "co_ugm3", "no2_ugm3", "o3_ugm3"]
    total = max(ispu_value(p, row[p]) for p in polls if row.get(p) is not None)
    return total, category_of(total)
