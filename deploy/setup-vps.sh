#!/usr/bin/env bash
# Pasang loop forecast AirSense di VPS Debian/Ubuntu.
# Jalankan sebagai root: bash setup-vps.sh
set -euo pipefail

APP=/opt/airsense
USER_NAME=airsense

apt-get update
apt-get install -y python3 python3-venv python3-pip git

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

[ -f .env ] || cat > .env <<'EOF'
SUPABASE_URL=https://nmavntmgseosyaeijmov.supabase.co
SUPABASE_KEY=ISI_DENGAN_KEY_DARI_analytics/.env
EOF

chown -R "$USER_NAME:$USER_NAME" "$APP"

install -m 644 "$APP/deploy/airsense-forecast.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now airsense-forecast

echo
echo "Terpasang. Cek log:  journalctl -u airsense-forecast -f"
echo "Kalau .env baru dibuat, isi dulu key-nya lalu: systemctl restart airsense-forecast"