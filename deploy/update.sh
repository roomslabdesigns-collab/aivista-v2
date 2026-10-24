#!/usr/bin/env bash
# Pull the latest code from GitHub, rebuild and restart AIVista.
# Usage, from the server:   bash ~/aivista/deploy/update.sh
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$APP_DIR"

# Keep a copy of the database before every update.
if [[ -f data/aivista.db ]]; then
  mkdir -p data/backups
  cp data/aivista.db "data/backups/aivista-$(date +%Y%m%d-%H%M%S).db"
  ls -1t data/backups/*.db | tail -n +11 | xargs -r rm -- # keep the 10 newest
fi

git pull --ff-only
npm ci --no-audit --no-fund
npx playwright install chromium
npm run build
sudo systemctl restart aivista
sleep 3
systemctl --no-pager --lines=5 status aivista
echo "Updated to $(git log -1 --format='%h %s')"
