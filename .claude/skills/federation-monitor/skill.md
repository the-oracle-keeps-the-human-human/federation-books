# /federation-monitor — Real-Time Federation Health Monitor

> Watch your federation continuously — get alerts when nodes drop, recover, or drift.

## Usage

```
/federation-monitor                 # Start monitoring (checks every 30s)
/federation-monitor --once          # Single health snapshot
/federation-monitor --interval 60   # Custom interval in seconds
/federation-monitor --alert         # Only show state changes (quiet mode)
/federation-monitor --log           # Write results to log file
```

## Action

### Step 1: Setup

```bash
CONFIG="${MAW_CONFIG:-$HOME/.config/maw/maw.config.json}"
if [ ! -f "$CONFIG" ]; then
  echo "❌ No maw config. Run /federation-setup first."
  exit 1
fi

NODE=$(jq -r '.node' "$CONFIG")
PORT=$(jq -r '.port // 3456' "$CONFIG")
TOKEN=$(jq -r '.federationToken' "$CONFIG")
INTERVAL="${1:-30}"
LOG_FILE="$HOME/.config/maw/federation-monitor.log"

echo "👁️ Federation Monitor — $NODE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Interval: ${INTERVAL}s"
echo "  Peers: $(jq '.namedPeers | length' "$CONFIG")"
echo "  Log: $LOG_FILE"
echo ""
```

---

### Step 2: Health Check Function

```bash
check_peer() {
  local NAME="$1"
  local URL="$2"
  local START=$(date +%s%N)

  # Try /api/identity with timeout
  RESPONSE=$(curl -sf --connect-timeout 5 --max-time 10 \
    -w "\n%{http_code}\n%{time_total}" \
    "$URL/api/identity" 2>/dev/null)

  local END=$(date +%s%N)
  local LATENCY=$(( (END - START) / 1000000 ))

  HTTP_CODE=$(echo "$RESPONSE" | tail -2 | head -1)
  CURL_TIME=$(echo "$RESPONSE" | tail -1)
  BODY=$(echo "$RESPONSE" | sed -n '1p')

  if [ "$HTTP_CODE" = "200" ]; then
    PEER_NODE=$(echo "$BODY" | jq -r '.node' 2>/dev/null)
    PEER_VERSION=$(echo "$BODY" | jq -r '.version // "?"' 2>/dev/null)
    PEER_AGENTS=$(echo "$BODY" | jq -r '.agents | length' 2>/dev/null)
    echo "UP|$NAME|${LATENCY}ms|v$PEER_VERSION|${PEER_AGENTS}agents"
  else
    echo "DOWN|$NAME|${LATENCY}ms|HTTP$HTTP_CODE|"
  fi
}

check_local() {
  RESPONSE=$(curl -sf --connect-timeout 3 "http://localhost:$PORT/api/identity" 2>/dev/null)
  if [ -n "$RESPONSE" ]; then
    AGENTS=$(echo "$RESPONSE" | jq -r '.agents | length' 2>/dev/null)
    echo "UP|$NODE|local|$(echo "$RESPONSE" | jq -r '.version // "?"')|${AGENTS}agents"
  else
    echo "DOWN|$NODE|local|not-running|"
  fi
}
```

---

### Step 3: Monitor Loop

```bash
# Track previous state for change detection
declare -A PREV_STATE

monitor_tick() {
  local TIMESTAMP=$(date '+%H:%M:%S')
  local CHANGES=0

  # Check local
  LOCAL=$(check_local)
  LOCAL_STATUS=$(echo "$LOCAL" | cut -d'|' -f1)

  # Check all peers
  RESULTS=""
  jq -c '.namedPeers[]' "$CONFIG" | while read -r PEER; do
    NAME=$(echo "$PEER" | jq -r '.name')
    URL=$(echo "$PEER" | jq -r '.url')
    RESULT=$(check_peer "$NAME" "$URL")
    STATUS=$(echo "$RESULT" | cut -d'|' -f1)
    LATENCY=$(echo "$RESULT" | cut -d'|' -f3)

    # Detect state change
    if [ "${PREV_STATE[$NAME]}" != "$STATUS" ] && [ -n "${PREV_STATE[$NAME]}" ]; then
      CHANGES=$((CHANGES + 1))
      if [ "$STATUS" = "UP" ]; then
        echo "  🟢 $TIMESTAMP $NAME RECOVERED (was ${PREV_STATE[$NAME]})"
      else
        echo "  🔴 $TIMESTAMP $NAME DROPPED (was ${PREV_STATE[$NAME]})"
      fi
    fi

    PREV_STATE[$NAME]="$STATUS"

    # Display
    if [ "$STATUS" = "UP" ]; then
      echo "  ● $NAME  $LATENCY"
    else
      echo "  · $NAME  unreachable"
    fi
  done

  # Summary line
  UP_COUNT=$(echo "$ALL_RESULTS" | grep -c "^UP" || true)
  TOTAL=$(jq '.namedPeers | length' "$CONFIG")
  echo "  [$TIMESTAMP] $UP_COUNT/$TOTAL peers up"
}
```

