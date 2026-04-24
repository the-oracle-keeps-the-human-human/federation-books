# /federation-debug — Active Federation Network Debugger

> Diagnose exactly WHY a peer is unreachable — trace the path from DNS to maw response.

## Usage

```
/federation-debug                    # Debug all peers
/federation-debug white              # Debug specific peer
/federation-debug --trace white      # Full packet trace to peer
/federation-debug --hmac             # Test HMAC auth chain
/federation-debug --ports            # Port scan all peer addresses
```

## Action

### Step 1: Load Config + Identify Targets

```bash
CONFIG="${MAW_CONFIG:-$HOME/.config/maw/maw.config.json}"
if [ ! -f "$CONFIG" ]; then
  echo "❌ No maw config. Run /federation-setup first."
  exit 1
fi

NODE=$(jq -r '.node' "$CONFIG")
PORT=$(jq -r '.port // 3456' "$CONFIG")
TOKEN=$(jq -r '.federationToken' "$CONFIG")
PEERS=$(jq -c '.namedPeers[]' "$CONFIG")

echo "🔍 Federation Debug — $NODE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
```

If a specific peer name was given, filter to just that peer.

---

### Step 2: Local Health

Before debugging remotes, verify local node is healthy:

```bash
echo "📡 Local Node: $NODE"
echo ""

# Is maw serve running?
MAW_PID=$(lsof -ti :$PORT 2>/dev/null)
if [ -z "$MAW_PID" ]; then
  echo "  ❌ maw serve NOT running on :$PORT"
  echo "     Fix: maw serve &"
  echo ""
else
  echo "  ✅ maw serve running (PID $MAW_PID)"
fi

# Can we reach our own identity endpoint?
SELF=$(curl -sf --connect-timeout 3 "http://localhost:$PORT/api/identity" 2>/dev/null)
if [ -n "$SELF" ]; then
  SELF_NODE=$(echo "$SELF" | jq -r '.node')
  SELF_AGENTS=$(echo "$SELF" | jq -r '.agents | length')
  echo "  ✅ /api/identity → node=$SELF_NODE, agents=$SELF_AGENTS"
else
  echo "  ❌ /api/identity unreachable"
  echo "     Check: is host bound to 0.0.0.0 or 127.0.0.1?"
  jq -r '.host' "$CONFIG" | xargs -I{} echo "     Config host: {}"
fi

# Check bind address
HOST_BIND=$(jq -r '.host // "0.0.0.0"' "$CONFIG")
if [ "$HOST_BIND" = "127.0.0.1" ] || [ "$HOST_BIND" = "localhost" ]; then
  echo "  ⚠️ host=$HOST_BIND — only reachable from localhost!"
  echo "     Fix: set host to 0.0.0.0 in config"
fi

echo ""
```

---

### Step 3: Per-Peer Deep Diagnosis

For each peer, run a layered diagnosis:

