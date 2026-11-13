#!/usr/bin/env bash
# Pasang loop forecast AirSense di VPS Debian/Ubuntu.
# Jalankan sebagai root: bash setup-vps.sh
set -euo pipefail

APP=/opt/airsense
USER_NAME=airsense

apt-get update
apt-get install -y python3 python3-venv python3-pip git

# ------------------------------------------------------------
# Swap: jaring pengaman saat melatih model. Dengan 3 GB RAM
# sebenarnya cukup, tapi latihan bisa naik mendadak.
# ------------------------------------------------------------
if ! swapon --show | grep -q .; then
  echo "Membuat swap 2 GB..."
  fallocate -l 2G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=2048 status=none
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

id -u "$USER_NAME" >/dev/null 2>&1 || useradd --system --create-home --shell /bin/bash "$USER_NAME"
mkdir -p "$APP"

if [ ! -d "$APP/.git" ]; then
  git clone https://github.com/azzuhra-28/AirSense.git "$APP"
fi
cd "$APP"
git pull --ff-only

cd "$APP/analytics"
[ -d .venv ] || python3 -m venv .venv

# torch dari index CPU: wheel CUDA default ~2,5 GB, versi CPU ~200 MB.
.venv/bin/pip install --upgrade pip
.venv/bin/pip install torch --index-url https://download.pytorch.org/whl/cpu
.venv/bin/pip install -r requirements.txt

# ------------------------------------------------------------
# Kredensial. Service TIDAK dinyalakan sebelum key diisi, supaya
# tidak berputar-putar gagal lalu membanjiri log.
# ------------------------------------------------------------
if [ ! -f .env ]; then
  cat > .env <<'EOF'
SUPABASE_URL=https://nmavntmgseosyaeijmov.supabase.co
SUPABASE_KEY=ISI_DI_SINI
EOF
  chown -R "$USER_NAME:$USER_NAME" "$APP"
  echo
  echo "Kredensial belum ada. Isi dulu:"
  echo "  nano $APP/analytics/.env"
  echo "lalu jalankan skrip ini sekali lagi."
  exit 0
fi

if grep -q 'ISI_DI_SINI\|ISI_DENGAN' .env; then
  echo
  echo "Kunci Supabase di .env masih placeholder."
  echo "  nano $APP/analytics/.env"
  echo "lalu jalankan skrip ini sekali lagi."
  exit 1
fi

chown -R "$USER_NAME:$USER_NAME" "$APP"

install -m 644 "$APP/deploy/airsense-forecast.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now airsense-forecast

# ------------------------------------------------------------
# Verifikasi singkat: service harus hidup setelah 20 detik.
# ------------------------------------------------------------
sleep 20
if systemctl is-active --quiet airsense-forecast; then
  echo
  echo "Service berjalan."
  echo "Log terakhir:"
  journalctl -u airsense-forecast -n 15 --no-pager || true
else
  echo
  echo "Service TIDAK berjalan. Periksa:"
  journalctl -u airsense-forecast -n 40 --no-pager || true
  exit 1
fi

echo
echo "Selesai. Pantau dengan: journalctl -u airsense-forecast -f"
echo "Siklus pertama bisa 5-10 menit karena model dilatih dari nol."
