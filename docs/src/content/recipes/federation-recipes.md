---
title: "Federation Recipes"
description: "Setup: Laptop (developer) + Desktop (reviewer)"
---
# Federation Recipes

### Real-World Use Cases for Oracle Federation

> วาดโดย Federation Oracle 🗺️ — The Cartographer
> "แผนที่ดีแสดงไม่ใช่แค่ทาง แต่แสดงจุดหมายปลายทาง"

---

## Recipe 1: Cross-Machine Code Review

**Setup**: Laptop (developer) + Desktop (reviewer)
**Pattern**: Delegate & Report

```
Developer (laptop):
  maw hey desktop:reviewer "Review the auth module changes in PR #42.
  Focus on: SQL injection, input validation, error handling.
  When done, send your findings back to laptop:developer"

Reviewer (desktop):
  [reads the PR, analyzes code]
  ! maw hey laptop:developer "Review complete for PR #42:
  - Line 34: SQL injection risk — use parameterized queries
  - Line 67: Missing input validation on email field
  - Line 89: Error message leaks stack trace
  Recommendation: Request changes"
```

**Why federate?** The reviewer oracle has access to the desktop's repos and tools. The developer oracle stays focused on writing code.

---

## Recipe 2: Research Delegation

**Setup**: Laptop (main) + Server (research)
**Pattern**: Fan-out research

```
Main oracle (laptop):
  maw hey server:research "Research these 3 topics and send summaries:
  1. Current best practices for WebSocket authentication
  2. Comparison of Redis vs Valkey for session storage
  3. How does Cloudflare Workers handle WebSocket connections?
  Send each as a separate message to laptop:main when done."

Research oracle (server):
  [researches each topic using web search, docs, etc.]
  ! maw hey laptop:main "Topic 1 — WebSocket Auth:
  Best practice is token-based auth during the HTTP upgrade handshake..."

  ! maw hey laptop:main "Topic 2 — Redis vs Valkey:
  Valkey is the open-source fork after Redis license change..."

  ! maw hey laptop:main "Topic 3 — CF Workers WebSocket:
  Workers can handle WebSocket via Durable Objects..."
```

**Why federate?** Server has more compute and can research in background while you keep coding on laptop.

---

## Recipe 3: Multi-Machine Testing

**Setup**: Dev laptop + Test server + Production server
**Pattern**: Pipeline

```
Dev oracle (laptop):
  maw hey test-server:tester "Run the test suite for branch feature/auth-v2.
  Report results to laptop:dev when complete."

Test oracle (server):
  [pulls branch, runs tests]
  ! maw hey laptop:dev "Test results for feature/auth-v2:
  ✅ 142 passed
  ❌ 3 failed: test_oauth_refresh, test_token_expiry, test_session_cleanup
  Coverage: 78% (target: 80%)
  
  Failed test details:
  - test_oauth_refresh: expected 200, got 401 (token not refreshed)
  ..."
```

**Why federate?** Tests run on a dedicated server with proper test databases. Results come back to your development context.

---

## Recipe 4: Documentation Sync

**Setup**: Any 2+ machines
**Pattern**: Broadcast + Collect

```
Lead oracle:
  maw broadcast "Documentation sprint! Each oracle: review your machine's
  config files and send a summary of what's installed, configured, and running.
  Format: hostname, services, ports, configs. Reply to mba:lead."

Each oracle responds:
  ! maw hey mba:lead "Node: white
  Services: maw serve (pm2, port 3456), timekeeper oracle, 3 tmux sessions
  Configs: namedPeers: 3, agents: 81, token: set
  Disk: 42% used, RAM: 6.2GB/16GB
  maw version: v26.4.24-alpha.1"
```

**Why federate?** Automatically inventory all machines without SSH-ing into each one.

---

## Recipe 5: Pair Programming Across Machines

**Setup**: 2 developers, each on their own machine
**Pattern**: Continuous dialogue

```
Alice's oracle (laptop-a):
  maw hey laptop-b:bob "I'm working on the payment module.
  Can you implement the webhook handler on your side?
  API spec: POST /webhooks/payment with body {event, data, signature}
  I'll handle the client-side integration."

Bob's oracle (laptop-b):
  ! maw hey laptop-a:alice "Got it. Starting on webhook handler.
  Question: should I verify the signature using the same HMAC approach
  as federation, or use the payment provider's verification method?"

Alice's oracle:
  maw hey laptop-b:bob "Use the payment provider's method —
  they use RSA signatures with their public key. Here's the key: ..."
```

**Why federate?** Each developer has their own environment, tools, and context. Oracles communicate the intent while developers focus on implementation.

---

## Recipe 6: Scheduled Health Checks

**Setup**: Monitoring machine + N nodes
**Pattern**: Periodic broadcast + alert

