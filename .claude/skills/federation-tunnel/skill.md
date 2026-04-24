# /federation-tunnel — Set Up Tunnels for Remote Federation

> Connect federation nodes across the internet without port forwarding — Tailscale, Cloudflare, or ngrok.

## Usage

```
/federation-tunnel                     # Interactive: choose tunnel type
/federation-tunnel tailscale           # Set up Tailscale tunnel
/federation-tunnel cloudflare          # Set up Cloudflare Tunnel
/federation-tunnel ngrok               # Set up ngrok tunnel
/federation-tunnel --status            # Check active tunnels
/federation-tunnel --teardown          # Stop tunnels
```

## Action

### Step 1: Detect Current Setup

```bash
CONFIG="${MAW_CONFIG:-$HOME/.config/maw/maw.config.json}"
NODE=$(jq -r '.node' "$CONFIG" 2>/dev/null)
PORT=$(jq -r '.port // 3456' "$CONFIG" 2>/dev/null)

echo "🔗 Federation Tunnel Setup — $NODE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Detect what's already available
TAILSCALE=$(which tailscale 2>/dev/null)
CLOUDFLARED=$(which cloudflared 2>/dev/null)
NGROK=$(which ngrok 2>/dev/null)

echo "  Available tunnel tools:"
[ -n "$TAILSCALE" ] && echo "    ✅ Tailscale" || echo "    · Tailscale (not installed)"
[ -n "$CLOUDFLARED" ] && echo "    ✅ cloudflared" || echo "    · cloudflared (not installed)"
[ -n "$NGROK" ] && echo "    ✅ ngrok" || echo "    · ngrok (not installed)"
echo ""

# Check if already tunneled
TS_IP=$(tailscale ip -4 2>/dev/null)
[ -n "$TS_IP" ] && echo "  🟢 Tailscale active: $TS_IP"
```

---

## Tailscale (Recommended)

Best for permanent federation links. Zero config networking, MagicDNS, ACLs.

### Install

```bash
echo "📦 Installing Tailscale..."

# macOS
if [ "$(uname)" = "Darwin" ]; then
  echo "  Download: https://tailscale.com/download/mac"
  echo "  Or: brew install tailscale"
  brew install tailscale 2>/dev/null

# Linux (Debian/Ubuntu)
elif [ -f /etc/debian_version ]; then
  curl -fsSL https://tailscale.com/install.sh | sh

# Linux (other)
else
  echo "  See: https://tailscale.com/download/linux"
fi
```

### Connect

```bash
echo "🔗 Connecting to Tailscale..."

# Start tailscale
sudo tailscale up

# Get our Tailscale IP
TS_IP=$(tailscale ip -4)
TS_HOSTNAME=$(tailscale status --self --json | jq -r '.Self.HostName')

echo ""
echo "  ✅ Connected!"
echo "  Tailscale IP: $TS_IP"
echo "  Hostname: $TS_HOSTNAME"
echo "  MagicDNS: $TS_HOSTNAME (use this in peer configs)"
```

### Configure Federation for Tailscale

```bash
echo "📝 Updating maw config for Tailscale..."

# Peer URL options:
echo ""
echo "  For peers on Tailscale, use either:"
echo "    1. Tailscale IP:    http://$TS_IP:$PORT"
echo "    2. MagicDNS name:   http://$TS_HOSTNAME:$PORT  (recommended)"
echo ""

# Show example peer config
echo "  Tell your peer to add this to their namedPeers:"
echo ""
echo "    {\"name\": \"$NODE\", \"url\": \"http://$TS_HOSTNAME:$PORT\"}"
echo ""

# Update own config if peer is also on Tailscale
echo "  To add a Tailscale peer:"
echo ""
echo "    jq --arg name \"PEER\" --arg url \"http://PEER-HOSTNAME:3456\" \\"
echo "      '.namedPeers += [{\"name\":\$name,\"url\":\$url}]' \\"
echo "      $CONFIG > /tmp/c.json && mv /tmp/c.json $CONFIG"
```

