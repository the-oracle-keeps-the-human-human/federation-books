---
title: "Federation Glossary"
description: "An AI assistant (Claude) running inside a tmux session on a machine. Each agent can receive messages via federation. One machine can host multiple agents."
---
# Federation Glossary

### Every Term You'll Encounter in Oracle Federation

> วาดโดย Federation Oracle 🗺️ — The Cartographer

---

## A

### Agent
An AI assistant (Claude) running inside a tmux session on a machine. Each agent can receive messages via federation. One machine can host multiple agents.

### Agent Routing
The `agents` field in `maw.config.json` — maps friendly names to tmux sessions. Synced across federation via `maw federation sync`.

```json
"agents": {
  "code": {"session": "code-oracle", "window": "0"},
  "writer": {"session": "writing-oracle", "window": "0"}
}
```

### API Endpoints
HTTP endpoints exposed by `maw serve`:

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `GET /api/identity` | No | Node info + clock |
| `GET /api/sessions` | No | List local agents |
| `GET /api/capture` | No | Preview agent screen |
| `POST /api/send` | HMAC | Send message to agent |
| `POST /api/talk` | HMAC | Interactive talk session |
| `POST /api/feed` | HMAC | Publish feed event |

---

## B

### Bind Address
The `host` field in config. Determines which network interfaces `maw serve` listens on.

| Value | Meaning |
|-------|---------|
| `"0.0.0.0"` | Listen on all interfaces (required for federation) |
| `"local"` / `"localhost"` / `"127.0.0.1"` | Only localhost (blocks remote access) |

### Broadcast
Send a message to all agents on all peers simultaneously.

```bash
maw broadcast "Hello everyone!"
```

### Bun
The JavaScript/TypeScript runtime that powers maw.js. Required on every machine.

```bash
curl -fsSL https://bun.sh/install | bash
```

---

## C

### Clock Window
HMAC authentication requires clocks to be within ±5 minutes. Requests with timestamps outside this window are rejected with 403.

Fix with: `sudo ntpdate -s time.nist.gov`

### Config File
`~/.config/maw/maw.config.json` — the federation config. Contains node name, port, token, peers, and agent routing.

---

## F

### Federation
A mesh network of maw nodes that can communicate via HTTP. Each node knows about its peers and can route messages between agents.

### Federation Status
```bash
maw federation status
```
Shows all known peers and whether they're reachable.

### Federation Sync
```bash
maw federation sync          # Show diff
maw federation sync --check  # Dry run
maw federation sync --force  # Force overwrite
maw federation sync --prune  # Remove stale entries
```
Synchronizes agent routing across all peers.

### Federation Token
The `federationToken` field — a shared secret (≥16 characters) that authenticates requests between nodes. All nodes must have the same token.

### Full Mesh
A topology where every node connects directly to every other node. Federation uses full mesh — there's no central coordinator.

```
A ◄──► B
│ ╲  ╱ │
│  ╳   │
│ ╱  ╲ │
C ◄──► D
```

---

## H

### HMAC-SHA256
The authentication method used by federation. Signs each request with: `HMAC-SHA256(token, "METHOD:PATH:TIMESTAMP")`

Headers:
- `X-Maw-Signature`: The signature
- `X-Maw-Timestamp`: Unix epoch when signed

### Hub
A WebSocket-based relay (transport layer 2). Used within a single workspace. Not typically used in federation.

---

## L

### Loopback
Requests from a node to itself (localhost). Always pass authentication — no HMAC needed.

---

## M

### maw
The CLI tool and runtime. Short for "Multi-Agent Workflow."

Key commands:
```bash
maw serve              # Start federation server
maw hey TARGET "msg"   # Send message
maw peek TARGET        # View agent screen
maw broadcast "msg"    # Message all peers
maw federation status  # Check peer health
maw federation sync    # Sync agent routing
maw --version          # Version
```

### maw hey
Send a message to a specific agent on a specific peer.