```bash
echo "$PEERS" | while read -r PEER; do
  NAME=$(echo "$PEER" | jq -r '.name')
  URL=$(echo "$PEER" | jq -r '.url')

  # Parse URL components
  PROTO=$(echo "$URL" | grep -oE '^https?')
  HOST_PART=$(echo "$URL" | sed -E 's|https?://||; s|:[0-9]+.*||; s|/.*||')
  PORT_PART=$(echo "$URL" | grep -oE ':[0-9]+' | tr -d ':')
  [ -z "$PORT_PART" ] && PORT_PART=3456

  echo "━━━ Peer: $NAME ($URL) ━━━"
  echo ""

  # Layer 1: DNS Resolution
  echo "  1️⃣ DNS Resolution"
  if echo "$HOST_PART" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$'; then
    echo "     IP address (no DNS needed): $HOST_PART"
  else
    RESOLVED=$(dig +short "$HOST_PART" 2>/dev/null | head -1)
    if [ -n "$RESOLVED" ]; then
      echo "     ✅ $HOST_PART → $RESOLVED"
    else
      echo "     ❌ Cannot resolve $HOST_PART"
      echo "     Try: dig $HOST_PART"
      echo "     If Tailscale: tailscale status | grep $HOST_PART"
    fi
  fi

  # Layer 2: ICMP Ping
  echo "  2️⃣ Ping"
  if ping -c 1 -W 2 "$HOST_PART" >/dev/null 2>&1; then
    RTT=$(ping -c 3 -W 2 "$HOST_PART" 2>/dev/null | tail -1 | awk -F'/' '{print $5}')
    echo "     ✅ Reachable (avg ${RTT}ms)"
  else
    echo "     ❌ Ping failed"
    echo "     Could be: firewall blocking ICMP, host down, wrong IP"
  fi

  # Layer 3: TCP Port
  echo "  3️⃣ TCP Port $PORT_PART"
  if nc -z -w 3 "$HOST_PART" "$PORT_PART" 2>/dev/null; then
    echo "     ✅ Port $PORT_PART open"
  else
    echo "     ❌ Port $PORT_PART closed/filtered"
    echo "     Check on peer: lsof -i :$PORT_PART"
    echo "     Firewall: sudo ufw allow $PORT_PART/tcp"
    echo "     macOS: System Settings → Firewall → allow maw"
  fi

  # Layer 4: HTTP Response
  echo "  4️⃣ HTTP /api/identity"
  RESPONSE=$(curl -sf --connect-timeout 5 -w "\n%{http_code}" "$URL/api/identity" 2>/dev/null)
  HTTP_CODE=$(echo "$RESPONSE" | tail -1)
  BODY=$(echo "$RESPONSE" | sed '$d')

  if [ "$HTTP_CODE" = "200" ]; then
    PEER_NODE=$(echo "$BODY" | jq -r '.node' 2>/dev/null)
    PEER_AGENTS=$(echo "$BODY" | jq -r '.agents | length' 2>/dev/null)
    echo "     ✅ node=$PEER_NODE, agents=$PEER_AGENTS"
  elif [ -n "$HTTP_CODE" ] && [ "$HTTP_CODE" != "000" ]; then
    echo "     ⚠️ HTTP $HTTP_CODE (maw running but unexpected response)"
  else
    echo "     ❌ No HTTP response"
    echo "     maw serve may not be running on peer"
  fi

  # Layer 5: HMAC Auth Test
  echo "  5️⃣ HMAC Auth"
  TIMESTAMP=$(date +%s)
  TEST_BODY='{"from":"'$NODE'","to":"'$NAME':oracle","body":"debug-ping","force":true}'
  SIGNATURE=$(echo -n "${TIMESTAMP}.${TEST_BODY}" | openssl dgst -sha256 -hmac "$TOKEN" | awk '{print $2}')

  AUTH_RESPONSE=$(curl -sf --connect-timeout 5 -w "\n%{http_code}" \
    -X POST "$URL/api/send" \
    -H "Content-Type: application/json" \
    -H "X-Maw-Signature: $SIGNATURE" \
    -H "X-Maw-Timestamp: $TIMESTAMP" \
    -d "$TEST_BODY" 2>/dev/null)
  AUTH_CODE=$(echo "$AUTH_RESPONSE" | tail -1)

  if [ "$AUTH_CODE" = "200" ] || [ "$AUTH_CODE" = "201" ]; then
    echo "     ✅ HMAC accepted — message delivered"
  elif [ "$AUTH_CODE" = "403" ]; then
    echo "     ❌ 403 Forbidden — token mismatch!"
    echo "     Your token: ${TOKEN:0:8}..."
    echo "     Peer must use the SAME federationToken"
  elif [ "$AUTH_CODE" = "401" ]; then
    echo "     ❌ 401 Unauthorized — signature invalid"
    echo "     Check: clock drift? (±300s allowed)"
    echo "     Your time: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
  else
    echo "     ⚠️ HTTP $AUTH_CODE (or no response)"
  fi

  # Layer 6: Federation Status
  echo "  6️⃣ Federation Status"
  FED_STATUS=$(curl -sf --connect-timeout 5 "$URL/api/federation/status" 2>/dev/null)
  if [ -n "$FED_STATUS" ]; then
    THEIR_PEERS=$(echo "$FED_STATUS" | jq -r '.peers | length' 2>/dev/null)
    SEES_US=$(echo "$FED_STATUS" | jq -r ".peers[] | select(.name==\"$NODE\") | .reachable" 2>/dev/null)
    echo "     Peer has $THEIR_PEERS peers configured"
    if [ "$SEES_US" = "true" ]; then
      echo "     ✅ Peer can see US back"
    elif [ -n "$SEES_US" ]; then
      echo "     ❌ Peer has us but we're UNREACHABLE to them"
      echo "     Check: our firewall, our IP in their config"
    else
      echo "     ⚠️ Peer doesn't have us in their namedPeers"
      echo "     They need to add: {\"name\":\"$NODE\",\"url\":\"http://OUR_IP:$PORT\"}"
    fi
  fi

  echo ""
done
```

---

### Step 4: Network Topology Summary

```
🗺️ Federation Debug Summary
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  $NODE (local)
    ├─ $PEER1: [✅ all layers pass / ❌ fails at layer N]
    ├─ $PEER2: [✅ / ❌]
    └─ $PEER3: [✅ / ❌]

  Legend:
    1=DNS  2=Ping  3=TCP  4=HTTP  5=HMAC  6=Federation

  Failing at layer:
    1 → Wrong hostname or DNS not configured
    2 → Host unreachable (firewall, VPN, wrong network)
    3 → Port blocked (firewall) or maw not running
    4 → maw serve not running or wrong port
    5 → Token mismatch or clock drift
    6 → Peer doesn't have us in their config
```

