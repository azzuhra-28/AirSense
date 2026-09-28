"""
AirSense - Automatic Insight (rule-based, tanpa LLM)

Menggabungkan beberapa observasi (kategori ISPU, tren, dominant
pollutant, forecast, alert) jadi satu paragraf naratif. Variasi
frasa dipilih acak dari beberapa pilihan supaya tidak terdengar
seperti template yang sama persis tiap kali muncul.
"""

import random


POLLUTANT_LABELS = {
    "pm25_ugm3": "PM2.5",
    "pm10_ugm3": "PM10",
    "co_ugm3": "karbon monoksida (CO)",
    "no2_ugm3": "nitrogen dioksida (NO2)",
    "o3_ugm3": "ozon (O3)",
}


OPENING_PHRASES = {
    "Baik": [
        "Kualitas udara saat ini tergolong Baik.",
        "Udara sekarang dalam kondisi Baik.",
        "Kondisi udara saat ini cukup baik untuk aktivitas luar ruangan.",
    ],
    "Sedang": [
        "Kualitas udara saat ini berada di kategori Sedang.",
        "Kondisi udara sekarang tergolong Sedang.",
        "Udara saat ini masih dalam batas Sedang, perlu diperhatikan kelompok sensitif.",
    ],
    "Tidak Sehat": [
        "Kualitas udara saat ini masuk kategori Tidak Sehat.",
        "Kondisi udara sekarang tergolong Tidak Sehat, disarankan mengurangi aktivitas luar ruangan.",
    ],
    "Sangat Tidak Sehat": [
        "Kualitas udara saat ini Sangat Tidak Sehat.",
        "Kondisi udara sekarang berada di level Sangat Tidak Sehat, perlu kewaspadaan tinggi.",
    ],
    "Berbahaya": [
        "Kualitas udara saat ini berada di level Berbahaya.",
        "Kondisi udara sekarang Berbahaya, hindari aktivitas luar ruangan.",
    ],
}


DOMINANT_PHRASES = [
    "{pollutant} menjadi polutan dominan saat ini.",
    "Kontributor utama saat ini adalah {pollutant}.",
    "{pollutant} tercatat sebagai polutan paling berpengaruh.",
]


TREND_UP_PHRASES = [
    "Nilainya naik sekitar {pct}% dibanding rata-rata 24 jam terakhir.",
    "Ada kenaikan sekitar {pct}% dari rata-rata harian.",
    "Trennya meningkat, sekitar {pct}% di atas rata-rata 24 jam.",
]

TREND_DOWN_PHRASES = [
    "Nilainya turun sekitar {pct}% dibanding rata-rata 24 jam terakhir.",
    "Ada penurunan sekitar {pct}% dari rata-rata harian.",
    "Trennya membaik, sekitar {pct}% di bawah rata-rata 24 jam.",
]

TREND_STABLE_PHRASES = [
    "Nilainya relatif stabil dibanding rata-rata 24 jam terakhir.",
    "Tidak ada perubahan signifikan dibanding rata-rata harian.",
]


FORECAST_PHRASES = {
    "improving": [
        "Perkiraan 60 menit ke depan menunjukkan kondisi cenderung membaik ({category}).",
        "Untuk satu jam ke depan, indikator forecast mengarah ke kategori {category}.",
    ],
    "worsening": [
        "Perkiraan 60 menit ke depan menunjukkan kondisi cenderung memburuk ({category}).",
        "Waspada, indikator forecast untuk satu jam ke depan mengarah ke kategori {category}.",
    ],
    "stable": [
        "Perkiraan 60 menit ke depan menunjukkan kondisi relatif tidak berubah ({category}).",
    ],
}


ALERT_PHRASES = [
    "Sistem mendeteksi kondisi yang perlu diperhatikan: {message}",
    "Perhatian: {message}",
]


CATEGORY_ORDER = [
    "Baik",
    "Sedang",
    "Tidak Sehat",
    "Sangat Tidak Sehat",
    "Berbahaya",
]


def _pick(phrases):
    return random.choice(phrases)


def _trend_direction(current, rolling_avg):
    if rolling_avg in (None, 0) or current is None:
        return None

    change = (current - rolling_avg) / rolling_avg

    if change > 0.05:
        return "up", abs(change) * 100
    if change < -0.05:
        return "down", abs(change) * 100
    return "stable", abs(change) * 100


def _forecast_direction(current_category, forecast_category):
    if current_category not in CATEGORY_ORDER:
        return "stable"
    if forecast_category not in CATEGORY_ORDER:
        return "stable"

    current_rank = CATEGORY_ORDER.index(current_category)
    forecast_rank = CATEGORY_ORDER.index(forecast_category)

    if forecast_rank > current_rank:
        return "worsening"
    if forecast_rank < current_rank:
        return "improving"
    return "stable"


def build_insight(latest_row, forecast):
    """
    latest_row : baris terbaru sensor_df (hasil run_from_dataframe).
    forecast   : dict hasil forecast_t60 + add_forecast_indicator.

    Return: paragraf insight (string).
    """

    sentences = []

    category = latest_row.get("ispu_category")
    dominant = latest_row.get("dominant_pollutant")

    if category in OPENING_PHRASES:
        sentences.append(_pick(OPENING_PHRASES[category]))

    if dominant in POLLUTANT_LABELS:
        label = POLLUTANT_LABELS[dominant]
        sentences.append(
            _pick(DOMINANT_PHRASES).format(pollutant=label)
        )

        rolling_column = f"{dominant}_rolling_24h"
        current_value = latest_row.get(dominant)
        rolling_value = latest_row.get(rolling_column)

        direction = _trend_direction(current_value, rolling_value)

        if direction:
            trend, pct = direction
            pct_text = f"{pct:.0f}"

            if trend == "up":
                sentences.append(
                    _pick(TREND_UP_PHRASES).format(pct=pct_text)
                )
            elif trend == "down":
                sentences.append(
                    _pick(TREND_DOWN_PHRASES).format(pct=pct_text)
                )
            else:
                sentences.append(_pick(TREND_STABLE_PHRASES))

    forecast_category = forecast.get("forecast_indicator_category")

    if forecast_category:
        direction = _forecast_direction(category, forecast_category)
        sentences.append(
            _pick(FORECAST_PHRASES[direction]).format(
                category=forecast_category
            )
        )

    has_alert = bool(latest_row.get("has_alert", False))

    if has_alert:
        message = latest_row.get("alert_message", "")
        if message:
            sentences.append(
                _pick(ALERT_PHRASES).format(message=message)
            )

    return " ".join(sentences)