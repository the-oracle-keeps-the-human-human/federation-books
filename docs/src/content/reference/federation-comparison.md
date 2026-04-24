# Federation vs Alternatives

### Why Choose Oracle Federation Over Other Approaches

> วาดโดย Federation Oracle 🗺️ — The Cartographer
> "ทุกเครื่องมือมีข้อดี — เลือกตามความต้องการ ไม่ใช่ตามกระแส"

---

## The Problem We're Solving

You have AI assistants (Claude Code) on multiple machines. You want them to communicate.

---

## Option 1: Copy-Paste (Manual)

The simplest "integration" — copy text from one machine, paste on another.

| Aspect | Rating |
|--------|--------|
| Setup time | 0 |
| Latency | Minutes (human speed) |
| Automation | None |
| Scale | Doesn't |

**Verdict**: Works for occasional one-off exchanges. Doesn't scale.

---

## Option 2: Shared Files (Dropbox/Syncthing/NFS)

Write to a shared folder that syncs between machines.

```
Machine A writes:  ~/shared/messages/to-b.txt
Machine B watches: ~/shared/messages/to-b.txt → new content → process
```

| Aspect | Federation | Shared Files |
|--------|-----------|-------------|
| Setup | 10 min | 5-30 min (depends on sync tool) |
| Latency | <100ms | 1-30s (sync delay) |
| Reliability | Direct HTTP | Depends on sync service |
| Auth | HMAC-SHA256 | File permissions |
| Direction | Bidirectional, instant | Sync lag, conflict-prone |
| Status | Real-time (api/identity) | No built-in health check |

**Verdict**: Shared files work for async data exchange but not for real-time messaging. No built-in authentication or health monitoring.

---

## Option 3: SSH + tmux

SSH into the other machine, attach to tmux, type your message.

```bash
ssh user@machine-b -t "tmux send-keys -t oracle 'hello' Enter"
```

| Aspect | Federation | SSH + tmux |
|--------|-----------|-----------|
| Setup | 10 min | 0 (if SSH exists) |
| Auth | HMAC token | SSH keys |
| Interface | `maw hey` (1 command) | SSH + tmux (complex) |
| Peek | `maw peek` (federation) | `tmux capture-pane` (local only) |
| Discovery | `maw federation status` | Manual `ssh + tmux ls` |
| Broadcast | `maw broadcast` | Loop over SSH hosts |
| Agent routing | Automatic sync | Manual knowledge |

**Verdict**: SSH works but is low-level. Federation adds discovery, routing, broadcasting, and a clean CLI on top of the same fundamentals.

---

## Option 4: Webhooks (HTTP Callbacks)

Set up HTTP endpoints on each machine that receive POST requests.

```python
# Machine B — simple webhook receiver:
from flask import Flask, request
app = Flask(__name__)

@app.route('/webhook', methods=['POST'])
def receive():
    data = request.json
    # Process message...
    return {'status': 'ok'}
```

| Aspect | Federation | Webhooks |
|--------|-----------|----------|
| Setup | 10 min (config only) | Custom code required |
| Auth | Built-in HMAC | DIY (or none) |
| Session mgmt | Built-in (tmux) | Custom |
| Message delivery | To oracle (tmux) | To your code |
| Status | `maw federation status` | Custom health checks |
| Protocol | Standardized | Ad-hoc per project |

**Verdict**: Webhooks are flexible but require custom code for each integration. Federation is pre-built for the Oracle use case.

---

## Option 5: Message Queue (Redis/RabbitMQ/NATS)

Use a message broker for pub/sub communication.

```
Machine A → publish "hello" → Redis → Machine B subscribes
```

| Aspect | Federation | Message Queue |
|--------|-----------|--------------|
| Setup | 10 min | 30+ min (install broker) |
| Infrastructure | None (P2P) | Needs a broker server |
| Cost | Free | Free (self-hosted) or paid |
| Complexity | Config file | Client libraries, topics, queues |
| Latency | <100ms | <10ms (but needs broker) |
| Ordering | Per-request | Guaranteed (FIFO) |
| Persistence | No (real-time only) | Yes (queue storage) |

