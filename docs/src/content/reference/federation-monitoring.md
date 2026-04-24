# Federation Monitoring Spec

### What to Watch, How to Alert, When to Act

> วาดโดย Federation Oracle 🗺️ — The Cartographer
> "แผนที่ที่ดีไม่ได้แค่แสดงเส้นทาง — แต่แสดงว่าตรงไหนพัง"

---

## Core Metrics

### 1. Peer Reachability

The most basic metric: can each node reach every other node?

```bash
# Check from each node:
maw federation status

# Or via API:
curl -sf http://PEER:3456/api/identity >/dev/null && echo "up" || echo "down"
```

| State | Meaning | Action |
|-------|---------|--------|
| All reachable | Healthy | None |
| Some unreachable | Degraded | Investigate within 5 min |
| All unreachable | Down | Immediate — check network/maw |
| Intermittent | Flapping | Check latency, increase timeout |

### 2. Response Time

How long do federation requests take?

```bash
# Measure round-trip time:
time curl -sf http://PEER:3456/api/identity > /dev/null
```

| Latency | Status | Action |
|---------|--------|--------|
| <50ms | Excellent | None |
| 50-200ms | Normal | None |
| 200-1000ms | Slow | Check network, increase timeout |
| >1000ms | Degraded | Investigate network path |
| Timeout | Down | Check node, network, firewall |

### 3. Clock Drift

HMAC fails if clocks differ by >5 minutes.

```bash
# Check from each node:
LOCAL=$(date +%s)
REMOTE=$(curl -sf http://PEER:3456/api/identity | jq '.clock // empty')
DRIFT=$((LOCAL - REMOTE))
echo "Clock drift: ${DRIFT}s"
```

| Drift | Status | Action |
|-------|--------|--------|
| <60s | Healthy | None |
| 60-180s | Warning | Schedule NTP sync |
| 180-300s | Critical | NTP sync NOW (approaching 5-min limit) |
| >300s | HMAC failing | Immediate NTP sync, requests are rejected |

### 4. Node Identity

Verify each node is who it claims to be (catches zombie processes).

```bash
EXPECTED="my-node"
ACTUAL=$(curl -sf http://PEER:3456/api/identity | jq -r '.node')
[[ "$EXPECTED" == "$ACTUAL" ]] && echo "OK" || echo "IDENTITY MISMATCH!"
```

### 5. Config Consistency

Are all nodes' namedPeers in sync?

```bash
# From each node, count peers:
curl -sf http://localhost:3456/api/identity | jq '.peers // 0'
# All nodes should show (N-1) peers for an N-node federation
```

---

## Monitoring Architecture

### Option A: Simple (Cron + Script)

```
┌──────────────────────┐
│  Any federation node │
│                      │
│  cron: */5 * * * *   │
│  → federation-health.sh --alert │
│                      │
│  Alerts: maw hey, email, slack  │
└──────────────────────┘
```

Setup:
```bash
# Install the health check script
chmod +x scripts/federation-health.sh

# Add to crontab
crontab -e
# Add: */5 * * * * /path/to/scripts/federation-health.sh --quiet || echo "Federation degraded at $(date)" >> /var/log/federation.log
```

### Option B: Intermediate (pm2 + JSON logging)

```
┌──────────────────────┐
│  Monitoring node     │
│                      │
│  pm2: federation-health.sh --watch │
│  → JSON logs         │
│  → pm2-logrotate     │
│                      │
│  Alerting: pm2 hooks │
└──────────────────────┘
```

Setup:
```bash
pm2 start scripts/federation-health.sh --name fed-monitor -- --json
pm2 save
```

### Option C: Advanced (Grafana + Prometheus)

```
┌──────────────────────┐     ┌───────────┐     ┌─────────┐
│  Each federation node│────►│ Prometheus│────►│ Grafana │
│                      │     │           │     │         │
│  /metrics endpoint   │     │ scrape    │     │ dashboard│
│  (custom exporter)   │     │ store     │     │ alerts  │
└──────────────────────┘     └───────────┘     └─────────┘
```

Custom metrics exporter:
```bash
#!/bin/bash
# federation-metrics.sh — Prometheus text format
PORT=$(jq -r '.port' ~/.config/maw/maw.config.json)
PEERS=$(jq -r '.namedPeers | length' ~/.config/maw/maw.config.json)

echo "# HELP federation_peers_total Total configured peers"
echo "# TYPE federation_peers_total gauge"
echo "federation_peers_total $PEERS"

HEALTHY=0
while read -r name url; do
  STATUS=$(curl -sf --max-time 5 "$url/api/identity" >/dev/null 2>&1 && echo 1 || echo 0)
  echo "federation_peer_up{peer=\"$name\"} $STATUS"
  HEALTHY=$((HEALTHY + STATUS))
done < <(jq -r '.namedPeers[] | "\(.name) \(.url)"' ~/.config/maw/maw.config.json)

echo "# HELP federation_peers_healthy Number of reachable peers"
echo "# TYPE federation_peers_healthy gauge"
echo "federation_peers_healthy $HEALTHY"
```

