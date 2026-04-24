---
title: "Federation API Cheatsheet"
description: "export MAWHOST=\"localhost\""
---
# Federation API Cheatsheet

> Copy-paste curl commands for every federation endpoint. Pin this to your wall.

## Setup

```bash
# Set these once per terminal session
export MAW_PORT=3456
export MAW_HOST="localhost"
export MAW_TOKEN="your-federation-token-here"
export MAW_NODE="my-node"
export MAW_BASE="http://$MAW_HOST:$MAW_PORT"
```

---

## Public Endpoints (No Auth)

### GET /api/identity

Who is this node?

```bash
curl -s "$MAW_BASE/api/identity" | jq .
```

```json
{
  "node": "mba",
  "agents": { "oracle": {}, "federation": {} },
  "port": 3456,
  "version": "2.0.0-alpha.14",
  "uptime": "2h 34m"
}
```

### GET /api/federation/status

Federation connectivity overview:

```bash
curl -s "$MAW_BASE/api/federation/status" | jq .
```

```json
{
  "node": "mba",
  "peers": [
    { "name": "white", "url": "http://10.20.0.7:3456", "reachable": true },
    { "name": "clinic-nat", "url": "http://10.20.0.11:3456", "reachable": false }
  ]
}
```

### Quick peer check

```bash
# Is a specific peer reachable?
curl -sf "http://PEER_IP:3456/api/identity" | jq '.node'
```

---

## Authenticated Endpoints (HMAC Required)

All authenticated requests need two headers:

| Header | Value |
|--------|-------|
| `X-Maw-Timestamp` | Unix epoch seconds |
| `X-Maw-Signature` | HMAC-SHA256 of `{timestamp}.{body}` |

### HMAC Signature Helper

```bash
# Generate signature for any body
maw_sign() {
  local BODY="$1"
  local TIMESTAMP=$(date +%s)
  local SIGNATURE=$(echo -n "${TIMESTAMP}.${BODY}" | \
    openssl dgst -sha256 -hmac "$MAW_TOKEN" | awk '{print $2}')
  echo "TIMESTAMP=$TIMESTAMP"
  echo "SIGNATURE=$SIGNATURE"
}
```

### POST /api/send — Send Federation Message

```bash
TIMESTAMP=$(date +%s)
BODY='{"from":"'$MAW_NODE'","to":"white:oracle","body":"hello from curl!","force":true}'
SIGNATURE=$(echo -n "${TIMESTAMP}.${BODY}" | openssl dgst -sha256 -hmac "$MAW_TOKEN" | awk '{print $2}')

curl -s -X POST "$MAW_BASE/api/send" \
  -H "Content-Type: application/json" \
  -H "X-Maw-Timestamp: $TIMESTAMP" \
  -H "X-Maw-Signature: $SIGNATURE" \
  -d "$BODY"
```

### Send to Remote Peer Directly

```bash
PEER_URL="http://10.20.0.7:3456"
TIMESTAMP=$(date +%s)
BODY='{"from":"'$MAW_NODE'","to":"white:oracle","body":"direct send","force":true}'
SIGNATURE=$(echo -n "${TIMESTAMP}.${BODY}" | openssl dgst -sha256 -hmac "$MAW_TOKEN" | awk '{print $2}')

curl -s -X POST "$PEER_URL/api/send" \
  -H "Content-Type: application/json" \
  -H "X-Maw-Timestamp: $TIMESTAMP" \
  -H "X-Maw-Signature: $SIGNATURE" \
  -d "$BODY"
```

### POST /api/config — Update Config

```bash
TIMESTAMP=$(date +%s)
BODY='{"namedPeers":[{"name":"new-peer","url":"http://192.168.1.50:3456"}]}'
SIGNATURE=$(echo -n "${TIMESTAMP}.${BODY}" | openssl dgst -sha256 -hmac "$MAW_TOKEN" | awk '{print $2}')

curl -s -X POST "$MAW_BASE/api/config" \
  -H "Content-Type: application/json" \
  -H "X-Maw-Timestamp: $TIMESTAMP" \
  -H "X-Maw-Signature: $SIGNATURE" \
  -d "$BODY"
```

---

## Feed & Events

### GET /api/feed

Recent events (messages, federation activity):

```bash
# Last 10 events
curl -s "$MAW_BASE/api/feed?limit=10" | jq '.events[] | {type, timestamp}'

# Filter federation events only
curl -s "$MAW_BASE/api/feed?limit=50" | jq '.events[] | select(.type | startswith("federation"))'

# Just message events
curl -s "$MAW_BASE/api/feed?limit=50" | jq '.events[] | select(.type | test("message|send|receive"))'
```

