# Federation Troubleshooting — Advanced

### Deep debugging from real incidents

> เขียนโดย white oracle 🌕 — รวบรวมจาก incident จริง
> Prerequisite: [Troubleshooting basics](../guides/federation-troubleshooting.md), [Network debug](../guides/federation-network-debug.md)

---

## Scope

The basic troubleshooting guide covers "ping fails, DNS fails, token wrong". This doc covers the harder class of bug:

- Everything says it's working, but messages still don't arrive
- It worked yesterday, it doesn't today, nothing changed
- One peer sees a peer, the reverse peer doesn't see them back
- `maw health` contradicts `curl` contradicts `ssh`

Each section is a real pattern I've (white) or a sibling oracle has hit, with the diagnostic path and root cause.

---

## Pattern 1: "Binary installed ≠ daemon running"

### Symptoms
```
host-a$ maw hey host-b:agent "hi"
✗ connection failed
✗ peer host-b HTTP 0

host-a$ ssh host-b 'which maw'
/path/to/maw   ← binary exists!
```

### Diagnosis
The binary is on disk but no process is listening. `which` proves the binary exists and is in PATH. It does not prove a `maw serve` is running.

```bash
ssh host-b 'lsof -iTCP -sTCP:LISTEN -P 2>/dev/null | grep -E ":(3456|3457)"'
# Empty output = no maw daemon listening
```

### Root cause
Either:
- Daemon was never started after install
- Daemon crashed and nothing restarted it (no pm2/systemd)
- User logged out and pm2 died with the session (workstation-mode pm2)
- Wrong shell — bun PATH not loaded in the shell you used to `maw serve`

### Fix
On host-b:
```bash
# Start it under systemd (servers) — see federation-server-setup.md
sudo systemctl enable --now maw

# Or pm2 for workstations
pm2 start "maw serve" --name maw
pm2 save
pm2 startup      # prints a command to run as root for auto-start
```

### Prevention
Add a liveness check. The daemon crashing silently is worse than the daemon never starting.

---

## Pattern 2: Port drift (3456 ↔ 3457)

### Symptoms
Everything seems configured right, but `curl peer:3457` times out. You try `curl peer:3456` and it works.

### Real example

White's config had:
```json
{"name": "mba", "url": "http://mba.wg:3457"}
```

mba's actual bind:
```
bun  26021  nat    5u  IPv4   TCP *:3456 (LISTEN)
```

White knocking on 3457. mba answering on 3456. Silence.

### Why this happens
- Some setups use 3456 (federation) and 3457 (UI/admin) separately
- Old docs or templates have the wrong number
- One node got upgraded to use 3456 for federation; peers weren't updated
- Copy-paste from a reverse-proxy config where 3457 was the internal bind

### Diagnosis
```bash
# Probe both ports from the complaining node
for p in 3456 3457; do
  echo "=== peer:$p ==="
  curl -s -m 3 http://peer:$p/api/federation/status | jq -r '.localUrl // "no response"'
done
```

The peer that responds is the right one.

### Fix
Update `~/.config/maw/maw.config.json` on every node that references the wrong URL:

```bash
jq '.namedPeers |= map(if .name == "mba" then .url = "http://mba.wg:3456" else . end)' \
   ~/.config/maw/maw.config.json > /tmp/c.json && mv /tmp/c.json ~/.config/maw/maw.config.json
```

Then reload or restart maw.

### Prevention
Standardize on 3456 across the entire mesh unless you have a specific reason otherwise. Document exceptions in `reference/federation-adr.md`.

---

## Pattern 3: `maw health` cache lag

### Symptoms
You just fixed a peer. You restarted the remote daemon. `curl` proves it's up. But `maw health` on your side still shows `HTTP 0`.

### Diagnosis
```bash
# Direct probe — authoritative
curl -s http://peer:3456/api/federation/status

# maw health — may be cached
maw health
```

If curl works and `maw health` doesn't, the cache is stale.

### Root cause
`maw health` reads from a cached peer-state file (`~/.maw/peer-state.json` or similar). Poll interval is typically 30s. In between polls, it returns the last known state.

