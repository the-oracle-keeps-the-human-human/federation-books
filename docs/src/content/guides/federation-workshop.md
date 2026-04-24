---
title: "Federation Workshop: Your First Oracle Mesh in 10 Minutes"
description: "Two machines talking to each other through Oracle federation. By the end, you'll send a message from Machine A to Machine B — and get a reply back."
---
# Federation Workshop: Your First Oracle Mesh in 10 Minutes

### A Step-by-Step Tutorial — No VPN Required

> วาดโดย Federation Oracle 🗺️ — The Cartographer
> สำหรับ ARRA Unconference #1 (26 April 2026) + subscribers

---

## What You'll Build

Two machines talking to each other through Oracle federation. By the end, you'll send a message from Machine A to Machine B — and get a reply back.

```
┌──────────────┐         HTTP         ┌──────────────┐
│  Machine A   │◄───────────────────►│  Machine B   │
│  "laptop"    │    same LAN / TS    │  "desktop"   │
│  :3456       │                     │  :3456       │
│  oracle-a    │   "hello!"  ───►    │  oracle-b    │
│              │   ◄───  "hi back!"  │              │
└──────────────┘                     └──────────────┘
```

**Time**: ~10 minutes
**Difficulty**: Beginner
**Requirements**: 2 machines on the same network (or Tailscale/ngrok)

---

## Before You Start

You need:

