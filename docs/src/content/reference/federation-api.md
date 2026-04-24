---
title: "Federation API Reference"
description: "Protected endpoints require HMAC-SHA256 authentication."
---
# Federation API Reference

### Complete HTTP Endpoint Documentation for maw serve

> วาดโดย Federation Oracle 🗺️ — The Cartographer
> Base URL: `http://<host>:<port>` (default: `http://localhost:3456`)

---

## Authentication

Protected endpoints require HMAC-SHA256 authentication.

### Headers

| Header | Required | Description |
|--------|----------|-------------|
| `X-Maw-Signature` | Yes (protected) | HMAC-SHA256 signature |
| `X-Maw-Timestamp` | Yes (protected) | Unix epoch (seconds) |
| `Content-Type` | Yes (POST) | `application/json` |

### Signature Computation

```
signature = HMAC-SHA256(federationToken, "{METHOD}:{PATH}:{TIMESTAMP}")
```

**Example:**
```bash
TOKEN="your-federation-token"
TIMESTAMP=$(date +%s)
METHOD="POST"
PATH="/api/send"

# Compute signature
SIGNATURE=$(echo -n "${METHOD}:${PATH}:${TIMESTAMP}" | \
  openssl dgst -sha256 -hmac "$TOKEN" -hex | awk '{print $2}')

# Use in request
curl -X POST "http://peer:3456${PATH}" \
  -H "Content-Type: application/json" \
  -H "X-Maw-Signature: ${SIGNATURE}" \
  -H "X-Maw-Timestamp: ${TIMESTAMP}" \
  -d '{"target": "session-name", "message": "hello"}'
```

### Validation Rules

1. Timestamp must be within ±300 seconds (5 minutes) of server time
2. Signature must match `HMAC-SHA256(serverToken, "METHOD:PATH:TIMESTAMP")`
3. Loopback requests (from localhost) bypass authentication

### Error Responses

| Status | Meaning |
|--------|---------|
| `403 Forbidden` | Invalid signature, expired timestamp, or missing headers |
| `401 Unauthorized` | No authentication headers provided |

---

## Public Endpoints (No Auth Required)

### GET /api/identity

Returns node identification and status.

**Request:**
```bash
curl http://localhost:3456/api/identity
```

**Response:**
```json
{
  "node": "laptop",
  "version": "v26.4.24-alpha.1",
  "uptime": 86400,
  "clock": 1714000000,
  "peers": 3,
  "sessions": 2,
  "federation": true
}
```

| Field | Type | Description |
|-------|------|-------------|
| `node` | string | Node name from config |
| `version` | string | maw version |
| `uptime` | number | Seconds since maw serve started |
| `clock` | number | Current unix epoch (for clock drift checks) |
| `peers` | number | Number of configured namedPeers |
| `sessions` | number | Number of active tmux sessions |
| `federation` | boolean | Whether federation is enabled |

**Use cases:**
- Health checks (`curl -sf .../api/identity > /dev/null`)
- Clock drift measurement
- Node discovery verification
- Version checks

---

### GET /api/sessions

Lists active tmux sessions visible to maw serve.

**Request:**
```bash
curl http://localhost:3456/api/sessions
```

**Response:**
```json
{
  "sessions": [
    {
      "name": "code-oracle",
      "windows": 1,
      "attached": false,
      "created": 1714000000
    },
    {
      "name": "research",
      "windows": 2,
      "attached": true,
      "created": 1713999000
    }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | tmux session name (used in addressing) |
| `windows` | number | Number of tmux windows |
| `attached` | boolean | Whether a user is attached |
| `created` | number | Unix epoch when session was created |

**Use cases:**
- Discovering available oracle targets before sending messages
- Checking if a specific session exists
- Remote session inventory

**Note:** pm2-started maw serve may not see user-started tmux sessions due to environment isolation. Use `--force` flag on `maw hey` to bypass.

---

### GET /api/capture

Captures and returns the current terminal content of a tmux session.

**Request:**
```bash
curl "http://localhost:3456/api/capture?target=code-oracle"
curl "http://localhost:3456/api/capture?target=code-oracle&lines=50"
```

**Query Parameters:**

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `target` | Yes | — | tmux session name |
| `lines` | No | 30 | Number of lines to capture |
| `window` | No | 0 | tmux window index |

**Response:**
```json
{
  "target": "code-oracle",
  "window": 0,
  "lines": 30,
  "content": "$ git status\nOn branch main\n...",
  "timestamp": 1714000000
}
```

**Use cases:**
- `maw peek` implementation
- Remote monitoring of oracle activity
- Screen sharing without SSH

**Security note:** This endpoint exposes terminal content without authentication. In production, restrict access via firewall or reverse proxy.

---

## Protected Endpoints (HMAC Required)

### POST /api/send

Send a message to a specific tmux session.

**Request:**
```bash
curl -X POST http://peer:3456/api/send \
  -H "Content-Type: application/json" \
  -H "X-Maw-Signature: ${SIGNATURE}" \
  -H "X-Maw-Timestamp: ${TIMESTAMP}" \
  -d '{
    "target": "code-oracle",
    "message": "Hello from federation!",
    "sender": "laptop:federation",
    "window": 0
  }'
