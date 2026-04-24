# /federation-setup — Interactive Federation Setup Wizard

> Walk through setting up federation step by step with validation at each stage.

## Usage

```
/federation-setup              # Full interactive wizard
/federation-setup --check      # Verify existing setup
/federation-setup --add-peer   # Add a new peer to existing config
```

## Action

Guide the user through federation setup. Validate each step before moving on.

---

### Step 1: Prerequisites Check

```bash
echo "🔍 Checking prerequisites..."

# bun
BUN=$(which bun 2>/dev/null)
if [ -z "$BUN" ]; then
  echo "❌ bun not found"
  echo "Install: curl -fsSL https://bun.sh/install | bash"
  exit 1
fi
echo "✅ bun: $(bun --version)"

# maw
MAW=$(which maw 2>/dev/null)
if [ -z "$MAW" ]; then
  echo "📦 Installing maw..."
  bun install -g maw-js
  MAW=$(which maw 2>/dev/null)
fi
echo "✅ maw: $MAW"

# jq (for config editing)
JQ=$(which jq 2>/dev/null)
if [ -z "$JQ" ]; then
  echo "⚠️ jq not found (optional but recommended)"
  echo "Install: brew install jq (macOS) or apt install jq (Linux)"
fi

# network
echo ""
echo "🌐 Network check:"
echo "  Hostname: $(hostname)"
echo "  Local IPs: $(ifconfig 2>/dev/null | grep 'inet ' | grep -v 127.0.0.1 | awk '{print $2}' | tr '\n' ', ')"
```

Display result and ask user to confirm before proceeding.

---

### Step 2: Choose Node Name

Ask the user for their node name. Validate:

```bash
# Node name rules:
# - lowercase alphanumeric + hyphens only
# - no spaces, no special chars
# - 2-20 characters
# - unique across the federation

echo "📛 What should this node be called?"
echo "   Examples: mba, white, homelab, pi-node"
echo "   Rules: lowercase, no spaces, 2-20 chars"
```

Store as `$NODE_NAME`.

---

### Step 3: Choose Port

```bash
DEFAULT_PORT=3456

echo "🔌 Federation port?"
echo "   Default: $DEFAULT_PORT (recommended)"
echo "   Common alternatives: 3457, 8456, 9456"

# Check if default port is available
if lsof -i :$DEFAULT_PORT >/dev/null 2>&1; then
  EXISTING=$(lsof -i :$DEFAULT_PORT | tail -1 | awk '{print $1}')
  echo "   ⚠️ Port $DEFAULT_PORT in use by: $EXISTING"
  echo "   Try: 3457, 3458, or another free port"
fi
```

Store as `$PORT`.

---

### Step 4: Generate Federation Token

```bash
# Generate a secure 32-character token
TOKEN=$(openssl rand -hex 16)
echo "🔑 Generated federation token: $TOKEN"
echo ""
echo "   ⚠️ IMPORTANT: All nodes in your federation must use the SAME token."
echo "   Save this token — you'll need it for every peer."
echo ""
echo "   Or paste an existing token if joining an existing federation:"
```

Store as `$TOKEN`.

---

### Step 5: Add Peers

```bash
echo "👥 Add your first peer"
echo ""
echo "   A peer is another machine running maw serve."
echo ""
echo "   You need:"
echo "     • Peer's name (e.g., 'white')"
echo "     • Peer's URL (e.g., 'http://192.168.1.100:3456')"
echo ""
echo "   Common URL patterns:"
echo "     • LAN:       http://192.168.x.x:3456"
echo "     • WireGuard: http://10.20.0.x:3456"
echo "     • Tailscale: http://hostname:3456"
echo "     • Tunnel:    https://your-tunnel.example.com"
```

Collect peer name + URL pairs. Validate each:

```bash
PEER_URL="$1"
echo "Testing $PEER_URL..."

# Can we reach it?
RESPONSE=$(curl -sf --connect-timeout 5 "$PEER_URL/api/identity" 2>/dev/null)
if [ -n "$RESPONSE" ]; then
  PEER_NODE=$(echo "$RESPONSE" | jq -r '.node')
  echo "✅ Reachable! Node: $PEER_NODE"
else
  echo "⚠️ Can't reach $PEER_URL yet"
  echo "   This is OK if the peer isn't running yet."
  echo "   You can add it now and test later."
fi
```

---

### Step 6: Write Config

```bash
CONFIG_DIR="$HOME/.config/maw"
CONFIG_FILE="$CONFIG_DIR/maw.config.json"

mkdir -p "$CONFIG_DIR"

# Build peers JSON
PEERS_JSON="["
for i in "${!PEER_NAMES[@]}"; do
  [ $i -gt 0 ] && PEERS_JSON+=","
  PEERS_JSON+="{\"name\":\"${PEER_NAMES[$i]}\",\"url\":\"${PEER_URLS[$i]}\"}"
done
PEERS_JSON+="]"

# Write config
cat > "$CONFIG_FILE" << CONF
{
  "node": "$NODE_NAME",
  "host": "0.0.0.0",
  "port": $PORT,
  "federationToken": "$TOKEN",
  "namedPeers": $PEERS_JSON
}
CONF

echo "✅ Config written to: $CONFIG_FILE"
echo ""
cat "$CONFIG_FILE" | jq .
```

---

### Step 7: Start Serving

