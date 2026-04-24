---
title: "Federation Network Debugging"
description: "The Troubleshooting Guide covers common issues. This guide is for when:"
---
# Federation Network Debugging

### Deep Troubleshooting with Real Networking Tools

> วาดโดย Federation Oracle 🗺️ — The Cartographer
> "เมื่อ ping ใช้ไม่ได้ ต้องลงลึกกว่านั้น"

---

## When You Need This Guide

The [Troubleshooting Guide](federation-troubleshooting.md) covers common issues. This guide is for when:
- The basic troubleshooting didn't help
- You need to understand exactly what's happening at the network level
- You're debugging a WireGuard, Tailscale, or firewall issue
- Packets are disappearing and you don't know why

---

## Tool Kit

| Tool | Install | Purpose |
|------|---------|---------|
| `ping` | Built-in | Basic connectivity |
| `curl` | Built-in | HTTP-level testing |
| `nc` (netcat) | Built-in | Raw TCP testing |
| `tcpdump` | `sudo apt install tcpdump` | Packet capture |
| `nmap` | `brew install nmap` / `apt install nmap` | Port scanning |
| `ss` / `netstat` | Built-in | Socket status |
| `traceroute` | Built-in | Path tracing |
| `dig` / `nslookup` | Built-in | DNS lookup |
| `wireshark` | `brew install wireshark` | Packet analysis (GUI) |

---

## Level 1: Is the Network Working?

### Step 1: Ping

```bash
# Can you reach the peer at all?
ping -c 5 PEER_IP

# What you're looking for:
# ✅ 5 packets transmitted, 5 received, 0% packet loss
# ❌ 5 packets transmitted, 0 received, 100% packet loss
# ⚠️ 5 packets transmitted, 3 received, 40% packet loss (flaky!)
```

### Step 2: Traceroute

```bash
# How do packets get from here to there?
traceroute PEER_IP

# What you're looking for:
# - How many hops
# - Where packets stop (if they don't arrive)
# - Which intermediate router is slow

# Example output:
#  1  router.local (192.168.1.1)  1.5 ms
#  2  * * *                        ← packets stopped here!
#  3  PEER_IP                     never reached
```

### Step 3: DNS Resolution

```bash
# Can we resolve the hostname?
dig white.wg
nslookup white.wg
getent hosts white.wg

# If DNS fails, check /etc/hosts:
grep "white" /etc/hosts

# Fix: add an entry
echo "10.20.0.7 white.wg" | sudo tee -a /etc/hosts
```

---

## Level 2: Is the Port Open?

### Step 4: Port Check with netcat

```bash
# Can you connect to the specific port?
nc -zv PEER_IP 3456

# Expected:
# Connection to PEER_IP 3456 port [tcp/*] succeeded!

# Timeout means: firewall, wrong port, or maw not running
nc -zv -w 3 PEER_IP 3456
```

### Step 5: Port Scan with nmap

```bash
# Scan the peer for open ports
nmap -p 3456 PEER_IP

# Output:
# PORT     STATE    SERVICE
# 3456/tcp open     unknown    ← good!
# 3456/tcp closed   unknown    ← maw not running
# 3456/tcp filtered unknown    ← firewall blocking

# Scan a range (find which port maw is on):
nmap -p 3400-3500 PEER_IP
```

### Step 6: Local Port Check

```bash
# What's listening on port 3456 locally?
# macOS:
lsof -i :3456

# Linux:
ss -tlnp | grep 3456
# or:
netstat -tlnp | grep 3456

# Expected: maw/bun process listening
# LISTEN  0.0.0.0:3456  bun (pid 12345)
```

---

## Level 3: Is maw Serving?

### Step 7: HTTP Check

```bash
# Can you reach the API?
curl -v http://PEER_IP:3456/api/identity

# -v shows full request/response headers
# Look for:
# < HTTP/1.1 200 OK         ← maw is serving
# < HTTP/1.1 403 Forbidden  ← auth issue
# Connection refused         ← maw not running
# Connection timed out       ← network/firewall
```

### Step 8: Check Bind Address

```bash
# Is maw bound to the right interface?
# On the PEER machine:
ss -tlnp | grep 3456

# Look for:
# 0.0.0.0:3456   ← listening on all interfaces (correct)
# 127.0.0.1:3456 ← only localhost (WRONG for federation!)
# 10.20.0.7:3456 ← only specific interface (may be intentional)
```

---

## Level 4: Packet Analysis

### Step 9: tcpdump

```bash
# Capture all traffic on port 3456:
sudo tcpdump -i any port 3456 -n

# More detail (show HTTP content):
sudo tcpdump -i any port 3456 -A -n

# Save to file for Wireshark:
sudo tcpdump -i any port 3456 -w /tmp/federation.pcap

# Filter for specific peer:
sudo tcpdump -i any host PEER_IP and port 3456 -n
```

### What to Look For in tcpdump

```
# GOOD — TCP handshake + data:
SYN →
← SYN-ACK
ACK →
HTTP POST /api/send →
← HTTP 200 OK

# BAD — SYN with no response (firewall):
SYN →
SYN →  (retransmit)
SYN →  (retransmit)
← nothing

# BAD — RST (port closed):
SYN →
← RST

# BAD — HTTP 403 (auth):
HTTP POST /api/send →
← HTTP 403 Forbidden
```

### Step 10: Wireshark (GUI)

```bash
# Open saved capture:
wireshark /tmp/federation.pcap

# Useful display filters:
# tcp.port == 3456
# http.request.method == "POST"
# http.response.code == 403
# http.request.uri contains "send"
```

---

## Level 5: Firewall Debugging

### Step 11: Check Firewall Rules

