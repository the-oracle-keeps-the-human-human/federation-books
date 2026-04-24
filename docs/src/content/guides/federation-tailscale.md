---
title: "Federation over Tailscale"
description: "Use case: You have 2+ machines on different networks (home, office, cloud) and want them to federate without touching routers or port forwarding."
---
# Federation over Tailscale

> 🗺️ Tailscale-specific guide — จาก install ถึง federation ข้ามเครื่อง ไม่ต้องเปิด port, ไม่ต้องตั้ง firewall

**Use case**: You have 2+ machines on different networks (home, office, cloud) and want them to federate without touching routers or port forwarding.

---

## Why Tailscale for Federation?

| Concern | Without Tailscale | With Tailscale |
|---------|-------------------|----------------|
| Port forwarding | Required on every router | Not needed |
| Firewall rules | Must open 3456 manually | Automatic |
| NAT traversal | Doesn't work | Built-in (DERP relay) |
| Encryption | HTTP in cleartext on LAN | WireGuard encryption |
| DNS | Use raw IPs or mDNS | MagicDNS names |
| Cost | Free | Free up to 100 devices |

Tailscale wraps WireGuard into a zero-config overlay network. Each machine gets a stable `100.x.y.z` IP that works anywhere.

---

## Step 1: Install Tailscale on Every Node

### macOS

```bash
brew install --cask tailscale
# Or download from https://tailscale.com/download/mac
```

Open Tailscale from the menu bar and sign in.

### Linux (Ubuntu/Debian)

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```

### Raspberry Pi

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up

# Verify
tailscale status
```

### Verify on each machine

```bash
# Your Tailscale IP
tailscale ip -4
# → 100.64.0.1

# See all machines
tailscale status
# → machine-a   100.64.0.1   macOS   ...
# → machine-b   100.64.0.2   linux   ...
```

---

## Step 2: Test Connectivity

Before configuring federation, verify raw connectivity:

```bash
# From machine A, ping machine B's Tailscale IP
ping 100.64.0.2

# Test that maw serve port is reachable
curl -s http://100.64.0.2:3456/api/identity | jq '.'
```

If `maw serve` isn't running on machine B yet:

```bash
# On machine B
maw serve
```

---

## Step 3: Configure Federation with Tailscale IPs

### On machine A (`~/.oracle/maw.config.json` or `~/.config/maw/maw.config.json`)

```json
{
  "node": "machine-a",
  "port": 3456,
  "host": "0.0.0.0",
  "federationToken": "your-shared-secret-min-16-chars",
  "namedPeers": [
    { "name": "machine-b", "url": "http://100.64.0.2:3456" }
  ]
}
```

### On machine B

```json
{
  "node": "machine-b",
  "port": 3456,
  "host": "0.0.0.0",
  "federationToken": "your-shared-secret-min-16-chars",
  "namedPeers": [
    { "name": "machine-a", "url": "http://100.64.0.1:3456" }
  ]
}
```

Restart `maw serve` on both after config changes.

---

## Step 4: Using MagicDNS Instead of IPs

Tailscale provides MagicDNS — each machine gets a DNS name like `machine-a.tailnet-name.ts.net`.

### Enable MagicDNS

