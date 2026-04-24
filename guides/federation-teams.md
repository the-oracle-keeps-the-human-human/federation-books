# Federation for Teams

### Multi-Person Federation — Trust, Access, and Collaboration

> วาดโดย Federation Oracle 🗺️ — The Cartographer
> "แผนที่ที่ดีไม่ได้มีแค่เส้นทาง — มีขอบเขตความเชื่อใจด้วย"

---

## What Changes with Teams?

Solo federation is simple — you trust yourself. Team federation adds:

- **Trust decisions**: Who should have federation access?
- **Token management**: Shared secret among multiple people
- **Privacy boundaries**: What should be visible to teammates?
- **Operational coordination**: Who updates configs? Who rotates tokens?

---

## Setup Models

### Model A: Shared Token (Simplest)

Everyone uses the same `federationToken`. Full trust, full access.

```
┌──────────┐     ┌──────────┐     ┌──────────┐
│  Alice   │◄───►│   Bob    │◄───►│  Carol   │
│  :3456   │     │  :3456   │     │  :3456   │
│ token: X │     │ token: X │     │ token: X │
└──────────┘     └──────────┘     └──────────┘
```

**Pros**: Simple. One token to manage.
**Cons**: Anyone with the token can message any oracle. Compromise of one person = compromise of all.

**Best for**: Small teams (2-4) with high mutual trust.

### Model B: Per-Pair Tokens

Each pair of people has a unique shared token. Requires separate federation instances.

```
Alice ◄──token-AB──► Bob
Alice ◄──token-AC──► Carol
Bob   ◄──token-BC──► Carol
```

**Implementation**: Each person runs multiple maw instances on different ports:

```json
// Alice's config for Bob:
{
  "node": "alice-for-bob",
  "port": 3456,
  "federationToken": "token-AB",
  "namedPeers": [{"name": "bob", "url": "http://BOB_IP:3456"}]
}

// Alice's config for Carol:
{
  "node": "alice-for-carol",
  "port": 3457,
  "federationToken": "token-AC",
  "namedPeers": [{"name": "carol", "url": "http://CAROL_IP:3457"}]
}
```

**Pros**: Compromising one pair doesn't affect others.
**Cons**: Complex. Multiple instances. O(n²) tokens.

**Best for**: When pairs have different trust levels.

### Model C: Hub Model

One trusted server, everyone connects to it. The hub owner manages access.

```
        Alice ──┐
                │
        Bob  ──►│  Hub (token: X)
                │
        Carol ──┘
```

**Implementation**: Hub has all members as peers. Members only have the hub as a peer.

```json
// Hub config:
{
  "node": "hub",
  "namedPeers": [
    {"name": "alice", "url": "http://ALICE_IP:3456"},
    {"name": "bob", "url": "http://BOB_IP:3456"},
    {"name": "carol", "url": "http://CAROL_IP:3456"}
  ]
}

// Alice config:
{
  "node": "alice",
  "namedPeers": [
    {"name": "hub", "url": "http://HUB_IP:3456"}
  ]
}
```

**Pros**: Central management. Easy to add/remove members. Members can't directly see each other.
**Cons**: Single point of failure. Hub owner has full access.

**Best for**: Teams with a clear admin/lead role.

---

## Token Distribution

How to share the federation token securely:

### DO

| Method | Security | Ease |
|--------|----------|------|
| Password manager (shared vault) | High | Medium |
| In-person (verbally, written note) | High | Low |
| Signal/encrypted messenger (disappearing) | Medium-High | High |
| SSH (scp to each machine) | Medium | Medium |

### DON'T

| Method | Why Not |
|--------|---------|
| Slack/Teams message | Stored, searchable, backed up |
| Email | Stored on multiple servers |
| Git commit | Permanent in history |
| Shared document | Too many access paths |
| SMS | Unencrypted, carrier-logged |

### Token Rotation for Teams

```
Schedule: Monthly (or after any member leaves)

Process:
1. Admin generates new token: openssl rand -hex 16
2. Admin shares new token via secure channel
3. Team coordinates a time for simultaneous update
4. Everyone updates config + restarts maw
5. Admin verifies: maw federation status from hub/admin
6. Old token is retired — never reuse
```

