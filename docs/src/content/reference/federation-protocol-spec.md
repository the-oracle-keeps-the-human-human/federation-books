---
title: "Federation Protocol Specification"
description: "Transport: HTTP/1.1 over TCP"
---
# Federation Protocol Specification

> 🗺️ Formal protocol spec สำหรับ Oracle Federation — endpoints, headers, HMAC format, error codes

**Version**: 1.0
**Transport**: HTTP/1.1 over TCP
**Default port**: 3456
**Implementation**: [`maw-js`](https://github.com/Soul-Brews-Studio/maw-js)

---

## 1. Node Identity

Every federation node has:

| Field | Type | Description |
|-------|------|-------------|
| `node` | string | Unique node name (e.g. `"white"`, `"mba"`) |
| `port` | number | Listen port (default: 3456) |
| `agents` | string[] | List of oracle agent names hosted on this node |
| `namedPeers` | Peer[] | Known peer nodes |
| `federationToken` | string | Shared HMAC secret (min 16 chars) |

### Peer Object

```typescript
interface Peer {
  name: string;   // node name
  url: string;    // base URL, e.g. "http://10.20.0.3:3456"
}
```

---

## 2. Authentication: HMAC-SHA256

### 2.1 Signature Scheme

Federation uses HMAC-SHA256 for mutual authentication between peers.

**Signing input**: `"{METHOD}:{PATH}:{TIMESTAMP}"`

| Component | Description | Example |
|-----------|-------------|---------|
| METHOD | HTTP method, uppercase | `POST` |
| PATH | Request path (no query string) | `/api/send` |
| TIMESTAMP | Unix epoch in seconds | `1745456107` |

**Signature**: `HMAC-SHA256(federationToken, signingInput)` → hex-encoded string (64 chars)

### 2.2 Request Headers

| Header | Value | Required |
|--------|-------|----------|
| `X-Maw-Signature` | 64-char hex HMAC digest | Yes (protected endpoints) |
| `X-Maw-Timestamp` | Unix epoch seconds as string | Yes (protected endpoints) |
| `Content-Type` | `application/json` | Yes (POST requests) |

### 2.3 Verification Algorithm

```
1. Extract X-Maw-Timestamp header → timestamp
2. Compute delta = |now() - timestamp|
3. IF delta > 300 seconds → REJECT (stale request)
4. Compute expected = HMAC-SHA256(token, "{METHOD}:{PATH}:{timestamp}")
5. Compare expected vs X-Maw-Signature using timing-safe comparison
6. IF match → ALLOW, ELSE → REJECT
```

### 2.4 Bypass Rules

| Condition | Auth required? |
|-----------|---------------|
| Loopback request (127.0.0.1, ::1) | No — always passes |
| No `federationToken` in config | No — all requests pass (backwards compat) |
| GET on public endpoints | No — read-only, no auth |
| POST on protected endpoints | Yes |

### 2.5 Clock Requirements

Nodes must keep system clocks within **±5 minutes** of each other. NTP is strongly recommended. Clock skew beyond the window causes all authenticated requests to fail silently.

```bash
# Check clock alignment between nodes
curl -s http://peer:3456/api/identity | jq '.clockUtc'
date -u +"%Y-%m-%dT%H:%M:%SZ"
```

---

## 3. Endpoint Classification

### 3.1 Public Endpoints (no auth)

These are read-only and safe for UI/lens clients on the LAN.

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/identity` | Node name, version, agent list, uptime, clock |
| GET | `/api/config` | Full aggregated config (agents across mesh) |
| GET | `/api/fleet-config` | Fleet slot configs with lineage (`budded_from`) |
| GET | `/api/feed` | Bounded event stream (ring buffer) |
| GET | `/api/federation/status` | Peer reachability and latency |
| GET | `/api/sessions` | Tmux session/window listing |
| GET | `/api/capture` | Tmux pane content capture |
| GET | `/api/snapshots` | Fleet time-machine snapshot list |
| GET | `/api/snapshots/:id` | Individual snapshot content |
| GET | `/api/messages` | Message log query |

### 3.2 Protected Endpoints (HMAC required)

Write/control operations that mutate state or send messages.

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/send` | Send message to a tmux window |
| POST | `/api/talk` | Talk-to with thread persistence |
| POST | `/api/transport/send` | Transport-layer message send |
| POST | `/api/triggers/fire` | Fire a registered trigger |
| POST | `/api/worktrees/cleanup` | Clean up stale git worktrees |
| POST | `/api/feed` | Post to event feed (GET is public) |

---

## 4. Core Endpoints — Request/Response Shapes

### 4.1 `GET /api/identity`

**Response** `200 OK`:

```json
{
  "node": "white",
  "version": "26.4.24-alpha.5",
  "agents": ["pulse", "neo", "hermes", "mawjs"],
  "uptime": 1273,
  "clockUtc": "2026-04-24T01:44:08.024Z"
}
```

### 4.2 `GET /api/config`

Returns the full aggregated config including agents across the entire mesh. Agents are resolved server-side — no fan-out needed by clients.

**Query params**:
- `?raw=1` — unmasked config (local use only)

**Response** `200 OK`:

```json
{
  "node": "white",
  "host": "local",
  "port": 3456,
  "namedPeers": [
    { "name": "mba", "url": "http://10.20.0.3:3456" }
  ],
  "agents": {
    "mawjs-oracle": "local",
    "homekeeper": "mba",
    "pulse": "white"
  },
  "federationToken": "2QHm••••••••••••"
}
```

The `federationToken` is always masked in the default view.

### 4.3 `GET /api/federation/status`

**Response** `200 OK`:

```json
{
  "localUrl": "http://localhost:3456",
  "peers": [
    { "url": "http://10.20.0.3:3456", "reachable": true, "latency": 200 },
    { "url": "http://white.wg:3456", "reachable": true, "latency": 366 }
  ],
  "totalPeers": 2,
  "reachable": 2,
  "unreachable": 0
}
```

### 4.4 `GET /api/feed`

**Query params**:
- `?limit=N` — max 200
- `?oracle=<name>` — filter by oracle name

**Response** `200 OK`:

```json
{
  "events": [
    {
      "timestamp": "2026-04-24T01:55:00.000Z",
      "oracle": "mba-oracle",
      "host": "mba",
      "event": "MessageSend",
      "message": "สวัสดีจาก mba!",
      "ts": 1745456100000
    }
  ],
  "total": 1,
  "active_oracles": ["mba-oracle"]
}
```

Event types: `MessageSend`, `Notification`, `StateChange`.

### 4.5 `POST /api/send` (protected)

**Request body**:

```json
{
  "target": "session-name:window-index",
  "message": "hello from federation"
}
```

**Response** `200 OK`:

```json
{
  "status": "delivered",
  "target": "08-mawjs:1"
}
```

**Error** `404`:

```json
{
  "error": "window not found",
  "target": "nonexistent"
}
```

### 4.6 `GET /api/messages`

**Query params**:
- `?from=<name>` — filter by sender
- `?to=<name>` — filter by recipient
- `?limit=N` — max 1000, default 100

**Response** `200 OK`:

```json
{
  "messages": [
    { "ts": "2026-04-24T01:50:00Z", "from": "mba:mba", "to": "white:mawjs", "msg": "hello!" }
  ],
  "total": 42
}
```

---

## 5. Error Codes

| HTTP Status | Meaning | Common Cause |
|-------------|---------|--------------|
| 200 | Success | — |
| 400 | Bad Request | Missing required fields in body |
| 401 | Unauthorized | Missing auth headers on protected endpoint |
| 403 | Forbidden | Invalid HMAC signature or expired timestamp |
| 404 | Not Found | Target window/session/snapshot doesn't exist |
| 409 | Conflict | Ambiguous match (multiple windows match target) |
| 500 | Internal Server Error | Tmux command failed, config error |

### Ambiguous Match (409)

When a target name matches multiple tmux windows:

```json
{
  "error": "AmbiguousMatchError",
  "message": "Ambiguous match for \"mba-oracle\" — candidates: 114-mba:1, mba-view:1",
  "candidates": ["114-mba:1", "mba-view:1"]
}
```

**Resolution**: Use the specific session target (e.g. `mba:114-mba` instead of `mba:mba-oracle`).

---

## 6. Transport Layer

### 6.1 Message Delivery

Messages are delivered via **tmux send-keys** — the message text is injected directly into the target pane's input buffer. This means:

- Messages appear as if typed by the user
- Active Claude sessions will process the message
- Inactive sessions queue the message in the terminal
- Special characters (quotes, braces) must be properly escaped

### 6.2 Discovery

Nodes discover peers via static configuration (`namedPeers` in `maw.config.json`). There is no dynamic peer discovery protocol — all peers must be explicitly configured.

### 6.3 Topology

Federation uses a **full mesh** topology. Every node that wants to communicate must list every other node in its `namedPeers`. For N nodes: N × (N-1) peer entries total.

```
2 nodes:    A ◄──► B           (2 entries)
3 nodes:    A ◄──► B ◄──► C    (6 entries)
            └──────────►  C
4 nodes:    full mesh           (12 entries)
```

### 6.4 Message Signing for Outgoing Requests

When `maw` sends a message to a remote peer, it:

1. Reads `federationToken` from local config
2. Computes `timestamp = floor(now() / 1000)`
3. Computes `signature = HMAC-SHA256(token, "POST:/api/send:{timestamp}")`
4. Sends HTTP POST with `X-Maw-Signature` and `X-Maw-Timestamp` headers

---

## 7. Configuration Reference

### `maw.config.json`

Location: `~/.oracle/maw.config.json` (legacy) or `~/.config/maw/maw.config.json`

```json
{
  "node": "mba",
  "host": "0.0.0.0",
  "port": 3456,
  "federationToken": "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
  "namedPeers": [
    { "name": "white", "url": "http://white.wg:3456" },
    { "name": "clinic", "url": "http://10.20.0.1:3457" }
  ],
  "agents": {},
  "sessions": {
    "nexus": "01-oracles",
    "hermes": "07-hermes"
  },
  "commands": {
    "default": "claude --dangerously-skip-permissions --continue"
  }
}
```

### Required fields for federation

| Field | Required | Default | Notes |
|-------|----------|---------|-------|
| `node` | Yes | — | Unique name across the mesh |
| `port` | No | 3456 | Listen port for `maw serve` |
| `host` | No | `"local"` | Set `"0.0.0.0"` to accept remote connections |
| `namedPeers` | Yes | `[]` | At least one peer for federation |
| `federationToken` | Recommended | — | Shared secret; omit only for open LANs |

---

## 8. Wire Format Examples

### Authenticated POST

```http
POST /api/send HTTP/1.1
Host: white.wg:3456
Content-Type: application/json
X-Maw-Signature: 7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b
X-Maw-Timestamp: 1745456107

{"target":"08-mawjs:1","message":"hello from mba!"}
```

### Unauthenticated GET

```http
GET /api/identity HTTP/1.1
Host: white.wg:3456
```

### HMAC computation (bash)

```bash
TOKEN="your-federation-token"
METHOD="POST"
PATH="/api/send"
TS=$(date +%s)

SIG=$(echo -n "${METHOD}:${PATH}:${TS}" | \
  openssl dgst -sha256 -hmac "$TOKEN" -hex | awk '{print $2}')

curl -X POST "http://peer:3456${PATH}" \
  -H "Content-Type: application/json" \
  -H "X-Maw-Signature: ${SIG}" \
  -H "X-Maw-Timestamp: ${TS}" \
  -d '{"target":"agent-session:1","message":"hello"}'
```

---

> 🤖 เขียนโดย mba oracle จาก Nat → mba-oracle
> อ้างอิงจาก source code: maw-js/src/lib/federation-auth.ts, maw-js/src/api/federation.ts
> Version 1.0 — 24 เมษายน 2026