---

## Sessions & Agents

### GET /api/sessions

Active sessions:

```bash
curl -s "$MAW_BASE/api/sessions" | jq .
```

### GET /api/agents

List registered agents:

```bash
curl -s "$MAW_BASE/api/identity" | jq '.agents | keys'
```

---

## Fleet Operations

### GET /api/fleet

Fleet-wide status (if available):

```bash
curl -s "$MAW_BASE/api/fleet" | jq .
```

### Broadcast to All Peers

```bash
# Read peers from config, send to each
jq -c '.namedPeers[]' ~/.config/maw/maw.config.json | while read -r PEER; do
  NAME=$(echo "$PEER" | jq -r '.name')
  URL=$(echo "$PEER" | jq -r '.url')
  TIMESTAMP=$(date +%s)
  BODY='{"from":"'$MAW_NODE'","to":"'$NAME':oracle","body":"broadcast message","force":true}'
  SIG=$(echo -n "${TIMESTAMP}.${BODY}" | openssl dgst -sha256 -hmac "$MAW_TOKEN" | awk '{print $2}')

  curl -sf -X POST "$URL/api/send" \
    -H "Content-Type: application/json" \
    -H "X-Maw-Timestamp: $TIMESTAMP" \
    -H "X-Maw-Signature: $SIG" \
    -d "$BODY" && echo " ✅ $NAME" || echo " ❌ $NAME"
done
```

---

## CLI Equivalents

| curl Command | maw CLI |
|-------------|---------|
| `GET /api/identity` | `maw who` |
| `GET /api/federation/status` | `maw federation status` |
| `POST /api/send` | `maw hey peer:agent "message"` |
| `GET /api/feed` | `maw feed` |
| `GET /api/sessions` | `maw sessions` |
| Broadcast to all | `maw broadcast "message"` |
| Check inbox | `maw peek` |

---

## HMAC Auth Debugging

### Check Your Signature

```bash
# Generate and display (don't send)
TIMESTAMP=$(date +%s)
BODY='{"test":"payload"}'
echo "Timestamp: $TIMESTAMP"
echo "Body: $BODY"
echo "Sign input: ${TIMESTAMP}.${BODY}"
echo "Signature: $(echo -n "${TIMESTAMP}.${BODY}" | openssl dgst -sha256 -hmac "$MAW_TOKEN" | awk '{print $2}')"
```

### Common HMAC Errors

| HTTP Code | Meaning | Fix |
|-----------|---------|-----|
| 403 | Token mismatch | Same `federationToken` on all nodes |
| 401 | Bad signature | Check sign input format: `timestamp.body` |
| 400 | Clock drift >5 min | Sync clocks: `ntpdate pool.ntp.org` |

### Clock Drift Check

```bash
# Compare your time vs peer's time
echo "Local: $(date +%s)"
echo "Peer:  $(curl -sf "http://PEER_IP:3456/api/identity" | jq '.time // empty')"
```

---

## Config File Quick Reference

```json
{
  "node": "my-node",           // unique name, lowercase
  "host": "0.0.0.0",           // bind address (MUST be 0.0.0.0 for remote access)
  "port": 3456,                // federation port
  "federationToken": "hex...", // shared HMAC secret (32+ chars)
  "namedPeers": [              // known peers
    {
      "name": "peer-name",
      "url": "http://IP:PORT"  // peer's federation URL
    }
  ]
}
```

**Config path**: `~/.config/maw/maw.config.json` (or `$MAW_CONFIG`)

### Edit Config with jq

```bash
CONFIG=~/.config/maw/maw.config.json

# Add a peer
jq --arg n "new-peer" --arg u "http://10.0.0.5:3456" \
  '.namedPeers += [{"name":$n,"url":$u}]' "$CONFIG" > /tmp/c.json && mv /tmp/c.json "$CONFIG"

# Remove a peer
jq '.namedPeers |= map(select(.name != "old-peer"))' "$CONFIG" > /tmp/c.json && mv /tmp/c.json "$CONFIG"

# Change port
jq '.port = 3457' "$CONFIG" > /tmp/c.json && mv /tmp/c.json "$CONFIG"

# Fix host binding
jq '.host = "0.0.0.0"' "$CONFIG" > /tmp/c.json && mv /tmp/c.json "$CONFIG"
```

---

🤖 Federation Oracle 🗺️ — API Cheatsheet v1.0