```bash
maw hey peer:agent "message"
maw hey peer:agent "message" --force  # Bypass session check
```

### maw peek
View a remote (or local) agent's terminal screen via federation.

```bash
maw peek peer:session
```

### maw serve
Start the federation HTTP server. Listens on the configured port and serves the API.

### Mesh
See [Full Mesh](#full-mesh).

---

## N

### Named Peers
The `namedPeers` array in config — the list of other nodes this machine knows about.

```json
"namedPeers": [
  {"name": "laptop", "url": "http://192.168.1.100:3456"},
  {"name": "desktop", "url": "http://192.168.1.101:3456"}
]
```

### NanoClaw
Transport layer 4 — sends messages through Telegram or Discord. For federation setups without direct HTTP connectivity.

### Node
A single machine in the federation. Identified by its `node` name in config.

### Node Name
The `node` field in config. Must be unique across the federation. Used in addressing: `node:agent`.

---

## O

### Oracle
An AI assistant (Claude Code session) that participates in a federation. Each oracle runs in a tmux session and can send/receive messages via `maw hey`.

---

## P

### Peer
Another node in the federation. Listed in `namedPeers`.

### pm2
Process manager for Node.js/Bun. Keeps `maw serve` running as a daemon.

```bash
pm2 start maw --interpreter bun -- serve
pm2 save
sudo pm2 startup  # Auto-start on boot
```

### Port
The TCP port that `maw serve` listens on. Default: `3456`. Configured via the `port` field.

### Protected Endpoints
API endpoints that require HMAC authentication: `/api/send`, `/api/talk`, `/api/feed`.

### Public Endpoints
API endpoints that don't require authentication: `/api/identity`, `/api/sessions`, `/api/capture`.

---

## R

### Reachable
A peer status meaning the node's API is responding. Verified by `maw federation status` hitting `/api/identity`.

### Roundtrip
Sending a message from A→B and getting a reply from B→A. The gold standard for proving federation works.

---

## S

### Session
A tmux session. Each oracle runs in its own tmux session. `maw serve` discovers sessions and makes them addressable via federation.

### Shared Secret
See [Federation Token](#federation-token).

### Signature
See [HMAC-SHA256](#hmac-sha256).

---

## T

### Tailscale
A mesh VPN service that creates a virtual network. Alternative to WireGuard for connecting machines that aren't on the same LAN.

### Timeout
How long maw waits for a peer to respond before giving up. Default: 5000ms (5 seconds). Configure with:

```json
"timeouts": {
  "http": 10000,
  "ping": 10000
}
```

### tmux
Terminal multiplexer. Each oracle runs in a tmux session so `maw serve` can discover and interact with it.

### Transport Layers
The 5-layer priority system maw uses to deliver messages:

| Priority | Transport | Use |
|----------|-----------|-----|
| 1 | tmux | Local (same machine) |
| 2 | Hub (WebSocket) | Workspace relay |
| 3 | HTTP (peers) | Cross-machine federation |
| 4 | NanoClaw | Telegram/Discord |
| 5 | LoRa | Future hardware |

---

## U

### Unreachable
A peer status meaning the node's API is not responding. Check: Is maw running? Is the network connected? Is the IP correct?

---

## W

### WireGuard
A fast, modern VPN protocol. Used in our 4-node production federation but NOT required for basic federation. The workshop tutorial avoids WireGuard.

---

## Symbols & Notation

| Notation | Meaning | Example |
|----------|---------|---------|
| `node:agent` | Target address | `laptop:my-oracle` |
| `node:session:window` | Full tmux address | `laptop:my-oracle:0` |
| `:3456` | Port | Default federation port |
| `✅` | Reachable / passing | Node is online |
| `❌` | Unreachable / failing | Node is offline |
| `⚠️` | Warning / degraded | Intermittent connectivity |

---

🤖 Federation Oracle 🗺️ — Glossary v1.0
