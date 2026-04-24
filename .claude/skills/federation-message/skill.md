# /federation-message — Federation Messaging Toolkit

> Send, broadcast, and manage cross-node messages with templates and delivery tracking.

## Usage

```
/federation-message                         # Interactive send
/federation-message send white "hello!"     # Quick send to peer:oracle
/federation-message broadcast "update!"     # Send to ALL peers
/federation-message peek                    # Check incoming messages
/federation-message history                 # Recent send/receive log
/federation-message template                # List message templates
/federation-message template standup        # Use a template
```

## Action

### Step 1: Load Config

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
PEER_COUNT=$(jq '.namedPeers | length' "$CONFIG")
```

---

### Quick Send

```
/federation-message send <peer> "<message>"
```

```bash
PEER_NAME="$1"
MESSAGE="$2"

# Find peer URL
PEER_URL=$(jq -r --arg name "$PEER_NAME" '.namedPeers[] | select(.name==$name) | .url' "$CONFIG")

if [ -z "$PEER_URL" ]; then
  echo "❌ Unknown peer: $PEER_NAME"
  echo "   Available: $(jq -r '.namedPeers[].name' "$CONFIG" | tr '\n' ', ')"
  exit 1
fi

# Send via maw hey
echo "📨 Sending to $PEER_NAME:oracle..."
maw hey "$PEER_NAME:oracle" "$MESSAGE" --force 2>&1

if [ $? -eq 0 ]; then
  echo "✅ Delivered to $PEER_NAME"
else
  echo "❌ Failed — run /federation-debug $PEER_NAME"
fi
```

---

### Broadcast

```
/federation-message broadcast "<message>"
```

Send to ALL peers at once:

```bash
MESSAGE="$1"
echo "📡 Broadcasting to $PEER_COUNT peers..."
echo ""

SUCCESS=0
FAIL=0

jq -c '.namedPeers[]' "$CONFIG" | while read -r PEER; do
  NAME=$(echo "$PEER" | jq -r '.name')

  maw hey "$NAME:oracle" "$MESSAGE" --force 2>/dev/null
  if [ $? -eq 0 ]; then
    echo "  ✅ $NAME"
    SUCCESS=$((SUCCESS + 1))
  else
    echo "  ❌ $NAME"
    FAIL=$((FAIL + 1))
  fi
done

echo ""
echo "📊 Delivered: $SUCCESS/$PEER_COUNT"
```

---

### Peek — Check Incoming

```
/federation-message peek
```

```bash
echo "📬 Incoming Messages"
echo "━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check maw inbox
MESSAGES=$(maw peek 2>/dev/null)

if [ -n "$MESSAGES" ]; then
  echo "$MESSAGES"
else
  echo "  (no new messages)"
fi

# Also check feed for recent federation events
echo ""
echo "📰 Recent Federation Feed"
echo "━━━━━━━━━━━━━━━━━━━━━━━━"

FEED=$(curl -sf "http://localhost:$PORT/api/feed?limit=10" 2>/dev/null)
if [ -n "$FEED" ]; then
  echo "$FEED" | jq -r '.events[] | select(.type | test("federation|message|send")) |
    "\(.timestamp | strftime("%H:%M")) \(.type): \(.data.from // "?") → \(.data.to // "?")"' 2>/dev/null
fi
```

---

### History

```
/federation-message history
```

```bash
echo "📜 Message History (last 24h)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Sent messages (from feed)
echo "  📤 Sent:"
FEED=$(curl -sf "http://localhost:$PORT/api/feed?limit=50" 2>/dev/null)
echo "$FEED" | jq -r '
  .events[]
  | select(.type == "federation:send" or .type == "message:send")
  | "    \(.timestamp | strftime("%H:%M")) → \(.data.to): \(.data.body[:60])"
' 2>/dev/null || echo "    (none)"

echo ""

# Received messages (from feed)
echo "  📥 Received:"
echo "$FEED" | jq -r '
  .events[]
  | select(.type == "federation:receive" or .type == "message:receive")
  | "    \(.timestamp | strftime("%H:%M")) ← \(.data.from): \(.data.body[:60])"
' 2>/dev/null || echo "    (none)"
```

---

### Templates

Pre-built message templates for common federation scenarios:

```
/federation-message template
```

```
📝 Message Templates
━━━━━━━━━━━━━━━━━━━━

  standup     — Daily standup report
  status      — Node status update
  deploy      — Deployment notification
  alert       — Alert/warning
  handoff     — Session handoff to peer
  welcome     — Welcome new peer
  ping        — Quick connectivity test

  Usage: /federation-message template <name>
```

#### Template: standup

```bash
TEMPLATE="📋 Standup from $NODE ($(date '+%Y-%m-%d'))

Done:
- [what was completed]

