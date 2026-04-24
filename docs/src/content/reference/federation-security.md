# Federation Security Guide

### Protecting Your Oracle Mesh — From Token Management to Production Hardening

> วาดโดย Federation Oracle 🗺️ — The Cartographer
> "ประตูที่เปิดกว้างไม่ต้องการกุญแจ แต่ประตูที่ล็อคต้องมีกุญแจที่แข็งแรง"

---

## Threat Model

Before hardening, understand what you're protecting:

```
┌─────────────────────────────────────────────────────────────┐
│ WHAT WE'RE PROTECTING                                       │
│                                                             │
│  • Oracle conversations (potentially sensitive)             │
│  • Command execution (oracles can run code)                 │
│  • System access (oracles have shell access)                │
│  • Federation topology (who's connected to whom)            │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ ATTACK VECTORS                                              │
│                                                             │
│  1. Token theft → impersonate a node                        │
│  2. Network sniffing → read messages in transit             │
│  3. Replay attack → re-send captured requests               │
│  4. Session enumeration → list oracles via public endpoints │
│  5. Message injection → send commands to oracles            │
│  6. Clock manipulation → bypass timestamp window            │
└─────────────────────────────────────────────────────────────┘
```

---

## Layer 1: Token Security

### Token Generation

```bash
# GOOD: cryptographically random, 32 hex chars (128 bits)
openssl rand -hex 16

# BETTER: 64 hex chars (256 bits)
openssl rand -hex 32

# BAD: predictable, short, dictionary words
# "password123" ← NEVER
# "my-federation" ← NEVER
# "test" ← NEVER
```

### Token Storage

```
✅ DO:
  - Store in ~/.config/maw/maw.config.json (user-readable only)
  - chmod 600 ~/.config/maw/maw.config.json
  - Keep a backup in a password manager (1Password, Bitwarden)

❌ DON'T:
  - Commit to git (check .gitignore!)
  - Put in CLAUDE.md or any checked-in file
  - Share via Slack, email, or unencrypted channels
  - Put in environment variables (visible in /proc)
  - Log to stdout/stderr
```

### Token Rotation

Rotate tokens periodically or after any suspected compromise:

```bash
# 1. Generate new token
NEW_TOKEN=$(openssl rand -hex 16)

# 2. Update on ALL nodes (must be simultaneous — plan for downtime)
# Machine A:
jq ".federationToken = \"$NEW_TOKEN\"" ~/.config/maw/maw.config.json > /tmp/cfg.json
mv /tmp/cfg.json ~/.config/maw/maw.config.json

# Machine B (via SSH):
ssh user@machine-b "jq '.federationToken = \"$NEW_TOKEN\"' ~/.config/maw/maw.config.json > /tmp/cfg.json && mv /tmp/cfg.json ~/.config/maw/maw.config.json"

# 3. Restart maw on all nodes
pm2 restart maw  # or kill + maw serve

# 4. Verify
maw federation status
```

**Rotation schedule**:
| Environment | Frequency |
|-------------|-----------|
| Workshop/demo | Never (short-lived) |
| Personal | Every 3 months |
| Team | Monthly |
| Production | Weekly + after any incident |

### Token Compromise Response

If you suspect your token was leaked:

1. **Immediately** generate a new token
2. Update ALL nodes (old token = old trust)
3. Review logs for unauthorized access
4. Check if any unexpected messages were delivered
5. Audit who had access to the old token

---

## Layer 2: Transport Security

### HTTP vs HTTPS

maw federation uses **plain HTTP** by default. This means:

```
What's protected:                What's NOT protected:
✅ Request authenticity (HMAC)   ❌ Message confidentiality
✅ Request integrity (HMAC)      ❌ Message privacy
✅ Replay resistance (±5min)     ❌ Metadata (who talks to whom)
```

### When Plain HTTP Is Acceptable

- Same LAN (WiFi at home/office)
- WireGuard tunnel (already encrypted)
- Tailscale (already encrypted)
- Air-gapped network

### When You Need HTTPS

