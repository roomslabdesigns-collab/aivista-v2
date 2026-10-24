#!/usr/bin/env bash
# One-time setup of AIVista on an Oracle Cloud "Always Free" Ubuntu server (ARM or x86).
# Installs Node.js 22, Chromium (for crawling JS-heavy sites) and Caddy (automatic HTTPS),
# builds the app and runs it as a systemd service that restarts on crash and on reboot.
#
# Usage, from the server:   bash ~/aivista/deploy/oracle-setup.sh [your-domain.com]
# Without a domain, the site is served at https://<public-ip-with-dashes>.sslip.io
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DOMAIN="${1:-}"
SERVICE=aivista
APP_PORT=3001

step() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
# Non-interactive so packages like iptables-persistent don't stop to ask questions.
apt() { sudo DEBIAN_FRONTEND=noninteractive apt-get "$@"; }

step "Installing system packages"
apt update -y
apt install -y curl git ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https iptables-persistent

step "Installing Node.js 22"
if ! command -v node >/dev/null || [[ "$(node -v)" != v22* ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  apt install -y nodejs
fi
node -v

step "Installing Caddy (reverse proxy with automatic HTTPS)"
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  apt update -y
  apt install -y caddy
fi

step "Installing app dependencies and Chromium"
cd "$APP_DIR"
npm ci --no-audit --no-fund
npx playwright install --with-deps chromium

step "Building the web app"
npm run build

if [[ ! -f .env ]]; then
  step "Creating .env from .env.example (add your API keys to it afterwards)"
  cp .env.example .env
fi
mkdir -p data

step "Creating the systemd service"
sudo tee /etc/systemd/system/${SERVICE}.service >/dev/null <<EOF
[Unit]
Description=AIVista
After=network-online.target
Wants=network-online.target

[Service]
User=${USER}
WorkingDirectory=${APP_DIR}
Environment=NODE_ENV=production
Environment=PORT=${APP_PORT}
Environment=HOST=127.0.0.1
ExecStart=$(command -v npm) start
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now ${SERVICE}
sudo systemctl restart ${SERVICE}

if [[ -z "$DOMAIN" ]]; then
  IP="$(curl -fsS https://api.ipify.org)"
  DOMAIN="${IP//./-}.sslip.io"
fi

step "Configuring Caddy for https://${DOMAIN}"
sudo tee /etc/caddy/Caddyfile >/dev/null <<EOF
${DOMAIN} {
  encode gzip
  reverse_proxy 127.0.0.1:${APP_PORT}
}
EOF
sudo systemctl enable --now caddy
sudo systemctl reload caddy

step "Opening ports 80 and 443 in the server firewall"
# Oracle's Ubuntu images ship iptables rules that reject everything except SSH.
for port in 80 443; do
  sudo iptables -C INPUT -p tcp --dport "$port" -j ACCEPT 2>/dev/null \
    || sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport "$port" -j ACCEPT
done
sudo netfilter-persistent save

step "Done"
sleep 3
systemctl --no-pager --lines=5 status ${SERVICE} || true
cat <<EOF

AIVista should now be live at:  https://${DOMAIN}
(The HTTPS certificate is issued on the first visit; give it ~30 seconds.)

Next:
  1. Add your API keys:   nano ${APP_DIR}/.env
  2. Restart the app:     sudo systemctl restart ${SERVICE}
  3. Sign up on the site, then set ALLOW_SIGNUP=false in .env and restart again.

Logs:     journalctl -u ${SERVICE} -f
Updates:  bash ${APP_DIR}/deploy/update.sh
EOF
