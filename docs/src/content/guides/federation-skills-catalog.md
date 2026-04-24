---
title: "Federation Skills Catalog"
description: "ghq get the-oracle-keeps-the-human-human/federation-books"
---
# Federation Skills Catalog

> Every skill you need to set up, run, debug, and manage a federation — installed with one command.

## Quick Install

```bash
# Clone federation-books (has all skills)
ghq get the-oracle-keeps-the-human-human/federation-books

# Or if you don't have ghq:
git clone https://github.com/the-oracle-keeps-the-human-human/federation-books.git

# Symlink skills into your oracle
BOOKS="$HOME/Code/github.com/the-oracle-keeps-the-human-human/federation-books"
for skill in federation-setup federation-invite federation-doctor federation-debug \
             federation-fleet federation-message federation-talk fleet-map sync; do
  ln -sf "$BOOKS/.claude/skills/$skill" "$HOME/.claude/skills/$skill" 2>/dev/null && \
    echo "✅ $skill" || echo "⚠️ $skill (already exists)"
done
```

After symlinking, skills are available as `/skill-name` in any Claude Code session.

---

## Skill Reference

### 🏗️ /federation-setup — Interactive Setup Wizard

**When to use**: First time setting up federation on a machine.

```
/federation-setup              # Full 9-step wizard
/federation-setup --check      # Verify existing setup
/federation-setup --add-peer   # Add a new peer
```

**What it does** (9 steps):
1. Check prerequisites (bun, maw, jq)
2. Choose node name (lowercase, 2-20 chars)
3. Choose port (default 3456, checks availability)
4. Generate federation token (32-char hex, or paste existing)
5. Add peers (name + URL, tests reachability)
6. Write `~/.config/maw/maw.config.json`
7. Start `maw serve`
8. Send first message
9. Verify roundtrip

**Config it creates** (`~/.config/maw/maw.config.json`):

```json
{
  "node": "my-node",
  "host": "0.0.0.0",
  "port": 3456,
  "federationToken": "a1b2c3d4e5f6...",
  "namedPeers": [
    {"name": "peer-name", "url": "http://192.168.1.100:3456"}
  ]
}
```

---

### 📬 /federation-invite — Shareable Invite Generator

**When to use**: You want someone to join your federation.

```
/federation-invite                # Generate invite from current config
/federation-invite --tailscale    # Include Tailscale hints
/federation-invite --lan          # Include LAN discovery hints
```

**What it does**:
- Reads your `maw.config.json`
- Auto-detects your best IP (Tailscale > WireGuard > LAN)
- Generates a copy-paste text block with:
  - Install command
  - Pre-filled config with your token and URL
  - Start + test commands
- Reminds you to add them back to YOUR config

**Example output**:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📬 Federation Invite from mba
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Join my Oracle federation in 3 steps:

1. Install maw:
   bun install -g maw-js

2. Create your config:
   (pre-filled JSON with token + peer URL)

3. Start + test:
   maw serve &
   maw hey mba:oracle "hello!"

Network: Tailscale (100.64.0.3)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

### 🩺 /federation-doctor — Diagnostic & Auto-Fix

**When to use**: Something isn't working and you don't know why.

```
/federation-doctor               # Run 8 diagnostic checks
/federation-doctor --fix         # Auto-fix what can be fixed
```

**8 checks**:

| # | Check | What it tests |
|---|-------|--------------|
| 1 | maw installed | `which maw` |
| 2 | Config exists | `~/.config/maw/maw.config.json` |
| 3 | Config valid | JSON parse + required fields |
| 4 | Serve running | `curl localhost:PORT/api/identity` |
| 5 | Peers reachable | `curl PEER_URL/api/identity` per peer |
| 6 | Token match | HMAC-signed test request |
| 7 | Clock drift | Compare timestamps with peers |
| 8 | Books repo | Local federation-books checkout |

**`--fix` mode** auto-repairs:
- Installs maw if missing
- Generates minimal config if missing
- Changes `host: "127.0.0.1"` → `"0.0.0.0"`
- Starts `maw serve` if not running

---

### 🔍 /federation-debug — 6-Layer Network Diagnosis

**When to use**: A specific peer is unreachable and you need to know exactly where it fails.

```
/federation-debug                    # Debug all peers
/federation-debug white              # Debug one peer
/federation-debug --trace white      # Full packet trace
/federation-debug --hmac             # Test HMAC auth chain
/federation-debug --ports            # Port scan peer addresses
```

