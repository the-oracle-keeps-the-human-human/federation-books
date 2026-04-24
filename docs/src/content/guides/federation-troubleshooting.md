---
title: "Federation Troubleshooting Guide"
description: "maw federation status shows \"unreachable\"?"
---
# Federation Troubleshooting Guide

### Every Problem We Hit (and How We Fixed It)

> วาดโดย Federation Oracle 🗺️ — The Cartographer
> Based on real failures from the MBA/white/oracle-world/clinic-nat federation (23-24 April 2026)

---

## Quick Diagnosis Flowchart

```
maw federation status shows "unreachable"?
│
├─ Can you ping the peer IP?
│  ├─ No  → Network issue (§1)
│  └─ Yes → Can you curl http://PEER_IP:PORT/api/identity?
│           ├─ No  → maw not running or port blocked (§2)
│           └─ Yes → Config mismatch (§3)
│
maw hey returns 403?
│
└─ Token mismatch (§4)
│
maw hey returns "target not found"?
│
└─ Oracle not visible to maw serve (§5)
│
maw hey times out?
│
└─ Slow network or wrong bind address (§6)
│
maw update wiped my config?
│
└─ Config recovery (§7)
```

---

## §1: Network Issues — "I Can't Ping the Peer"

### Symptoms
```bash
ping PEER_IP
# → Request timeout / Destination host unreachable
```

### Causes & Fixes

| Cause | How to Check | Fix |
|-------|-------------|-----|
| Wrong IP | `ip addr` or `ifconfig` on peer | Update namedPeers with correct IP |
| Different networks | Check subnet masks match | Same WiFi, or use Tailscale |
| WiFi isolation | Some routers block device-to-device | Turn off AP isolation, or use ethernet |
| Firewall (peer) | `sudo ufw status` (Linux), System Settings → Firewall (macOS) | Allow port 3456 |
| VPN interfering | Check if VPN routes override local traffic | Disconnect VPN or add exception |

### Real Example: Clinic-nat Subnet Isolation

We had two WireGuard subnets (10.20.x and 10.10.x) that couldn't see each other. Clinic-nat's packets leaked to the public internet instead of routing through WireGuard.

**Fix**: Used MBA as an IP relay between subnets. For the workshop, avoid this complexity — use same LAN or Tailscale.

---

## §2: Port/Service Issues — "Ping Works, Curl Doesn't"

### Symptoms
```bash
ping PEER_IP         # ✅ works
curl http://PEER_IP:3456/api/identity  # ❌ Connection refused
```

### Causes & Fixes

| Cause | How to Check | Fix |
|-------|-------------|-----|
| maw serve not running | `ps aux | grep maw` on peer | Start `maw serve` |
| Wrong port | `jq .port ~/.config/maw/maw.config.json` | Match port in config and namedPeers |
| Port in use by another process | `lsof -i :3456` | Kill the other process, or change port |
| maw not in PATH | `which maw` | `ln -sf /path/to/maw-js/src/cli.ts ~/.bun/bin/maw` |

### Real Example: Oracle-world Zombie Process

`pm2 list` showed maw as "online" but it was serving with the wrong node identity ("white" instead of "oracle-world"). Old process from a previous config.

**Fix**: 
```bash
pm2 delete maw
pm2 start maw --interpreter bun -- serve
pm2 save
```

---

## §3: Config Issues — "Curl Works, But maw Says Unreachable"

### Symptoms
```bash
curl http://PEER_IP:3456/api/identity  # ✅ returns JSON
maw federation status                   # ❌ shows "unreachable"
```

### Causes & Fixes

| Cause | How to Check | Fix |
|-------|-------------|-----|
| namedPeers URL wrong | `jq '.namedPeers' ~/.config/maw/maw.config.json` | Fix URL (IP, port, protocol) |
| Using hostname without DNS | Try `getent hosts PEER.wg` | Use IP instead of hostname |
| Protocol missing | Check for `http://` prefix | URLs must start with `http://` |
| Trailing slash | Check URL format | Remove trailing slash |

### Real Example: MBA Missing DNS

`getent hosts white.wg` returned nothing on MBA — no /etc/hosts entry for the WireGuard hostnames.

**Fix**: Added entries to `/etc/hosts`:
```
10.20.0.7    white.wg
10.20.0.16   oracle-world.wg
10.20.0.1    clinic.wg
```

Or simpler: use raw IPs in namedPeers instead of hostnames.

---

## §4: Authentication — "403 Forbidden"

### Symptoms
```bash
maw hey peer:oracle "hello"
# → 403 Forbidden
```

### Causes & Fixes

| Cause | How to Check | Fix |
|-------|-------------|-----|
| Different tokens | Compare `jq '.federationToken'` on both machines | Make them identical |
| Token too short | `jq '.federationToken | length'` | Must be ≥16 characters |
| Empty token | `jq '.federationToken'` shows `""` | Set a real token |
| Clock drift >5 min | `date` on both machines | Sync with NTP: `sudo ntpdate -s time.nist.gov` |

### Real Example: maw update Wiped Token

`maw update alpha -y` on white reset `federationToken` to `""`. Every request failed with 403.

**Fix**: Re-set the token:
```bash
jq '.federationToken = "YOUR_TOKEN_HERE"' ~/.config/maw/maw.config.json > /tmp/maw.json \
  && mv /tmp/maw.json ~/.config/maw/maw.config.json
```

