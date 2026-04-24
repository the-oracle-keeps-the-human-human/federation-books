# /federation-doctor — Diagnose and Fix Federation Issues

> Auto-diagnose common federation problems and offer fixes.

## Usage

```
/federation-doctor              # Full diagnostic
/federation-doctor --fix        # Diagnose + auto-fix what's possible
/federation-doctor --quick      # Quick connectivity check only
```

## Action

Run all checks in order. Stop at the first failure and offer a fix.

### Check 1: maw installed?

```bash
MAW=$(which maw 2>/dev/null)
if [ -z "$MAW" ]; then
  echo "❌ maw not found"
  echo "Fix: bun install -g maw-js"
  # --fix mode: bun install -g maw-js
else
  echo "✅ maw: $MAW"
fi
```

### Check 2: Config exists?

```bash
CONFIG="${MAW_CONFIG:-$HOME/.config/maw/maw.config.json}"
if [ ! -f "$CONFIG" ]; then
  echo "❌ No config at $CONFIG"
  echo "Fix: mkdir -p ~/.config/maw && create maw.config.json"
else
  echo "✅ config: $CONFIG"
fi
```

### Check 3: Config valid?

```bash
# Check required fields
NODE=$(jq -r '.node // empty' "$CONFIG")
TOKEN=$(jq -r '.federationToken // empty' "$CONFIG")
PEERS=$(jq -r '.namedPeers | length' "$CONFIG")
HOST=$(jq -r '.host // "missing"' "$CONFIG")

[ -z "$NODE" ] && echo "❌ missing .node" && ISSUES+=("node")
[ -z "$TOKEN" ] && echo "❌ missing .federationToken" && ISSUES+=("token")
[ ${#TOKEN} -lt 16 ] 2>/dev/null && echo "⚠️ token too short (<16 chars)" && ISSUES+=("token-short")
[ "$PEERS" -eq 0 ] && echo "⚠️ no namedPeers configured" && ISSUES+=("no-peers")
[ "$HOST" = "local" ] || [ "$HOST" = "localhost" ] || [ "$HOST" = "127.0.0.1" ] && \
  echo "⚠️ host=$HOST — federation requires 0.0.0.0 to listen on all interfaces" && ISSUES+=("host-local")

echo "✅ node=$NODE, token=${#TOKEN} chars, peers=$PEERS, host=$HOST"
```

### Check 4: maw serve running?

```bash
PORT=$(jq -r '.port // 3456' "$CONFIG")
RESPONSE=$(curl -sf "http://localhost:$PORT/api/identity" 2>/dev/null)
if [ -z "$RESPONSE" ]; then
  echo "❌ maw serve not running on :$PORT"
  echo "Fix: maw serve &"
  echo "  or: pm2 start maw -- serve"
  # --fix mode: start maw serve in background
else
  SERVE_NODE=$(echo "$RESPONSE" | jq -r '.node')
  AGENTS=$(echo "$RESPONSE" | jq -r '.agents | length')
  echo "✅ maw serve: node=$SERVE_NODE, agents=$AGENTS on :$PORT"
fi
```

### Check 5: Peers reachable?

```bash
PEERS_JSON=$(jq -c '.namedPeers[]' "$CONFIG" 2>/dev/null)
REACHABLE=0
TOTAL=0

echo "$PEERS_JSON" | while read -r PEER; do
  NAME=$(echo "$PEER" | jq -r '.name')
  URL=$(echo "$PEER" | jq -r '.url')
  TOTAL=$((TOTAL + 1))

  RESPONSE=$(curl -sf --connect-timeout 5 "$URL/api/identity" 2>/dev/null)
  if [ -n "$RESPONSE" ]; then
    PEER_NODE=$(echo "$RESPONSE" | jq -r '.node')
    echo "  ✅ $NAME ($URL) — node=$PEER_NODE"
    REACHABLE=$((REACHABLE + 1))
  else
    echo "  ❌ $NAME ($URL) — unreachable"
    
    # Diagnose WHY
    # DNS?
    HOST_PART=$(echo "$URL" | sed 's|http://||' | cut -d: -f1)
    if ! ping -c 1 -W 2 "$HOST_PART" >/dev/null 2>&1; then
      echo "    → DNS/network: can't ping $HOST_PART"
      echo "    Fix: check VPN, WireGuard, or add to /etc/hosts"
    else
      # Port?
      PORT_PART=$(echo "$URL" | grep -oE ':[0-9]+' | tr -d ':')
      if ! nc -zw 2 "$HOST_PART" "$PORT_PART" 2>/dev/null; then
        echo "    → port $PORT_PART closed — maw serve not running on peer?"
        echo "    Fix: ssh to $HOST_PART and start maw serve"
      else
        echo "    → port open but API not responding — check peer maw version"
      fi
    fi
  fi
done

echo ""
echo "Peers: $REACHABLE/$TOTAL reachable"
```

### Check 6: Token match?