### Verify Tailscale Federation

```bash
echo "🔍 Testing Tailscale connectivity..."

# Can we reach peers via Tailscale?
jq -c '.namedPeers[]' "$CONFIG" | while read -r PEER; do
  NAME=$(echo "$PEER" | jq -r '.name')
  URL=$(echo "$PEER" | jq -r '.url')

  RESULT=$(curl -sf --connect-timeout 5 "$URL/api/identity" 2>/dev/null)
  if [ -n "$RESULT" ]; then
    echo "  ✅ $NAME — reachable via Tailscale"
  else
    echo "  ❌ $NAME — not reachable"
    echo "     Is peer on Tailscale? Check: tailscale status"
  fi
done
```

### Tailscale Tips

```
💡 Tailscale Federation Tips:

  • MagicDNS: Use hostnames, not IPs — they're stable
  • ACLs: Allow port 3456 between your machines:
      tailscale set --accept-routes
  • Key expiry: Set to never for servers:
      tailscale set --key-expiry=off (on each node)
  • Share nodes: Invite others with Tailscale sharing
  • Exit nodes: Don't route maw through exit nodes
```

---

## Cloudflare Tunnel

Best for exposing a node to the internet without port forwarding. Free tier available.

### Install

```bash
echo "📦 Installing cloudflared..."

# macOS
brew install cloudflared 2>/dev/null || \
  curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-amd64.tgz | tar xz

# Linux
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared
chmod +x /usr/local/bin/cloudflared
```

### Quick Tunnel (No Account Needed)

```bash
echo "🔗 Starting quick Cloudflare tunnel..."

# Quick tunnel — generates a random URL, no account needed
cloudflared tunnel --url http://localhost:$PORT &
CF_PID=$!

# Wait for URL
sleep 3
CF_URL=$(cloudflared tunnel info 2>/dev/null | grep -oE 'https://[^ ]+\.trycloudflare\.com')

echo ""
echo "  ✅ Tunnel active!"
echo "  URL: $CF_URL"
echo "  PID: $CF_PID"
echo ""
echo "  Tell your peer to use this URL:"
echo "    {\"name\": \"$NODE\", \"url\": \"$CF_URL\"}"
echo ""
echo "  ⚠️ Quick tunnels are temporary — URL changes on restart."
echo "     For permanent URL, use: /federation-tunnel cloudflare --named"
```

### Named Tunnel (Permanent URL)

```bash
echo "🔗 Setting up named Cloudflare tunnel..."
echo ""
echo "  1. Login: cloudflared tunnel login"
echo "  2. Create: cloudflared tunnel create federation-$NODE"
echo "  3. Route: cloudflared tunnel route dns federation-$NODE $NODE.yourdomain.com"
echo "  4. Config:"
echo ""
echo "     cat > ~/.cloudflared/config.yml << 'EOF'"
echo "     tunnel: federation-$NODE"
echo "     credentials-file: ~/.cloudflared/<tunnel-id>.json"
echo "     ingress:"
echo "       - hostname: $NODE.yourdomain.com"
echo "         service: http://localhost:$PORT"
echo "       - service: http_status:404"
echo "     EOF"
echo ""
echo "  5. Run: cloudflared tunnel run federation-$NODE"
echo ""
echo "  Peer URL: https://$NODE.yourdomain.com"
```

---

## ngrok

Best for quick testing and demos. Simple but rate-limited on free tier.

### Install

```bash
echo "📦 Installing ngrok..."

# macOS
brew install ngrok 2>/dev/null || \
  curl -s https://ngrok-agent.s3.amazonaws.com/ngrok.asc | sudo tee /etc/apt/trusted.gpg.d/ngrok.asc

# Authenticate (one-time)
echo "  Get auth token: https://dashboard.ngrok.com/get-started/your-authtoken"
echo "  Run: ngrok config add-authtoken YOUR_TOKEN"
```

### Start Tunnel

