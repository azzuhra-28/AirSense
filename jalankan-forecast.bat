@echo off
REM ============================================================
REM  AirSense - Forecast Loop
REM  Jalankan forecast tiap menit selama alat mengirim data.
REM  Tutup jendela ini untuk berhenti.
REM ============================================================

setlocal

cd /d "%~dp0analytics"

REM Pakai python dari environment conda yang punya torch.
set "PY=%USERPROFILE%\miniconda3\envs\ds_env\python.exe"
if not exist "%PY%" set "PY=python"

echo.
echo  AirSense forecast loop
echo  Python : %PY%
echo  Interval: 5 menit
echo.
echo  Catatan: interval 1 menit menulis ~86.000 baris/hari
echo  (~33 MB). Pakai 5 menit untuk pemakaian harian.
echo  Jalankan database/retensi_forecast.sql sekali di Supabase
echo  supaya data lama terhapus otomatis.
echo.
echo  Tutup jendela ini untuk berhenti.
echo.

"%PY%" forecast_loop.py --interval 5 --device cpu

echo.
echo  Loop berhenti. Tekan tombol apa saja untuk menutup.
pause >nul