```bash
# For each reachable peer, try an authenticated request
PEERS_JSON=$(jq -c '.namedPeers[]' "$CONFIG" 2>/dev/null)
TOKEN=$(jq -r '.federationToken' "$CONFIG")

echo "$PEERS_JSON" | while read -r PEER; do
  URL=$(echo "$PEER" | jq -r '.url')
  NAME=$(echo "$PEER" | jq -r '.name')

  # Try sending a test (will fail with 403 if token mismatch)
  TIMESTAMP=$(date +%s)
  SIGN_STRING="POST:/api/send:$TIMESTAMP"
  
  if command -v openssl &>/dev/null; then
    SIG=$(echo -n "$SIGN_STRING" | openssl dgst -sha256 -hmac "$TOKEN" -hex 2>/dev/null | awk '{print $NF}')
  else
    continue
  fi

  HTTP_CODE=$(curl -sf -o /dev/null -w "%{http_code}" \
    -X POST "$URL/api/send" \
    -H "Content-Type: application/json" \
    -H "X-Maw-Signature: $SIG" \
    -H "X-Maw-Timestamp: $TIMESTAMP" \
    -d '{"target":"__doctor_test__","message":"ping"}' 2>/dev/null || echo "000")

  case "$HTTP_CODE" in
    200|404) echo "  ✅ $NAME — token matches (auth ok)" ;;
    403)     echo "  ❌ $NAME — 403 Forbidden (token mismatch!)" 
             echo "    Fix: ensure federationToken is identical on both nodes" ;;
    000)     echo "  ⚠️ $NAME — unreachable (skipped token check)" ;;
    *)       echo "  ⚠️ $NAME — HTTP $HTTP_CODE" ;;
  esac
done
```

### Check 7: Clock drift?

```bash
LOCAL_TIME=$(date +%s)
echo "Local clock: $(date '+%Y-%m-%d %H:%M:%S %Z') (epoch: $LOCAL_TIME)"

PEERS_JSON=$(jq -c '.namedPeers[]' "$CONFIG" 2>/dev/null)
echo "$PEERS_JSON" | while read -r PEER; do
  URL=$(echo "$PEER" | jq -r '.url')
  NAME=$(echo "$PEER" | jq -r '.name')
  
  PEER_IDENTITY=$(curl -sf --connect-timeout 3 "$URL/api/identity" 2>/dev/null)
  if [ -n "$PEER_IDENTITY" ]; then
    # Check response time as proxy for clock drift
    RESPONSE_TIME=$(curl -sf -o /dev/null -w "%{time_total}" "$URL/api/identity" 2>/dev/null)
    echo "  $NAME: response ${RESPONSE_TIME}s"
    
    # If we can SSH, check actual clock
    # ssh user@host "date +%s" → compare with local
  fi
done

echo ""
echo "HMAC window: ±300s (5 min). If clock drift > 300s, auth will fail."
echo "Fix: sudo ntpdate pool.ntp.org (or timedatectl set-ntp true)"
```

### Check 8: Federation books repo?

```bash
BOOKS_DIR=$(find ~/Code -path "*/federation-books" -type d 2>/dev/null | head -1)
if [ -z "$BOOKS_DIR" ]; then
  echo "⚠️ federation-books not cloned"
  echo "Fix: ghq get the-oracle-keeps-the-human-human/federation-books"
else
  BEHIND=$(cd "$BOOKS_DIR" && git fetch origin --quiet 2>/dev/null && git rev-list --count HEAD..origin/main 2>/dev/null || echo "?")
  echo "✅ federation-books: $BOOKS_DIR ($BEHIND commits behind)"
fi
```

---

## Output Format

```
🏥 Federation Doctor
━━━━━━━━━━━━━━━━━━━━

✅ maw: /usr/local/bin/maw
✅ config: ~/.config/maw/maw.config.json
✅ node=mba, token=32 chars, peers=3, host=0.0.0.0
✅ maw serve: node=mba, agents=3 on :3457
  ✅ white (http://white.wg:3456) — node=white
  ❌ clinic-nat (http://clinic.wg:3457) — unreachable
    → DNS/network: can't ping clinic.wg
  ✅ oracle-world (http://oracle-world.wg:3456) — node=oracle-world
Peers: 2/3 reachable
  ✅ white — token matches
  ✅ oracle-world — token matches
Local clock: 2026-04-24 09:30:00 ICT
✅ federation-books: ~/Code/.../federation-books (0 behind)

━━━━━━━━━━━━━━━━━━━━
Health: 7/8 checks passed
Issue: clinic-nat unreachable (VPN/WireGuard)
```

---

## --fix Mode

When `--fix` is passed, auto-fix issues where possible:

| Issue | Auto-fix |
|-------|----------|
| maw not installed | `bun install -g maw-js` |
| config missing | Generate minimal config |
| host=localhost | `jq '.host = "0.0.0.0"'` |
| token too short | Generate new 32-char token |
| maw serve not running | `maw serve &` |
| federation-books not cloned | `ghq get the-oracle-keeps-the-human-human/federation-books` |
| behind on federation-books | `git pull origin main` |

Issues that CANNOT be auto-fixed (need human):
- Peer unreachable (network/VPN issue)
- Token mismatch (need to coordinate with peer)
- Clock drift > 300s (need NTP setup)

---

🤖 Federation Oracle 🗺️ — /federation-doctor v1.0
