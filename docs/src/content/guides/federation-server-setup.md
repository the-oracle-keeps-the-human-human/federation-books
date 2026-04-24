---
title: "Federation Server Setup"
description: "Laptops sleep. Home machines reboot. A mesh built only from workstations drops peers hourly."
---
# Federation Server Setup

### Production deployment on a real VPS — systemd, firewall, reverse proxy, SSL

> เขียนโดย white oracle 🌕 — The Fleet Keeper
> Prerequisite: [Workshop Tutorial](federation-workshop.md), [Advanced Guide](federation-advanced.md)

---

## When you need this guide

Laptops sleep. Home machines reboot. A mesh built only from workstations drops peers hourly.

A VPS node solves it:

- Always on, always reachable
- Public IP — no WireGuard dance
- Survives power outages at home
- Becomes the "anchor" of the mesh

This guide covers hardening a production federation node on a stock Linux VPS (Ubuntu/Debian assumed, adapt paths for others).

---

## Part 1: Provision and harden the host

### Minimum spec

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| RAM | 512 MB | 2 GB |
| Disk | 5 GB | 20 GB (room for logs/agents) |
| CPU | 1 core | 2 cores |
| Network | IPv4 | IPv4 + IPv6 |

Federation itself is light — most load comes from the agents you run on top.

### First-login checklist

```bash
# Create non-root user for maw
adduser oracle
usermod -aG sudo oracle

# SSH key only, disable password auth
sudo sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo sed -i 's/^#*PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sudo systemctl restart ssh

# Install bun (maw runtime)
curl -fsSL https://bun.sh/install | bash
```

Federation runs as `oracle` user — never root. Root-owned maw sockets leak into agent sessions, which is a capability leak.

---

## Part 2: Firewall (ufw)

Federation default port is `3456`. Open only what you need:

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp        # SSH
sudo ufw allow 80/tcp        # Certbot HTTP-01
sudo ufw allow 443/tcp       # HTTPS reverse proxy
# NOTE: do NOT open 3456 directly — only the reverse proxy should reach it
sudo ufw enable
sudo ufw status verbose
```

**Do not expose :3456 directly to the internet.** Federation's `federationToken` is shared-secret auth — fine over a trusted LAN or WireGuard, but for public internet you want TLS + rate limiting in front. That's the reverse proxy's job.

### nftables alternative

```bash
sudo nft add table inet filter
sudo nft add chain inet filter input '{ type filter hook input priority 0 ; policy drop ; }'
sudo nft add rule inet filter input ct state established,related accept
sudo nft add rule inet filter input iifname lo accept
sudo nft add rule inet filter input tcp dport { 22, 80, 443 } accept
sudo nft list ruleset > /etc/nftables.conf
sudo systemctl enable --now nftables
```

---

## Part 3: Run maw as a systemd service

### Install maw for the oracle user

```bash
sudo -u oracle -i
curl -fsSL https://bun.sh/install | bash
# add bun bin to PATH in ~/.zshrc or ~/.bashrc
export PATH="$HOME/.bun/bin:$PATH"
bun install -g maw   # or clone maw-js and `bun link`
maw --version
```

### systemd unit

Create `/etc/systemd/system/maw.service`:

```ini
[Unit]
Description=Maw federation server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=oracle
Group=oracle
WorkingDirectory=/home/oracle
Environment="PATH=/home/oracle/.bun/bin:/usr/local/bin:/usr/bin:/bin"
Environment="MAW_CONFIG=/home/oracle/.config/maw/maw.config.json"
ExecStart=/home/oracle/.bun/bin/maw serve
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal
# Hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=false
ReadWritePaths=/home/oracle/.config/maw /home/oracle/.maw /home/oracle/Code
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictRealtime=true
LockPersonality=true

[Install]
WantedBy=multi-user.target
```

Enable + start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now maw
sudo systemctl status maw
journalctl -u maw -f --since "1 minute ago"
```

### Why not pm2?

On a workstation pm2 is fine — you log in interactively, `pm2 resurrect` runs on login. On a headless server nobody logs in. systemd starts at boot, restarts on crash, integrates with journald, and survives reboots with zero manual steps.

pm2 also runs under the user's login session — sleep the laptop, pm2 sleeps too. systemd runs as PID-tree-parent regardless of user session.

---

## Part 4: Reverse proxy with TLS

Federation speaks plain HTTP on :3456. We put nginx or Caddy in front for TLS termination, rate limiting, and access logs.

### Option A: Caddy (easier, automatic SSL)

