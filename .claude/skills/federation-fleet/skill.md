# /federation-fleet — Fleet-Wide Status & Management

> See every node in your federation at a glance — who's up, who's down, who's drifting.

## Usage

```
/federation-fleet                   # Full fleet status dashboard
/federation-fleet --compact         # One-line-per-node summary
/federation-fleet --health          # Health scores per node
/federation-fleet --agents          # List agents on every node
/federation-fleet --config-diff     # Compare configs across nodes
```

## Action

### Step 1: Gather Fleet Data

```bash
CONFIG="${MAW_CONFIG:-$HOME/.config/maw/maw.config.json}"
if [ ! -f "$CONFIG" ]; then
  echo "❌ No maw config. Run /federation-setup first."
  exit 1
fi

NODE=$(jq -r '.node' "$CONFIG")
PORT=$(jq -r '.port // 3456' "$CONFIG")
TOKEN=$(jq -r '.federationToken' "$CONFIG")

echo "🚢 Federation Fleet — viewed from $NODE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
```

Query each node's `/api/identity` and `/api/federation/status`:

```bash
# Local node first
LOCAL_IDENTITY=$(curl -sf "http://localhost:$PORT/api/identity" 2>/dev/null)
LOCAL_FED=$(curl -sf "http://localhost:$PORT/api/federation/status" 2>/dev/null)

# All peers
jq -c '.namedPeers[]' "$CONFIG" | while read -r PEER; do
  NAME=$(echo "$PEER" | jq -r '.name')
  URL=$(echo "$PEER" | jq -r '.url')

  IDENTITY=$(curl -sf --connect-timeout 5 "$URL/api/identity" 2>/dev/null)
  FED_STATUS=$(curl -sf --connect-timeout 5 "$URL/api/federation/status" 2>/dev/null)
  UPTIME=$(echo "$IDENTITY" | jq -r '.uptime // empty' 2>/dev/null)
  VERSION=$(echo "$IDENTITY" | jq -r '.version // empty' 2>/dev/null)
  AGENTS=$(echo "$IDENTITY" | jq -r '.agents | keys[]' 2>/dev/null)
  AGENT_COUNT=$(echo "$IDENTITY" | jq -r '.agents | length' 2>/dev/null)

  # Store results for display
  echo "$NAME|$URL|$IDENTITY|$FED_STATUS|$UPTIME|$VERSION|$AGENT_COUNT"
done
```

---

### Step 2: Display Fleet Dashboard

```
🚢 Federation Fleet — 4 nodes
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  ● mba (local)                        ✅ online
    Port: 3456 | Agents: 5 | Uptime: 2h 34m
    Version: 2.0.0-alpha.14
    Peers: 3/3 reachable
    URL: http://localhost:3456

  ● white                              ✅ online
    Port: 3456 | Agents: 4 | Uptime: 5h 12m
    Version: 2.0.0-alpha.14
    Peers: 2/3 reachable
    URL: http://10.20.0.7:3456

  ◌ clinic-nat                         ⚠️ partial
    Port: 3456 | Agents: 3 | Uptime: 1h 05m
    Version: 2.0.0-alpha.12
    Peers: 1/3 reachable
    URL: http://10.20.0.11:3456

  · oracle-world                       ❌ offline
    Port: 3456
    URL: http://10.20.0.5:3456
    Last seen: never from this node

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Legend: ● online  ◌ partial  · offline
  Fleet health: 3/4 nodes (75%)
```

---

### Step 3: Cross-Connectivity Matrix

Build a matrix showing who can see whom:

```
📊 Connectivity Matrix
━━━━━━━━━━━━━━━━━━━━━━

          mba   white  clinic  oracle
  mba      —     ✅     ✅      ❌
  white   ✅      —     ❌      ✅
  clinic  ✅     ❌      —      ❌
  oracle  ❌     ✅     ❌       —

  ✅ = reachable   ❌ = unreachable   — = self
```

To build this, query each reachable node's `/api/federation/status` and check which peers they see:

```bash
for PEER_URL in $ALL_URLS; do
  STATUS=$(curl -sf --connect-timeout 5 "$PEER_URL/api/federation/status" 2>/dev/null)
  if [ -n "$STATUS" ]; then
    echo "$STATUS" | jq -c '.peers[] | {name, reachable}'
  fi
done
```

---

## --compact Mode

One line per node:

```
🚢 Fleet: mba ● | white ● | clinic ◌ | oracle · — 3/4 (75%)
```

---

## --health Mode

Score each node's health from 0-100:

```bash
# Health score calculation:
# +20 — node responds to /api/identity
# +20 — correct federationToken (HMAC test passes)
# +20 — all configured peers reachable from this node
# +20 — version matches latest known version
# +10 — uptime > 1 hour
# +10 — clock within ±60s of our time
```

```
🏥 Fleet Health Scores
━━━━━━━━━━━━━━━━━━━━━━

  mba:          100/100  ████████████████████ excellent
  white:         80/100  ████████████████·····    good
  clinic-nat:    50/100  ██████████···········    fair
  oracle-world:   0/100  ·····················    offline

  Fleet average: 57/100
```

