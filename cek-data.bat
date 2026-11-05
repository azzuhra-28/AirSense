@echo off
REM ============================================================
REM  AirSense - Cek Data Harian
REM  Klik dua kali file ini sekali sehari.
REM  Hasilnya langsung terbaca: ada bolong atau tidak.
REM ============================================================

setlocal

cd /d "%~dp0analytics"

set "PY=%USERPROFILE%\miniconda3\envs\ds_env\python.exe"
if not exist "%PY%" set "PY=python"

cls
echo.
echo  ============================================================
echo   CEK DATA AIRSENSE
echo  ============================================================
echo.

"%PY%" cek_jeda.py --hari 7

echo.
echo  ============================================================
echo   CARA BACA
echo  ============================================================
echo.
echo   Lihat tabel "Baris per hari":
echo     ok    = hari itu aman, data masuk hampir penuh
echo     BOCOR = ada jam yang kosong, lihat daftar lubang di bawahnya
echo.
echo   Lihat "Lubang": kalau tertulis "tidak ada", data bersambung penuh.
echo.
echo   Lihat "Kesiapan model": siap = forecast bisa dihitung.
echo.
echo  ============================================================
echo.
pause
