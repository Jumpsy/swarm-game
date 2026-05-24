# SWARM self-hosted AI on a VPS

Run the AI power-up generator on your own VPS (zero per-call cost forever).

## What gets installed

- **Ollama** running locally on `127.0.0.1:11434`
- **qwen2.5:1.5b** model (~1 GB disk, ~1.5 GB RAM, ~25 tok/s on a 2-vCPU CPU)
- **swarm-wish.service** — Node.js HTTP proxy on `0.0.0.0:3737`
- **systemd** auto-restart on crash/reboot

## Specs needed

Minimum: **2 vCPU, 4 GB RAM, 5 GB free disk.**
Tested on IONOS VPS 2-4-120 (Ubuntu 24.04).

## One-shot install

SSH into your VPS as root and run:

```bash
curl -fsSL https://raw.githubusercontent.com/Jumpsy/swarm-game/main/vps/setup.sh | bash
```

Takes ~5 minutes (most of it is the model download). When it finishes you'll see a `✅ DONE` block with your public IP and exact next steps.

## Firewall

In your IONOS panel: **Servers → your VPS → Firewall** → add inbound rule for **TCP 3737**.

## Point Vercel at it

```bash
cd swarm-game
vercel env add VPS_AI_URL    # paste: http://YOUR_VPS_IP:3737/api/wish
vercel --prod
```

The Vercel `/api/wish` endpoint will then prefer the VPS over the external providers (OpenRouter/Groq/Gemini/Anthropic).

## Test

```bash
# From anywhere
curl -X POST http://YOUR_VPS_IP:3737/api/wish \
  -H 'Content-Type: application/json' \
  -d '{"wish":"more crit damage"}'

# Expected response:
# {"name":"Snake Eyes Module","description":"+8% crit chance","stat":"crit","op":"add","value":0.08,"provider":"vps/qwen2.5:1.5b"}
```

## Ops

```bash
# Live logs
journalctl -fu swarm-wish

# Restart after editing
systemctl restart swarm-wish

# Swap model (smaller = faster, bigger = smarter)
ollama pull qwen2.5:0.5b      # 0.6 GB, ~50 tok/s
ollama pull qwen2.5:3b        # 2 GB, ~12 tok/s
ollama pull llama3.2:3b       # 2 GB
systemctl edit swarm-wish     # set Environment=OLLAMA_MODEL=qwen2.5:0.5b
systemctl restart swarm-wish

# Disk usage
ollama list
du -sh /root/.ollama

# Manually update the proxy code
curl -fsSL https://raw.githubusercontent.com/Jumpsy/swarm-game/main/vps/server.js \
  -o /opt/swarm-wish/server.js
systemctl restart swarm-wish
```

## Latency

CPU inference takes a few seconds. Typical times for 200-token JSON response:

| Model | RAM | Tok/s on 2-vCPU | Time per wish |
|---|---|---|---|
| qwen2.5:0.5b | 0.6 GB | ~50 | ~4s |
| **qwen2.5:1.5b** (default) | 1.5 GB | ~25 | **~8s** |
| qwen2.5:3b | 2 GB | ~12 | ~16s |

The game shows `⏳ AI THINKING…` during the wait, so 5–10 seconds is acceptable.

## Optional: HTTPS

The setup script serves plain HTTP. If you want HTTPS:

1. Point a domain at your VPS IP (A record).
2. Install nginx + certbot, proxy to `127.0.0.1:3737`.
3. Update `VPS_AI_URL` to `https://yourdomain.com/api/wish`.

Plain HTTP works fine for Vercel-to-VPS calls (server-side, no mixed-content issue).