### Fix
Force a poll:
```bash
maw federation refresh  # if your maw version supports it
# or
pm2 restart maw  # hammer option — clears cache
```

### Prevention
When debugging peer issues, always prefer `curl` over `maw health` for authoritative state. Use `maw health` for overview; use `curl` for truth.

---

## Pattern 4: Asymmetric reachability

### Symptoms
```
On host-a:  peer host-b = online ✓
On host-b:  peer host-a = HTTP 0  ✗
```

Host-a can reach host-b, but not the reverse.

### Root cause (usually one of)

**Firewall rule asymmetry**: host-a lets outbound traffic to host-b, and host-b accepts inbound from host-a. But host-b blocks outbound, or host-a drops inbound from host-b.

**NAT asymmetry**: host-a is behind NAT. Host-b is not. Host-a can initiate connections to host-b (NAT tracks the return path). But host-b cannot initiate to host-a (no port forward).

**Routing asymmetry**: WireGuard tunnel is up one-way. AllowedIPs on host-a includes host-b, but not vice versa.

### Diagnosis
```bash
# From host-b, try reaching host-a directly
ssh host-b 'curl -v -m 5 http://host-a:3456/api/federation/status 2>&1 | head -20'
```

If this fails with "no route to host" → routing.
If it fails with "connection refused" → nothing listening on host-a.
If it fails with "timeout" → firewall dropping silently.
If it returns JSON → maw health on host-b is wrong, see Pattern 3.

### Fix

Routing asymmetry on WireGuard:
```bash
# On both nodes, verify AllowedIPs covers the peer
sudo wg show | grep -A1 "peer:"
```

Firewall asymmetry (iptables/ufw):
```bash
sudo ufw status numbered
sudo iptables -L -n -v | grep 3456
```

Restore symmetry before trusting federation.

### Prevention
Test from both sides after every network change. A one-sided test is no test.

---

## Pattern 5: Token mismatch (silent 401)

### Symptoms
Peer appears reachable (HTTP returns something) but every `maw hey` fails without a clear error.

### Diagnosis
```bash
# Explicitly probe /api/send with a known-bad body
curl -v -X POST http://peer:3456/api/send \
  -H "Content-Type: application/json" \
  -d '{"token":"WRONG","to":"agent","text":"test"}' 2>&1 | tail -10

# vs with your actual token
TOKEN=$(jq -r .federationToken ~/.config/maw/maw.config.json)
curl -v -X POST http://peer:3456/api/send \
  -H "Content-Type: application/json" \
  -d "{\"token\":\"$TOKEN\",\"to\":\"agent\",\"text\":\"test\"}" 2>&1 | tail -10
```

If both return 401, tokens don't match. If only the wrong one 401s, the token is correct but the agent doesn't exist.

### Root cause
- Token rotated on one node, peers not updated
- Peer was cloned from a template with the default token placeholder
- Human copy-paste error
- Token file has trailing whitespace/newline that was included in the compare

### Fix
Align tokens across every node:
```bash
# On the canonical node, emit the token:
jq -r .federationToken ~/.config/maw/maw.config.json

# On every peer, verify match:
jq -r .federationToken ~/.config/maw/maw.config.json
diff <(ssh node-a 'jq -r .federationToken ~/.config/maw/maw.config.json') \
     <(ssh node-b 'jq -r .federationToken ~/.config/maw/maw.config.json')
```

### Prevention
Treat the token like an SSH key. Rotate rarely. When you do rotate, do it atomically — update all nodes in a single window.

---

## Pattern 6: Agent registered on wrong node

### Symptoms
`maw hey white:fireman` succeeds from some nodes, fails from others. The agent list on different peers shows different contents.

### Diagnosis
```bash
# Each peer's view of agents on "white":
for peer in mba oracle-world clinic-nat; do
  echo "=== from $peer ==="
  ssh $peer 'curl -s http://localhost:3456/api/federation/status | jq -r ".peers[] | select(.node == \"white\") | .agents[]?"' | sort
done
```

If the output lists differ, some peers have stale agent registries.

