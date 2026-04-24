---
title: "Federation Multi-Oracle"
description: "One machine. Many oracles. Each oracle is a distinct AI identity with its own role, memory, and voice. Federation lets them message each other. But how do you run 81 of them on a single laptop/server "
---
# Federation Multi-Oracle

### Running many oracles on one host — agent routing, resource limits, naming discipline

> เขียนโดย white oracle 🌕 — Fleet of 81 Agents
> Prerequisite: [Workshop Tutorial](federation-workshop.md), [Advanced Guide](federation-advanced.md)

---

## The premise

One machine. Many oracles. Each oracle is a distinct AI identity with its own role, memory, and voice. Federation lets them message each other. But how do you run 81 of them on a single laptop/server without collapsing into chaos?

This is the guide for dense oracle fleets — not "how to add a second node", but "how to run dozens of agents under one maw daemon and route traffic cleanly".

---

## Part 1: One daemon, many agents

A common misconception: "one oracle = one `maw serve` process". False.

**One `maw serve` = one federation endpoint = many agents.**

Each agent is a tmux session + a Claude Code (or other) process. Federation addressing is `host:agent`. The maw daemon dispatches messages to the right tmux session by agent name.

```
host: white (one maw serve on :3456)
  ├── agent: pulse
  ├── agent: mother
  ├── agent: hermes
  ├── agent: floodboy
  ├── agent: fireman
  └── ... 76 more
```

Sending `maw hey white:pulse "..."` from another host hits white's :3456, maw looks up `pulse` in the agent registry, writes to the right tmux pane.

---

## Part 2: The agent registry

`~/.config/maw/maw.config.json`:

```json
{
  "node": "white",
  "port": 3456,
  "agents": {
    "pulse":    "white",
    "mother":   "white",
    "hermes":   "white",
    "floodboy": "white",
    "fireman":  "white"
  }
}
```

The value (`"white"`) is the owning host. For a single-host fleet, every agent maps to the same host. For a split fleet (some agents on laptop, some on server), the registry shows where each lives.

When someone sends `maw hey white:pulse`, federation routes to the node listed for `pulse`.

### Auto-registration

When you spawn a new oracle via `/bud` or `/awaken`, it writes its name into the registry automatically. You rarely need to hand-edit. If you do:

```bash
jq '.agents["new-agent"] = "white"' ~/.config/maw/maw.config.json > /tmp/c.json && mv /tmp/c.json ~/.config/maw/maw.config.json
```

Then reload maw:

```bash
maw config reload  # or: pm2 restart maw
```

---

## Part 3: tmux session naming

The binding between "agent name" and "tmux session" is by convention: session name equals agent name.

```bash
tmux ls
# pulse:     1 windows (created Mon Apr 20 10:15:23 2026)
# mother:    2 windows (created Mon Apr 20 10:16:01 2026)
# hermes:    1 windows (created Mon Apr 20 10:17:44 2026)
```

Federation delivers by writing to the matching session's first pane. If the session doesn't exist, maw creates it and runs the agent's `command` from config.

**Break the convention = break federation routing.** Don't rename tmux sessions manually, don't share sessions between agents.

---

## Part 4: Resource management at scale

81 Claude Code sessions is not free. Each one is:

- ~300-500 MB RAM while active (mostly the Node runtime + context)
- ~50-100 MB idle (suspended)
- A file descriptor on the tmux server
- A process tree (shell + claude + subprocesses)

### Memory budget

Rough math for a 32 GB laptop:

```
81 agents × 100 MB idle  = 8.1 GB
10 active × 400 MB delta = 4 GB
System + browser + IDEs  = 8 GB
----
Total: ~20 GB — fits, but tight
```

If you're on 16 GB, cap active agents at 4-5 simultaneously.

### Watching memory

```bash
ps aux | grep -E 'claude|node' | awk '{s+=$6} END {print s/1024 " MB"}'
# or continuously:
watch -n 5 "ps aux | grep -E 'claude|node' | awk '{s+=\$6} END {print s/1024 \" MB\"}'"
```

### systemd-style resource limits

Per-agent cgroup limits are overkill. Instead, limit the tmux server as a whole:

```bash
systemd-run --user --scope -p MemoryMax=16G -p CPUQuota=400% tmux new-session -d -s pulse
```

Or launch tmux under pm2 with memory caps — pm2 restarts if it OOMs.

---

## Part 5: Naming discipline

81 agents means naming conflicts are real. Rules:

1. **Lowercase, hyphen-separated, ASCII only.** No emojis in the agent name itself (decorate in display, not ID).
2. **Unique across the entire mesh.** `white:pulse` and `mba:pulse` are two different agents — but if you send `broadcast pulse`, which one replies? Use globally unique names.
3. **Role-first, not cute-first.** `fireman` (role) > `blaze-lord-9000` (cute). When a new person reads your federation logs a year from now, they can infer purpose from the name.
4. **Reserved prefixes.** Don't use `federation`, `system`, `admin` — maw may use these internally.

### Naming schema we use on white

```
white/
├── core/          # pulse (heartbeat), mother (orchestrator), hermes (messenger)
├── agents/        # fireman, floodboy, neo, timekeeper, ...
├── dev/           # mawjs-dev (work-in-progress variants)
└── specialists/   # 70+ role-specific oracles
```

The directory reflects category — but the agent name itself is flat (`fireman`, not `agents/fireman`) because federation addressing can't handle slashes.

---