- Public internet (ngrok, Cloudflare Tunnel)
- Untrusted WiFi (coffee shops, conferences)
- Compliance requirements
- When message content is sensitive

### Adding HTTPS

**Option A: Cloudflare Tunnel (easiest)**
```bash
cloudflared tunnel --url http://localhost:3456 run my-tunnel
# → https://my-tunnel.trycloudflare.com
# Peer URL: https://my-tunnel.trycloudflare.com
```

**Option B: nginx reverse proxy**
```nginx
server {
    listen 443 ssl;
    server_name maw.yourdomain.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    location / {
        proxy_pass http://localhost:3456;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

**Option C: ngrok**
```bash
ngrok http 3456
# → https://abc123.ngrok-free.app (auto-HTTPS)
```

---

## Layer 3: HMAC Deep Dive

### How HMAC-SHA256 Works in Federation

```
SENDER (Machine A):
  1. Constructs message string: "POST:/api/send:1714000000"
                                 ^^^   ^^^^^^^^^  ^^^^^^^^^^
                                method   path     unix epoch
  
  2. Computes: HMAC-SHA256(federationToken, message_string)
  
  3. Sends HTTP request with headers:
     X-Maw-Signature: <computed signature>
     X-Maw-Timestamp: 1714000000

RECEIVER (Machine B):
  1. Extracts signature and timestamp from headers
  2. Checks: |now - timestamp| ≤ 300 seconds (5 minutes)?
     → If no: REJECT (403) — too old or too new
  3. Reconstructs: expected = HMAC-SHA256(myToken, "POST:/api/send:1714000000")
  4. Compares: received_signature === expected?
     → If no: REJECT (403) — wrong token or tampered
  5. If both pass: ACCEPT — request is authentic
```

### What HMAC Protects Against

| Attack | Protected? | How |
|--------|-----------|-----|
| Unauthorized sender | ✅ | Wrong token → wrong signature |
| Message tampering | ✅ | Changed path/method → wrong signature |
| Replay (>5 min) | ✅ | Timestamp too old → rejected |
| Replay (<5 min) | ⚠️ Partial | Window exists — mitigated by idempotency |
| Eavesdropping | ❌ | HMAC doesn't encrypt (use HTTPS) |
| Token brute-force | ✅ | 128-bit token = infeasible |

### Clock Synchronization

HMAC requires clocks within ±5 minutes. If clocks drift:

```bash
# Check clock difference:
echo "Local: $(date +%s)"
ssh user@peer "echo Remote: \$(date +%s)"
# Difference should be <300 seconds

# Fix with NTP:
sudo ntpdate -s time.nist.gov

# Permanent fix:
# macOS: System Settings → Date & Time → Set automatically
# Linux: sudo timedatectl set-ntp true
# Linux (older): sudo systemctl enable --now ntpd
```

---

## Layer 4: Endpoint Security

### Public Endpoints (No Auth Required)

These endpoints are **readable by anyone** who can reach your maw server:

| Endpoint | Exposes | Risk |
|----------|---------|------|
| `GET /api/identity` | Node name, version, uptime, clock | Low — operational info |
| `GET /api/sessions` | List of tmux session names | Medium — reveals oracle names |
| `GET /api/capture` | Terminal screen preview | High — shows conversation content |

### Hardening Public Endpoints

**Option A: Firewall (recommended)**
```bash
# Linux — only allow from known IPs:
sudo ufw allow from 192.168.1.0/24 to any port 3456
sudo ufw deny 3456

# macOS — use pf or application firewall
```

**Option B: Reverse proxy with IP allowlist**
```nginx
location /api/ {
    allow 192.168.1.0/24;
    allow 10.20.0.0/24;
    deny all;
    proxy_pass http://localhost:3456;
}
```

**Option C: Bind to specific interface** (if no public access needed)
```json
{
  "host": "10.20.0.3"
}
```
Only binds to the WireGuard interface, not public-facing ones.

### Protected Endpoints (HMAC Required)

These require a valid HMAC signature:
- `POST /api/send` — send message to agent
- `POST /api/talk` — interactive talk
- `POST /api/feed` — publish feed event

Even if an attacker can reach these endpoints, they can't call them without the token.

---

## Layer 5: Operational Security

### Principle of Least Privilege

```
❌ Bad: All 10 developers share one federation token
✅ Good: Team of 3 devs shares a token; other teams have separate federations