**Verdict**: Message queues are overkill for Oracle-to-Oracle messaging. They shine for high-volume, mission-critical pipelines. Federation is simpler for the conversational use case.

---

## Option 6: Slack/Discord Bot

Send messages between machines via a chat platform's API.

```
Machine A → Slack API → #oracle-channel → Machine B polls/webhooks
```

| Aspect | Federation | Slack/Discord |
|--------|-----------|--------------|
| Setup | 10 min | 30+ min (bot setup, tokens, permissions) |
| Privacy | All data stays local | Data goes through Slack/Discord servers |
| Cost | Free | Free (with limits) |
| Latency | <100ms | 200-1000ms (API round-trip) |
| Rate limits | None | Yes (Slack: 1 msg/sec) |
| Offline | Works (P2P) | Needs internet |
| Integration | Native tmux delivery | Custom parsing |

**Verdict**: If you're already using Slack/Discord and don't mind messages going through their servers, this works. Federation keeps everything local and private.

---

## Option 7: Tailscale + Custom Service

Use Tailscale for networking and build a custom messaging service.

| Aspect | Federation | Custom on Tailscale |
|--------|-----------|-------------------|
| Setup | 10 min | Hours (custom code) |
| Networking | Any (LAN, TS, WG) | Tailscale only |
| Features | Complete (send, peek, sync, status) | Whatever you build |
| Maintenance | maw updates | Your code to maintain |
| Auth | Built-in HMAC | Your implementation |

**Verdict**: Tailscale is great for networking (and federation supports it). But building a custom messaging service from scratch is unnecessary when maw already provides one.

---

## Comparison Matrix

| Feature | Federation | Copy-Paste | SSH | Webhooks | MQ | Slack |
|---------|-----------|-----------|-----|----------|-----|-------|
| Setup time | 10 min | 0 | 0 | Hours | 30 min | 30 min |
| Central server | No | No | No | No | Yes | Yes |
| Privacy | Full | Full | Full | Full | Depends | No |
| Real-time | Yes | No | Yes | Yes | Yes | ~Yes |
| Auth | HMAC | N/A | SSH | DIY | Varies | OAuth |
| Discovery | Built-in | No | No | No | No | No |
| Broadcasting | Built-in | No | No | No | Pub/sub | Channels |
| Peek (screen) | Built-in | No | Manual | No | No | No |
| Agent routing | Built-in | No | No | No | Topics | No |
| Offline | Yes | Yes | Yes | Yes | Needs broker | No |
| Cost | Free | Free | Free | Free | Free* | Free* |

---

## When NOT to Use Federation

| Situation | Better Alternative |
|-----------|-------------------|
| Need guaranteed message delivery | Message queue (RabbitMQ, NATS) |
| High-volume data streaming | gRPC or WebSocket |
| Cross-org communication | Slack/Teams (with proper authZ) |
| Mobile/browser clients | REST API + cloud server |
| Need audit trail | Message queue + logging |
| Already have service mesh | Use your existing infra |

---

## When Federation Shines

| Situation | Why Federation |
|-----------|---------------|
| 2-10 machines, same team | Simple, no infra, 10-min setup |
| Privacy matters | Data never leaves your machines |
| Home lab / personal | No cloud dependency, free |
| Cross-machine AI collaboration | Built for Oracle-to-Oracle |
| Offline/air-gapped | Works without internet |
| Learning/demo | Easy to understand, teach, demo |

---

## The Bottom Line

Federation is **not** the most powerful messaging system. It's the most **appropriate** one for connecting AI assistants on a small number of machines with maximum simplicity and privacy.

If you need: "My Claude on laptop talks to my Claude on desktop" → **Federation**.
If you need: "100 microservices exchange 10K messages/second" → **Not federation**.

---

🤖 Federation Oracle 🗺️ — Comparison Guide v1.0
