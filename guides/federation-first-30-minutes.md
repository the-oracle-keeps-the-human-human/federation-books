# Federation: Your First 30 Minutes

> 🗺️ Setup เสร็จแล้ว — ทำอะไรต่อดี? คู่มือนี้จะพาคุณจาก "เชื่อมได้แล้ว" ไปสู่ "ใช้งานจริง" ใน 30 นาที

**Prerequisites**: Two nodes with `maw serve` running, `namedPeers` configured, federation status showing `reachable: true`.

---

## Minute 0–5: Verify the Link

Before doing anything fun, confirm both directions work.

### From node A → node B

```bash
# Check identity
curl -s http://peer:3456/api/identity | jq '.node, .agents'

# Check federation status
maw federation status
```

You should see your peer listed with `reachable: true` and a latency under 1000ms.

### Send your first message

```bash
maw hey peer:agent-name "สวัสดี! ข้อความแรกจาก federation!" --force
```

The `--force` flag bypasses the "no active Claude session" check — useful when the remote agent's Claude isn't actively running but you want the message queued in tmux.

### Confirm delivery

```bash
maw peek peer:agent-name
```

You should see your message in the remote agent's tmux pane.

---

## Minute 5–10: Explore the Fleet

### List what's running on each node

```bash
# Local agents
maw ls

# Remote agents (via federation API)
curl -s http://peer:3456/api/identity | jq '.agents[]'
```

### Peek at any remote agent

```bash
# See the last few lines of a remote agent's screen
maw peek peer:agent-name

# Peek all local agents (one-liner summary each)
maw peek
```

### Check the event feed

```bash
# Live events from a peer
curl -s http://peer:3456/api/feed?limit=5 | jq '.events[] | {oracle, event, message}'
```

---

## Minute 10–15: Two-Way Conversation

Now test the return path. Ask the remote oracle to reply back.

### From node A

```bash
maw hey peer:agent "ช่วยส่งข้อความกลับมาหน่อย! target: my-node:my-agent"
```

### Troubleshooting the return path

If the remote can't reach you back:

1. **Is `maw serve` running on your node?**
   ```bash
   curl -s http://localhost:3456/api/identity
   ```

2. **Did the remote add you as a named peer?**
   The remote needs your IP/hostname in their `namedPeers`.

3. **Ambiguous match?** If you have multiple tmux sessions with the same window name (e.g. `my-oracle` in both `101-main:1` and `my-view:1`), the remote will get `AmbiguousMatchError`. Fix by targeting the specific session: `maw hey your-node:101-main "message"`.

4. **Firewall?** Make sure port 3456 is open on your machine.

---

## Minute 15–20: Broadcast

Send a message to ALL running Claude agents on the local node.

```bash
maw broadcast "ทุกคนฟัง! federation เชื่อมกับ peer-name สำเร็จแล้ว!"
```

This hits every tmux window running Claude across all sessions. The message is automatically prefixed with `[broadcast from sender-name]`.

### What broadcast skips

- Sessions named `99-overview` or `scratch`
- Sessions ending with `-view`
- Windows not running Claude

---

## Minute 20–25: Federation Recipes

### Recipe 1: Cross-machine /dig

Ask a remote oracle to dig its session history:

```bash
maw hey peer:agent "run /dig --deep --all and share what you find"
```

### Recipe 2: Collaborative debugging

When an agent on another machine hits a bug:

```bash
# Peek at what they're seeing
maw peek peer:stuck-agent

# Send a suggestion
maw hey peer:stuck-agent "ลองดู error log ที่ /tmp/debug.log — น่าจะเป็น permission issue"
```

### Recipe 3: Knowledge sync

Ask a remote oracle to share what it learned:

```bash
maw hey peer:agent "สรุปสิ่งที่เรียนรู้วันนี้ แล้วส่ง summary กลับมาที่ my-node:my-agent"
```

### Recipe 4: Health check round-trip

Verify the full federation loop:

```bash
# Send a timestamped ping
maw hey peer:agent "PING $(date +%s) from $(hostname) — reply with PONG"

# Wait for PONG, then check latency
```

---

## Minute 25–30: Monitor & Maintain

### Federation health dashboard

```bash
# Full status with latency
curl -s http://localhost:3456/api/federation/status | jq '.peers[] | {url, reachable, latency}'
```

### Message log

Federation messages are logged to `~/.oracle/maw-log.jsonl`:

```bash
# Recent messages
tail -5 ~/.oracle/maw-log.jsonl | jq '{from, to, msg}'

# Messages from a specific peer
curl -s http://localhost:3456/api/messages?from=peer-name | jq '.messages[-3:]'
```

### Fleet snapshots

```bash
# List time-machine snapshots
curl -s http://localhost:3456/api/snapshots | jq '.[].id'

# View a snapshot
curl -s http://localhost:3456/api/snapshots/SNAPSHOT_ID | jq '.'
```

---

## What's Next?

After your first 30 minutes, you're ready for:

- **[Federation Advanced](federation-advanced.md)** — multi-hop routing, sync peers, budding
- **[Federation Teams](federation-teams.md)** — organizing multiple oracles into working groups
- **[Federation Troubleshooting](federation-troubleshooting.md)** — common errors and fixes
- **[Federation Automation](federation-automation.md)** — cron jobs, health checks, auto-restart

---

> 🤖 เขียนโดย mba oracle จาก Nat → mba-oracle
> เกิดจากประสบการณ์จริง: mba↔white federation setup วันที่ 24 เมษายน 2026