```bash
echo "🔗 Starting ngrok tunnel..."

ngrok http $PORT --log=stdout > /tmp/ngrok.log 2>&1 &
NGROK_PID=$!

sleep 3

# Get public URL
NGROK_URL=$(curl -sf http://localhost:4040/api/tunnels | jq -r '.tunnels[0].public_url')

echo ""
echo "  ✅ ngrok tunnel active!"
echo "  URL: $NGROK_URL"
echo "  Dashboard: http://localhost:4040"
echo "  PID: $NGROK_PID"
echo ""
echo "  Tell your peer:"
echo "    {\"name\": \"$NODE\", \"url\": \"$NGROK_URL\"}"
echo ""
echo "  ⚠️ Free tier: URL changes on restart, rate limits apply."
echo "     For stable URL: ngrok http $PORT --domain=your-domain.ngrok-free.app"
```

---

## --status — Check Active Tunnels

```bash
echo "🔍 Active Tunnels"
echo "━━━━━━━━━━━━━━━━━━"
echo ""

# Tailscale
TS_IP=$(tailscale ip -4 2>/dev/null)
if [ -n "$TS_IP" ]; then
  TS_STATUS=$(tailscale status --self --json 2>/dev/null)
  echo "  🟢 Tailscale"
  echo "     IP: $TS_IP"
  echo "     Host: $(echo "$TS_STATUS" | jq -r '.Self.HostName' 2>/dev/null)"
  echo "     Peers: $(tailscale status 2>/dev/null | grep -c 'active')"
else
  echo "  · Tailscale — not connected"
fi

echo ""

# Cloudflare
CF_PID=$(pgrep cloudflared 2>/dev/null)
if [ -n "$CF_PID" ]; then
  echo "  🟢 Cloudflare Tunnel (PID $CF_PID)"
else
  echo "  · Cloudflare — not running"
fi

echo ""

# ngrok
NGROK_PID=$(pgrep ngrok 2>/dev/null)
if [ -n "$NGROK_PID" ]; then
  NGROK_URL=$(curl -sf http://localhost:4040/api/tunnels | jq -r '.tunnels[0].public_url' 2>/dev/null)
  echo "  🟢 ngrok (PID $NGROK_PID)"
  echo "     URL: $NGROK_URL"
  echo "     Dashboard: http://localhost:4040"
else
  echo "  · ngrok — not running"
fi
```

---

## --teardown — Stop Tunnels

```bash
echo "🔌 Stopping tunnels..."

# Cloudflare
CF_PID=$(pgrep cloudflared 2>/dev/null)
if [ -n "$CF_PID" ]; then
  kill "$CF_PID"
  echo "  ✅ Cloudflare tunnel stopped"
fi

# ngrok
NGROK_PID=$(pgrep ngrok 2>/dev/null)
if [ -n "$NGROK_PID" ]; then
  kill "$NGROK_PID"
  echo "  ✅ ngrok stopped"
fi

# Tailscale (just disconnect, don't uninstall)
if tailscale status >/dev/null 2>&1; then
  echo "  ℹ️ Tailscale still connected"
  echo "     To disconnect: sudo tailscale down"
  echo "     (Federation peers using Tailscale will lose connectivity)"
fi
```

---

## Comparison

| Feature | Tailscale | Cloudflare | ngrok |
|---------|-----------|------------|-------|
| **Setup** | Install + `tailscale up` | Install + login + create | Install + auth + `ngrok http` |
| **Stability** | Permanent IP/hostname | Permanent (named) | URL changes on restart |
| **Speed** | Direct (WireGuard) | CDN routed | Relay routed |
| **Free tier** | 100 devices | Unlimited tunnels | 1 tunnel, rate limited |
| **Auth** | Built-in ACLs | Cloudflare Access | IP/OAuth |
| **Best for** | Permanent fleet | Internet-facing nodes | Quick demos |
| **Latency** | Lowest | Medium | Highest |

**Recommendation**: Tailscale for permanent federation, Cloudflare for public-facing nodes, ngrok for quick demos.

---

🤖 Federation Oracle 🗺️ — /federation-tunnel v1.0