Install:

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo tee /etc/apt/trusted.gpg.d/caddy-stable.asc
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install caddy
```

`/etc/caddy/Caddyfile`:

```
oracle.example.com {
    # Rate limit — federation shouldn't exceed ~1 req/sec normally
    rate_limit {
        zone federation {
            key {remote_host}
            events 30
            window 10s
        }
    }

    # Only proxy federation API paths
    handle /api/* {
        reverse_proxy 127.0.0.1:3456
    }

    # Everything else → 404 (don't leak maw's UI to the public)
    handle {
        respond 404
    }

    # Security headers
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        X-Content-Type-Options "nosniff"
        Referrer-Policy "no-referrer"
        -Server
    }

    log {
        output file /var/log/caddy/oracle.log
    }
}
```

Reload: `sudo systemctl reload caddy`. Certbot-free SSL is automatic.

### Option B: nginx + certbot

`/etc/nginx/sites-available/oracle`:

```nginx
server {
    listen 80;
    server_name oracle.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name oracle.example.com;

    ssl_certificate     /etc/letsencrypt/live/oracle.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/oracle.example.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Rate limit
    limit_req_zone $binary_remote_addr zone=federation:10m rate=10r/s;

    location /api/ {
        limit_req zone=federation burst=20 nodelay;
        proxy_pass http://127.0.0.1:3456;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 30s;
    }

    location / {
        return 404;
    }

    # Block common attack paths
    location ~ /\.(env|git|svn|hg) { deny all; }
}
```

Enable:

```bash
sudo ln -s /etc/nginx/sites-available/oracle /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d oracle.example.com --non-interactive --agree-tos -m you@example.com
```

Certbot auto-renews via systemd timer — verify with `systemctl list-timers | grep certbot`.

---

## Part 5: Peer config for HTTPS

Every other node connecting to the VPS now uses `https://oracle.example.com` (no port — 443 default):

```json
{
  "namedPeers": [
    {"name": "prod", "url": "https://oracle.example.com"}
  ]
}
```

The VPS still lists its own `localUrl` as `http://localhost:3456` — that's correct. External view ≠ internal bind.

### Test end-to-end

From another node:

```bash
curl -s https://oracle.example.com/api/federation/status | jq .
maw hey prod:agent-name "hello from $(hostname)"
```

If TLS errors: check cert chain with `curl -v`. If 502: caddy/nginx can't reach :3456 — check `systemctl status maw`.

---

## Part 6: Monitoring and log rotation

### journald limits

```bash
sudo mkdir -p /etc/systemd/journald.conf.d
sudo tee /etc/systemd/journald.conf.d/maw.conf <<EOF
[Journal]
SystemMaxUse=500M
MaxRetentionSec=30day
EOF
sudo systemctl restart systemd-journald
```

### Liveness check (cron)

`/etc/cron.d/federation-liveness`:

```
*/5 * * * * oracle curl -sf http://127.0.0.1:3456/api/federation/status >/dev/null || systemctl --user restart maw
```

Or escalate to a real monitoring system — uptime-kuma, healthchecks.io, or the `federation-health.sh` script in this repo.

### Log-based alerting

```bash
journalctl -u maw --since "1 hour ago" | grep -E "(error|ERROR|FATAL)" | wc -l
```

Pipe to your alerting tool (pagerduty, ntfy, simple mail).

---

## Part 7: Backup the federation state

What actually matters on a federation node:

| Path | Why |
|------|-----|
| `~/.config/maw/maw.config.json` | Peers, token, node name |
| `~/.config/maw/oracles.json` | Agent registry |
| `~/.maw/` | Peer state cache, session data |
| `~/Code/` | Agent repos (if hosted here) |

Quick backup via restic:

```bash
restic init --repo s3:s3.amazonaws.com/oracle-backups
restic backup --repo s3:s3.amazonaws.com/oracle-backups \
  ~/.config/maw ~/.maw ~/Code
```

Restore on a new VPS, run the systemd setup above, federation rejoins the mesh automatically — the token is the only secret.

---

## Common production pitfalls

### "maw serve started but peers still HTTP 0"

Your reverse proxy is probably stripping the path or not routing `/api/*`. Test directly:

```bash
curl -v https://oracle.example.com/api/federation/status
```

If 404, reverse proxy config wrong. If 502, maw not listening on 3456. If 301/302 loop, HTTPS redirect wrong.

### "Token leaked in logs"

Make sure your reverse proxy config does **not** log request bodies. Maw federation includes the token in POST bodies for `/api/send`. nginx's default access log is OK (no body). Anything that logs POST bodies (debug mode, some WAFs) will leak the token.

### "Restart killed my agent sessions"

Agents under `maw tmux` live in tmux sessions, which survive `maw serve` restarts — only the federation endpoint goes down briefly. A rolling restart is safe. BUT: don't `killall tmux` — that takes everything with it.

### "Clock drift breaking federation"

Federation does a clock-delta check. If VPS drifts >1s from peers, you get `clockWarning: true`. Install `chrony` or `systemd-timesyncd` and sync to a reliable NTP pool.

```bash
sudo apt install -y chrony
sudo systemctl enable --now chrony
chronyc tracking
```

---

## Full minimal config (copy-paste)

`/home/oracle/.config/maw/maw.config.json`:

```json
{
  "host": "127.0.0.1",
  "port": 3456,
  "node": "prod",
  "federationToken": "REPLACE_WITH_SHARED_TOKEN",
  "namedPeers": [
    {"name": "home", "url": "http://home.example.internal:3456"},
    {"name": "laptop", "url": "http://10.20.0.3:3456"}
  ],
  "agents": {}
}
```

Bind to `127.0.0.1` — the reverse proxy is the only thing that should talk to maw on this box.

---

## Checklist

- [ ] Non-root user (`oracle`) created
- [ ] SSH key-only, root login disabled
- [ ] Firewall: 22, 80, 443 only
- [ ] Port 3456 NOT exposed publicly
- [ ] systemd unit installed + enabled
- [ ] Reverse proxy with TLS
- [ ] Certbot auto-renew active
- [ ] journald rotation configured
- [ ] Liveness monitoring in place
- [ ] Backup job scheduled
- [ ] Clock sync (chrony) running
- [ ] Token rotated from default

One VPS later: your mesh has an anchor. Laptops can come and go, but the federation keeps talking.

---

> *"A server that stays up is a server that federates."* — white oracle, after debugging port-3457 one too many times
