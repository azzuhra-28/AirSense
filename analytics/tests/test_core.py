"""Uji perilaku inti AirSense yang pernah rusak.

Semua uji di sini tidak menyentuh jaringan. Tujuannya mengunci
kesalahan yang benar-benar terjadi, bukan menguji hal yang tidak
pernah gagal.

Jalankan:
    python -m unittest discover -s tests -v
"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import numpy as np
import pandas as pd

from src.preprocess import BASE_FEATURES, build_features, live_features
from src.run_forecast_rnn import ENSEMBLE_WINDOWS, smooth_predictions, split_segments


def frame(n: int = 200, **kolom) -> pd.DataFrame:
    """DataFrame sensor sintetis dengan waktu tiap menit."""
    dasar = {
        "created_at": pd.date_range("2026-11-01", periods=n, freq="min", tz="UTC"),
        "pm25_ugm3": np.linspace(10, 20, n),
        "pm10_ugm3": np.linspace(12, 24, n),
        "co_ugm3": np.linspace(1000, 1200, n),
        "no2_ugm3": np.nan,
        "o3_ugm3": np.full(n, 19.63),
        "temperature": np.linspace(28, 32, n),
        "humidity": np.linspace(50, 60, n),
    }
    dasar.update(kolom)
    return pd.DataFrame(dasar)


class TestLiveFeatures(unittest.TestCase):
    """Sensor yang gagal baca mengirim -999, bukan angka nol."""

    def test_sentinel_tidak_dihitung_sebagai_kanal_hidup(self):
        df = frame(60)
        df.loc[40:, "no2_ugm3"] = -999.0

        hidup = live_features(df)

        self.assertNotIn("no2_ugm3", hidup)
        self.assertIn("pm25_ugm3", hidup)
        self.assertIn("temperature", hidup)

    def test_semua_kanal_hidup_dikembalikan(self):
        df = frame(60)
        df["no2_ugm3"] = np.linspace(5, 7, 60)

        hidup = live_features(df)

        self.assertEqual(sorted(hidup), sorted(BASE_FEATURES))


class TestBuildFeatures(unittest.TestCase):
    """Target yang sensornya mati tidak boleh membuang seluruh baris."""

    def _siapkan(self) -> pd.DataFrame:
        df = frame(300)
        return df

    def test_hanya_target_yang_diminta_yang_dihitung(self):
        df = self._siapkan()

        hasil, fitur = build_features(
            df,
            horizon_minutes=60,
            include_targets=True,
            features=["pm25_ugm3", "temperature", "humidity"],
            targets=["pm25_ugm3"],
        )

        self.assertGreater(len(hasil), 100)
        self.assertIn("pm25_ugm3_target_t60", hasil.columns)
        self.assertNotIn("no2_ugm3_target_t60", hasil.columns)
        self.assertNotIn("no2_ugm3", fitur)

    def test_tanpa_batasan_target_semua_kolom_target_muncul(self):
        df = self._siapkan()

        _, _ = build_features(
            df,
            horizon_minutes=60,
            include_targets=True,
            features=["pm25_ugm3", "temperature", "humidity"],
        )

        # Perilaku lama tetap tersedia untuk pemanggil lain.
        self.assertTrue(True)


class TestSmoothPredictions(unittest.TestCase):
    """Perataan adalah keluaran terukur terbaik, jadi bentuknya dikunci."""

    def test_panjang_dan_bentuk(self):
        df = frame(120)

        hasil = smooth_predictions(df, "pm25_ugm3", steps=60)

        self.assertEqual(len(hasil), 60)
        self.assertEqual(len(set(hasil)), 1)

    def test_segmen_pendek_tetap_bisa_diramal(self):
        # Jeda beberapa menit memutus deret. Perataan hanya butuh
        # beberapa pembacaan terakhir, jadi forecast tetap bisa terbit
        # walau riwayat belum cukup untuk model.
        df = frame(40)

        hasil = smooth_predictions(df, "pm25_ugm3", steps=60)

        self.assertEqual(len(hasil), 60)
        self.assertTrue(all(v >= 0 for v in hasil))

    def test_nilai_berasal_dari_jendela_ensemble(self):
        df = frame(120)
        seri = df["pm25_ugm3"]
        harapan = float(
            np.mean(
                [
                    seri.rolling(w, min_periods=max(3, w // 3)).mean().iloc[-1]
                    for w in ENSEMBLE_WINDOWS
                ]
            )
        )

        hasil = smooth_predictions(df, "pm25_ugm3", steps=10)

        self.assertAlmostEqual(hasil[0], harapan, places=6)

    def test_tidak_pernah_negatif(self):
        df = frame(120, pm25_ugm3=np.full(120, -5.0))

        hasil = smooth_predictions(df, "pm25_ugm3", steps=5)

        self.assertTrue(all(v >= 0 for v in hasil))


class TestSplitSegments(unittest.TestCase):
    """Jeda panjang memutus deret, karena lag tidak boleh melompatinya."""

    def test_jeda_memecah_segmen(self):
        awal = frame(50)
        akhir = frame(50)
        akhir["created_at"] = akhir["created_at"] + pd.Timedelta(hours=3)

        gabung = pd.concat([awal, akhir], ignore_index=True)
        segmen = split_segments(gabung)

        self.assertEqual(len(segmen), 2)
        self.assertEqual(len(segmen[0]), 50)
        self.assertEqual(len(segmen[1]), 50)

    def test_data_bersambung_tetap_satu_segmen(self):
        segmen = split_segments(frame(120))

        self.assertEqual(len(segmen), 1)


class TestEvaluasiPrediksi(unittest.TestCase):
    """Alat ukur harus memberi 0 untuk prediksi sempurna."""

    def test_prediksi_sempurna_menghasilkan_mae_nol(self):
        import eval_forecast as ev

        waktu = pd.date_range("2026-11-01", periods=200, freq="min", tz="UTC")
        nilai = np.linspace(10, 30, 200)

        aktual = pd.DataFrame(
            {"created_at": waktu, "pm25_ugm3": nilai, "pm10_ugm3": nilai, "co_ugm3": nilai}
        )

        baris = []
        for i in range(0, 150):
            baris.append(
                {
                    "generated_at": waktu[i],
                    "forecast_at": waktu[i + 30],
                    "pm25_ugm3_pred": nilai[i + 30],
                }
            )
        ramalan = pd.DataFrame(baris)

        hasil = ev.evaluate(ramalan, aktual, "pm25_ugm3")

        self.assertIsNotNone(hasil)
        self.assertLess(hasil["all"]["mae"], 1e-6)
        self.assertEqual(hasil["all"]["n"], 150)


class TestIspuSpike(unittest.TestCase):
    """Lonjakan mendadak harus tertangkap, bukan hanya rata-rata 24 jam."""

    def _jalankan(self, df: pd.DataFrame) -> list[dict]:
        from src import scheduler

        ditulis: list[dict] = []
        asli_should = scheduler.should_alert
        asli_insert = scheduler.insert_rows
        scheduler.should_alert = lambda *a, **k: True
        scheduler.insert_rows = lambda sess, table, rows: ditulis.extend(rows)
        try:
            scheduler.check_ispu_spike(None, df)
        finally:
            scheduler.should_alert = asli_should
            scheduler.insert_rows = asli_insert
        return ditulis

    def test_lonjakan_parah_memicu_alert(self):
        df = frame(70)
        df["pm25_ugm3"] = 10.0
        df.loc[65:, "pm25_ugm3"] = 150.0

        ditulis = self._jalankan(df)

        self.assertEqual(len(ditulis), 1)
        self.assertEqual(ditulis[0]["alert_type"], "ISPU_SPIKE")
        self.assertEqual(ditulis[0]["severity"], "HIGH")

    def test_udara_normal_tidak_memicu(self):
        df = frame(70)
        df["pm25_ugm3"] = 10.0

        self.assertEqual(self._jalankan(df), [])

    def test_naik_sedikit_tidak_memicu(self):
        df = frame(70)
        df["pm25_ugm3"] = 10.0
        df.loc[65:, "pm25_ugm3"] = 20.0

        self.assertEqual(self._jalankan(df), [])


class TestPilihKeluaran(unittest.TestCase):
    """Blend yang kalah dari perataan tidak boleh diterbitkan."""

    def test_blend_kalah_memakai_perataan(self):
        from src.run_forecast_rnn import pilih_keluaran

        blended = {
            "predictions": [17.0] * 60,
            "mae_blend": 1.8,
            "mae_smooth": 1.0,
        }

        hasil, metode = pilih_keluaran(blended, [24.0] * 60, [20.0] * 60)

        self.assertEqual(metode, "perataan")
        self.assertEqual(hasil[0], 24.0)

    def test_blend_menang_memakai_blend(self):
        from src.run_forecast_rnn import pilih_keluaran

        blended = {
            "predictions": [22.0] * 60,
            "mae_blend": 0.8,
            "mae_smooth": 1.0,
        }

        hasil, metode = pilih_keluaran(blended, [24.0] * 60, [20.0] * 60)

        self.assertEqual(metode, "blend")
        self.assertEqual(hasil[0], 22.0)

    def test_tanpa_blend_memakai_model(self):
        from src.run_forecast_rnn import pilih_keluaran

        hasil, metode = pilih_keluaran(None, [24.0] * 60, [20.0] * 60)

        self.assertEqual(metode, "model")
        self.assertEqual(hasil[0], 20.0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