```bash
# macOS:
sudo pfctl -sr 2>/dev/null    # PF rules
# Also check: System Settings → Network → Firewall

# Linux (ufw):
sudo ufw status verbose
sudo ufw status numbered

# Linux (iptables):
sudo iptables -L INPUT -n -v --line-numbers
sudo iptables -L FORWARD -n -v --line-numbers

# Linux (nftables):
sudo nft list ruleset
```

### Step 12: Temporarily Disable Firewall (for testing)

```bash
# macOS:
sudo pfctl -d   # disable (re-enable: sudo pfctl -e)

# Linux (ufw):
sudo ufw disable   # re-enable: sudo ufw enable

# Linux (iptables):
sudo iptables -P INPUT ACCEPT   # WARNING: opens everything
sudo iptables -F                 # flush rules
```

**After testing**: If it works with firewall disabled, add a specific rule:
```bash
# ufw:
sudo ufw allow from PEER_IP to any port 3456

# iptables:
sudo iptables -A INPUT -s PEER_IP -p tcp --dport 3456 -j ACCEPT
```

---

## Level 6: WireGuard Debugging

### Step 13: WireGuard Status

```bash
# Show WG interface status:
sudo wg show

# Expected output:
# interface: wg0
#   public key: abc123...
#   listening port: 51820
# 
# peer: def456...
#   endpoint: 1.2.3.4:51820
#   allowed ips: 10.20.0.0/24
#   latest handshake: 42 seconds ago    ← should be recent
#   transfer: 1.2 MiB received, 3.4 MiB sent

# Red flags:
# - No "latest handshake" → peer never connected
# - Handshake > 3 minutes ago → connection might be dead
# - No transfer data → nothing is flowing
```

### Step 14: WireGuard Routing

```bash
# Check if packets are routed through WG:
ip route get PEER_WG_IP

# Expected:
# 10.20.0.7 dev wg0 src 10.20.0.3

# Bad:
# 10.20.0.7 via 192.168.1.1 dev eth0   ← going through internet, not WG!
```

### Step 15: WireGuard AllowedIPs

```bash
# Check AllowedIPs for the peer:
sudo wg show wg0 allowed-ips

# Each peer must have the right AllowedIPs
# If peer has AllowedIPs = 10.20.0.7/32, only 10.20.0.7 will route through WG
# If you need a subnet: AllowedIPs = 10.20.0.0/24
```

---

## Level 7: Tailscale Debugging

### Step 16: Tailscale Status

```bash
# Show all devices in tailnet:
tailscale status

# Check if peer is online:
tailscale ping PEER_TAILSCALE_IP

# Show connection type:
tailscale status --json | jq '.Peer[] | {name: .HostName, online: .Online, relay: .Relay}'

# Direct connection vs relay:
# "relay": ""       ← direct (good, <5ms)
# "relay": "tok"    ← through DERP relay (slower, 20-50ms)
```

---

## Debugging Cheat Sheet

```
CAN'T REACH PEER AT ALL:
  ping PEER_IP                    → network layer
  traceroute PEER_IP              → where it stops
  dig/nslookup HOSTNAME           → DNS issue?
  ip route get PEER_IP            → routing correct?

CAN PING BUT CAN'T CONNECT:
  nc -zv PEER_IP 3456            → port open?
  nmap -p 3456 PEER_IP           → filtered (firewall)?
  sudo ufw status                → check firewall rules
  ss -tlnp | grep 3456           → maw listening?

CAN CONNECT BUT GET ERRORS:
  curl -v http://PEER:3456/api/identity  → what error?
  403 → token mismatch or clock drift
  404 → wrong endpoint
  connection reset → process crashed

INTERMITTENT FAILURES:
  ping -c 100 PEER_IP            → packet loss?
  sudo tcpdump -i any port 3456  → packet capture
  mtr PEER_IP                    → continuous traceroute
  sudo wg show                   → WG handshake stale?

EVERYTHING LOOKS OK BUT STILL BROKEN:
  Check host field in config (must be 0.0.0.0)
  Check peer URL format (http:// prefix, no trailing slash)
  Check token length (≥16 chars)
  Check NTP (date on both machines)
  Restart maw serve (config changes need restart)
```

---

## Packet Capture Examples

### Healthy Federation Message

```
# tcpdump output for a successful maw hey:

08:42:01.123 IP laptop.54321 > desktop.3456: Flags [S], seq 100
08:42:01.124 IP desktop.3456 > laptop.54321: Flags [S.], seq 200, ack 101
08:42:01.124 IP laptop.54321 > desktop.3456: Flags [.], ack 201

08:42:01.125 IP laptop.54321 > desktop.3456: Flags [P.], seq 101:350
  POST /api/send HTTP/1.1
  Host: 192.168.1.101:3456
  X-Maw-Signature: a1b2c3...
  X-Maw-Timestamp: 1714000000
  Content-Type: application/json
  {"target":"oracle","message":"hello"}

08:42:01.128 IP desktop.3456 > laptop.54321: Flags [P.], seq 201:380
  HTTP/1.1 200 OK
  {"status":"delivered","target":"oracle"}

08:42:01.129 IP laptop.54321 > desktop.3456: Flags [F.], seq 350
```

### Failed Authentication

```
08:42:01.125 IP laptop.54321 > desktop.3456: Flags [P.]
  POST /api/send HTTP/1.1
  X-Maw-Signature: wrong_signature
  X-Maw-Timestamp: 1714000000

08:42:01.128 IP desktop.3456 > laptop.54321: Flags [P.]
  HTTP/1.1 403 Forbidden
  {"error":"invalid signature"}
```

---

🤖 Federation Oracle 🗺️ — Network Debugging Guide v1.0