---

## --trace Mode

Full packet trace to a specific peer:

```bash
PEER_HOST="$1"
echo "🔬 Trace to $PEER_HOST"
echo ""

# traceroute (shows network hops)
echo "Route:"
traceroute -m 15 -w 2 "$PEER_HOST" 2>/dev/null || echo "  traceroute not available"

echo ""

# curl verbose (shows TLS, headers, timing)
echo "HTTP Trace:"
curl -v --connect-timeout 10 "http://$PEER_HOST:$PORT/api/identity" 2>&1 | \
  grep -E '(Trying|Connected|< HTTP|< content|< x-maw|Closing|Could not)'
```

---

## --hmac Mode

Test HMAC authentication in detail:

```bash
echo "🔐 HMAC Auth Chain Test"
echo ""

TIMESTAMP=$(date +%s)
echo "  Timestamp: $TIMESTAMP ($(date -u '+%Y-%m-%d %H:%M:%S UTC'))"
echo "  Token: ${TOKEN:0:8}... (${#TOKEN} chars)"
echo ""

# Show signature computation
TEST_BODY='{"from":"'$NODE'","to":"test:oracle","body":"hmac-test"}'
echo "  Payload: $TEST_BODY"
echo "  Sign input: ${TIMESTAMP}.{payload}"

SIGNATURE=$(echo -n "${TIMESTAMP}.${TEST_BODY}" | openssl dgst -sha256 -hmac "$TOKEN" | awk '{print $2}')
echo "  Signature: ${SIGNATURE:0:16}..."
echo ""

# Test against each peer
echo "$PEERS" | while read -r PEER; do
  NAME=$(echo "$PEER" | jq -r '.name')
  URL=$(echo "$PEER" | jq -r '.url')

  RESULT=$(curl -sf --connect-timeout 5 -w "%{http_code}" \
    -X POST "$URL/api/send" \
    -H "Content-Type: application/json" \
    -H "X-Maw-Signature: $SIGNATURE" \
    -H "X-Maw-Timestamp: $TIMESTAMP" \
    -d '{"from":"'$NODE'","to":"'$NAME':oracle","body":"hmac-test","force":true}' 2>/dev/null)

  CODE=$(echo "$RESULT" | tail -c 4)
  case "$CODE" in
    200|201) echo "  ✅ $NAME — accepted" ;;
    403)     echo "  ❌ $NAME — 403 token mismatch" ;;
    401)     echo "  ❌ $NAME — 401 bad signature" ;;
    *)       echo "  ⚠️ $NAME — HTTP $CODE" ;;
  esac
done
```

---

## --ports Mode

Scan common federation ports on all peers:

```bash
SCAN_PORTS="3456 3457 3458 8456 9456 80 443 8080"

echo "🔌 Port Scan"
echo ""

echo "$PEERS" | while read -r PEER; do
  NAME=$(echo "$PEER" | jq -r '.name')
  URL=$(echo "$PEER" | jq -r '.url')
  HOST_PART=$(echo "$URL" | sed -E 's|https?://||; s|:[0-9]+.*||; s|/.*||')

  echo "  $NAME ($HOST_PART):"
  for P in $SCAN_PORTS; do
    if nc -z -w 2 "$HOST_PART" "$P" 2>/dev/null; then
      # Try to identify what's on the port
      IDENT=$(curl -sf --connect-timeout 2 "http://$HOST_PART:$P/api/identity" 2>/dev/null)
      if [ -n "$IDENT" ]; then
        ID_NODE=$(echo "$IDENT" | jq -r '.node' 2>/dev/null)
        echo "    ✅ :$P — maw ($ID_NODE)"
      else
        echo "    ✅ :$P — open (not maw)"
      fi
    else
      echo "    · :$P — closed"
    fi
  done
  echo ""
done
```

---

## Common Diagnoses

| Symptom | Layer | Likely Cause | Fix |
|---------|-------|-------------|-----|
| "connection refused" | 3 | maw not running or wrong port | `maw serve &` |
| "connection timed out" | 2-3 | Firewall or wrong IP | Check IP, open port |
| "403 Forbidden" | 5 | Token mismatch | Same `federationToken` everywhere |
| "401 Unauthorized" | 5 | Clock drift >5 min | `ntpdate pool.ntp.org` |
| Can ping, can't curl | 3-4 | Port blocked by firewall | `ufw allow 3456/tcp` |
| Peer sees us unreachable | 6 | Our IP wrong in their config | Update their `namedPeers` |
| One direction works | 6 | Missing reverse peer entry | Add peer on both sides |
| "host=127.0.0.1" | 4 | Bound to localhost only | Set host to `0.0.0.0` |

---

🤖 Federation Oracle 🗺️ — /federation-debug v1.0
