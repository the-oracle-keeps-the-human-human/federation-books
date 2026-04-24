# Federation Setup Guide — 4 Nodes on WireGuard

> วาดโดย Federation Oracle 🗺️ — The Cartographer
> วันที่: 2026-04-23

## Overview

Federation เชื่อม Oracle 4 เครื่องเข้าด้วยกันผ่าน WireGuard VPN:

```
┌──────────┐       ┌──────────┐       ┌──────────────┐
│   MBA    │◄─────►│  white   │◄─────►│ oracle-world │
│ mba.wg   │       │ white.wg │       │oracle-world.wg│
│ :3457    │       │ :3456    │       │ :3456         │
└────┬─────┘       └──────────┘       └───────────────┘
     │
     ▼
┌──────────┐
│clinic-nat│
│clinic.wg │
│ :3457    │
└──────────┘
```

## How It Works

### 1. maw serve

แต่ละเครื่อง run `maw serve` ซึ่ง:
- เปิด HTTP server บน port ที่กำหนด (3456 หรือ 3457)
- อ่าน tmux sessions → แปลงเป็น agent list
- expose REST API + WebSocket สำหรับ federation

### 2. namedPeers

แต่ละเครื่องมี `~/.config/maw/maw.config.json` ที่บอกว่ารู้จัก peer ไหนบ้าง:

```json
{
  "node": "mba",
  "port": 3457,
  "namedPeers": [
    {"name": "white", "url": "http://white.wg:3456"},
    {"name": "oracle-world", "url": "http://oracle-world.wg:3456"},
    {"name": "clinic-nat", "url": "http://clinic.wg:3457"}
  ]
}
```

### 3. HMAC-SHA256 Authentication

ทุกเครื่องต้องมี `federationToken` เดียวกัน (shared secret, ≥16 chars)

เมื่อส่ง request ข้าม node:
1. Sign: `HMAC-SHA256(token, "METHOD:PATH:TIMESTAMP")`
2. ส่ง signature ใน header `X-Maw-Signature` + `X-Maw-Timestamp`
3. Peer verify: timestamp ต้องอยู่ใน ±5 นาที

Protected endpoints (ต้อง auth):
- `POST /api/send` — ส่งข้อความไป agent
- `POST /api/talk` — talk-to command
- `POST /api/feed` — publish feed event

Public endpoints (ไม่ต้อง auth, สำหรับ UI):
- `GET /api/sessions` — list agents
- `GET /api/identity` — node info + clock
- `GET /api/capture` — terminal preview

### 4. Transport Layers

เมื่อส่งข้อความ maw เลือก transport ตาม priority:

| Priority | Transport | Use Case |
|----------|-----------|----------|
| 1 (fastest) | tmux | local agent บนเครื่องเดียวกัน |
| 2 | Hub WebSocket | workspace hub (ถ้า config) |
| 3 | HTTP federation | cross-machine ผ่าน namedPeers |
| 4 | NanoClaw | Telegram, Discord |
| 5 | LoRa | future hardware |

### 5. Federation Commands

```bash
# ดูสถานะ peers
maw federation status

# sync agent routing
maw federation sync          # show diff
maw federation sync --check  # dry-run
maw federation sync --force  # overwrite conflicts
maw federation sync --prune  # remove stale routes

# ส่งข้อความข้ามเครื่อง
maw hey white:pulse "hello"
maw broadcast "message to all"
```

## Setup Steps (New Node)

### Step 1: Install maw

```bash
# Option A: from source (recommended)
ghq get -u -p https://github.com/Soul-Brews-Studio/maw-js
cd $(ghq root)/github.com/Soul-Brews-Studio/maw-js
bun install
ln -sf $(pwd)/src/cli.ts ~/.bun/bin/maw

# Option B: bun global
bun add -g maw-js
```

### Step 2: Create config

```bash
mkdir -p ~/.config/maw
cat > ~/.config/maw/maw.config.json << 'EOF'
{
  "node": "YOUR_NODE_NAME",
  "port": 3456,
  "federationToken": "SAME_TOKEN_AS_OTHER_NODES",
  "namedPeers": [
    {"name": "mba", "url": "http://mba.wg:3457"},
    {"name": "white", "url": "http://white.wg:3456"},
    {"name": "oracle-world", "url": "http://oracle-world.wg:3456"},
    {"name": "clinic-nat", "url": "http://clinic.wg:3457"}
  ],
  "agents": {}
}
EOF
```

### Step 3: Start serving

```bash
# In tmux (recommended)
tmux new-session -d -s maw-server "maw serve"

# Verify
curl http://localhost:3456/api/identity
```

### Step 4: Verify from other nodes

```bash
# From any existing node:
maw federation status
# → should show new node as reachable

maw federation sync
# → should discover new node's agents
```

### Step 5: Tell other nodes about you

Add your node to every other node's `namedPeers`:
```json
{"name": "YOUR_NODE", "url": "http://YOUR_NODE.wg:PORT"}
```

## Current Network (2026-04-23)

| Node | SSH | Port | WG IP | Agents |
|------|-----|------|-------|--------|
| MBA | nat@localhost | 3457 | 10.20.0.3 | 9 |
| white | nat@white.wg | 3456 | 10.20.0.7 | 81 |
| clinic-nat | nat@clinic.wg | 3457 | 10.20.0.1 | 73 |
| oracle-world | neo@oracle-world | 3456 | 10.20.0.16 | 81 |

## Troubleshooting

### Peer shows "unreachable"
1. Check WG: `ping PEER.wg`
2. Check maw: `curl http://PEER.wg:PORT/api/identity`
3. maw not running? → `ssh USER@PEER "tmux ls"` → start `maw serve`
4. Port conflict? → check `ss -tlnp | grep PORT`

### Clock drift warning
- HMAC ±5 min window → ถ้า clock ต่างกันเกิน 3 นาทีจะ warn, เกิน 5 นาทีจะ reject
- Fix: `sudo ntpdate -s time.nist.gov` หรือ enable NTP

### Wrong node identity
- ถ้า `/api/identity` ตอบ node name ผิด → เช็ค `maw.config.json` ว่า `"node"` ตรงไหม
- Kill old process แล้ว restart

### Federation token mismatch
- ทุกเครื่องต้องมี `federationToken` เดียวกัน
- Token ต้องยาว ≥16 chars
- ถ้าไม่ตรง → request จะถูก reject ด้วย 403

---

🤖 ตอบโดย Federation Oracle จาก Nat → federation-oracle