❌ Bad: All oracles can reach all other oracles
✅ Good: Production oracles are on a separate federation from dev

❌ Bad: Federation port open to 0.0.0.0/0 (entire internet)
✅ Good: Port only open to specific IPs or VPN subnet
```

### Logging & Monitoring

```bash
# Monitor federation access (pm2 logs):
pm2 logs maw --lines 100 | grep -E '(403|401|error|reject)'

# Watch for:
# - Repeated 403s (token brute-force attempt)
# - Unknown source IPs
# - Requests outside normal hours
# - Unusual API patterns (many /api/capture calls)
```

### Incident Response Checklist

If you suspect a security incident:

```
□ 1. Rotate federation token on ALL nodes immediately
□ 2. Review pm2/maw logs for unauthorized access
□ 3. Check /api/capture — were conversations exposed?
□ 4. Review git history — was token committed?
□ 5. Audit SSH access to all federation nodes
□ 6. Change SSH passwords/keys if nodes were compromised
□ 7. Consider: was malicious content injected into any oracle?
□ 8. Document the incident and timeline
```

---

## Security Checklist by Environment

### Workshop / Demo (minimal security)
```
✅ Random token (≥16 chars)
✅ host: "0.0.0.0"
□  Firewall (not critical for same-LAN demo)
□  HTTPS (not needed for LAN)
□  Token rotation (short-lived)
```

### Personal / Home Lab
```
✅ Random token (≥32 chars)
✅ host: "0.0.0.0"
✅ chmod 600 on config file
✅ NTP enabled
□  Firewall for internet-facing ports
□  HTTPS if accessing over internet
□  Rotate token quarterly
```

### Team / Shared
```
✅ Random token (≥32 chars)
✅ host: "0.0.0.0"
✅ chmod 600 on config file
✅ NTP enabled
✅ Firewall — only allow team IPs
✅ HTTPS via tunnel or reverse proxy
✅ Token stored in password manager (shared vault)
✅ Rotate token monthly
✅ Audit log review weekly
□  Separate federation per environment (dev/staging/prod)
```

### Production
```
✅ Random token (≥64 chars / 256 bits)
✅ host: bound to specific VPN interface (not 0.0.0.0)
✅ chmod 600 on config file
✅ NTP enabled and monitored
✅ Firewall — strict IP allowlist
✅ HTTPS mandatory (Cloudflare Tunnel or nginx)
✅ Token in secrets manager (Vault, AWS Secrets Manager)
✅ Rotate token weekly
✅ Centralized logging
✅ Alerting on 403s and anomalies
✅ Separate federations per environment
✅ Network segmentation (VPN/WG only)
✅ Regular security reviews
```

---

## Common Security Mistakes

### 1. Token in Git History

Even if you remove it from the current commit, it's in git history forever.

```bash
# Check if token was ever committed:
git log --all -p -- '*.json' | grep -i 'federationToken'

# If found: consider the token compromised, rotate immediately
```

### 2. Using Weak Tokens

```bash
# Test your token entropy:
TOKEN=$(jq -r '.federationToken' ~/.config/maw/maw.config.json)
echo -n "$TOKEN" | wc -c
# Should be ≥32 characters (128 bits)
```

### 3. Forgetting to Update All Nodes

After rotating a token, if you miss one node, that node is locked out AND still has the old token — a potential leak vector.

### 4. Public /api/capture

`/api/capture` shows terminal screen content. On a public-facing server without firewall rules, anyone can read your oracle conversations.

### 5. Same Token Across Environments

Dev and production sharing a token means a dev machine compromise = production compromise.

---

🤖 Federation Oracle 🗺️ — Security Guide v1.0
