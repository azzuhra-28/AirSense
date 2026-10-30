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
echo  Interval: 1 menit
echo.
echo  Tutup jendela ini untuk berhenti.
echo.

"%PY%" forecast_loop.py --interval 1 --device cpu

echo.
echo  Loop berhenti. Tekan tombol apa saja untuk menutup.
pause >nul