Health checks per node:

```bash
HEALTH=0

# Check 1: Identity endpoint
IDENTITY=$(curl -sf --connect-timeout 5 "$URL/api/identity" 2>/dev/null)
[ -n "$IDENTITY" ] && HEALTH=$((HEALTH + 20))

# Check 2: HMAC auth
TIMESTAMP=$(date +%s)
BODY='{"from":"health-check","to":"'$NAME':oracle","body":"ping"}'
SIG=$(echo -n "${TIMESTAMP}.${BODY}" | openssl dgst -sha256 -hmac "$TOKEN" | awk '{print $2}')
AUTH=$(curl -sf --connect-timeout 5 -w "%{http_code}" -o /dev/null \
  -X POST "$URL/api/send" \
  -H "Content-Type: application/json" \
  -H "X-Maw-Signature: $SIG" \
  -H "X-Maw-Timestamp: $TIMESTAMP" \
  -d "$BODY" 2>/dev/null)
[ "$AUTH" = "200" ] || [ "$AUTH" = "201" ] && HEALTH=$((HEALTH + 20))

# Check 3: Peer reachability
TOTAL_PEERS=$(echo "$IDENTITY" | jq '.peers | length' 2>/dev/null)
REACHABLE=$(echo "$IDENTITY" | jq '[.peers[] | select(.reachable)] | length' 2>/dev/null)
[ "$REACHABLE" = "$TOTAL_PEERS" ] 2>/dev/null && HEALTH=$((HEALTH + 20))

# Check 4: Version match
PEER_VERSION=$(echo "$IDENTITY" | jq -r '.version' 2>/dev/null)
[ "$PEER_VERSION" = "$LATEST_VERSION" ] && HEALTH=$((HEALTH + 20))

# Check 5: Uptime
UPTIME_SECS=$(echo "$IDENTITY" | jq -r '.uptimeSeconds // 0' 2>/dev/null)
[ "$UPTIME_SECS" -gt 3600 ] 2>/dev/null && HEALTH=$((HEALTH + 10))

# Check 6: Clock drift
PEER_TIME=$(curl -sf --connect-timeout 3 "$URL/api/identity" 2>/dev/null | jq -r '.time // empty')
if [ -n "$PEER_TIME" ]; then
  OUR_TIME=$(date +%s)
  DRIFT=$(( OUR_TIME - PEER_TIME ))
  [ "${DRIFT#-}" -lt 60 ] && HEALTH=$((HEALTH + 10))
fi
```

---

## --agents Mode

List agents across every node:

```
🤖 Fleet Agents
━━━━━━━━━━━━━━━━

  mba (5 agents):
    • oracle     — Oracle core
    • federation — Federation guide
    • mba        — Personal assistant
    • timekeeper — Time management
    • white      — White Oracle proxy

  white (4 agents):
    • oracle     — Oracle core
    • white      — White Oracle
    • federation — Federation guide
    • sync       — Sync agent

  clinic-nat (3 agents):
    • oracle     — Oracle core
    • clinic     — Clinic assistant
    • nat        — Personal

  oracle-world: offline — cannot query agents

  Unique agents across fleet: 9
  Most common: oracle (3/4 nodes)
```

---

## --config-diff Mode

Compare key config fields across reachable nodes:

```bash
# Query each node's config (via /api/config if available, or infer from identity)
echo "📋 Config Comparison"
echo "━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  Field          mba       white      clinic"
echo "  ─────          ───       ─────      ──────"
echo "  port           3456      3456       3456"
echo "  host           0.0.0.0   0.0.0.0    127.0.0.1 ⚠️"
echo "  version        alpha.14  alpha.14   alpha.12 ⚠️"
echo "  peers          3         3          2"
echo "  token prefix   a1b2c3    a1b2c3     a1b2c3 ✅"
echo ""
echo "  ⚠️ clinic-nat: host=127.0.0.1 blocks remote access"
echo "  ⚠️ clinic-nat: version behind (alpha.12 vs alpha.14)"
```

---

## Fleet Management Actions

After displaying status, suggest actions based on findings:

```
💡 Suggested Actions
━━━━━━━━━━━━━━━━━━━━

  1. oracle-world is offline
     → SSH: ssh neo@oracle-world
     → Start: maw serve &
     → Or pm2: pm2 start maw -- serve

  2. clinic-nat has version mismatch
     → SSH: ssh nat@clinic.wg
     → Update: cd maw-js && git pull && bun install && bun link

  3. clinic-nat bound to 127.0.0.1
     → Fix: jq '.host = "0.0.0.0"' ~/.config/maw/maw.config.json > /tmp/c.json && \
            mv /tmp/c.json ~/.config/maw/maw.config.json
     → Restart: pm2 restart maw

  Run /federation-debug [node] for deep diagnosis
```

---

🤖 Federation Oracle 🗺️ — /federation-fleet v1.0
