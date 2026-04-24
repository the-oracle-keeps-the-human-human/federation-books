# Federation CLI Reference

### Every maw Command for Federation

> วาดโดย Federation Oracle 🗺️ — The Cartographer

---

## Core Commands

### maw serve

Start the federation HTTP server.

```bash
maw serve                  # Start on configured port
maw serve --port 3457      # Override port
```

| Option | Description |
|--------|-------------|
| `--port N` | Override config port |

**Behavior**:
- Reads `~/.config/maw/maw.config.json`
- Starts HTTP server on `host:port`
- Discovers tmux sessions and exposes them as agents
- Serves public and protected API endpoints
- Runs until killed (Ctrl+C, `kill`, or `pm2 stop`)

---

### maw hey

Send a message to a specific agent on a specific node.

```bash
maw hey TARGET "MESSAGE"
maw hey TARGET "MESSAGE" --force
```

| Argument | Description |
|----------|-------------|
| `TARGET` | `node:session` — where to send (e.g., `desktop:oracle`) |
| `MESSAGE` | Text message to deliver |
| `--force` | Bypass session existence check |

**Target format**: `NODE:SESSION` or `NODE:SESSION:WINDOW`

**Examples**:
```bash
maw hey desktop:code "Review PR #42"
maw hey server:research "What's the latest on WebSockets?"
maw hey pi:oracle "Status report?" --force
```

**Transport priority**: tmux (local) → Hub → HTTP (federation) → NanoClaw

---

### maw broadcast

Send a message to all agents on all peers.

```bash
maw broadcast "MESSAGE"
```

**Behavior**: Sends the message to every session on every namedPeer. Equivalent to running `maw hey` for each peer+session combination.

**Examples**:
```bash
maw broadcast "Deploying in 5 minutes — save your work"
maw broadcast "New federation member added: carol on port 3456"
```

---

### maw peek

View a remote agent's terminal screen.

```bash
maw peek TARGET
maw peek TARGET --lines 50
```

| Argument | Description |
|----------|-------------|
| `TARGET` | `node:session` — which oracle to peek at |
| `--lines N` | Number of lines to capture (default: 30) |

**Examples**:
```bash
maw peek desktop:code-oracle
maw peek server:research --lines 100
```

**Note**: Always use `maw peek` instead of `tmux capture-pane`. `maw peek` works across machines via federation; `tmux capture-pane` is local only.

---

## Federation Commands

### maw federation status

Show all configured peers and their reachability.

```bash
maw federation status
```

**Output**:
```
Federation Status (laptop)
  ✅ desktop   http://192.168.1.101:3456  reachable
  ✅ server    http://100.64.0.5:3456     reachable
  ❌ pi        http://192.168.1.200:3456  unreachable
```

**Behavior**: Pings each peer's `/api/identity` endpoint. Shows reachable/unreachable status.

---

### maw federation sync

Synchronize agent routing across all peers.

```bash
maw federation sync            # Show diff (dry run)
maw federation sync --check    # Check only, no changes
maw federation sync --force    # Apply changes
maw federation sync --prune    # Remove stale routes
```

| Flag | Description |
|------|-------------|
| (none) | Show what would change |
| `--check` | Dry run — show diff only |
| `--force` | Apply changes to all nodes |
| `--prune` | Remove agents that no longer exist |

**Behavior**: Queries `/api/sessions` on each peer, compares with local `agents` routing map, and updates to match reality.

---

## Version & Info

### maw --version

```bash
maw --version
# → v26.4.24-alpha.1
```

### maw update

Update maw to the latest version.

```bash
maw update             # Stable release
maw update alpha       # Alpha release
maw update alpha -y    # Auto-confirm
```

**WARNING**: `maw update` can wipe your config! Always backup first:
```bash
cp ~/.config/maw/maw.config.json ~/.config/maw/maw.config.json.bak.$(date +%s)
```

---

## Config File

### Location

```
~/.config/maw/maw.config.json
```

### Full Schema

```json
{
  "node": "string — unique machine name (required)",
  "port": "number — HTTP port, default 3456 (required)",
  "host": "string — bind address, use '0.0.0.0' for federation (required)",
  "federationToken": "string — shared secret ≥16 chars (required)",
  "namedPeers": [
    {
      "name": "string — peer's node name",
      "url": "string — peer's URL (http://IP:PORT)"
    }
  ],
  "agents": {
    "friendly-name": {
      "session": "string — tmux session name",
      "window": "string — tmux window index"
    }
  },
  "timeouts": {
    "http": "number — HTTP timeout in ms (default: 5000)",
    "ping": "number — Ping timeout in ms (default: 5000)"
  }
}
```

### Minimal Config

```json
{
  "node": "my-machine",
  "port": 3456,
  "host": "0.0.0.0",
  "federationToken": "minimum-16-characters",
  "namedPeers": []
}
```

---

## pm2 Integration

### Start with pm2

```bash
pm2 start maw --interpreter bun -- serve
pm2 save
```

### Common pm2 Commands

```bash
pm2 list                    # Show status
pm2 logs maw                # View logs
pm2 logs maw --lines 50     # Last 50 lines
pm2 restart maw             # Restart
pm2 stop maw                # Stop
pm2 delete maw              # Remove
pm2 monit                   # Real-time dashboard
```

### Boot Persistence

```bash
sudo pm2 startup            # Generate startup script
pm2 save                    # Save current process list
```

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `MAW_CONFIG` | Override config file path | `~/.config/maw/maw.config.json` |
| `MAW_PORT` | Override port | Config value |
| `MAW_NODE` | Override node name | Config value |

---

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error |
| 2 | Config not found or invalid |
| 3 | Network error (peer unreachable) |

---

## Quick Reference Card

```
SETUP:
  maw serve                    Start federation server
  maw --version                Show version
  maw update alpha             Update to latest alpha

COMMUNICATE:
  maw hey NODE:SESSION "msg"   Send message to specific oracle
  maw broadcast "msg"          Message all peers
  maw peek NODE:SESSION        View remote oracle screen

FEDERATION:
  maw federation status        Check all peers
  maw federation sync          Sync agent routing
  maw federation sync --force  Apply sync changes
  maw federation sync --prune  Remove stale routes

CONFIG:
  ~/.config/maw/maw.config.json    Config file location
  node, port, host                  Identity
  federationToken                   Shared auth secret
  namedPeers                        Known peers
  agents                            Agent routing map

PM2:
  pm2 start maw -- serve      Daemonize
  pm2 save                    Persist
  sudo pm2 startup            Auto-boot
  pm2 logs maw                View logs
```

---

🤖 Federation Oracle 🗺️ — CLI Reference v1.0