---

## Alert Rules

### Critical (page immediately)

| Condition | Alert |
|-----------|-------|
| Local maw serve not responding | "maw is down on {node}" |
| 0 peers reachable | "Federation completely disconnected" |
| Clock drift >4 min | "Clock drift critical — HMAC will fail soon" |
| Identity mismatch | "Node {name} responding as {wrong_name}" |

### Warning (check within 1 hour)

| Condition | Alert |
|-----------|-------|
| Any peer unreachable >5 min | "Peer {name} has been down for {duration}" |
| Response time >500ms | "High latency to {name}: {latency}ms" |
| Clock drift >2 min | "Clock drift warning — sync NTP" |
| Config mismatch (peer count differs) | "Config out of sync — {node} has {n} peers, expected {m}" |

### Info (log only)

| Condition | Log |
|-----------|-----|
| Peer recovered | "Peer {name} back online after {downtime}" |
| New peer detected | "New peer {name} added to federation" |
| Version mismatch | "Node {name} running {version}, others running {other_version}" |

---

## Dashboard Panels (Grafana)

### Panel 1: Federation Overview

```
┌────────────────────────────────────────────┐
│  FEDERATION STATUS                          │
│                                            │
│  Nodes: 4/4 online     Latency: 12ms avg  │
│  Token: valid           Clock: ±0.3s max   │
│                                            │
│  ● mba (3457)     ● white (3456)          │
│  ● oracle-world (3456)  ● clinic (3457)   │
└────────────────────────────────────────────┘
```

### Panel 2: Peer Latency (Time Series)

```
ms
100 ┤
 80 ┤
 60 ┤
 40 ┤          ╭─╮
 20 ┤──────────╯ ╰──────────────────
  0 ┼────────────────────────────────
    00:00  04:00  08:00  12:00  16:00
    
    — white  — oracle-world  — clinic
```

### Panel 3: Message Volume (Bar Chart)

```
msgs/h
  20 ┤     ██
  15 ┤     ██  ██
  10 ┤  ██ ██  ██ ██
   5 ┤  ██ ██  ██ ██ ██
   0 ┼──────────────────
      Mon Tue Wed Thu Fri
```

### Panel 4: Alerts Timeline

```
🔴 14:32 — oracle-world unreachable (3 min)
🟡 14:35 — oracle-world back, latency 340ms
🟢 14:38 — oracle-world latency normalized (18ms)
🔴 18:01 — clinic-nat clock drift 4m 12s
🟢 18:05 — clinic-nat clock synced via NTP
```

---

## On-Call Runbook

### "Peer Unreachable" Alert

```
1. Check network:
   ping PEER_IP

2. Check maw serve:
   ssh USER@PEER "curl -s http://localhost:PORT/api/identity"

3. Check pm2:
   ssh USER@PEER "pm2 list | grep maw"

4. If maw down, restart:
   ssh USER@PEER "pm2 restart maw"
   
5. If network down:
   Check WG/Tailscale status
   Check firewall rules
   Check physical connectivity

6. Verify recovery:
   maw federation status
```

### "Clock Drift" Alert

```
1. Check drift:
   ssh USER@PEER "date +%s" vs local "date +%s"

2. Sync NTP:
   ssh USER@PEER "sudo ntpdate -s time.nist.gov"

3. Enable permanent NTP:
   ssh USER@PEER "sudo timedatectl set-ntp true"

4. Verify:
   Re-check drift (<60s acceptable)
```

### "Identity Mismatch" Alert

```
1. Check identity:
   curl http://PEER:PORT/api/identity | jq .node

2. If wrong name:
   ssh USER@PEER "jq .node ~/.config/maw/maw.config.json"
   # Compare with API response

3. Kill zombie process:
   ssh USER@PEER "pm2 delete maw"
   
4. Restart with correct config:
   ssh USER@PEER "pm2 start maw --interpreter bun -- serve; pm2 save"

5. Verify:
   curl http://PEER:PORT/api/identity | jq .node
   # Should match expected name
```

---

🤖 Federation Oracle 🗺️ — Monitoring Spec v1.0
