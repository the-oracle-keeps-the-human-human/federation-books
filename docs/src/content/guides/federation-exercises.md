# Federation Exercises Workbook

### Hands-On Practice — From Beginner to Advanced

> วาดโดย Federation Oracle 🗺️ — The Cartographer
> "อ่านแผนที่ร้อยครั้ง ไม่เท่าเดินทางเองหนึ่งครั้ง"

---

## How to Use This Workbook

Each exercise has:
- **Goal**: What you'll learn
- **Prerequisites**: What you need
- **Steps**: What to do
- **Verify**: How to confirm it worked
- **Bonus**: Extra challenge

Work through them in order — each builds on the previous one.

---

## Level 1: Foundations

### Exercise 1.1: Check Your Machine

**Goal**: Verify your machine is ready for federation.

**Steps**:
```bash
# 1. Check Bun
bun --version
# Expected: v1.x.x

# 2. Check maw
maw --version
# Expected: v26.x.x

# 3. Check network
ipconfig getifaddr en0   # macOS WiFi
# or: hostname -I        # Linux
# Expected: an IP like 192.168.x.x

# 4. Check if port 3456 is free
lsof -i :3456
# Expected: nothing (port is free)
```

**Verify**: All 4 commands succeed. Write down your IP: `__________`

---

### Exercise 1.2: Create Your First Config

**Goal**: Write a valid `maw.config.json` from scratch.

**Steps**:
```bash
# 1. Generate a token
openssl rand -hex 16
# Write it down: __________________________________

# 2. Create the config directory
mkdir -p ~/.config/maw

# 3. Create the config file (replace the placeholders!)
cat > ~/.config/maw/maw.config.json << 'EOF'
{
  "node": "YOUR_NAME",
  "port": 3456,
  "host": "0.0.0.0",
  "federationToken": "YOUR_TOKEN",
  "namedPeers": [],
  "agents": {}
}
EOF

# 4. Validate
scripts/federation-validate.sh
```

**Verify**: Validator shows "✅ Valid JSON", "✅ host: 0.0.0.0", "✅ federationToken"

**Bonus**: What happens if you set `host` to `"localhost"` and run the validator?

---

### Exercise 1.3: Start and Stop maw serve

**Goal**: Understand the maw serve lifecycle.

**Steps**:
```bash
# 1. Start maw serve
maw serve &
# Note the PID: ____

# 2. Check it's running
curl -s http://localhost:3456/api/identity | jq .
# What's the node name? ________

# 3. Check sessions
curl -s http://localhost:3456/api/sessions | jq .
# How many sessions? ____

# 4. Stop it
kill %1  # or: kill PID

# 5. Verify it stopped
curl -s http://localhost:3456/api/identity
# Expected: connection refused
```

**Verify**: You can start, query, and stop maw serve.

---

## Level 2: Two-Node Federation

### Exercise 2.1: Connect Two Machines

**Goal**: Establish your first federation.

**Prerequisites**: Two machines on the same network.

**Steps**:
```bash
# On Machine A:
# 1. Add Machine B as a peer
# Edit ~/.config/maw/maw.config.json:
# Add to namedPeers: {"name": "machine-b", "url": "http://B_IP:3456"}

# 2. Start serving
maw serve

# On Machine B:
# 3. Create config (mirror — same token, point at A)
# 4. Start serving
maw serve

# On Machine A:
# 5. Check status
maw federation status
```

**Verify**: Both machines show each other as "reachable"

**Bonus**: What happens if you use different tokens on each machine?

---

### Exercise 2.2: Send Your First Message

**Goal**: Prove messages travel across machines.

**Prerequisites**: Exercise 2.1 complete.

**Steps**:
```bash
# On Machine B — start a tmux session with Claude:
tmux new-session -d -s test-oracle
tmux send-keys -t test-oracle 'claude' Enter

# On Machine A — send a message:
maw hey machine-b:test-oracle "Exercise 2.2 — can you hear me?"
# Expected: ✅ delivered

# On Machine B — check if the oracle received it:
# (Look at the Claude session — the message should be visible)
```

**Verify**: Message appears in Machine B's oracle session.

---

### Exercise 2.3: Complete a Roundtrip

**Goal**: Send a message AND get a reply back.

