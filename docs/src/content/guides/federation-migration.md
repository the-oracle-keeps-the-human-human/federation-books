---
title: "Federation Migration Guide"
description: "- maw installed on one machine"
---
# Federation Migration Guide

### From Solo maw to Federated Mesh

> วาดโดย Federation Oracle 🗺️ — The Cartographer
> "คุณมี maw อยู่แล้ว ตอนนี้มาทำให้มันคุยกับเครื่องอื่นได้"

---

## Who Is This For?

You already have:
- maw installed on one machine
- Claude Code running in tmux sessions
- `maw serve` working locally
- Maybe some agents configured

You want to:
- Connect a second (or third) machine
- Send messages between machines
- Share agent routing across the mesh

---

## Pre-Migration Checklist

Before touching your config, verify your current setup:

```bash
# 1. maw is installed and working
maw --version

# 2. maw serve is running
curl -s http://localhost:3456/api/identity | jq .
# Should show your node name

# 3. You have active sessions
curl -s http://localhost:3456/api/sessions | jq .
# Should list your tmux sessions

# 4. Your config is valid
jq . ~/.config/maw/maw.config.json
```

If any of these fail, fix them before adding federation. Don't add complexity on top of a broken base.

---

## Step 1: Backup Your Config

**This is non-negotiable.** `maw update` has been known to wipe configs.

```bash
cp ~/.config/maw/maw.config.json ~/.config/maw/maw.config.json.pre-federation.$(date +%s)
```

Verify the backup:
```bash
diff ~/.config/maw/maw.config.json ~/.config/maw/maw.config.json.pre-federation.*
# Should show no differences
```

---

## Step 2: Audit Your Current Config

Read your config and understand what you have:

```bash
jq . ~/.config/maw/maw.config.json
```

**Typical solo config:**
```json
{
  "node": "my-laptop",
  "port": 3456,
  "namedPeers": [],
  "agents": {
    "code": {"session": "claude-code", "window": "0"},
    "research": {"session": "research", "window": "0"}
  }
}
```

**What needs to change for federation:**

| Field | Solo | Federation |
|-------|------|-----------|
| `node` | Any name | Unique across all machines |
| `port` | Any port | Same or different (just match in peer URLs) |
| `host` | Missing or "local" | **Must be `"0.0.0.0"`** |
| `federationToken` | Missing or empty | **Shared secret ≥16 chars** |
| `namedPeers` | `[]` | **List of peer machines** |
| `agents` | Your agents | Keep as-is (will be shared via sync) |

---

## Step 3: Generate a Federation Token

If you don't have one yet:

```bash
openssl rand -hex 16
```

Save this somewhere secure. Every machine in your federation needs the same token.

---

## Step 4: Update Your Config

Add the three missing fields:

```bash
# Using jq to surgically update (preserves everything else):
jq '.host = "0.0.0.0" | .federationToken = "YOUR_TOKEN_HERE"' \
  ~/.config/maw/maw.config.json > /tmp/maw-migration.json

# Verify the changes look right:
diff <(jq . ~/.config/maw/maw.config.json) <(jq . /tmp/maw-migration.json)

# Apply:
mv /tmp/maw-migration.json ~/.config/maw/maw.config.json
```

**Don't add namedPeers yet** — we'll do that after the second machine is set up.

---

## Step 5: Set Up the Second Machine

On your second machine, install maw and create a config:

```bash
# Install
git clone https://github.com/Soul-Brews-Studio/maw-js
cd maw-js && bun install && bun link

# Create config
mkdir -p ~/.config/maw
cat > ~/.config/maw/maw.config.json << 'ENDCONFIG'
{
  "node": "second-machine",
  "port": 3456,
  "host": "0.0.0.0",
  "federationToken": "SAME_TOKEN_AS_MACHINE_1",
  "namedPeers": [
    {"name": "my-laptop", "url": "http://MACHINE_1_IP:3456"}
  ],
  "agents": {}
}
ENDCONFIG

# Start serving
maw serve
```

---

## Step 6: Add the Peer to Your Original Machine

Now go back to Machine 1 and add Machine 2 as a peer:

