# ARRA Unconference #1 — Federation Live Demo Script

> 26 April 2026 | CEA | ~50 people
> Presenter: Nat + Federation Oracle 🗺️

---

## Pre-Demo Setup (Do Before Your Talk)

### 15 Minutes Before

```bash
# Machine A (your laptop — the "presenter" node)
# Verify maw is serving
curl -s http://localhost:3456/api/identity | jq .node
# → "presenter"

# Machine B (volunteer's laptop, or second machine)
# Verify it's serving too
maw federation status
# → ✅ volunteer  reachable
```

### 5 Minutes Before

```bash
# Test roundtrip silently
maw hey volunteer:oracle "pre-flight check"
# → ✅ delivered

# Verify the volunteer can reply
# (have them send back: maw hey presenter:oracle "check ok")
```

### Terminal Prep

- Font size: **24pt** minimum
- Dark background, light text
- Two terminals side by side (or two machines visible)
- Close all notifications

---

## The 5-Minute Demo

### [0:00 — 0:30] Hook

**Say**: "What if your AI assistants could talk to each other? Not through some cloud API — directly, machine to machine, right here in this room."

**Show**: Two terminals, both running `maw serve`

```
Left terminal (your laptop):     Right terminal (volunteer):
┌────────────────────────┐      ┌────────────────────────┐
│ $ maw federation status│      │ $ maw federation status│
│ ✅ volunteer reachable │      │ ✅ presenter reachable │
└────────────────────────┘      └────────────────────────┘
```

---

### [0:30 — 1:30] The Send

**Say**: "Let me send a message to the oracle on that other laptop."

```bash
maw hey volunteer:oracle "สวัสดี! This message just crossed the room — signed, sealed, delivered via HMAC-SHA256."
```

**Show**: The `✅ delivered` response.

**Then show the volunteer's screen**: The message appeared in their Claude conversation.

**Say**: "That message was cryptographically signed with a shared secret. No server in between. Just HTTP, peer-to-peer."

---

### [1:30 — 2:30] The Reply

**Say**: "Now the oracle on that machine can reply."

**Volunteer runs** (or you run on their machine):
```bash
maw hey presenter:oracle "ได้รับแล้ว! Federation works across the room!"
```

**Show your screen**: The reply arrived.

**Say**: "Roundtrip complete. Two AI assistants just had a conversation across two machines, with zero cloud infrastructure."

---

### [2:30 — 3:30] How It Works

**Say**: "Here's what happened in 3 seconds:"

```
1. maw signed the message    →  HMAC-SHA256(secret, "POST:/api/send:timestamp")
2. HTTP POST to the peer     →  Direct connection, no middleman
3. Peer verified signature   →  Checked secret + timestamp within ±5 minutes
4. Delivered to the oracle   →  Written to the oracle's tmux session
5. Reply went the same way   →  Symmetric — both nodes are equal peers
```

**Say**: "No central server. No cloud account. No API key. Just a shared secret and a list of peers."

---

### [3:30 — 4:30] The Setup

**Say**: "How long does this take to set up? Let me show you the entire config."

**Show the config file**:
```json
{
  "node": "presenter",
  "port": 3456,
  "host": "0.0.0.0",
  "federationToken": "our-shared-secret-token",
  "namedPeers": [
    {"name": "volunteer", "url": "http://192.168.1.42:3456"}
  ]
}
```

**Say**: "That's it. A name, a port, a shared secret, and a list of peers. Install maw, write this config, run `maw serve`. Ten minutes, tops."

---

### [4:30 — 5:00] Call to Action

**Say**: "Want to try it right now? If you have a laptop with Bun installed, we can add you to this federation in 2 minutes."

**Show**: The tutorial URL or QR code.

```
Tutorial: github.com/laris-co/federation-oracle
          → ψ/writing/federation-workshop.md

10-minute setup. No VPN. No cloud.
Just two machines that trust each other.
```

---

## If Someone Wants to Join Live (Bonus: +2 min)

Have the quick commands ready:

```bash
# On their laptop:
git clone https://github.com/Soul-Brews-Studio/maw-js && cd maw-js && bun install && bun link

# Find their IP:
ipconfig getifaddr en0  # macOS

# Create config (you type this for them):
mkdir -p ~/.config/maw
cat > ~/.config/maw/maw.config.json << 'EOF'
{
  "node": "audience-1",
  "port": 3456,
  "host": "0.0.0.0",
  "federationToken": "SAME_TOKEN",
  "namedPeers": [
    {"name": "presenter", "url": "http://YOUR_IP:3456"},
    {"name": "volunteer", "url": "http://VOLUNTEER_IP:3456"}
  ]
}
EOF

# Start:
maw serve

# Add them to your config and volunteer's config:
# (update namedPeers, restart maw serve)

# Verify:
maw federation status
# → ✅ 3/3 reachable

# Broadcast:
maw broadcast "Welcome to the federation!"
```

---

## Backup Plan: If WiFi Fails

If the venue WiFi doesn't let machines see each other:

### Option A: Phone Hotspot
Connect both machines to one phone's hotspot. Guaranteed local network.

### Option B: Ethernet Cable
Direct ethernet cable between two laptops (or through a small switch).

### Option C: Pre-recorded
Have a terminal recording ready (use `asciinema` or screen recording):
```bash
asciinema rec federation-demo.cast
# ... run the whole demo ...
# ctrl-D to stop
asciinema play federation-demo.cast
```

### Option D: Tailscale
Both machines join your tailnet. Works even on hostile WiFi.

---

## Key Talking Points (if Q&A)

**Q: How is this different from just using an API?**
A: No central server. Both machines are equal peers. If either goes down, the other keeps running. No monthly bill. No rate limits. Your data stays on your machines.

**Q: Is it secure?**
A: Every request is signed with HMAC-SHA256. Without the shared token, you can't send messages. The timestamp window prevents replay attacks. For public internet use, add TLS (HTTPS via ngrok or Cloudflare Tunnel).

**Q: Can I use this with more than 2 machines?**
A: Yes — we run a 4-node federation across WireGuard. Add peers to the config and every node can talk to every other node. Full mesh, no central coordinator.

**Q: What about NAT / firewalls?**
A: On the same LAN, it just works. For remote machines, use Tailscale (easiest), WireGuard, ngrok, or Cloudflare Tunnel. The tutorial covers all options.

**Q: What can I actually DO with this?**
A: Send messages between AI assistants on different machines. Peek at remote oracle screens. Broadcast to all nodes. Sync agent routing. Build multi-machine AI workflows. The oracles can collaborate on documents, share research, delegate tasks across machines.

---

🤖 Demo script by Federation Oracle 🗺️ (mba:federation) for ARRA Unconference #1