**Steps**:
```bash
# Machine A → Machine B:
maw hey machine-b:test-oracle "What's 2+2? Reply to machine-a:SESSION"

# Machine B → Machine A (from the oracle):
! maw hey machine-a:SESSION "4! Roundtrip complete."

# Machine A — verify reply arrived
```

**Verify**: Both machines sent and received messages.

**Bonus**: Time the roundtrip. How many milliseconds?

---

### Exercise 2.4: Use maw peek

**Goal**: View a remote oracle's screen.

**Steps**:
```bash
# From Machine A:
maw peek machine-b:test-oracle

# Expected: you see the terminal content of Machine B's oracle
```

**Verify**: You can see what the remote oracle is doing.

**Question**: Why should you use `maw peek` instead of `tmux capture-pane`?

**Answer**: `maw peek` works across machines via federation. `tmux capture-pane` only works locally.

---

## Level 3: Understanding the Protocol

### Exercise 3.1: Inspect HMAC Authentication

**Goal**: Understand how federation requests are authenticated.

**Steps**:
```bash
# 1. Read your token
TOKEN=$(jq -r '.federationToken' ~/.config/maw/maw.config.json)
echo "Token: $TOKEN"

# 2. Create a timestamp
TIMESTAMP=$(date +%s)
echo "Timestamp: $TIMESTAMP"

# 3. Compute a signature manually
MESSAGE="GET:/api/identity:$TIMESTAMP"
SIGNATURE=$(echo -n "$MESSAGE" | openssl dgst -sha256 -hmac "$TOKEN" -hex | awk '{print $2}')
echo "Message: $MESSAGE"
echo "Signature: $SIGNATURE"

# 4. Send an authenticated request
curl -s http://PEER:3456/api/send \
  -H "X-Maw-Signature: $SIGNATURE" \
  -H "X-Maw-Timestamp: $TIMESTAMP" \
  -H "Content-Type: application/json" \
  -d '{"target": "test", "message": "manual HMAC!"}'
```

**Verify**: You understand how the signature is computed.

**Question**: What happens if you change one character in the token?

---

### Exercise 3.2: Clock Drift Experiment

**Goal**: Understand why clocks matter for HMAC.

**Steps**:
```bash
# 1. Check clock difference between machines
echo "Local: $(date +%s)"
ssh user@peer "echo Remote: \$(date +%s)"
# Difference: ____ seconds

# 2. Try sending a request with a timestamp 6 minutes in the past
OLD_TIMESTAMP=$(($(date +%s) - 360))
# Compute signature with old timestamp, send request
# Expected: 403 Forbidden (outside ±5 min window)

# 3. Try with a timestamp 4 minutes old
RECENT_TIMESTAMP=$(($(date +%s) - 240))
# Expected: 200 OK (within window)
```

**Verify**: Requests with timestamps >5 minutes old are rejected.

---

### Exercise 3.3: Explore Public vs Protected Endpoints

**Goal**: Understand which endpoints need authentication.

**Steps**:
```bash
# Public endpoints (no auth needed):
curl -s http://PEER:3456/api/identity | jq .     # ✅ Works
curl -s http://PEER:3456/api/sessions | jq .     # ✅ Works
curl -s "http://PEER:3456/api/capture?target=test-oracle" | jq .  # ✅ Works

# Protected endpoint (needs auth):
curl -s -X POST http://PEER:3456/api/send \
  -H "Content-Type: application/json" \
  -d '{"target": "test", "message": "no auth"}'
# Expected: 403 Forbidden

# Same endpoint WITH auth:
# (compute signature first — see Exercise 3.1)
# Expected: 200 OK (or 404 if target doesn't exist)
```

**Verify**: You know which endpoints are public and which need HMAC.

**Question**: What security implications does public `/api/capture` have?

---

## Level 4: Operations

### Exercise 4.1: Set Up pm2 Persistence

**Goal**: Keep maw running after terminal close and system reboot.

**Steps**:
```bash
# 1. Install pm2
bun add -g pm2

# 2. Start maw with pm2
pm2 start maw --interpreter bun -- serve

# 3. Save the process list
pm2 save

# 4. Close your terminal, open a new one
# Check: is maw still running?
pm2 list
curl -s http://localhost:3456/api/identity | jq .

# 5. Set up boot persistence
sudo pm2 startup
pm2 save
```

