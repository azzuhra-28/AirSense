# ============================================================
# AirSense - ISPU Calculation
# Reference:
# Permen LHK No. P.14/MENLHK/SETJEN/KUM.1/7/2020
#
# Important:
# - Input concentration must already represent the required
#   24-hour measurement/aggregation.
# - This module performs concentration -> ISPU conversion.
# - Raw minute-level sensor readings must not be passed directly
#   as official ISPU values.
# ============================================================

from math import isfinite


POLLUTANTS = [
    "pm25_ugm3",
    "pm10_ugm3",
    "co_ugm3",
    "no2_ugm3",
    "o3_ugm3",
]


# Format:
# (concentration_lower, concentration_upper,
#  ispu_lower, ispu_upper)
ISPU_BREAKPOINTS = {
    "pm25_ugm3": [
        (0, 15.5, 0, 50),
        (15.5, 55.4, 50, 100),
        (55.4, 150.4, 100, 200),
        (150.4, 250.4, 200, 300),
        (250.4, 500, 300, 500),
    ],

    "pm10_ugm3": [
        (0, 50, 0, 50),
        (50, 150, 50, 100),
        (150, 350, 100, 200),
        (350, 420, 200, 300),
        (420, 500, 300, 500),
    ],

    "co_ugm3": [
        (0, 4000, 0, 50),
        (4000, 8000, 50, 100),
        (8000, 15000, 100, 200),
        (15000, 30000, 200, 300),
        (30000, 45000, 300, 500),
    ],

    "no2_ugm3": [
        (0, 80, 0, 50),
        (80, 200, 50, 100),
        (200, 1130, 100, 200),
        (1130, 2260, 200, 300),
        (2260, 3000, 300, 500),
    ],

    "o3_ugm3": [
        (0, 120, 0, 50),
        (120, 235, 50, 100),
        (235, 400, 100, 200),
        (400, 800, 200, 300),
        (800, 1000, 300, 500),
    ],
}


def _linear(x, xb, xa, ib, ia):
    """Linear interpolation according to the ISPU equation."""
    return ((ia - ib) / (xa - xb)) * (x - xb) + ib


def ispu_value(pollutant: str, concentration) -> float | None:
    """
    Convert a pollutant concentration to an ISPU value.

    Parameters
    ----------
    pollutant : str
        One of the pollutant column names in ISPU_BREAKPOINTS.

    concentration : float
        24-hour concentration in µg/m³.

    Returns
    -------
    float | None
        ISPU value, or None when the input is invalid.
    """

    if pollutant not in ISPU_BREAKPOINTS:
        raise ValueError(
            f"Pollutant tidak dikenali: {pollutant}"
        )

    if concentration is None:
        return None

    try:
        x = float(concentration)
    except (TypeError, ValueError):
        return None

    if not isfinite(x) or x < 0:
        return None

    breakpoints = ISPU_BREAKPOINTS[pollutant]

    for xb, xa, ib, ia in breakpoints:
        if x <= xa:
            return _linear(
                x,
                xb,
                xa,
                ib,
                ia
            )

    # Concentration above the highest regulatory breakpoint.
    # Keep the value at the maximum represented ISPU scale.
    return 500.0


def category_of(ispu_total) -> str | None:
    """
    Return the ISPU category for a total ISPU value.
    """

    if ispu_total is None:
        return None

    try:
        value = float(ispu_total)
    except (TypeError, ValueError):
        return None

    if not isfinite(value) or value < 0:
        return None

    if value <= 50:
        return "Baik"

    if value <= 100:
        return "Sedang"

    if value <= 200:
        return "Tidak Sehat"

    if value <= 300:
        return "Sangat Tidak Sehat"

    return "Berbahaya"


def ispu_total_of(row: dict) -> tuple[float | None, str | None]:
    """
    Calculate total ISPU from one row of 24-hour pollutant
    concentrations.

    Total ISPU is the highest valid pollutant ISPU value.
    """

    values = []

    for pollutant in POLLUTANTS:
        value = ispu_value(
            pollutant,
            row.get(pollutant)
        )

        if value is not None:
            values.append(value)

    if not values:
        return None, None

    total = max(values)

    return total, category_of(total)


def dominant_pollutant_of(row: dict) -> str | None:
    """
    Return the pollutant with the highest ISPU contribution.
    """

    values = {}

    for pollutant in POLLUTANTS:
        value = ispu_value(
            pollutant,
            row.get(pollutant)
        )

        if value is not None:
            values[pollutant] = value

    if not values:
        return None

    return max(
        values,
        key=values.get
    )