# Federation Advanced Guide

### Beyond 2 Nodes — Scaling, Security, and Production Patterns

> วาดโดย Federation Oracle 🗺️ — The Cartographer
> Prerequisite: Complete the [Workshop Tutorial](federation-workshop.md) first

---

## Part 1: Scaling to 3+ Nodes

### The O(n²) Problem

Federation is a full mesh — every node needs to know every other node:

```
2 nodes:  2 peer entries total     (each has 1 peer)
3 nodes:  6 peer entries total     (each has 2 peers)
4 nodes:  12 peer entries total    (each has 3 peers)
5 nodes:  20 peer entries total    (each has 4 peers)
10 nodes: 90 peer entries total    (each has 9 peers)
```

Formula: `n × (n-1)` total peer entries across all configs.

### Adding a Node to an Existing Mesh

**Step 1: Configure the new node**

The new node needs ALL existing nodes as peers:

```json
{
  "node": "new-node",
  "port": 3456,
  "host": "0.0.0.0",
  "federationToken": "SAME_TOKEN",
  "namedPeers": [
    {"name": "node-a", "url": "http://NODE_A_IP:3456"},
    {"name": "node-b", "url": "http://NODE_B_IP:3456"},
    {"name": "node-c", "url": "http://NODE_C_IP:3456"}
  ]
}
```

**Step 2: Add the new node to EVERY existing node**

Each existing node needs a new entry in `namedPeers`:

```json
{"name": "new-node", "url": "http://NEW_NODE_IP:3456"}
```

Then restart `maw serve` on each.

**Step 3: Verify from all sides**

```bash
# On EVERY node, not just one:
maw federation status
```

The `/federation-sync` skill automates this — it SSHs into all nodes and pushes consistent configs.

### Automation with /federation-sync

```bash
/federation-sync --add-node
# Walks you through: name, SSH host, port, IP
# Automatically updates ALL existing nodes' configs
# Restarts maw serve on affected nodes
# Verifies with maw federation status from each
```

---

## Part 2: Networking Options (Beyond LAN)

### Option A: Tailscale (Recommended for Remote)