---

### Step 4: Display Formats

#### Default — Rolling Status

```
👁️ Federation Monitor — mba
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  [10:30:15] ● white    23ms  ● clinic   45ms  · oracle   —
             2/3 peers up

  [10:30:45] ● white    21ms  ● clinic   43ms  · oracle   —
             2/3 peers up

  🟢 10:31:15 oracle-world RECOVERED (was DOWN)
  [10:31:15] ● white    22ms  ● clinic   44ms  ● oracle  120ms
             3/3 peers up ✅

  🔴 10:35:45 clinic-nat DROPPED (was UP)
  [10:35:45] ● white    25ms  · clinic   —     ● oracle  118ms
             2/3 peers up ⚠️
```

#### --once — Single Snapshot

```
👁️ Federation Snapshot — mba @ 10:30:15
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  ● mba (local)        — v2.0.0-alpha.14  5 agents
  ● white              23ms  v2.0.0-alpha.14  4 agents
  ● clinic-nat         45ms  v2.0.0-alpha.12  3 agents
  · oracle-world       —     unreachable

  Status: 3/4 nodes up (75%)
```

#### --alert — Quiet Mode (only state changes)

```
👁️ Monitoring... (alerts only)

  🔴 10:35:45 clinic-nat DROPPED
  🟢 10:42:15 clinic-nat RECOVERED (down 6m 30s)
  🔴 11:05:00 oracle-world DROPPED
```

---

### Step 5: Logging (--log mode)

```bash
log_entry() {
  local TIMESTAMP=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
  local STATUS="$1"
  local PEER="$2"
  local LATENCY="$3"
  local DETAILS="$4"

  echo "{\"ts\":\"$TIMESTAMP\",\"peer\":\"$PEER\",\"status\":\"$STATUS\",\"latency\":\"$LATENCY\",\"details\":\"$DETAILS\"}" >> "$LOG_FILE"
}

# Read log for recent history
show_log() {
  echo "📊 Monitor Log (last 50 entries)"
  echo ""
  tail -50 "$LOG_FILE" | jq -r '"\(.ts) \(.status) \(.peer) \(.latency)"' 2>/dev/null
}
```

Log format (JSONL):

```json
{"ts":"2026-04-24T04:30:15Z","peer":"white","status":"UP","latency":"23ms","details":"v2.0.0-alpha.14 4agents"}
{"ts":"2026-04-24T04:30:15Z","peer":"clinic-nat","status":"UP","latency":"45ms","details":"v2.0.0-alpha.12 3agents"}
{"ts":"2026-04-24T04:30:15Z","peer":"oracle-world","status":"DOWN","latency":"—","details":"timeout"}
```

---

### Step 6: Uptime Report

After monitoring for a while, generate an uptime report:

```
📊 Uptime Report (last 1 hour)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  white:         100% ████████████████████ (0 drops)
  clinic-nat:     92% ██████████████████·· (1 drop, 6m 30s)
  oracle-world:   45% █████████··········· (3 drops, 33m total)

  Fleet uptime: 79%
  Checks: 120
  Alerts: 4
```

---

## Latency Tracking

Track latency trends per peer:

```
📈 Latency Trends (last 30 min)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  white:        avg 23ms  min 18ms  max 45ms  ▁▂▁▁▃▁▁▂▁
  clinic-nat:   avg 44ms  min 35ms  max 120ms ▂▃▂▂█▃▂▃▂
  oracle-world: avg 115ms min 95ms  max 250ms ▅▆▅▅█▆▅▆▅

  ⚠️ clinic-nat spike at 10:33 (120ms, 3x avg)
```

---

## Integration with Other Skills

```
# Monitor → Debug (when node drops)
/federation-debug clinic-nat

# Monitor → Fleet (periodic dashboard)
/federation-fleet --health

# Monitor → Message (alert broadcast)
/federation-message broadcast "⚠️ oracle-world down since 10:35"
```

---

🤖 Federation Oracle 🗺️ — /federation-monitor v1.0
