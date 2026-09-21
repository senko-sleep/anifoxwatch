#!/usr/bin/env bash
# Prepare a fresh Ubuntu VM (Oracle Cloud Always Free, x86 or ARM) and start the API.
#
#   git clone <your repo> anistream-hub && cd anistream-hub/deploy
#   cp .env.example .env && nano .env      # set DOMAIN
#   bash oracle-setup.sh
#
# Safe to re-run: every step checks before it acts.
set -euo pipefail

cd "$(dirname "$0")"
[ -f .env ] || { echo "Create deploy/.env first (cp .env.example .env) and set DOMAIN."; exit 1; }
# shellcheck disable=SC1091
source .env
[ -n "${DOMAIN:-}" ] || { echo "DOMAIN is empty in deploy/.env"; exit 1; }

echo "==> Installing Docker"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER" || true
fi

echo "==> Opening ports 80/443 in the VM firewall"
# Oracle's Ubuntu images ship with iptables rules that drop everything but SSH,
# on top of the cloud-side security list (which you must open in the console too).
for port in 80 443; do
  if ! sudo iptables -C INPUT -p tcp --dport "$port" -j ACCEPT 2>/dev/null; then
    sudo iptables -I INPUT 6 -p tcp --dport "$port" -j ACCEPT
  fi
done
command -v netfilter-persistent >/dev/null 2>&1 || sudo apt-get install -y -qq iptables-persistent
sudo netfilter-persistent save >/dev/null

echo "==> Building and starting (first build takes a few minutes)"
sudo docker compose up -d --build

echo "==> Waiting for the API to report healthy"
for _ in $(seq 1 40); do
  status=$(sudo docker inspect -f '{{.State.Health.Status}}' "$(sudo docker compose ps -q api)" 2>/dev/null || echo starting)
  [ "$status" = "healthy" ] && break
  sleep 5
done
echo "API health: ${status:-unknown}"

echo
echo "Done. Test it:   curl https://$DOMAIN/api/health"
echo "Then point the frontend at it:  VITE_API_URL=https://$DOMAIN  (in ../.env.production) and rebuild."