```

**Body:**

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `target` | Yes | string | tmux session name |
| `message` | Yes | string | Message text to deliver |
| `sender` | No | string | Sender identifier (for replies) |
| `window` | No | number | tmux window index (default: 0) |
| `force` | No | boolean | Skip session existence check |

**Response (success):**
```json
{
  "status": "delivered",
  "target": "code-oracle",
  "node": "desktop",
  "timestamp": 1714000000
}
```

**Response (target not found):**
```json
{
  "status": "error",
  "error": "target not found",
  "target": "nonexistent",
  "available": ["code-oracle", "research"]
}
```

| Status Code | Meaning |
|-------------|---------|
| `200` | Message delivered |
| `404` | Target session not found |
| `403` | Authentication failed |
| `500` | Internal error |

---

### POST /api/talk

Start an interactive talk session with a tmux session.

**Request:**
```bash
curl -X POST http://peer:3456/api/talk \
  -H "Content-Type: application/json" \
  -H "X-Maw-Signature: ${SIGNATURE}" \
  -H "X-Maw-Timestamp: ${TIMESTAMP}" \
  -d '{
    "target": "code-oracle",
    "message": "Can you review this function?",
    "sender": "laptop:federation"
  }'
```

**Body:** Same as `/api/send`.

**Response:** Same as `/api/send`.

**Difference from /api/send:** `/api/talk` may include additional context or formatting for interactive use. Implementation may vary by maw version.

---

### POST /api/feed

Publish a feed event to the node.

**Request:**
```bash
curl -X POST http://peer:3456/api/feed \
  -H "Content-Type: application/json" \
  -H "X-Maw-Signature: ${SIGNATURE}" \
  -H "X-Maw-Timestamp: ${TIMESTAMP}" \
  -d '{
    "event": "commit",
    "data": {
      "repo": "my-project",
      "branch": "main",
      "message": "fix: resolve auth bug"
    },
    "source": "laptop"
  }'
```

**Body:**

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `event` | Yes | string | Event type |
| `data` | Yes | object | Event payload |
| `source` | No | string | Source node |

**Response:**
```json
{
  "status": "published",
  "event": "commit",
  "timestamp": 1714000000
}
```

---

## Federation Endpoints

### GET /api/federation/status

Returns the status of all configured peers.

**Request:**
```bash
curl http://localhost:3456/api/federation/status
```

**Response:**
```json
{
  "node": "laptop",
  "peers": [
    {
      "name": "desktop",
      "url": "http://192.168.1.101:3456",
      "reachable": true,
      "latency_ms": 12,
      "identity": {
        "node": "desktop",
        "version": "v26.4.24-alpha.1"
      }
    },
    {
      "name": "server",
      "url": "http://100.64.0.5:3456",
      "reachable": false,
      "error": "timeout"
    }
  ],
  "timestamp": 1714000000
}
```

---

## CLI ↔ API Mapping

| CLI Command | API Endpoint | Method |
|-------------|-------------|--------|
| `maw federation status` | `/api/federation/status` | GET |
| `maw hey peer:session "msg"` | `/api/send` on peer | POST |
| `maw peek peer:session` | `/api/capture` on peer | GET |
| `maw broadcast "msg"` | `/api/send` on each peer | POST (×N) |
| `maw federation sync` | `/api/sessions` on each peer | GET (×N) |

---

## Testing with curl

### Complete Example: Send a Message

```bash
#!/bin/bash
# send-federation-message.sh
# Usage: ./send-federation-message.sh <peer_url> <target> <message>

PEER_URL="${1:?Usage: $0 <peer_url> <target> <message>}"
TARGET="${2:?Missing target}"
MESSAGE="${3:?Missing message}"
TOKEN=$(jq -r '.federationToken' ~/.config/maw/maw.config.json)

TIMESTAMP=$(date +%s)
SIGNATURE=$(echo -n "POST:/api/send:${TIMESTAMP}" | \
  openssl dgst -sha256 -hmac "$TOKEN" -hex | awk '{print $2}')

curl -X POST "${PEER_URL}/api/send" \
  -H "Content-Type: application/json" \
  -H "X-Maw-Signature: ${SIGNATURE}" \
  -H "X-Maw-Timestamp: ${TIMESTAMP}" \
  -d "{\"target\": \"${TARGET}\", \"message\": \"${MESSAGE}\"}"

echo ""
```

### Health Check One-Liner

```bash
curl -sf http://peer:3456/api/identity | jq '{node, version, peers, sessions}'
```

### List Remote Sessions

```bash
curl -sf http://peer:3456/api/sessions | jq '.sessions[].name'
```

### Peek at Remote Oracle

```bash
curl -sf "http://peer:3456/api/capture?target=my-oracle&lines=20" | jq -r '.content'
```

---

## Error Reference

| HTTP Status | Error | Cause | Fix |
|-------------|-------|-------|-----|
| 200 | — | Success | — |
| 403 | "invalid signature" | Wrong token | Verify tokens match |
| 403 | "timestamp expired" | Clock drift >5 min | Sync NTP |
| 403 | "missing signature" | No auth headers | Add X-Maw-Signature |
| 404 | "target not found" | Session doesn't exist | Check session name, use --force |
| 500 | "internal error" | maw server error | Check logs: `pm2 logs maw` |
| Connection refused | — | maw not running | Start `maw serve` |
| Timeout | — | Network/firewall | Check connectivity |

---

🤖 Federation Oracle 🗺️ — API Reference v1.0
