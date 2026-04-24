# Federation in 60 Seconds — Video Script

### Storyboard for a Short Explainer Video

> วาดโดย Federation Oracle 🗺️ — The Cartographer
> Format: Screen recording + voiceover (or text captions for silent)

---

## Version A: 60-Second Explainer

### [0:00 — 0:05] Hook

**Visual**: Split screen — two terminals on different machines
**Text/Voice**: "What if your AI could talk to another AI on a different machine?"

### [0:05 — 0:15] The Problem

**Visual**: Single laptop with Claude running. Arrow pointing to another laptop with "?" 
**Text/Voice**: "Your AI assistant lives on one machine. But what if you have two machines — a laptop and a server — and you want them to collaborate?"

### [0:15 — 0:30] The Solution

**Visual**: Terminal showing `maw.config.json` (6 lines), then `maw serve`
**Text/Voice**: "Federation. Six lines of config. One command to start. Your machines can now talk to each other."

```json
{
  "node": "laptop",
  "port": 3456,
  "host": "0.0.0.0",
  "federationToken": "your-secret",
  "namedPeers": [{"name": "server", "url": "http://192.168.1.50:3456"}]
}
```

### [0:30 — 0:45] The Proof

**Visual**: Terminal typing `maw hey server:oracle "hello!"` → `✅ delivered`
Then the server's terminal shows the message arriving.
Then the server replies → message appears on laptop.

**Text/Voice**: "Send a message. It arrives instantly. The other AI replies. Cryptographically signed. No cloud. No middleman."

### [0:45 — 0:55] How It Works

**Visual**: Simple diagram:
```
Laptop ──HTTP──► Server
         HMAC-SHA256
         ±5 min window
         Direct, P2P
```

**Text/Voice**: "Peer-to-peer HTTP. Authenticated with HMAC. Your data never leaves your network."

### [0:55 — 1:00] CTA

**Visual**: URL + "10 minutes to set up"
**Text/Voice**: "Try it yourself. Ten minutes. Two machines. That's it."

---

## Version B: 3-Minute Tutorial Walkthrough

### [0:00 — 0:10] Intro

**Visual**: Two laptops side by side on a desk
**Text/Voice**: "I'm going to connect two AI assistants across two machines in under 3 minutes."

### [0:10 — 0:30] Install

**Visual**: Terminal on Machine A
```bash
git clone https://github.com/Soul-Brews-Studio/maw-js
cd maw-js && bun install && bun link
maw --version
# → v26.4.24-alpha.1
```

**Text/Voice**: "Clone maw, install, link. Same thing on the second machine."

**Visual**: Quick cut to Machine B doing the same.

### [0:30 — 0:50] Token

**Visual**: Terminal
```bash
openssl rand -hex 16
# → a1b2c3d4e5f6789012345678abcdef01
```

**Text/Voice**: "Generate a shared secret. Copy this — both machines need the exact same token."

### [0:50 — 1:30] Config

**Visual**: Terminal on Machine A, typing the config
```bash
mkdir -p ~/.config/maw
cat > ~/.config/maw/maw.config.json << 'EOF'
{
  "node": "alpha",
  "port": 3456,
  "host": "0.0.0.0",
  "federationToken": "a1b2c3d4e5f6789012345678abcdef01",
  "namedPeers": [
    {"name": "beta", "url": "http://192.168.1.42:3456"}
  ]
}
EOF
```

**Text/Voice**: "Create the config. Key things: `host` must be `0.0.0.0` — not localhost. Token must match. Peer URL is the other machine's IP."

**Visual**: Cut to Machine B — similar config but mirrored.

### [1:30 — 1:45] Start

**Visual**: Split screen — both terminals
```bash
# Machine A:          # Machine B:
maw serve             maw serve
```

**Text/Voice**: "Start serving on both machines."

### [1:45 — 2:00] Check

**Visual**: Machine A terminal
```bash
maw federation status
# ✅ beta  http://192.168.1.42:3456  reachable
```

**Text/Voice**: "Check the status — beta is reachable. Let's verify from the other side too."

**Visual**: Machine B
```bash
maw federation status
# ✅ alpha  http://192.168.1.100:3456  reachable
```

**Text/Voice**: "Both sides see each other. Always check from both machines."

### [2:00 — 2:30] Message

**Visual**: Machine A
```bash
maw hey beta:my-oracle "Hello from alpha! Can you read this?"
# ✅ delivered → beta:my-oracle
```

**Visual**: Machine B — the message appears in the oracle's conversation

**Text/Voice**: "Message sent from alpha. And there it is on beta — delivered. Now let's send one back."

**Visual**: Machine B
```bash
! maw hey alpha:oracle "Got it! Federation is live!"
```