```bash
echo "🚀 Starting maw serve..."
echo ""
echo "   Option A (foreground — see logs):"
echo "     maw serve"
echo ""
echo "   Option B (background — runs silently):"
echo "     maw serve &"
echo ""
echo "   Option C (pm2 — auto-restart):"
echo "     pm2 start maw -- serve"
echo "     pm2 save"
```

Start and verify:

```bash
maw serve &
sleep 2

IDENTITY=$(curl -sf "http://localhost:$PORT/api/identity")
if [ -n "$IDENTITY" ]; then
  echo "✅ maw serve running!"
  echo "$IDENTITY" | jq '{node, agents: (.agents | length), port: .port}'
else
  echo "❌ maw serve failed to start"
  echo "   Check: lsof -i :$PORT"
  echo "   Check: maw serve (foreground for error output)"
fi
```

---

### Step 8: Send First Message

```bash
FIRST_PEER="${PEER_NAMES[0]}"
echo "📨 Sending first federation message..."
echo ""
echo "   maw hey $FIRST_PEER:oracle \"hello from $NODE_NAME!\""

# Try it
maw hey "$FIRST_PEER:oracle" "hello from $NODE_NAME! federation setup complete" --force 2>&1
```

---

### Step 9: Verify Roundtrip

```bash
echo "🔄 Verifying roundtrip..."
echo ""
echo "   Ask your peer to run:"
echo "     maw hey $NODE_NAME:oracle \"hello back!\""
echo ""
echo "   Then check for incoming messages:"
echo "     maw peek"
echo ""
echo "   Or check federation status:"
echo "     maw federation status"
```

---

## Output Format

```
🏗️ Federation Setup Wizard
━━━━━━━━━━━━━━━━━━━━━━━━━━

Step 1/9: Prerequisites ✅
  bun: 1.1.38
  maw: /usr/local/bin/maw

Step 2/9: Node Name ✅
  node: my-node

Step 3/9: Port ✅
  port: 3456 (available)

Step 4/9: Token ✅
  token: a1b2c3... (32 chars)

Step 5/9: Peers ✅
  white (http://10.20.0.7:3456) — reachable ✅

Step 6/9: Config ✅
  ~/.config/maw/maw.config.json written

Step 7/9: Serve ✅
  maw serve running on :3456

Step 8/9: First Message ✅
  sent to white:oracle

Step 9/9: Roundtrip
  ⏳ waiting for reply from peer...

━━━━━━━━━━━━━━━━━━━━━━━━━━
Setup complete! 🎉

Next steps:
  • Add more peers: /federation-setup --add-peer
  • Check health:    /federation-doctor
  • Send messages:   maw hey peer:agent "message"
  • Auto-start:      pm2 start maw -- serve && pm2 save
```

---

## --check Mode

Runs a lighter version — just validates existing setup without creating anything:

```bash
CONFIG="${MAW_CONFIG:-$HOME/.config/maw/maw.config.json}"

if [ ! -f "$CONFIG" ]; then
  echo "❌ No config found. Run /federation-setup to create one."
  exit 1
fi

echo "📋 Current Setup:"
jq '{node, host, port, token_length: (.federationToken | length), peers: [.namedPeers[].name]}' "$CONFIG"

# Test serve
PORT=$(jq -r '.port // 3456' "$CONFIG")
curl -sf "http://localhost:$PORT/api/identity" | jq . || echo "❌ maw serve not running"

# Test peers
jq -c '.namedPeers[]' "$CONFIG" | while read -r PEER; do
  NAME=$(echo "$PEER" | jq -r '.name')
  URL=$(echo "$PEER" | jq -r '.url')
  if curl -sf --connect-timeout 3 "$URL/api/identity" >/dev/null 2>&1; then
    echo "  ✅ $NAME"
  else
    echo "  ❌ $NAME"
  fi
done
```

---

## --add-peer Mode

Add a new peer to existing config:

```bash
CONFIG="${MAW_CONFIG:-$HOME/.config/maw/maw.config.json}"

echo "➕ Add new peer"
echo "   Peer name:"
# read PEER_NAME
echo "   Peer URL (e.g., http://192.168.1.100:3456):"
# read PEER_URL

# Validate
RESPONSE=$(curl -sf --connect-timeout 5 "$PEER_URL/api/identity" 2>/dev/null)
if [ -n "$RESPONSE" ]; then
  echo "✅ Reachable: $(echo "$RESPONSE" | jq -r '.node')"
fi

# Add to config
jq --arg name "$PEER_NAME" --arg url "$PEER_URL" \
  '.namedPeers += [{"name": $name, "url": $url}]' \
  "$CONFIG" > /tmp/maw-config.tmp && mv /tmp/maw-config.tmp "$CONFIG"

echo "✅ Added $PEER_NAME to config"
echo "   Restart maw serve to pick up new peer"
```

---

## Peer Setup Instructions

After completing your own setup, give the peer these instructions:

```
📬 Federation Invite

Join my federation:

1. Install: bun install -g maw-js
2. Create config:
   mkdir -p ~/.config/maw
   cat > ~/.config/maw/maw.config.json << 'EOF'
   {
     "node": "YOUR-NODE-NAME",
     "host": "0.0.0.0",
     "port": 3456,
     "federationToken": "SHARED_TOKEN",
     "namedPeers": [
       {"name": "MY-NODE", "url": "http://MY-IP:MY-PORT"}
     ]
   }
   EOF
3. Start: maw serve
4. Test: maw hey MY-NODE:oracle "hello!"
```

Generate this invite with the actual values filled in so the user can share it.

---

🤖 Federation Oracle 🗺️ — /federation-setup v1.0