**Prevention**: ALWAYS backup before updating:
```bash
cp ~/.config/maw/maw.config.json ~/.config/maw/maw.config.json.bak.$(date +%s)
```

---

## §5: Target Issues — "Target Not Found"

### Symptoms
```bash
maw hey peer:my-oracle "hello"
# → target "my-oracle" not found on peer
```

### Causes & Fixes

| Cause | How to Check | Fix |
|-------|-------------|-----|
| Oracle not in tmux | `tmux ls` on peer | Start claude in tmux: `tmux new -s my-oracle` |
| maw serve can't see tmux | `curl http://localhost:PORT/api/sessions` | pm2 env issue — use `--force` flag |
| Wrong session name | `curl http://PEER:PORT/api/sessions` | Check actual session names |
| Agent routing stale | `jq '.agents' ~/.config/maw/maw.config.json` | `maw federation sync` to refresh |

### Real Example: pm2 maw Can't See tmux

MBA's pm2-launched maw returned 0 sessions from `/api/sessions` because pm2 starts processes in a clean environment without tmux socket access.

**Fix**: Use `--force` flag to bypass session check:
```bash
maw hey peer:oracle "hello" --force
```

---

## §6: Timeout Issues — "Request Timed Out"

### Symptoms
```bash
maw hey peer:oracle "hello"
# → timeout after 5s (or 10s)
```

### Causes & Fixes

| Cause | How to Check | Fix |
|-------|-------------|-----|
| `host: "local"` or `"localhost"` | `jq '.host'` on peer | Change to `"0.0.0.0"` |
| Slow network (WG, long hops) | `ping -c 5 PEER_IP` (check latency) | Increase timeout in config |
| Bun HTTP client bug | `curl` works but `maw` doesn't | Known issue with `curlFetch` — file a bug |
| DNS resolution slow | Try IP instead of hostname | Use raw IPs in namedPeers |

### Increasing Timeout

Add to your `maw.config.json`:
```json
{
  "timeouts": {
    "http": 10000,
    "ping": 10000
  }
}
```

Default is 5000ms (5 seconds). For slow connections, 10000ms (10s) is safer.

### Real Example: MBA `host: "local"`

MBA's config had `"host": "local"` — maw serve only listened on localhost. Other machines could ping MBA but couldn't reach the maw server.

**Fix**: Changed to `"host": "0.0.0.0"` and restarted maw serve.

---

## §7: Config Recovery — "maw update Wiped Everything"

### Symptoms
After `maw update alpha -y`:
```bash
jq . ~/.config/maw/maw.config.json
# → namedPeers: [], agents: {}, federationToken: ""
```

### Recovery Steps

**If you have a backup:**
```bash
# Find the latest backup
ls -t ~/.config/maw/maw.config.json.bak.* | head -1
# Restore it
cp BACKUP_FILE ~/.config/maw/maw.config.json
```

**If another node still has your config info:**
```bash
# From a working node, push the token:
TOKEN=$(jq -r '.federationToken' ~/.config/maw/maw.config.json)
echo "Token: $TOKEN"
# Copy to the affected node

# Rebuild namedPeers from another node's config:
jq '.namedPeers' ~/.config/maw/maw.config.json
# Adapt for the target node
```

**If you have nothing:**
```bash
# Generate new token
openssl rand -hex 16
# → must update ALL nodes with the new token

# Rebuild config from scratch
# Use /federation-workshop to guide you
```

### Prevention

```bash
# Add this alias:
alias maw-update='cp ~/.config/maw/maw.config.json ~/.config/maw/maw.config.json.bak.$(date +%s) && maw update'
```

---

## Diagnostic Commands Cheat Sheet

```bash
# ── Local checks ──
maw --version                              # Version
maw federation status                       # Peer status
curl -s http://localhost:3456/api/identity  # Node identity
curl -s http://localhost:3456/api/sessions  # Local oracles
jq . ~/.config/maw/maw.config.json         # Full config
lsof -i :3456                              # What's on the port
tmux ls                                    # Active sessions

# ── Remote checks ──
ping PEER_IP                               # Network reachable?
curl -s http://PEER_IP:3456/api/identity   # maw running?
curl -s http://PEER_IP:3456/api/sessions   # Remote oracles?
ssh USER@PEER 'pm2 list | grep maw'        # pm2 status?
ssh USER@PEER 'jq .node ~/.config/maw/maw.config.json'  # Node name?

# ── Federation operations ──
maw hey PEER:SESSION "test"                # Send message
maw hey PEER:SESSION "test" --force        # Force send (bypass check)
maw peek PEER:SESSION                      # View remote screen
maw broadcast "test"                       # Message all peers
maw federation sync                        # Sync agent routing
maw federation sync --check                # Dry-run sync
```

---

## The Golden Rules of Federation Debugging

1. **Test from BOTH sides.** "A can reach B" doesn't mean "B can reach A." Always run `maw federation status` from every node.

2. **Check the simplest thing first.** Before blaming WireGuard, check if `maw serve` is actually running.

3. **Use IPs, not hostnames** (when debugging). Hostnames add a DNS layer that can fail silently.

4. **`host` must be `"0.0.0.0"`**. This is the #1 mistake. "local" = only localhost can connect.

5. **Tokens must match exactly**. One character off = 403 on every request.

6. **Backup before `maw update`**. It can wipe your config. Always.

7. **Use `maw peek`, never `tmux capture-pane`**. The federation-native way works across machines.

---

🤖 Written by Federation Oracle 🗺️ (mba:federation) for Nat → federation-oracle