**Verify**: maw survives terminal close. (Reboot test is bonus.)

---

### Exercise 4.2: Config Backup and Recovery

**Goal**: Practice the backup/restore workflow.

**Steps**:
```bash
# 1. Create a backup
cp ~/.config/maw/maw.config.json ~/.config/maw/maw.config.json.bak.$(date +%s)

# 2. List backups
ls -la ~/.config/maw/maw.config.json.bak.*

# 3. Deliberately break the config (for practice!)
# Change federationToken to something wrong
jq '.federationToken = "wrong"' ~/.config/maw/maw.config.json > /tmp/bad.json
mv /tmp/bad.json ~/.config/maw/maw.config.json

# 4. Restart maw, check status
pm2 restart maw
maw federation status
# Expected: peers show 403 or unreachable

# 5. Restore from backup
cp ~/.config/maw/maw.config.json.bak.* ~/.config/maw/maw.config.json
pm2 restart maw
maw federation status
# Expected: all peers reachable again
```

**Verify**: You can backup, break, and restore config confidently.

---

### Exercise 4.3: Add a Third Node

**Goal**: Scale from 2 to 3 nodes.

**Steps**:
```bash
# 1. Set up a 3rd machine (or use a Docker container, or a Pi)
# Install maw, create config with SAME token

# 2. The new node lists both existing nodes as peers
# 3. BOTH existing nodes add the new node as a peer
# 4. Restart maw on all 3 machines

# 5. Verify from ALL 3 machines:
maw federation status
# Each should show 2 peers, both reachable

# 6. Test broadcast:
maw broadcast "Hello from the 3-node federation!"
# All oracles on all machines should receive it
```

**Verify**: `maw federation status` shows 2/2 peers from every node.

**Reflection**: How many config entries did you add total? (Answer: 6 — each of 3 nodes has 2 peers)

---

## Level 5: Advanced Challenges

### Exercise 5.1: Federation via Tailscale

**Goal**: Connect two machines that aren't on the same LAN.

**Steps**:
1. Install Tailscale on both machines
2. Join the same tailnet
3. Get Tailscale IPs: `tailscale ip -4`
4. Update namedPeers to use Tailscale IPs
5. Verify `maw federation status`

**Bonus**: Measure latency difference between LAN and Tailscale.

---

### Exercise 5.2: Automated Health Monitoring

**Goal**: Set up cron-based federation monitoring.

**Steps**:
```bash
# 1. Test the health check script
./scripts/federation-health.sh

# 2. Test JSON output
./scripts/federation-health.sh --json | jq .

# 3. Set up a 5-minute cron job
crontab -e
# Add:
*/5 * * * * /path/to/scripts/federation-health.sh --quiet || echo "$(date): DEGRADED" >> /tmp/federation.log

# 4. Wait 10 minutes, check the log
cat /tmp/federation.log
```

---

### Exercise 5.3: Build a Custom Integration

**Goal**: Write a script that uses the federation API.

**Challenge**: Write a bash script that:
1. Checks all peers' status
2. Queries each peer's session list
3. Counts total oracles across the federation
4. Prints a summary

```bash
#!/bin/bash
# Your solution here!
# Hints: use curl, jq, and the API endpoints from federation-api.md
```

**Verify**: Your script correctly reports total nodes and oracles.

---

## Answer Key

### Exercise 1.2 Bonus
With `host: "localhost"`, the validator warns: "⚠️ host is 'localhost' — remote peers CAN'T reach you!"

### Exercise 2.1 Bonus
With different tokens, `maw federation status` shows "reachable" (GET /api/identity is public), but `maw hey` fails with 403 Forbidden (POST /api/send requires matching HMAC).

### Exercise 3.1 Question
One character change = completely different signature. HMAC is a cryptographic hash — even a tiny change produces an entirely different output. The peer's signature won't match.

### Exercise 3.3 Question
Public `/api/capture` means anyone who can reach your server can read your oracle's terminal screen. For internet-facing nodes, restrict access via firewall or reverse proxy.

---

🤖 Federation Oracle 🗺️ — Exercises Workbook v1.0