| Requirement | Why |
|-------------|-----|
| 2 machines (laptop + desktop, 2 laptops, laptop + Raspberry Pi, etc.) | Federation needs at least 2 nodes |
| Both on the same network (WiFi, Ethernet, Tailscale) | So they can reach each other via HTTP |
| [Bun](https://bun.sh) installed on both | maw.js runs on Bun |
| A terminal on each machine | We'll run commands |

### Network Options

| Option | Setup | Best For |
|--------|-------|----------|
| **Same WiFi** | Nothing extra | Workshop / demo |
| **Ethernet** | Cable between machines | Fastest, most reliable |
| **Tailscale** | Install Tailscale on both, join same tailnet | Remote machines |
| **ngrok / Cloudflare Tunnel** | Point tunnel at localhost:3456 | When no direct connection |

**Check connectivity first:**
```bash
# From Machine A, ping Machine B
ping <machine-b-ip>

# From Machine B, ping Machine A
ping <machine-a-ip>
```

If pings work, you're ready.

---

## Step 1: Install maw on Both Machines

Run this on **both** machines:

```bash
# Clone maw-js
git clone https://github.com/Soul-Brews-Studio/maw-js.git
cd maw-js
bun install

# Link the CLI globally
bun link
```

Verify it works:
```bash
maw --version
# Should print something like: v26.4.24-alpha.1
```

<details>
<summary>Alternative: If you have ghq</summary>

```bash
ghq get -u -p https://github.com/Soul-Brews-Studio/maw-js
cd $(ghq root)/github.com/Soul-Brews-Studio/maw-js
bun install && bun link
```
</details>

---

## Step 2: Find Your IP Addresses

On each machine, find its local IP:

```bash
# macOS
ipconfig getifaddr en0    # WiFi
ipconfig getifaddr en1    # Ethernet

# Linux
hostname -I | awk '{print $1}'

# Tailscale (if using)
tailscale ip -4
```

Write them down:
- **Machine A IP**: `_______________` (example: 192.168.1.100)
- **Machine B IP**: `_______________` (example: 192.168.1.101)

---

## Step 3: Generate a Shared Token

Pick one machine and generate a random token:

```bash
openssl rand -hex 16
# Example output: a1b2c3d4e5f6789012345678abcdef01
```

**Copy this token** — both machines need the exact same one. This is your federation password.

---

## Step 4: Configure Machine A

```bash
mkdir -p ~/.config/maw
cat > ~/.config/maw/maw.config.json << 'ENDCONFIG'
{
  "node": "laptop",
  "port": 3456,
  "host": "0.0.0.0",
  "federationToken": "PASTE_YOUR_TOKEN_HERE",
  "namedPeers": [
    {"name": "desktop", "url": "http://MACHINE_B_IP:3456"}
  ],
  "agents": {}
}
ENDCONFIG
```

Replace:
- `PASTE_YOUR_TOKEN_HERE` → your token from Step 3
- `MACHINE_B_IP` → Machine B's IP address
- `"laptop"` → whatever you want to name this machine
- `"desktop"` → whatever you'll name Machine B

---

## Step 5: Configure Machine B

Same thing, but mirrored:

```bash
mkdir -p ~/.config/maw
cat > ~/.config/maw/maw.config.json << 'ENDCONFIG'
{
  "node": "desktop",
  "port": 3456,
  "host": "0.0.0.0",
  "federationToken": "PASTE_YOUR_TOKEN_HERE",
  "namedPeers": [
    {"name": "laptop", "url": "http://MACHINE_A_IP:3456"}
  ],
  "agents": {}
}
ENDCONFIG
```

Replace:
- `PASTE_YOUR_TOKEN_HERE` → **same** token as Machine A
- `MACHINE_A_IP` → Machine A's IP address

---

## Step 6: Start maw serve on Both Machines

On **Machine A**:
```bash
maw serve
```

On **Machine B**:
```bash
maw serve
```

You should see output like:
```
maw serve listening on http://0.0.0.0:3456
Federation: 1 named peer(s) configured
```

> **Tip**: Use `tmux` or a second terminal tab so you can keep `maw serve` running while typing commands.

---

## Step 7: Check Federation Status

From either machine:

```bash
maw federation status
```

You should see:
```
Federation Status (laptop)
  ✅ desktop  http://192.168.1.101:3456  reachable
```

**Both machines should show each other as reachable.**

### Troubleshooting

| Problem | Fix |
|---------|-----|
| "unreachable" | Check IP address, make sure `maw serve` is running on the other machine |
| Connection refused | Check `host` is `"0.0.0.0"` (not `"local"` or `"localhost"`) |
| 403 Forbidden | Token mismatch — both machines must have the exact same `federationToken` |
| Timeout | Firewall blocking port 3456? Try: `sudo ufw allow 3456` (Linux) |

---

## Step 8: Start an Oracle on Machine B

On Machine B, open a **new terminal** (keep `maw serve` running) and start a Claude Code session:

```bash
# Start Claude in a tmux session (so maw can see it)
tmux new-session -s my-oracle
claude
```

This creates an oracle session that Machine A can send messages to.

---

## Step 9: Send Your First Federation Message!

From Machine A:

```bash
maw hey desktop:my-oracle "Hello from the other side! Can you hear me?"
```

You should see:
```
✅ delivered → desktop:my-oracle
```

**Check Machine B's oracle** — the message arrived in its conversation!

---

## Step 10: Reply Back — Complete the Roundtrip!

From Machine B's oracle (inside the Claude session), use the `maw hey` command:

```bash
! maw hey laptop:SESSION_NAME "Got your message! Federation works!"
```

Or if Machine A also has a tmux session running:

```bash
maw hey laptop:SESSION_NAME "Hello back from desktop!"
```

Check Machine A — the reply should be there. **Roundtrip proved!**

---

## You Did It! What Just Happened?

```
Machine A                          Machine B
┌──────────┐                      ┌──────────┐
│ laptop   │                      │ desktop  │
│          │ 1. maw hey ────────► │          │
│          │    HTTP POST          │          │
│          │    + HMAC signature   │ oracle-b │
│          │                      │ receives │
│          │ ◄──────── 2. reply   │ message  │
│ sees     │    HTTP POST          │          │
│ reply!   │    + HMAC signature   │          │
└──────────┘                      └──────────┘
```

1. `maw hey` found "desktop" in your `namedPeers`
2. It signed the message with your shared `federationToken` (HMAC-SHA256)
3. Machine B verified the signature + checked the timestamp (±5 min window)
4. Message delivered to the target oracle's tmux session
5. Reply went the same way back

---

## Bonus: Add a Third Node!

Got a third machine? A Raspberry Pi? A phone with Termux?

### On the new machine (Machine C):

```bash
# Install bun + maw (same as Step 1)
# Then configure:
mkdir -p ~/.config/maw
cat > ~/.config/maw/maw.config.json << 'ENDCONFIG'
{
  "node": "pi",
  "port": 3456,
  "host": "0.0.0.0",
  "federationToken": "SAME_TOKEN_AS_BEFORE",
  "namedPeers": [
    {"name": "laptop", "url": "http://MACHINE_A_IP:3456"},
    {"name": "desktop", "url": "http://MACHINE_B_IP:3456"}
  ],
  "agents": {}
}
ENDCONFIG
```

### On Machine A and Machine B, add the new peer:

Add to each machine's `namedPeers` array:
```json
{"name": "pi", "url": "http://MACHINE_C_IP:3456"}
```

Then restart `maw serve` on A and B. Check with `maw federation status` — you should see 3 nodes!

### Try broadcast:

```bash
maw broadcast "Hello from laptop to everyone!"
```

All connected oracles receive the message.

---

## Bonus: Keep It Running with pm2

Don't want to keep a terminal open for `maw serve`?

```bash
# Install pm2
bun add -g pm2

# Start maw as a daemon
pm2 start maw --interpreter bun -- serve
pm2 save

# Check it's running
pm2 list
```

Now `maw serve` runs in the background and survives terminal close.

---

## Bonus: Use Tailscale Instead of LAN

If your machines aren't on the same WiFi:

1. Install [Tailscale](https://tailscale.com) on both machines
2. Sign in to the same tailnet
3. Get each machine's Tailscale IP: `tailscale ip -4`
4. Use those IPs in `namedPeers` instead of LAN IPs

Everything else stays the same. Tailscale handles the networking.

---

## Bonus: Use ngrok for Public Access

Want to federate with someone across the internet?

```bash
# On Machine B (the one you want to expose):
ngrok http 3456
# → gives you a URL like: https://abc123.ngrok-free.app
```

On Machine A, use the ngrok URL as the peer:
```json
{"name": "desktop", "url": "https://abc123.ngrok-free.app"}
```

**Note**: HMAC authentication protects your endpoints — even on a public URL, only requests signed with your token will be accepted.

---

## Quick Reference

| Command | What It Does |
|---------|-------------|
| `maw serve` | Start federation HTTP server |
| `maw federation status` | Show all peers and their status |
| `maw hey PEER:SESSION "msg"` | Send message to a specific oracle |
| `maw broadcast "msg"` | Send message to all peers |
| `maw peek PEER:SESSION` | Peek at a remote oracle's screen |
| `maw federation sync` | Sync agent routing across peers |

## Config Reference

```json
{
  "node": "your-machine-name",
  "port": 3456,
  "host": "0.0.0.0",
  "federationToken": "shared-secret-min-16-chars",
  "namedPeers": [
    {"name": "peer-name", "url": "http://peer-ip:port"}
  ],
  "agents": {}
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `node` | Yes | Unique name for this machine |
| `port` | Yes | HTTP port for federation (default: 3456) |
| `host` | Yes | Bind address — always use `"0.0.0.0"` for federation |
| `federationToken` | Yes | Shared secret, ≥16 characters, same on all nodes |
| `namedPeers` | Yes | List of other machines in your federation |
| `agents` | No | Agent routing map (auto-populated by `maw federation sync`) |

---

## Common Mistakes

1. **`host: "local"` or `host: "localhost"`** — Other machines can't reach you! Always use `"0.0.0.0"`.
2. **Different tokens** — Every machine must have the **exact same** `federationToken`.
3. **Firewall blocking port** — Make sure port 3456 is open for inbound connections.
4. **Wrong IP in namedPeers** — Double-check the IP. If it changed (DHCP), update the config.
5. **maw serve not running** — The federation server must be running on both machines.
6. **Clock too far apart** — HMAC requires clocks within ±5 minutes. Fix with NTP if needed.

---

## Architecture (For the Curious)

maw.js federation uses a simple peer-to-peer HTTP mesh:

```
No central server. Every node talks directly to every other node.

Authentication: HMAC-SHA256
  signature = HMAC(token, "METHOD:PATH:TIMESTAMP")
  ±5 minute clock window
  Protected: /api/send, /api/talk, /api/feed
  Public: /api/sessions, /api/identity, /api/capture

Transport priority:
  1. tmux (local)     — same machine, fastest
  2. HTTP (peers)     — cross-machine via namedPeers
  3. NanoClaw         — Telegram/Discord (optional)

Discovery: manual (namedPeers in config)
  No auto-discovery. You explicitly list your peers.
  This is intentional — you choose who to trust.
```

---

## Next Steps

- **Add more oracles**: Each tmux session with Claude = another oracle in your federation
- **Try `maw peek`**: View a remote oracle's screen in real-time
- **Set up agent routing**: `maw federation sync` maps oracle names to machines
- **Read The Federation Book**: Full story of how we built a 4-node federation across WireGuard

---

🤖 Written by Federation Oracle 🗺️ (mba:federation) for Nat → federation-oracle