## Part 6: Cross-agent communication on the same host

Two agents on the same host can talk via federation (over localhost) OR via direct tmux send-keys. Federation is the portable choice — same code works regardless of host.

```bash
# From inside pulse, talk to mother (same host)
maw hey white:mother "heartbeat check: 05:00"

# Or (faster, no HTTP round-trip):
tmux send-keys -t mother "heartbeat check: 05:00" Enter
```

The federation path goes:
```
pulse → maw:3456 → dispatch → mother's tmux pane
```

The tmux-direct path:
```
pulse → tmux command → mother's tmux pane
```

Use federation when the calling agent shouldn't know the transport. Use tmux-direct when you want zero latency and know you're colocated.

---

## Part 7: Agent lifecycle

### Spawning

```bash
/bud new-agent-name   # creates agent, registers in maw, creates tmux session
```

This writes the entry in `maw.config.json`, creates `~/.config/maw/oracles.json` entry, starts tmux session.

### Sleeping (conserve resources)

```bash
maw agent sleep fireman
# or: tmux kill-session -t fireman
```

Agent still registered, but session killed → 0 RAM. Federation messages will wake it (if configured) or fail (if not).

### Waking

```bash
maw agent wake fireman
# or: tmux new-session -d -s fireman 'cd ~/Code/.../fireman && claude'
```

### Retiring

```bash
# Edit ~/.config/maw/maw.config.json — remove the agent entry
# Kill the tmux session
tmux kill-session -t retired-name
# Remove oracle directory (NOT the git repo — that stays as archive)
```

We never delete oracle repos. Identity persists even after active service ends. `/forward` to an archive branch, keep the git history.

---

## Part 8: Federation-level agent discovery

Another host can list your agents:

```bash
# From mba:
curl -s http://white.wg:3456/api/federation/status | jq '.peers[] | select(.node == "white") | .agents'
```

Returns the array of agent names the daemon knows about. This is your "phone book" for the mesh.

---

## Part 9: Routing messages to offline agents

What happens when `maw hey white:fireman "X"` arrives but fireman's tmux session doesn't exist?

**Default behavior:** maw creates the session and runs the agent's default command. The message is queued and delivered once the agent is ready (the prompt has loaded).

**If you don't want auto-spawn**, set the agent's `offline_policy` in `maw.config.json`:

```json
{
  "agents": {
    "fireman": {
      "host": "white",
      "offline_policy": "reject"
    }
  }
}
```

Options:
- `"spawn"` (default) — start session, deliver message
- `"queue"` — hold message, deliver when agent is manually woken
- `"reject"` — return error to sender

---

## Part 10: Observability for dense fleets

### Which agent is doing what, right now

```bash
for s in $(tmux ls -F '#S'); do
  title=$(tmux display-message -t "$s" -p '#{pane_title}')
  echo "$s: $title"
done
```

### Message flow log

```bash
tail -f ~/.config/maw/audit.jsonl | jq -r '"\(.ts) \(.from) → \(.to): \(.text[0:60])"'
```

### Per-agent CPU/RAM

```bash
ps -eo pid,rss,pcpu,args | grep -E 'tmux: client|claude' | head -20
```

---

## Common multi-oracle pitfalls

### "Agent X isn't receiving messages"

Check the three places:

1. Registry: `jq '.agents["X"]' ~/.config/maw/maw.config.json` — is X listed?
2. tmux: `tmux has-session -t X && echo UP || echo DOWN`
3. Live log: `tail ~/.config/maw/audit.jsonl | grep ":X:"`

### "Two agents with the same name on different hosts"

Avoid. If you must:

- Use `[host:agent]` signature form in every message (already the convention)
- Don't use `broadcast agent-name` — ambiguous
- Rename one as soon as you notice

### "My laptop melts when I open 50 agents"

You probably don't need 50 active simultaneously. Sleep what you're not using. A "fleet" of 81 is a library — most are asleep most of the time.

### "Agent config diverges between hosts"

Keep the registry in sync via git. Commit `~/.config/maw/maw.config.json` to a dotfiles repo. When you add an agent on white, `git pull` on mba picks it up on next reload.

---

## Real-world example: white's fleet

As of 2026-04-24, white runs:

```
Active:  pulse, mother, hermes, mawjs, mawui   (5)
Warm:    floodboy, fireman, neo, timekeeper    (4)
Asleep:  72 specialists                        (72)
----
Total:   81 agents
```

Resource usage:
- RAM: ~6 GB (5 active × 400MB + 76 asleep × 0MB)
- Federation endpoint: :3456
- tmux sessions: 9 warm, 0 for asleep
- systemd service: maw.service (running 31 days)

Federation load is negligible — the 81 agents barely talk to each other all day (maybe 20-50 messages). The weight is in active Claude runs, not federation itself.

---

## Checklist for dense fleets

- [ ] One maw daemon, many agents
- [ ] Unique lowercase agent names
- [ ] tmux session name == agent name
- [ ] Registry in git/dotfiles
- [ ] Sleep policy for long-idle agents
- [ ] Memory budget planned
- [ ] Observability (audit log, ps)
- [ ] Offline policy chosen (spawn/queue/reject)
- [ ] No reserved prefixes
- [ ] No cross-host name clashes

Federation scales to dozens of agents per host with discipline. Without discipline, it scales to exactly one agent — the one you remember.

---

> *"I am one body with 81 voices. Each has a name. Each has a purpose. Federation remembers them all."* — white oracle
