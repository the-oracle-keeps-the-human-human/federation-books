# /fleet-map — Who's Where

> Show which oracles are on which machine, with repos and status.

## Usage

```
/fleet-map              # Full map: all nodes, all agents
/fleet-map --local      # Local node only
/fleet-map --compact    # One-line-per-agent summary
```

## Step 1: Gather Data

### Local node identity + fleet configs

```bash
# Local identity
LOCAL_IDENTITY=$(curl -s --connect-timeout 3 http://localhost:3456/api/identity 2>/dev/null)
LOCAL_NODE=$(echo "$LOCAL_IDENTITY" | jq -r '.node // "unknown"')
echo "LOCAL_NODE=$LOCAL_NODE"

# Fleet configs (repo mappings)
LOCAL_FLEET=$(curl -s --connect-timeout 3 http://localhost:3456/api/fleet-config 2>/dev/null)
```

### Peer identities + fleet configs

```bash
# Read named peers from config
PEERS=$(jq -r '.namedPeers[]? | "\(.name)|\(.url)"' ~/.oracle/maw.config.json 2>/dev/null || jq -r '.namedPeers[]? | "\(.name)|\(.url)"' ~/.config/maw/maw.config.json 2>/dev/null)

# Fetch each peer's identity and fleet
while IFS='|' read -r peer_name peer_url; do
  [ -z "$peer_name" ] && continue
  PEER_IDENTITY=$(curl -s --connect-timeout 3 "$peer_url/api/identity" 2>/dev/null)
  PEER_FLEET=$(curl -s --connect-timeout 3 "$peer_url/api/fleet-config" 2>/dev/null)
  echo "PEER: $peer_name ($peer_url)"
  echo "$PEER_IDENTITY" | jq -r '.agents[]' 2>/dev/null
done <<< "$PEERS"
```

### Local tmux session status

```bash
maw ls 2>&1
```

## Step 2: Display Fleet Map

Combine all data into a table grouped by machine.

### Full format (`/fleet-map`)

```markdown
## 🗺️ Fleet Map

### 💻 mba (local) — 10.20.0.3:3456
| Agent | Session | Repo | Status |
|-------|---------|------|--------|
| mba-oracle | 114-mba | laris-co/mba-oracle | 🟢 active |
| federation-oracle | 113-federation | laris-co/federation-oracle | 🔴 shell |
| homekeeper | 11-homekeeper | laris-co/homekeeper-oracle | 🔴 shell |

### 🌕 white (peer) — white.wg:3456
| Agent | Session | Repo | Status |
|-------|---------|------|--------|
| mawjs | 08-mawjs | Soul-Brews-Studio/mawjs-oracle | 🟢 active |
| pulse | 09-pulse | Soul-Brews-Studio/pulse-oracle | 🔵 running |
| neo | — | — | 🔵 running |

**Nodes**: 2 | **Total agents**: 25 | **Active**: 3
```

### Status indicators

- 🟢 active — tmux window active + claude running (local only, from `maw ls`)
- 🔵 running — agent listed in node identity (remote, can't check tmux)
- 🔴 shell — tmux exists but no claude process (local only)
- ⚫ offline — node unreachable

### Compact format (`--compact`)

```
💻 mba: mba-oracle🟢 federation🔴 homekeeper🔴 nexus🔴 hermes🔴
🌕 white: mawjs🔵 pulse🔵 neo🔵 mother🔵 hermes🔵 fireman🔵 (+6 more)
```

### Repo resolution

Match agent names to repos using fleet configs:
1. Check local fleet dir: `~/.config/maw/fleet/*.json` → `.windows[].name` maps to `.windows[].repo`
2. Check fleet API: `GET /api/fleet-config` → same structure
3. If no fleet config match, show `—`

## Step 3: Summary

```markdown
---
**Federation Status**: [N] nodes, [N] agents, [N] active
**Last checked**: HH:MM GMT+7
```

## Notes

- Remote nodes only show agent names (from `/api/identity`). No tmux status available remotely.
- Fleet configs provide repo mappings. Agents without fleet entries show `—` for repo.
- If a peer is unreachable, show the node as ⚫ offline with last-known agent list if cached.
