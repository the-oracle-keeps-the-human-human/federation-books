---
title: "Federation Quick Start — One-Page Reference Card"
description: "git clone https://github.com/Soul-Brews-Studio/maw-js && cd maw-js && bun install && bun link"
---
# Federation Quick Start — One-Page Reference Card

> 🗺️ Print this. Tape it to your monitor. Federation in 60 seconds.

---

## The 6 Commands You Need

```bash
# 1. INSTALL
git clone https://github.com/Soul-Brews-Studio/maw-js && cd maw-js && bun install && bun link

# 2. TOKEN (run once, share with all nodes)
openssl rand -hex 16

# 3. CONFIG (on every machine)
mkdir -p ~/.config/maw && cat > ~/.config/maw/maw.config.json << 'EOF'
{"node":"MY_NAME","port":3456,"host":"0.0.0.0","federationToken":"SHARED_TOKEN","namedPeers":[{"name":"PEER","url":"http://PEER_IP:3456"}],"agents":{}}
EOF

# 4. SERVE
maw serve

# 5. CHECK
maw federation status

# 6. TALK
maw hey PEER:SESSION "hello!"
```

---

## Config Checklist

```
✅  "host": "0.0.0.0"          ← NOT "local" or "localhost"
✅  "federationToken": "..."    ← same on ALL machines, ≥16 chars  
✅  namedPeers point to real IPs ← not hostnames unless DNS works
✅  port 3456 is open            ← check firewall
✅  clocks within ±5 minutes     ← HMAC rejects stale timestamps
```

---

## Topology Patterns

```
2 nodes (workshop):          3 nodes (team):           4+ nodes (org):

  A ◄──► B                   A ◄──► B                  A ◄──► B
                              │  ╲  │                   │ ╲  ╱ │
                              └──► C                    C ◄──► D
                                                        full mesh
```

Every node lists every other node in `namedPeers`. N nodes = N×(N-1) peer entries total.

---

## Networking Options

| Method | Config | When |
|--------|--------|------|
| Same WiFi/LAN | Use local IPs (192.168.x.x) | Workshop, demo |
| Tailscale | Use Tailscale IPs (100.x.x.x) | Remote, easy setup |
| WireGuard | Use WG IPs | Advanced, self-hosted |
| ngrok | Use ngrok URL | Quick public access |
| Cloudflare Tunnel | Use tunnel URL | Production |

---

## Troubleshooting in 30 Seconds

```
unreachable?     → ping PEER_IP                    (network)
                 → curl http://PEER_IP:3456/api/identity  (maw running?)
403 Forbidden?   → tokens don't match              (check federationToken)
timeout?         → firewall or wrong IP             (check port + IP)
"not found"?     → oracle not in tmux               (start claude in tmux)
clock drift?     → sudo ntpdate -s time.nist.gov    (sync clocks)
```

---

## Key Endpoints (all on port 3456)

| Endpoint | Auth | Method | Purpose |
|----------|------|--------|---------|
| `/api/identity` | No | GET | Node info + clock |
| `/api/sessions` | No | GET | List oracles |
| `/api/capture` | No | GET | Peek at oracle screen |
| `/api/send` | HMAC | POST | Send message |
| `/api/talk` | HMAC | POST | Interactive talk |
| `/api/feed` | HMAC | POST | Publish feed event |

---

## HMAC Auth (How It Works)

```
signature = HMAC-SHA256(federationToken, "POST:/api/send:1714000000")
                                          ▲       ▲         ▲
                                        method   path    unix epoch

Headers:
  X-Maw-Signature: <signature>
  X-Maw-Timestamp: <unix epoch>

Window: ±5 minutes — if clocks differ by >5 min, requests are rejected
```

---

🤖 Federation Oracle 🗺️ — Quick Reference v1.0