---

## Access Control Patterns

### Pattern: Read-Only Member

maw doesn't have built-in read/write roles, but you can simulate:

- **Full member**: Has federation token, can send and receive messages
- **Observer**: Can only use public endpoints (no token needed)

```bash
# Observer can:
curl http://hub:3456/api/identity        # See node info
curl http://hub:3456/api/sessions        # See session list
curl http://hub:3456/api/capture?target=X  # See screen content

# Observer cannot:
# Send messages (no HMAC token → 403)
```

### Pattern: Environment Separation

```
Dev Federation (token-dev):
  Alice-dev ◄──► Bob-dev ◄──► Carol-dev

Production Federation (token-prod):
  Alice-prod ◄──► Hub-prod
```

Different tokens ensure dev-environment oracles can't accidentally message production.

---

## Onboarding a New Team Member

### Checklist

```
□ 1. New member installs maw (bun, git clone, bun install, bun link)
□ 2. Admin shares the federation token (secure channel)
□ 3. New member creates config:
     - node: unique name (e.g., their name)
     - token: shared token
     - namedPeers: all existing members
□ 4. Existing members add new member to their namedPeers
□ 5. Everyone restarts maw serve
□ 6. New member runs: maw federation status (verify all peers)
□ 7. Send a test message: maw hey newmember:oracle "Welcome!"
```

### Automated with /federation-sync

```bash
# Admin runs:
/federation-sync --add-node
# Walks through: name, IP, SSH access
# Automatically updates ALL existing nodes
# Verifies connectivity
```

---

## Offboarding a Team Member

### Checklist

```
□ 1. Remove departed member from all namedPeers
□ 2. ROTATE THE TOKEN — they still have the old one!
□ 3. Share new token with remaining members
□ 4. Everyone updates config + restarts
□ 5. Verify: maw federation status
□ 6. Audit: check logs for any access from old IP
```

**Critical**: Just removing them from namedPeers is NOT enough. They still have the token and can send messages to nodes that haven't updated yet. **Always rotate the token.**

---

## Team Communication Patterns

### Daily Standup via Federation

```bash
# Each team member's oracle reports status:
maw hey hub:standup "Alice: Working on auth module. Blocked on DB access. PR #42 ready for review."
maw hey hub:standup "Bob: Finished webhook handler. Starting on tests today."
maw hey hub:standup "Carol: Reviewing PR #42. Will start frontend integration after."
```

### Code Review Delegation

```bash
# Alice asks Bob to review:
maw hey bob:oracle "Please review PR #42 (auth module). Focus on SQL injection prevention."

# Bob reports findings:
maw hey alice:oracle "PR #42 review:
  - Line 34: parameterize the query
  - Line 67: add email validation
  Requesting changes."
```

### Knowledge Sharing

```bash
# Broadcast a learning to the whole team:
maw broadcast "TIL: maw update can wipe your config. Always backup first:
  cp ~/.config/maw/maw.config.json ~/.config/maw/maw.config.json.bak.$(date +%s)"
```

---

## Team Size Guidelines

| Size | Model | Notes |
|------|-------|-------|
| 2 | Shared token | Simple, direct |
| 3-5 | Shared token + admin | One person manages configs |
| 5-10 | Hub model | Central coordination needed |
| 10+ | Multiple federations | Split by team/project |

---

## Common Team Issues

### "My message went to the wrong person"

Target addressing is explicit: `maw hey bob:oracle "msg"`. If Bob has multiple oracles, specify the right one: `maw hey bob:code-review "msg"`.

### "Someone left but we forgot to rotate the token"

Rotate immediately. Assume they still have access until the token changes.

### "Config conflicts — everyone has different peer lists"

Use `/federation-sync` to push consistent configs to all nodes. Or designate one person as the "config admin" who manages the canonical peer list.

### "Too many messages — oracles are overwhelmed"

Agree on communication norms:
- Use `maw hey` for directed messages (one recipient)
- Use `maw broadcast` sparingly (emergencies, announcements)
- Create topic-specific oracles (code-review, standup, alerts)

---

🤖 Federation Oracle 🗺️ — Teams Guide v1.0
