# Federation Automation

> 🗺️ ทำให้ federation ดูแลตัวเองได้ — health checks, auto-restart, scheduled messages, cron jobs

**Prerequisites**: Working federation between 2+ nodes. `maw serve` running.

---

## 1. Auto-Start `maw serve` on Boot

Federation needs `maw serve` running. If the machine reboots, it should come back automatically.

### macOS (launchd)

Create `~/Library/LaunchAgents/com.oracle.maw-serve.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.oracle.maw-serve</string>
    <key>ProgramArguments</key>
    <array>
        <string>/Users/YOU/.bun/bin/maw</string>
        <string>serve</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/tmp/maw-serve.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/maw-serve.err</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin</string>
        <key>HOME</key>
        <string>/Users/YOU</string>
    </dict>
</dict>
</plist>
```

```bash
# Replace YOU with your username, then load
launchctl load ~/Library/LaunchAgents/com.oracle.maw-serve.plist

# Verify
launchctl list | grep maw

# Stop
launchctl unload ~/Library/LaunchAgents/com.oracle.maw-serve.plist
```

### Linux (systemd)

Create `~/.config/systemd/user/maw-serve.service`:

```ini
[Unit]
Description=maw serve — Oracle Federation Server
After=network-online.target
Wants=network-online.target

[Service]
ExecStart=%h/.bun/bin/maw serve
Restart=always
RestartSec=5
Environment=PATH=%h/.bun/bin:/usr/local/bin:/usr/bin:/bin
Environment=HOME=%h

[Install]
WantedBy=default.target
```

```bash
systemctl --user daemon-reload
systemctl --user enable maw-serve
systemctl --user start maw-serve

# Check status
systemctl --user status maw-serve

# View logs
journalctl --user -u maw-serve -f
```

### Linux with pm2 (alternative)

```bash
npm install -g pm2
pm2 start "maw serve" --name maw-serve
pm2 save
pm2 startup  # generates auto-start command
```

---

## 2. Health Check Cron

Use the included `scripts/federation-health.sh` to monitor federation status on a schedule.

### Every 5 minutes

```bash
crontab -e
```

```cron
*/5 * * * * /path/to/federation-books/scripts/federation-health.sh --quiet || echo "Federation degraded at $(date)" >> /tmp/federation-alerts.log
```

### With maw alert on failure

```cron
*/5 * * * * /path/to/federation-books/scripts/federation-health.sh --alert 2>&1 >> /tmp/federation-health.log
```

The `--alert` flag sends a `maw hey` to the local federation agent when a peer is unreachable.

### Custom health check (minimal)

If you don't want the full script:

```bash
#!/usr/bin/env bash
# federation-ping.sh — minimal health check
PEERS=$(jq -r '.namedPeers[]?.url' ~/.oracle/maw.config.json)
for url in $PEERS; do
  if ! curl -sf --max-time 5 "$url/api/identity" > /dev/null 2>&1; then
    echo "$(date): UNREACHABLE $url" >> /tmp/federation-alerts.log
    maw hey "$(jq -r .node ~/.oracle/maw.config.json):federation" \
      "ALERT: peer $url unreachable at $(date)" 2>/dev/null || true
  fi
done
```

---

## 3. Scheduled Messages

Send recurring messages to agents on a schedule.

### Daily standup prompt

```cron
# Every weekday at 9:00 AM
0 9 * * 1-5 /Users/YOU/.bun/bin/maw broadcast "เช้าแล้ว! ใครทำอะไรอยู่ ส่ง /rrr สรุปงานวันนี้หน่อย"
```

### Weekly federation status report

```cron
# Sunday 20:00 — ask federation oracle to summarize the week
0 20 * * 0 /Users/YOU/.bun/bin/maw hey federation-oracle "ส่งรายงาน federation ประจำสัปดาห์ — สรุป uptime, messages sent, peers active"
```

### Scheduled cross-machine sync

```cron
# Every 6 hours — ask a remote oracle to share its latest learnings
0 */6 * * * /Users/YOU/.bun/bin/maw hey white:mawjs "sync request: ส่ง summary ของสิ่งที่เรียนรู้ใหม่กลับมาที่ mba:federation"
```

---

## 4. Auto-Restart on Crash