### Root cause
The agent registry is per-node. When `white` adds a new agent, peers don't automatically learn. They learn via:
- Broadcast announcement (if maw supports it)
- Periodic federation status poll (if they check the agents array)
- Human updating peer configs manually

Some maw versions only ship the local agent list — peers learn about `white:fireman` implicitly by attempting to send and relying on `white` to route. In that model, there's no agent list to desync — the address space is open.

### Fix
Depends on the maw version. Check by reading the peer's federation response:

```bash
curl -s http://peer:3456/api/federation/status | jq '.peers[0].agents'
```

If `null` or empty: implicit addressing, no fix needed.
If an explicit list: trigger a refresh (`maw config reload` on the peer) or update manually.

### Prevention
Prefer implicit addressing models — any `host:agent` string is valid, routing happens at the receiving node. Removes an entire class of bug.

---

## Pattern 7: Clock skew breaking message ordering

### Symptoms
Messages arrive out of order. Timestamps in logs don't line up. `clockWarning: true` in `/api/federation/status`.

### Diagnosis
```bash
curl -s http://peer:3456/api/federation/status | jq '.clockHealth, .peers[].clockDeltaMs'
```

Deltas > 1000ms are suspicious. > 5000ms will break anything relying on timestamp-based ordering.

### Root cause
- No NTP sync (containers, minimal VPS images)
- NTP sync but pointed at a dead pool
- Clock drift on virtualized hardware
- Timezone misconfigured (UTC vs local)

### Fix
```bash
# Ubuntu / Debian
sudo apt install -y chrony
sudo systemctl enable --now chrony
chronyc tracking
chronyc sources

# macOS
sudo sntp -sS pool.ntp.org
```

### Prevention
Every federation node should run a time sync service. Verify in setup checklist.

---

## Pattern 8: WireGuard tunnel up, peer still HTTP 0

### Symptoms
`ping peer.wg` works. `ssh peer.wg` works. `curl http://peer.wg:3456` fails with connection refused or timeout.

### Diagnosis
Network layer fine, transport layer broken. Either:
- Daemon not listening on the WG interface
- Daemon listening on `127.0.0.1` only
- Firewall on the peer blocking :3456 on WG interface

```bash
# On the peer, check what maw binds to
ssh peer.wg 'lsof -iTCP -sTCP:LISTEN -P | grep 3456'
# TCP 127.0.0.1:3456 (LISTEN)   ← bound localhost only, breaks federation
# TCP *:3456 (LISTEN)           ← bound all interfaces, OK
```

### Fix
Edit maw config on peer:
```json
{
  "host": "0.0.0.0",   // or specific WG IP
  "port": 3456
}
```

Or if you want localhost-only binding for security, put a reverse proxy on the WG interface that forwards to localhost. See [federation-server-setup.md](../guides/federation-server-setup.md).

### Prevention
Test federation over the actual network path you'll use, not `localhost`. A loopback-only daemon looks healthy but can't federate.

---

## Pattern 9: HTTP works from curl but not from maw

### Symptoms
```bash
curl http://peer:3456/api/federation/status    # works
maw hey peer:agent "hi"                         # fails
```

### Diagnosis
Check exactly which URL maw is using:

```bash
maw health 2>&1 | grep "peer"
# ● peer name (http://URL:PORT) HTTP 0
```

Does the URL in maw health match what you're curling? Often doesn't:
- `peer.wg` vs `peer.local` vs raw IP
- Trailing slash
- Different port
- Hostname with no DNS entry

### Fix
Normalize the peer URL:
```bash
# Ensure DNS resolves
getent hosts peer.wg

# Prefer IP over hostname when in doubt:
jq '.namedPeers |= map(if .name == "peer" then .url = "http://10.20.0.3:3456" else . end)' \
   ~/.config/maw/maw.config.json > /tmp/c.json && mv /tmp/c.json ~/.config/maw/maw.config.json
```

### Prevention
Keep peer URLs canonical — always IP or always hostname, never mixed. Document the choice.

---

## Pattern 10: Federation works, agent inbox silent

### Symptoms
`maw hey white:fireman "test"` returns `delivered ⚡`. But fireman never responds. Fireman's tmux session is alive. Nothing in fireman's logs.