**6 diagnostic layers** (per peer):

| Layer | Test | Common failure |
|-------|------|----------------|
| 1. DNS | Resolve hostname | Wrong hostname, no Tailscale DNS |
| 2. Ping | ICMP reachability | Host down, wrong network, firewall |
| 3. TCP | Port connectivity | maw not running, port blocked |
| 4. HTTP | `/api/identity` response | Wrong port, maw crashed |
| 5. HMAC | Authenticated send | Token mismatch, clock drift |
| 6. Federation | Bidirectional visibility | Missing reverse peer entry |

**Difference from /federation-doctor**: Doctor checks if YOUR setup is correct. Debug traces the path TO a specific peer and finds where it breaks.

---

### 🚢 /federation-fleet — Fleet Dashboard

**When to use**: See the big picture — all nodes, all agents, all connections.

```
/federation-fleet                   # Full dashboard
/federation-fleet --compact         # One line per node
/federation-fleet --health          # Health scores (0-100)
/federation-fleet --agents          # List all agents across fleet
/federation-fleet --config-diff     # Compare configs across nodes
```

**Dashboard shows**:
- Node status (online/partial/offline) with presence dots
- Port, agents, uptime, version per node
- Cross-connectivity matrix (who can see whom)
- Suggested fix actions for problems found

**Health scoring** (0-100 per node):
- +20 responds to `/api/identity`
- +20 HMAC auth passes
- +20 all peers reachable from that node
- +20 version matches fleet latest
- +10 uptime > 1 hour
- +10 clock within ±60s

---

### 📨 /federation-message — Messaging Toolkit

**When to use**: Send messages across federation — quick sends, broadcasts, templates.

```
/federation-message                         # Interactive menu
/federation-message send white "hello!"     # Quick send
/federation-message broadcast "update!"     # Send to all peers
/federation-message peek                    # Check incoming
/federation-message history                 # Recent messages
/federation-message template standup        # Use a template
```

**7 templates**:

| Template | Use for |
|----------|---------|
| `standup` | Daily standup (done/doing/blocked) |
| `status` | Auto-filled node status report |
| `deploy` | Deployment notification (repo, branch, commit) |
| `alert` | Warning with priority level |
| `handoff` | Session handoff to another oracle |
| `welcome` | Welcome message for new peers |
| `ping` | Quick connectivity test with timing |

**HMAC fallback**: If `maw hey` isn't available, includes curl + HMAC signature recipe for direct API sends.

---

### 💬 /federation-talk — Cross-Mesh Communication

**When to use**: Full communication toolkit — send, broadcast, listen, sync, review.

```
/federation-talk send white "message"
/federation-talk broadcast "all nodes: update!"
/federation-talk listen
/federation-talk sync
```

---

### 🗺️ /fleet-map — Visual Fleet Map

**When to use**: See which oracles live where.

```
/fleet-map
```

Shows machines → repos → oracles in tree format.

---

### 🔄 /sync — Git Sync + Broadcast

**When to use**: Commit, push, and tell the federation about it.

```
/sync                    # Commit + push
/sync --pr               # Create PR
/sync --broadcast        # Push + notify all peers
/sync --ack              # Acknowledge sync from peer
```

---

## Skill Comparison

| Need | Skill | Mode |
|------|-------|------|
| First-time setup | `/federation-setup` | Full wizard |
| Invite someone | `/federation-invite` | Generate invite |
| Something broken? | `/federation-doctor` | Quick diagnostic |
| WHY is it broken? | `/federation-debug` | Deep trace |
| What's the fleet status? | `/federation-fleet` | Dashboard |
| Send a message | `/federation-message` | Send/broadcast |
| Full comms toolkit | `/federation-talk` | Listen/sync/review |
| See the map | `/fleet-map` | Visual tree |
| Git + notify | `/sync` | Commit/push/broadcast |

## Creating Your Own Skills

Skills are Markdown files at `.claude/skills/<name>/skill.md`. Format:

```markdown
# /skill-name — Short Description

> One-line summary.

## Usage
(show command variants)

## Action
(what the skill does — bash snippets, prompts, outputs)
```

See the [SKILL.md spec](https://github.com/Soul-Brews-Studio/oracle-skills-cli) for full format with YAML frontmatter, agent support, and profile targeting.

---

🤖 Federation Oracle 🗺️ — Skills Catalog v1.0
