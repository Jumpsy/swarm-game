#!/usr/bin/env bash
# SWARM VPS setup — installs Ollama + a small fast model + the wish proxy service.
# Run ONCE as root on an Ubuntu 22.04 / 24.04 VPS.
#
#   ssh root@YOUR_VPS_IP
#   curl -fsSL https://raw.githubusercontent.com/Jumpsy/swarm-game/main/vps/setup.sh | bash
#
# After it finishes you'll have:
#   - Ollama running on 127.0.0.1:11434
#   - qwen2.5:1.5b model pulled (~1 GB)
#   - swarm-wish.service listening on 0.0.0.0:3737
#   - Firewall opened for port 3737
#
# Test from your laptop:
#   curl -X POST http://YOUR_VPS_IP:3737/api/wish -H 'Content-Type: application/json' -d '{"wish":"more crit"}'

set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "Run as root: sudo bash $0"
  exit 1
fi

MODEL="${OLLAMA_MODEL:-qwen2.5:1.5b}"
PORT="${SWARM_PORT:-3737}"
INSTALL_DIR="/opt/swarm-wish"

echo "── 1/6  Updating apt + installing deps ─────────────────────────"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl ufw ca-certificates gnupg

# Install Node.js 20 LTS via NodeSource if not present
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v)" != v2* ]]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y -qq nodejs
fi

echo "── 2/6  Installing Ollama ──────────────────────────────────────"
if ! command -v ollama >/dev/null 2>&1; then
  curl -fsSL https://ollama.com/install.sh | sh
else
  echo "    ollama already installed: $(ollama --version 2>/dev/null || echo unknown)"
fi

echo "── 3/6  Pulling model: $MODEL  (this may take a few minutes) ──"
# Make sure ollama service is up before pulling
systemctl enable --now ollama || true
sleep 3
ollama pull "$MODEL"

echo "── 4/6  Installing SWARM wish service ──────────────────────────"
mkdir -p "$INSTALL_DIR"
curl -fsSL https://raw.githubusercontent.com/Jumpsy/swarm-game/main/vps/server.js -o "$INSTALL_DIR/server.js"

cat > /etc/systemd/system/swarm-wish.service <<EOF
[Unit]
Description=SWARM wish AI proxy
After=network.target ollama.service
Wants=ollama.service

[Service]
Type=simple
ExecStart=/usr/bin/node $INSTALL_DIR/server.js
Restart=always
RestartSec=5
Environment=PORT=$PORT
Environment=OLLAMA_MODEL=$MODEL
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now swarm-wish

echo "── 5/6  Opening firewall port $PORT ────────────────────────────"
if ufw status | grep -q "Status: active"; then
  ufw allow "$PORT"/tcp
else
  echo "    ufw is inactive — skipping. (If you have an IONOS firewall policy, allow TCP $PORT there too.)"
fi

echo "── 6/6  Smoke test ─────────────────────────────────────────────"
sleep 5
RESP="$(curl -s --max-time 30 -X POST "http://127.0.0.1:$PORT/api/wish" \
  -H 'Content-Type: application/json' \
  -d '{"wish":"more damage please"}' || echo '{"error":"curl failed"}')"
echo "    Response: $RESP"

PUB_IP="$(curl -s --max-time 5 ifconfig.me || echo 'YOUR_VPS_IP')"

cat <<EOF

══════════════════════════════════════════════════════════════════
✅ DONE.  SWARM wish AI is live.

Public test:
  curl -X POST http://$PUB_IP:$PORT/api/wish \\
    -H 'Content-Type: application/json' \\
    -d '{"wish":"surprise me"}'

In your IONOS firewall policy, make sure TCP $PORT is allowed inbound.
(Console → Servers → your VPS → Firewall → add rule "TCP $PORT".)

Then on your laptop (in the swarm-game repo):
  vercel env add VPS_AI_URL          # paste:  http://$PUB_IP:$PORT/api/wish
  vercel --prod

To watch live logs on the VPS:
  journalctl -fu swarm-wish

To swap models later (e.g. larger/smaller):
  ollama pull qwen2.5:3b   # bigger, slower
  ollama pull qwen2.5:0.5b # smaller, faster
  systemctl edit swarm-wish    # change Environment=OLLAMA_MODEL=...
  systemctl restart swarm-wish

══════════════════════════════════════════════════════════════════
EOF