1. Go to [Tailscale Admin Console](https://login.tailscale.com/admin/dns)
2. Enable MagicDNS
3. Each machine now has a DNS name

### Use DNS names in config

```json
{
  "namedPeers": [
    { "name": "machine-b", "url": "http://machine-b.tailnet-abc.ts.net:3456" }
  ]
}
```

**Shorter alternative**: Tailscale also resolves just the machine name if MagicDNS is enabled:

```json
{ "name": "machine-b", "url": "http://machine-b:3456" }
```

---

## Step 5: Verify Federation

```bash
# Check status
maw federation status

# Send a test message
maw hey machine-b:agent-name "สวัสดีจาก machine-a ผ่าน Tailscale!"

# Peek at remote
maw peek machine-b:agent-name
```

---

## Tailscale-Specific Tips

### ACLs for Federation

If you use Tailscale ACLs, make sure port 3456 is allowed between federation nodes:

```json
{
  "acls": [
    {
      "action": "accept",
      "src": ["tag:oracle"],
      "dst": ["tag:oracle:3456"]
    }
  ],
  "tagOwners": {
    "tag:oracle": ["autogroup:admin"]
  }
}
```

Tag your machines:
```bash
sudo tailscale up --advertise-tags=tag:oracle
```

### Subnet Routing

If some machines can't run Tailscale (e.g. IoT devices, old servers), use a subnet router:

```bash
# On a machine that CAN run Tailscale and is on the same LAN as the target
sudo tailscale up --advertise-routes=192.168.1.0/24
```

Then approve the route in the admin console. Other Tailscale nodes can now reach `192.168.1.x` through the router.

### Exit Nodes

Not needed for federation — exit nodes route internet traffic, but federation only needs machine-to-machine connectivity.

### Key Expiry

Tailscale keys expire by default. For always-on federation nodes, disable key expiry:

1. Tailscale Admin Console → Machines
2. Click the machine → Disable key expiry

Or via CLI:
```bash
sudo tailscale up --auth-key=tskey-auth-xxxxx  # use a pre-auth key with no expiry
```

---

## Tailscale vs WireGuard: When to Choose Which

| Feature | Tailscale | WireGuard (self-hosted) |
|---------|-----------|------------------------|
| Setup time | 5 minutes | 30+ minutes |
| Config management | Automatic | Manual key exchange |
| NAT traversal | Built-in (DERP) | Requires open port or STUN |
| DNS | MagicDNS included | Manual or separate DNS |
| ACLs | Web UI | iptables/nftables |
| Performance | ~1-5ms overhead | ~0.5-1ms overhead |
| Dependencies | Tailscale account | None (kernel module) |
| Privacy | Traffic metadata visible to Tailscale | Fully self-hosted |
| Best for | Quick setup, remote teams | Privacy, max performance, homelab |

**Rule of thumb**: Start with Tailscale. Switch to WireGuard only if you need full self-hosting or sub-millisecond latency.

---

## Troubleshooting Tailscale + Federation

### "Connection refused" on Tailscale IP

```bash
# Is maw serve running?
curl -s http://localhost:3456/api/identity

# Is it bound to all interfaces?
# Config must have "host": "0.0.0.0", NOT "localhost"
grep host ~/.oracle/maw.config.json
```

### "HMAC signature invalid"

```bash
# Clock skew? Check both machines
date -u
ssh machine-b 'date -u'

# Tailscale doesn't affect clocks, but VMs sometimes drift
# Fix: enable NTP
sudo timedatectl set-ntp true  # Linux
```

### High latency (>100ms)

```bash
# Check if traffic is going through DERP relay (indirect route)
tailscale netcheck

# Direct connection is faster — check for NAT issues
tailscale ping machine-b
# Look for "via DERP" vs "pong from" (direct)
```

If using DERP relay, latency will be higher. To force direct connections:
- Ensure UDP 41641 is open on at least one side
- Try `tailscale up --netfilter-mode=off` on Linux

### MagicDNS not resolving

```bash
# Check if MagicDNS is enabled
tailscale dns status

# Fallback: use the raw Tailscale IP
tailscale ip -4 machine-b
```

---

## Example: 3-Node Federation over Tailscale

```
MacBook (home)          Server (cloud)         RPi (office)
100.64.0.1              100.64.0.2             100.64.0.3
  │                       │                      │
  └───── Tailscale mesh ──┼──────────────────────┘
         (encrypted)      │
                     Full mesh peers
```

Each node's config lists the other two:

```bash
# Quick setup on all 3
TOKEN=$(openssl rand -hex 16)
echo "Share this token with all nodes: $TOKEN"
```

After setup, any oracle on any machine can talk to any other:

```bash
maw hey cloud-server:agent "deploy the new version"
maw peek office-rpi:sensor-oracle
maw broadcast "ประชุมทีม 15 นาที!"
```

---

> 🤖 เขียนโดย mba oracle จาก Nat → mba-oracle
> อ้างอิง: Tailscale docs, federation-advanced.md, ประสบการณ์จริง mba↔white (WireGuard) setup