**Visual**: Machine A — reply arrives

**Text/Voice**: "Roundtrip complete. Two AI assistants, two machines, talking directly."

### [2:30 — 2:50] Under the Hood

**Visual**: Diagram overlay
```
alpha ─── HTTP POST ──► beta
          X-Maw-Signature: HMAC(token, "POST:/api/send:timestamp")
          X-Maw-Timestamp: 1714000000
          
          Peer verifies:
          1. Signature matches? ✅
          2. Timestamp within ±5min? ✅
          3. Target session exists? ✅
          → Message delivered
```

**Text/Voice**: "Every message is signed with HMAC-SHA256 using your shared token. No central server. No cloud. Just two machines that trust each other."

### [2:50 — 3:00] Outro

**Visual**: Terminal showing `maw federation status` with 3 nodes
**Text/Voice**: "Add more machines. Build a mesh. It scales to as many nodes as you need. Link in the description. Set up yours in 10 minutes."

---

## Version C: Asciinema Recording (Terminal Only)

For a pure terminal recording without voiceover:

```bash
# Record with asciinema
asciinema rec federation-demo.cast

# --- The recording ---

echo "=== Federation Setup in 60 Seconds ==="
echo ""

echo "Step 1: Check maw is installed"
maw --version

echo ""
echo "Step 2: Generate a token"
TOKEN=$(openssl rand -hex 16)
echo "Token: $TOKEN"

echo ""
echo "Step 3: Create config"
cat ~/.config/maw/maw.config.json | jq .

echo ""
echo "Step 4: maw serve is already running (pm2)"
pm2 list | grep maw

echo ""
echo "Step 5: Check federation"
maw federation status

echo ""
echo "Step 6: Send a message!"
maw hey peer:oracle "Hello from the terminal recording! 🗺️"

echo ""
echo "=== Done! Federation is live ==="
echo "Tutorial: github.com/laris-co/federation-oracle"

# End recording
# ctrl-D

# Upload (optional):
# asciinema upload federation-demo.cast
```

---

## Version D: Slide Deck Outline (10-min Talk)

For a longer presentation with slides:

### Slide 1: Title
**Federation: AI Assistants That Talk Across Machines**
Nat + Federation Oracle 🗺️ | ARRA Unconference #1 | 26 April 2026

### Slide 2: The Problem
- You have 2+ machines
- Each has AI assistants (Claude Code)
- They can't talk to each other
- Copy-pasting between machines is painful

### Slide 3: The Vision
```
laptop ◄──► desktop ◄──► server
  AI          AI           AI
  
"Hey desktop, review this code"
"Hey server, run the tests"
"Hey laptop, here are the results"
```

### Slide 4: How It Works
- **maw serve**: HTTP server on each machine
- **namedPeers**: List of known machines
- **HMAC-SHA256**: Cryptographic authentication
- **No cloud**: Direct peer-to-peer

### Slide 5: The Config (6 lines that matter)
```json
{
  "node": "laptop",
  "port": 3456,
  "host": "0.0.0.0",
  "federationToken": "shared-secret",
  "namedPeers": [{"name": "desktop", "url": "http://IP:3456"}]
}
```

### Slide 6: Live Demo
[Switch to terminal — run the demo script]

### Slide 7: Architecture
```
Transport layers:
1. tmux (local)
2. HTTP (federation) ← this
3. NanoClaw (Telegram)
4. LoRa (hardware)
```

### Slide 8: Security
- HMAC-SHA256 signed requests
- ±5 minute clock window
- Token never sent over wire
- Optional: HTTPS via tunnel

### Slide 9: What We Built
- 4-node federation (MBA, white, oracle-world, clinic-nat)
- Cross-machine collaboration (oracles writing together)
- 3,000+ lines of documentation
- 4 interactive skills

### Slide 10: Try It Now
- **Workshop**: github.com/laris-co/federation-oracle
- **Time**: 10 minutes
- **Needs**: 2 machines + Bun
- **WiFi credentials**: [on screen]
- "Who wants to join our federation right now?"

---

## Production Notes

### Recording Tools
- **Terminal**: [asciinema](https://asciinema.org) (free, embeddable)
- **Screen**: OBS Studio or macOS screen recording
- **Editing**: ffmpeg for trimming, DaVinci Resolve for polish
- **Captions**: Whisper (AI transcription) + manual review

### Tips
- Use a large terminal font (24pt+)
- Dark background, high contrast
- Pre-configure everything — no one wants to watch `bun install`
- Test the full demo before recording
- Keep terminal commands short — use aliases if needed
- Pause briefly after each command so viewers can read

---

🤖 Federation Oracle 🗺️ — Video Script v1.0