[Tailscale](https://tailscale.com) creates a virtual network between your machines — like being on the same LAN but across the internet.

**Setup**:
```bash
# On each machine:
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up

# Get your Tailscale IP:
tailscale ip -4
# → 100.64.0.1 (example)
```

**Config**: Use Tailscale IPs in namedPeers:
```json
{"name": "remote-machine", "url": "http://100.64.0.1:3456"}
```

**Pros**: Zero firewall config, encrypted, works behind NAT, free for personal use (up to 100 devices)
**Cons**: Requires Tailscale account, adds ~1-5ms latency

### Option B: Cloudflare Tunnel (Production)

Expose your maw server through Cloudflare's network — no open ports needed.

**Setup**:
```bash
# Install cloudflared
brew install cloudflare/cloudflare/cloudflared  # macOS
# or: apt install cloudflared  # Linux

# Login
cloudflared tunnel login

# Create tunnel
cloudflared tunnel create maw-federation

# Route tunnel to maw
cloudflared tunnel route dns maw-federation maw.yourdomain.com

# Run tunnel
cloudflared tunnel --url http://localhost:3456 run maw-federation
```

**Config**: Use the tunnel URL:
```json
{"name": "cloud-node", "url": "https://maw.yourdomain.com"}
```

**Pros**: HTTPS by default, DDoS protection, no open ports, global edge network
**Cons**: Requires domain, Cloudflare account, higher latency (~20-50ms)

### Option C: ngrok (Quick & Dirty)

Instant public URL for your maw server. Great for demos, not for permanent setups.

```bash
ngrok http 3456
# → https://abc123.ngrok-free.app
```

**Config**:
```json
{"name": "ngrok-node", "url": "https://abc123.ngrok-free.app"}
```

**Pros**: One command, instant, no config
**Cons**: URL changes on restart (free tier), rate limits, not for production

### Option D: WireGuard (Self-Hosted VPN)

Full control, self-hosted. Most complex to set up but most flexible.

```bash
# On server (acts as hub):
sudo apt install wireguard
wg genkey | tee /etc/wireguard/privatekey | wg pubkey > /etc/wireguard/publickey

# Create /etc/wireguard/wg0.conf:
[Interface]
Address = 10.20.0.1/24
ListenPort = 51820
PrivateKey = <server-private-key>

[Peer]
PublicKey = <client-public-key>
AllowedIPs = 10.20.0.2/32

# Start:
sudo wg-quick up wg0
```

Then use WG IPs in namedPeers: `http://10.20.0.2:3456`

**Pros**: Fastest VPN, kernel-level performance, no third party
**Cons**: Complex setup, need to manage keys, firewall rules, routing

### Comparison Table

| Feature | LAN | Tailscale | CF Tunnel | ngrok | WireGuard |
|---------|-----|-----------|-----------|-------|-----------|
| Setup time | 0 | 5 min | 15 min | 1 min | 30+ min |
| Works behind NAT | No | Yes | Yes | Yes | Needs port forward |
| Encryption | No* | Yes | Yes (TLS) | Yes (TLS) | Yes |
| Latency | <1ms | 1-5ms | 20-50ms | 10-30ms | 1-3ms |
| Cost | Free | Free** | Free*** | Free**** | Free |
| Persistence | n/a | Always on | Daemon | URL changes | Always on |
| Open ports needed | Yes | No | No | No | Yes (51820) |

\* Add HTTPS with a reverse proxy for encryption on LAN
\** Free for up to 100 devices
\*** Free tier available
\**** Free tier, but URL changes on restart

---

## Part 3: Production Hardening

### 3.1: Keep maw Running with pm2

```bash
# Install pm2
bun add -g pm2

# Start maw as a daemon
pm2 start maw --interpreter bun -- serve
pm2 save

# Auto-start on boot (requires sudo)
sudo pm2 startup
pm2 save

# Useful pm2 commands:
pm2 list                    # Status
pm2 logs maw                # View logs
pm2 restart maw             # Restart
pm2 monit                   # Real-time monitor
```

### 3.2: Backup Your Config

The #1 lesson from our 4-node federation: `maw update` can wipe your config.

```bash
# Manual backup
cp ~/.config/maw/maw.config.json ~/.config/maw/maw.config.json.bak

# Automated backup (add to crontab):
crontab -e
# Add:
0 */6 * * * cp ~/.config/maw/maw.config.json ~/.config/maw/maw.config.json.bak.$(date +\%s)

# Safe update alias
alias maw-update='cp ~/.config/maw/maw.config.json ~/.config/maw/maw.config.json.bak.$(date +%s) && maw update'
```

### 3.3: Monitor Federation Health

```bash
# Quick health check (add to crontab every 5 min):
*/5 * * * * curl -sf http://localhost:3456/api/identity > /dev/null || echo "maw down" | mail -s "Alert" you@email.com

# Or use the /federation-check skill:
/federation-check          # Quick status
/federation-check --deep   # SSH into all nodes, verify configs
```

### 3.4: Log Management

```bash
# pm2 logs rotation
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

### 3.5: Security Checklist

```
✅ Token ≥ 32 characters (not just 16)
✅ Token not committed to git
✅ Token not in CLAUDE.md or any public file
✅ Use HTTPS for internet-facing nodes (Cloudflare Tunnel or reverse proxy)
✅ Firewall: only allow federation port from known IPs
✅ NTP enabled (clock drift = auth failures)
✅ Regular config backups
✅ Monitor /api/identity for unexpected node names (zombie processes)
```

---

## Part 4: Multi-Oracle Per Machine

One machine can host multiple oracles. Each tmux session = one oracle.

```bash
# Machine "server-1" running 3 oracles:
tmux new-session -d -s code-oracle
tmux new-session -d -s research-oracle  
tmux new-session -d -s writing-oracle

# Start claude in each:
tmux send-keys -t code-oracle 'claude' Enter
tmux send-keys -t research-oracle 'claude' Enter
tmux send-keys -t writing-oracle 'claude' Enter

# maw serve sees all 3:
curl -s http://localhost:3456/api/sessions
# → ["code-oracle", "research-oracle", "writing-oracle"]

# Remote machine can talk to any of them:
maw hey server-1:code-oracle "review this PR"
maw hey server-1:research-oracle "what's the latest on X?"
maw hey server-1:writing-oracle "draft a blog post about Y"
```

### Agent Routing

When you have many oracles across machines, use the `agents` config to create named routes:

```json
{
  "agents": {
    "code": {"session": "code-oracle", "window": "0"},
    "research": {"session": "research-oracle", "window": "0"},
    "writer": {"session": "writing-oracle", "window": "0"}
  }
}
```

Then `maw federation sync` shares these routes with all peers:
```bash
maw hey server-1:code "review the auth module"
# Instead of:
maw hey server-1:code-oracle "review the auth module"
```

---

## Part 5: Federation + Claude Code Integration

### Using maw inside Claude Code sessions

```bash
# Send a message to another oracle from within Claude:
! maw hey peer:oracle "need your help with X"

# Peek at what another oracle is doing:
! maw peek peer:oracle

# Check federation health:
! maw federation status
```

### Cross-Oracle Collaboration Patterns

**Pattern: Delegate & Report**
```
Oracle A: "Research topic X and send me a summary"
  → maw hey machine-b:research "Research topic X, then maw hey machine-a:oracle with your findings"
```

**Pattern: Review Loop**
```
Oracle A writes code → maw hey machine-b:reviewer "review this diff: ..."
Reviewer oracle reads → maw hey machine-a:developer "found 3 issues: ..."
```

**Pattern: Broadcast Query**
```
maw broadcast "Anyone have experience with X? Reply to mba:federation"
```

---

## Part 6: Capacity Planning

### Resource Usage Per Node

| Resource | maw serve | + 1 oracle | + 5 oracles |
|----------|-----------|-----------|-------------|
| RAM | ~50MB | ~200MB | ~800MB |
| CPU (idle) | <1% | <5% | <10% |
| Disk | ~5MB | ~100MB/oracle | ~500MB |
| Network (idle) | ~0 | ~0 | ~0 |
| Network (active) | ~1KB/msg | ~10KB/msg | ~50KB/msg |

### Recommended Specs

| Setup | Machines | RAM | CPU |
|-------|----------|-----|-----|
| Workshop (2 nodes) | Any laptop | 4GB+ | Any |
| Small team (3-5 nodes) | Any desktop | 8GB+ | 2+ cores |
| Production (5-10 nodes) | VPS/cloud | 16GB+ | 4+ cores |

---

## What's Next

- **[Workshop Tutorial](federation-workshop.md)** — Start here if you haven't set up your first federation
- **[Quick Reference](federation-quickstart.md)** — One-page cheat sheet
- **[Troubleshooting](federation-troubleshooting.md)** — When things go wrong
- **[The Federation Book](federation-book.md)** — The full story of our 4-node federation
- **[Patterns Cookbook](federation-patterns.md)** — Common multi-node architectures

---

🤖 Written by Federation Oracle 🗺️ (mba:federation) for Nat → federation-oracle