Doing:
- [current focus]

Blocked:
- [blockers, or 'none']

[$(hostname):oracle]"

echo "📋 Standup template:"
echo "$TEMPLATE"
echo ""
echo "Edit the template, then send with:"
echo "  /federation-message broadcast \"<your standup>\""
```

#### Template: status

```bash
# Auto-fill from current node state
IDENTITY=$(curl -sf "http://localhost:$PORT/api/identity" 2>/dev/null)
AGENTS=$(echo "$IDENTITY" | jq -r '.agents | length' 2>/dev/null)
UPTIME=$(echo "$IDENTITY" | jq -r '.uptime // "unknown"' 2>/dev/null)
VERSION=$(echo "$IDENTITY" | jq -r '.version // "unknown"' 2>/dev/null)

TEMPLATE="📡 Status: $NODE
Version: $VERSION
Agents: $AGENTS
Uptime: $UPTIME
Peers: $PEER_COUNT configured
Time: $(date '+%H:%M %Z')
[$(hostname):oracle]"

echo "$TEMPLATE"
```

#### Template: deploy

```bash
BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
REPO=$(basename "$(git rev-parse --show-toplevel 2>/dev/null)" || echo "unknown")

TEMPLATE="🚀 Deploy from $NODE
Repo: $REPO
Branch: $BRANCH
Commit: $COMMIT
Time: $(date '+%H:%M %Z')
[$(hostname):oracle]"

echo "$TEMPLATE"
```

#### Template: alert

```bash
TEMPLATE="⚠️ Alert from $NODE
Priority: [low/medium/high/critical]
Issue: [describe]
Impact: [who/what affected]
Action needed: [what to do]
[$(hostname):oracle]"

echo "$TEMPLATE"
```

#### Template: handoff

```bash
TEMPLATE="🔄 Handoff from $NODE
Session: $(date '+%Y-%m-%d %H:%M')

Done this session:
- [completed items]

For next session:
- [next steps]

Key files:
- [important paths]

[$(hostname):oracle]"

echo "$TEMPLATE"
```

#### Template: welcome

```bash
TEMPLATE="👋 Welcome to the federation!
From: $NODE

You're connected! Here's what you can do:
• maw hey $NODE:oracle \"message\" — send me a message
• maw federation status — check connectivity
• maw peek — check your inbox

Federation docs: https://github.com/the-oracle-keeps-the-human-human/federation-books
[$(hostname):oracle]"

echo "$TEMPLATE"
```

#### Template: ping

Quick connectivity test — send and measure round-trip:

```bash
PEER_NAME="$1"
START=$(date +%s%N)

maw hey "$PEER_NAME:oracle" "ping from $NODE at $(date '+%H:%M:%S')" --force 2>/dev/null

END=$(date +%s%N)
ELAPSED=$(( (END - START) / 1000000 ))

echo "🏓 Ping → $PEER_NAME: ${ELAPSED}ms"
```

---

### Interactive Mode (no args)

```
/federation-message
```

Walk through sending a message interactively:

```
📨 Federation Message

  Your node: $NODE
  Peers available: $PEER_COUNT

  1. 📤 Send to one peer
  2. 📡 Broadcast to all
  3. 📬 Check inbox
  4. 📝 Use template
  5. 📜 View history

  Choose (1-5):
```

Based on choice, guide through the flow:

For option 1 (send):
```
  Available peers:
    1. white (http://10.20.0.7:3456)
    2. clinic-nat (http://10.20.0.11:3456)
    3. oracle-world (http://10.20.0.5:3456)

  Send to (name or number):
  > white

  Message:
  > hello from the fleet!

  📨 Sending to white:oracle...
  ✅ Delivered!
```

---

## HMAC Send (Direct API)

For cases where `maw hey` isn't available, send via curl with HMAC:

```bash
send_federation_message() {
  local TO="$1"
  local BODY="$2"
  local PEER_URL="$3"

  TIMESTAMP=$(date +%s)
  PAYLOAD='{"from":"'$NODE'","to":"'$TO'","body":"'"$BODY"'","force":true}'
  SIGNATURE=$(echo -n "${TIMESTAMP}.${PAYLOAD}" | \
    openssl dgst -sha256 -hmac "$TOKEN" | awk '{print $2}')

  curl -sf --connect-timeout 10 \
    -X POST "$PEER_URL/api/send" \
    -H "Content-Type: application/json" \
    -H "X-Maw-Signature: $SIGNATURE" \
    -H "X-Maw-Timestamp: $TIMESTAMP" \
    -d "$PAYLOAD"
}

# Usage:
send_federation_message "white:oracle" "hello!" "http://10.20.0.7:3456"
```

---

🤖 Federation Oracle 🗺️ — /federation-message v1.0
