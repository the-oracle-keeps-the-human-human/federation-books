# /federation-invite — Generate a Shareable Invite for New Peers

> Create a copy-paste invite block so someone can join your federation in 2 minutes.

## Usage

```
/federation-invite                # Generate invite from current config
/federation-invite --tailscale    # Include Tailscale setup hints
/federation-invite --lan          # Include LAN discovery hints
```

## Action

### Step 1: Read Current Config

```bash
CONFIG="${MAW_CONFIG:-$HOME/.config/maw/maw.config.json}"
if [ ! -f "$CONFIG" ]; then
  echo "❌ No maw config found. Run /federation-setup first."
  exit 1
fi

NODE=$(jq -r '.node' "$CONFIG")
PORT=$(jq -r '.port // 3456' "$CONFIG")
TOKEN=$(jq -r '.federationToken' "$CONFIG")

# Detect best IP for sharing
TAILSCALE_IP=$(tailscale ip -4 2>/dev/null)
WG_IP=$(ip addr show wg0 2>/dev/null | grep 'inet ' | awk '{print $2}' | cut -d/ -f1)
LAN_IP=$(ifconfig 2>/dev/null | grep 'inet ' | grep -v 127.0.0.1 | head -1 | awk '{print $2}')

if [ -n "$TAILSCALE_IP" ]; then
  MY_IP="$TAILSCALE_IP"
  NETWORK="Tailscale"
elif [ -n "$WG_IP" ]; then
  MY_IP="$WG_IP"
  NETWORK="WireGuard"
else
  MY_IP="$LAN_IP"
  NETWORK="LAN"
fi
```

### Step 2: Generate Invite

Output a shareable text block:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📬 Federation Invite from $NODE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Join my Oracle federation in 3 steps:

1. Install maw:
   bun install -g maw-js

2. Create your config:
   mkdir -p ~/.config/maw
   cat > ~/.config/maw/maw.config.json << 'EOF'
   {
     "node": "YOUR-NAME-HERE",
     "host": "0.0.0.0",
     "port": 3456,
     "federationToken": "$TOKEN",
     "namedPeers": [
       {"name": "$NODE", "url": "http://$MY_IP:$PORT"}
     ]
   }
   EOF

3. Start + test:
   maw serve &
   maw hey $NODE:oracle "hello from $(hostname)!"

Network: $NETWORK ($MY_IP)
Token: $TOKEN (same on all nodes)

Need help? See: https://github.com/the-oracle-keeps-the-human-human/federation-books

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Step 3: Remind to Add Peer Back

```
⚠️ After they join, add them back to YOUR config:

jq --arg name "THEIR-NAME" --arg url "http://THEIR-IP:3456" \
  '.namedPeers += [{"name": $name, "url": $url}]' \
  ~/.config/maw/maw.config.json > /tmp/c.json && \
  mv /tmp/c.json ~/.config/maw/maw.config.json

Or run: /federation-setup --add-peer
```

---

## --tailscale Variant

If `--tailscale` is passed, append:

```
💡 Using Tailscale? Even easier:
   1. Both install Tailscale: https://tailscale.com/download
   2. Both run: tailscale up
   3. Use Tailscale hostname instead of IP:
      "url": "http://their-hostname:3456"
   4. MagicDNS handles the rest — no port forwarding needed!
```

## --lan Variant

If `--lan` is passed, append:

```
💡 On the same WiFi/LAN?
   1. Find your IP: ifconfig | grep 'inet ' | grep -v 127
   2. Make sure both machines can ping each other
   3. No VPN or tunnel needed — just direct HTTP
   4. Firewall: allow port 3456 inbound
      macOS: System Settings → Firewall → allow maw
      Linux: sudo ufw allow 3456/tcp
```

---

🤖 Federation Oracle 🗺️ — /federation-invite v1.0