```bash
# Add the peer using jq:
jq '.namedPeers += [{"name": "second-machine", "url": "http://MACHINE_2_IP:3456"}]' \
  ~/.config/maw/maw.config.json > /tmp/maw-peer.json

# Verify:
jq '.namedPeers' /tmp/maw-peer.json

# Apply:
mv /tmp/maw-peer.json ~/.config/maw/maw.config.json
```

---

## Step 7: Restart and Verify

**Restart maw serve** on your original machine (to pick up config changes):

```bash
# If using pm2:
pm2 restart maw

# If running directly:
# Stop the old maw serve, then:
maw serve
```

**Check from both sides:**

```bash
# Machine 1:
maw federation status
# → ✅ second-machine  reachable

# Machine 2:
maw federation status
# → ✅ my-laptop  reachable
```

---

## Step 8: Test Messaging

```bash
# From Machine 1 → Machine 2:
maw hey second-machine:SESSION_NAME "Hello from the federation!"

# From Machine 2 → Machine 1:
maw hey my-laptop:SESSION_NAME "Got it! Replying back!"
```

If `SESSION_NAME` isn't known, check available sessions:
```bash
curl -s http://PEER_IP:3456/api/sessions | jq .
```

---

## Step 9: Sync Agent Routing (Optional)

Share your agent names across the mesh:

```bash
maw federation sync          # See what would change
maw federation sync --force  # Apply changes
```

Now both machines know about each other's named agents.

---

## What Changed: Before vs After

### Config Diff

```diff
 {
   "node": "my-laptop",
   "port": 3456,
+  "host": "0.0.0.0",
+  "federationToken": "a1b2c3d4e5f6789012345678abcdef01",
-  "namedPeers": [],
+  "namedPeers": [
+    {"name": "second-machine", "url": "http://192.168.1.42:3456"}
+  ],
   "agents": {
     "code": {"session": "claude-code", "window": "0"},
     "research": {"session": "research", "window": "0"}
   }
 }
```

### Capability Diff

| Capability | Before | After |
|-----------|--------|-------|
| Local messaging | ✅ | ✅ |
| Cross-machine messaging | ❌ | ✅ |
| Remote oracle peek | ❌ | ✅ |
| Broadcast | N/A | ✅ |
| Agent sync | N/A | ✅ |
| Authentication | None | HMAC-SHA256 |

### What Didn't Change

- Your existing agents still work exactly the same
- Local `maw hey` to tmux sessions is unchanged
- Your tmux sessions are untouched
- Your Claude Code sessions are unaffected
- Port number can stay the same

---

## Rollback Plan

If something goes wrong and you want to undo federation:

```bash
# Restore your backup
cp ~/.config/maw/maw.config.json.pre-federation.* ~/.config/maw/maw.config.json

# Restart maw
pm2 restart maw
# or: kill and restart maw serve
```

Your machine goes back to solo mode. All local functionality works as before.

---

## Migration Gotchas

### Gotcha 1: Existing `host` Field

If your config already has `"host": "local"` or `"host": "localhost"`, federation won't work. Must change to `"0.0.0.0"`.

### Gotcha 2: Port Conflicts

If your original machine uses port 3456 and the second machine also defaults to 3456, that's fine — they're on different machines. Only a problem if running multiple maw instances on the same machine.

### Gotcha 3: Firewall

Your machine's firewall might block inbound connections on port 3456. Check:
```bash
# macOS: System Settings → Network → Firewall
# Linux: sudo ufw status
# Linux: sudo iptables -L INPUT
```

### Gotcha 4: Node Name Collision

If both machines have `"node": "default"` or the same name, agent routing breaks. Each node must have a unique name.

### Gotcha 5: maw Version Mismatch

Both machines should run the same maw version. Check with `maw --version`. Update if needed (with backup first!).

---

## Next: Adding More Machines

Once you're comfortable with 2 nodes, scaling is easy:
1. Install maw on the new machine
2. Create config with your existing token and ALL existing peers
3. Add the new machine to ALL existing nodes' configs
4. Restart maw serve everywhere
5. `maw federation status` from all nodes

Or use the `/federation-sync --add-node` skill to automate steps 2-5.

---

🤖 Federation Oracle 🗺️ — Migration Guide v1.0