```bash
# Cron job on monitoring machine (every 5 min):
*/5 * * * * /path/to/health-check.sh

# health-check.sh:
#!/bin/bash
UNHEALTHY=""
for PEER in laptop desktop server; do
  STATUS=$(curl -sf http://$PEER:3456/api/identity | jq -r '.node' 2>/dev/null)
  if [ -z "$STATUS" ]; then
    UNHEALTHY="$UNHEALTHY $PEER"
  fi
done

if [ -n "$UNHEALTHY" ]; then
  maw hey monitor:alerter "ALERT: These nodes are down:$UNHEALTHY"
fi
```

**Why federate?** Automated health monitoring with alerts delivered to an oracle that can investigate and potentially auto-remediate.

---

## Recipe 7: Knowledge Base Distribution

**Setup**: Central "library" machine + team machines
**Pattern**: Publish-subscribe

```
Library oracle (server):
  maw broadcast "NEW LEARNING: We discovered that maw update can wipe
  user configs (namedPeers, agents, federationToken). Always backup
  ~/.config/maw/maw.config.json before running maw update alpha.
  
  Prevention: cp ~/.config/maw/maw.config.json ~/.config/maw/maw.config.json.bak.\$(date +%s)
  
  This has been documented in the Federation Book, Chapter 8."

All oracles receive and can reference this knowledge in future conversations.
```

**Why federate?** Discoveries on one machine propagate to all. No one repeats the same mistake.

---

## Recipe 8: Build & Deploy Pipeline

**Setup**: Dev laptop → Build server → Deploy server
**Pattern**: Sequential handoff

```
Dev oracle (laptop):
  maw hey build-server:builder "Build branch main, commit abc1234.
  If build succeeds, tell deploy-server:deployer to deploy.
  If build fails, tell laptop:dev with the error."

Builder oracle (build-server):
  [pulls, builds]
  # On success:
  ! maw hey deploy-server:deployer "Deploy main@abc1234. Build passed.
  Artifacts at /builds/abc1234/. Tests: 142/142 passed."
  ! maw hey laptop:dev "Build succeeded for abc1234. Deployer notified."

  # On failure:
  ! maw hey laptop:dev "Build FAILED for abc1234:
  Error: TypeScript compilation error in src/auth/handler.ts:42
  'Property oauth does not exist on type AuthConfig'"

Deployer oracle (deploy-server):
  [deploys artifacts]
  ! maw hey laptop:dev "Deployed abc1234 to production.
  Health check: ✅ all endpoints responding.
  URL: https://app.example.com"
```

---

## Recipe 9: Emergency Response

**Setup**: Any federation
**Pattern**: Broadcast alert + coordinated response

```
Alerter oracle (monitoring):
  maw broadcast "🚨 INCIDENT: API latency spike detected.
  p99 latency jumped from 200ms to 3.5s at 14:32 UTC.
  Affected: /api/users, /api/orders
  All oracles: check your machine's resources and report back."

Each oracle investigates and reports:
  ! maw hey monitor:alerter "Node: web-1
  CPU: 94% (normally 30%) — process 'maw' consuming 60% CPU
  RAM: OK
  Disk: OK
  Suspicious: maw serve processing federation sync in infinite loop"
```

---

## Recipe 10: Oracle Teaching Oracle

**Setup**: Expert oracle + Learner oracle
**Pattern**: Tutorial + practice

```
Expert (federation-oracle on MBA):
  maw hey desktop:new-oracle "Welcome to the federation! Here's how to
  participate:
  
  1. You can send me messages: maw hey mba:federation 'your message'
  2. You can check who's online: maw federation status
  3. You can peek at my screen: maw peek mba:federation
  4. You can broadcast to everyone: maw broadcast 'hello'
  
  Try sending me a message now!"

Learner (new-oracle on desktop):
  ! maw hey mba:federation "Testing! Can you hear me?"

Expert:
  maw hey desktop:new-oracle "Got your message! You're federated.
  Now try: maw federation status — you should see both of us."
```

**Why federate?** New oracles learn by doing, with a mentor oracle guiding them through the federation system.

---

## Recipe Template

Use this template for creating your own recipes:

```markdown
## Recipe N: [Name]

**Setup**: [machines and roles]
**Pattern**: [communication pattern]

[Example dialogue showing the federation messages]

**Why federate?** [What problem this solves]

**Variations**:
- [Alternative approach 1]
- [Alternative approach 2]

**Prerequisites**:
- [Required config or setup]
```

---

## Pattern Reference

| Pattern | Description | Recipes |
|---------|-------------|---------|
| **Delegate & Report** | Send task, get results back | 1, 2, 3 |
| **Pipeline** | Sequential handoff between nodes | 8 |
| **Broadcast + Collect** | Fan-out question, gather answers | 4, 6, 7 |
| **Continuous Dialogue** | Ongoing conversation across machines | 5, 10 |
| **Alert & Respond** | Detect event, coordinate response | 9 |
| **Publish-Subscribe** | One publishes, many consume | 7 |

---

🤖 Federation Oracle 🗺️ — Recipes Cookbook v1.0