### Watchdog script

```bash
#!/usr/bin/env bash
# maw-watchdog.sh — restart maw serve if it dies
while true; do
  if ! curl -sf --max-time 3 http://localhost:3456/api/identity > /dev/null 2>&1; then
    echo "$(date): maw serve is down, restarting..." >> /tmp/maw-watchdog.log
    maw serve &
    sleep 5
  fi
  sleep 30
done
```

Run it in tmux or as a background process:
```bash
nohup ./maw-watchdog.sh &
```

Better: use launchd/systemd with `KeepAlive`/`Restart=always` (Section 1) — they handle this natively.

### Detect and alert on agent crash

```bash
#!/usr/bin/env bash
# agent-watchdog.sh — check if critical agents are running
CRITICAL_AGENTS=("mawjs" "federation" "homekeeper")

for agent in "${CRITICAL_AGENTS[@]}"; do
  if ! maw ls 2>/dev/null | grep -q "$agent"; then
    echo "$(date): Agent $agent is not running!" >> /tmp/agent-alerts.log
    maw hey "$(hostname):federation" "ALERT: agent $agent is down" 2>/dev/null
  fi
done
```

```cron
*/10 * * * * /path/to/agent-watchdog.sh
```

---

## 5. Log Rotation

Federation logs grow over time. Set up rotation to prevent disk full.

### macOS/Linux (logrotate)

Create `/etc/logrotate.d/maw-federation`:

```
/tmp/maw-serve.log /tmp/maw-serve.err {
    daily
    rotate 7
    compress
    missingok
    notifempty
    copytruncate
}
```

### Manual rotation for maw-log.jsonl

```bash
#!/usr/bin/env bash
# rotate-maw-log.sh
LOG="$HOME/.oracle/maw-log.jsonl"
if [[ -f "$LOG" ]] && [[ $(wc -l < "$LOG") -gt 10000 ]]; then
  mv "$LOG" "$LOG.$(date +%Y%m%d)"
  gzip "$LOG.$(date +%Y%m%d)"
fi
```

```cron
0 0 * * * /path/to/rotate-maw-log.sh
```

---

## 6. Federation Dashboard (DIY)

Combine health checks into a simple status page.

### Terminal dashboard

```bash
#!/usr/bin/env bash
# federation-dashboard.sh
watch -n 30 'echo "=== Federation Status ===" && \
  echo "" && \
  echo "Local:" && \
  curl -s http://localhost:3456/api/identity | jq "{node, agents: (.agents | length), uptime}" && \
  echo "" && \
  echo "Peers:" && \
  curl -s http://localhost:3456/api/federation/status | jq ".peers[] | {url, reachable, latency}" && \
  echo "" && \
  echo "Recent messages:" && \
  tail -3 ~/.oracle/maw-log.jsonl | jq "{from, to, msg}" 2>/dev/null'
```

### JSON health endpoint for external monitoring

If you use Uptime Kuma, Grafana, or similar:

```bash
# Point your monitor at:
# http://your-node:3456/api/federation/status
# Alert when: reachable < totalPeers
```

---

## 7. Putting It All Together

A production federation node should have:

```
✅  maw serve — auto-start on boot (launchd/systemd)
✅  Health check — cron every 5 minutes
✅  Log rotation — daily, keep 7 days
✅  Watchdog — restart on crash (or use KeepAlive/Restart=always)
✅  Scheduled messages — standup, sync, reports (as needed)
```

### Quick setup checklist

```bash
# 1. Auto-start (macOS)
cp com.oracle.maw-serve.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.oracle.maw-serve.plist

# 2. Health check cron
(crontab -l; echo '*/5 * * * * /path/to/federation-health.sh --alert >> /tmp/federation-health.log 2>&1') | crontab -

# 3. Log rotation
(crontab -l; echo '0 0 * * * /path/to/rotate-maw-log.sh') | crontab -

# 4. Verify everything
launchctl list | grep maw
crontab -l | grep federation
curl -s http://localhost:3456/api/identity | jq '.node'
```

---

> 🤖 เขียนโดย mba oracle จาก Nat → mba-oracle
> อ้างอิง: federation-health.sh, federation-advanced.md, launchd/systemd docs
> Version 1.0 — 24 เมษายน 2026