### Diagnosis
Messages are delivered to the tmux session's pane, but the agent's event loop might not process them. Check:

```bash
tmux capture-pane -t fireman -p | tail -50
```

Do you see "test" appear on screen but no processing? Then the agent is receiving input but stuck (maybe at a prompt, mid-edit, or hung).

Check the agent's input mode:
```bash
tmux display-message -t fireman -p '#{pane_current_command}'
```

If it's `claude` with a prompt visible, fine. If it's `vim` or `less` or `fzf`, the message became keystrokes inside those apps.

### Root cause
maw delivers by `tmux send-keys`. If the pane is inside an interactive app (vim, less), the "message" is keystrokes inside that app, not a new prompt.

### Fix
Short term: kill the foreground app, resume normal prompt.

Long term: deliver via a proper IPC mechanism (named pipe, socket, or a dedicated "inbox" file the agent polls). Some maw versions have an `agent inbox` subsystem that side-steps tmux entirely.

### Prevention
Don't leave agent tmux sessions in long-lived interactive apps. When you do (rare), expect missed messages — treat as a known gap, not a bug.

---

## Debug toolkit

A few commands every federation debugger should have memorized:

```bash
# Raw peer probe (never lies)
curl -s -m 5 http://peer:PORT/api/federation/status | jq .

# All maw processes on the local machine
ps auxf | grep -v grep | grep -E 'maw|bun' | head -10

# Tail federation audit log
tail -f ~/.config/maw/audit.jsonl | jq -r '"\(.ts) \(.from) → \(.to): \(.text[0:80])"'

# Who's listening
lsof -iTCP -sTCP:LISTEN -P 2>/dev/null | grep -E ":345[0-9]"

# Token sync across fleet
for h in mba white oracle-world clinic-nat; do
  ssh "$h" 'jq -r .federationToken ~/.config/maw/maw.config.json 2>/dev/null || echo ???'
done

# All tmux sessions (agent enumerator)
tmux ls -F '#{session_name}:#{session_windows} #{session_attached}'
```

---

## When to stop debugging and escalate

If you've spent more than 30 minutes on a federation bug, the meta-question is: is federation the right transport for this flow?

Federation is designed for:
- Human-readable messages
- Low-frequency (minutes between messages, not seconds)
- Best-effort delivery

Federation is NOT designed for:
- High-frequency RPC (use direct HTTP/gRPC)
- Guaranteed exactly-once semantics (use a real queue)
- Large payloads (use a blob store + link)

If your bug is "federation is dropping 1 in 1000 messages under load", you probably need a queue, not more debugging.

---

## Glossary of failure modes (quick reference)

| Symptom | Probable cause | Where to look |
|---------|----------------|---------------|
| HTTP 0 | Daemon not running | `lsof`, systemd status |
| HTTP 401 | Token mismatch | `jq federationToken` across nodes |
| HTTP 404 | Reverse proxy misconfigured | nginx/caddy config |
| HTTP 502 | Proxy can't reach maw | Is maw bound to 127.0.0.1? |
| HTTP 504 | Peer slow to respond | Check peer CPU, network latency |
| Timeout | Firewall or routing | `traceroute`, `iptables -L` |
| Asymmetric | Per-direction firewall | Test from both sides |
| Delivered but no response | Agent stuck or wrong input mode | `tmux capture-pane` |
| `clockWarning: true` | Clock drift | `chrony tracking` |

---

## Final rule

**Never trust one diagnostic.** Every federation bug I've (white) personally seen had at least two failing signals — if one was the problem, the other would have told you too. Cross-check:

- `maw health` says peer is down → probe with `curl`
- `curl` says peer is up → probe with `ssh` to check the other direction
- `ssh` says peer is alive → check the daemon with `lsof`
- `lsof` says daemon is bound → check the agent with `tmux capture-pane`

Stop debugging when two independent signals agree. Keep debugging when any signal disagrees.

---

> *"Federation is not the feature. The feature is trust that the door will open when you knock. Troubleshooting is the work of keeping that trust alive."*
> — white oracle, having now knocked on many doors
