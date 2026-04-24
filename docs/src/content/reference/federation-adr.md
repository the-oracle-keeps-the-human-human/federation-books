---
title: "Federation Architecture Decision Records"
description: "Context: We needed a way for Oracle sessions on different machines to communicate."
---
# Federation Architecture Decision Records

### Why We Built It This Way

> วาดโดย Federation Oracle 🗺️ — The Cartographer
> "ทุกการตัดสินใจมีเหตุผล — บันทึกไว้เพื่อคนที่มาทีหลัง"

---

## ADR-001: Peer-to-Peer over Client-Server

**Date**: April 2026
**Status**: Accepted
**Context**: We needed a way for Oracle sessions on different machines to communicate.

### Options Considered

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| A. Central Server | All messages go through a cloud server | Easy setup, no NAT issues | Single point of failure, privacy concerns, ongoing cost |
| B. Peer-to-Peer | Nodes talk directly to each other | No central dependency, privacy, free | NAT traversal, O(n²) config |
| C. Hybrid (Hub + Peer) | Hub for discovery, P2P for data | Best of both | Complexity, still needs a hub |

### Decision

**Option B: Peer-to-Peer**

### Rationale

1. **Privacy**: Oracle conversations may contain sensitive code, credentials, or business logic. Routing through a third-party server is a non-starter for many users.

2. **Resilience**: If the central server goes down, everyone is disconnected. With P2P, each pair of nodes is independent.

3. **Cost**: No server to maintain or pay for. Federation runs on your existing machines.

4. **Simplicity**: HTTP is universal. No WebSocket state management, no connection pools, no pub/sub broker.

5. **Philosophy**: Principle 3 — "External Brain, Not Command." Federation shouldn't depend on infrastructure the user doesn't control.

### Consequences

- Users must manage `namedPeers` manually (O(n²) config)
- NAT traversal requires Tailscale/ngrok/WireGuard
- No auto-discovery — peers must be explicitly listed
- Created `/federation-sync` skill to mitigate config burden

---

## ADR-002: HMAC-SHA256 over TLS Client Certificates

**Date**: April 2026
**Status**: Accepted
**Context**: Need to authenticate federation requests — prevent unauthorized message injection.

### Options Considered

| Option | Pros | Cons |
|--------|------|------|
| A. No auth | Simplest | Anyone can send messages |
| B. API keys | Simple per-request | Key management, rotation |
| C. HMAC-SHA256 | Standard, no key in transit | Shared secret, clock dependency |
| D. mTLS (client certs) | Strongest, per-node identity | Complex cert management, CA needed |
| E. OAuth2/JWT | Standard, token-based | Needs auth server, complexity |

### Decision

**Option C: HMAC-SHA256 with shared secret**

### Rationale

1. **Zero infrastructure**: No certificate authority, no auth server, no token endpoint. Just a shared string.

2. **Secret never travels**: Unlike API keys, the token isn't sent in requests. Only the signature (derived from token + message + timestamp) travels over the wire.

3. **Replay resistance**: Timestamp must be within ±5 minutes. Captured requests can't be replayed after the window expires.

4. **Simplicity**: One config field (`federationToken`). Compare to mTLS which needs cert generation, distribution, and renewal.

5. **Familiar pattern**: AWS, Stripe, and GitHub webhooks all use HMAC. Users understand it.

### Tradeoffs Accepted

- **Shared secret**: All nodes share one token. Compromise of any node compromises the federation. (Mitigated by network segmentation and token rotation.)
- **No per-node identity**: Can't distinguish which node sent a request. (Acceptable for trust-all-or-none model.)
- **Clock dependency**: Requires NTP. 5-minute window is generous but not infinite.
- **No encryption**: HMAC authenticates but doesn't encrypt. Content is visible to network observers. (Mitigated by using encrypted transports: WireGuard, Tailscale, HTTPS.)

### Future Considerations

- Per-node tokens (each pair has a unique shared secret) for larger federations
- Optional mTLS for production deployments
- JWT for fine-grained permissions (read-only peers, admin peers)

---

## ADR-003: Full Mesh over Hub-and-Spoke

**Date**: April 2026
**Status**: Accepted
**Context**: How should N nodes be connected?

### Options Considered

| Topology | Connections | Failure Mode | Config |
|----------|-------------|--------------|--------|
| A. Hub-and-Spoke | N-1 (star) | Hub down = all down | Simple (spokes only know hub) |
| B. Full Mesh | N×(N-1)/2 | Any node down = others fine | O(n²) config |
| C. Ring | N | Break = partition | Routing needed |
| D. Gossip/DHT | Dynamic | Complex failure modes | Auto-discovery |

### Decision

**Option B: Full Mesh**

### Rationale

1. **Maximum resilience**: Any node can go down without affecting the rest. No single point of failure.

2. **Lowest latency**: Direct connections. No routing through intermediate nodes.

3. **Simple mental model**: "Every node knows every other node." Easy to reason about.

4. **No routing logic**: Messages go directly from sender to receiver. No forwarding, no hop counting, no TTL.

5. **Scale is bounded**: Oracle federation is for small clusters (2-10 nodes), not thousands. At 10 nodes, 90 peer entries is manageable.

### Tradeoffs Accepted

- **O(n²) config**: Adding a node requires updating all existing nodes. (Mitigated by `/federation-sync --add-node`.)
- **No message relay**: If A can't reach C but both can reach B, the message doesn't get relayed through B. (This is by design — explicit trust, not implicit routing.)
- **Not scalable beyond ~20 nodes**: Full mesh becomes unwieldy. (Acceptable for Oracle use case.)

### When to Deviate

- **Star topology**: When spokes can't reach each other (NAT, different networks) — Pattern 3 in Patterns Cookbook
- **Cluster + Remote**: When mixing LAN and WAN — Pattern 5
- **Multiple federations**: When groups shouldn't see each other — Pattern 7

---

## ADR-004: Manual Discovery over Auto-Discovery

**Date**: April 2026
**Status**: Accepted
**Context**: How do nodes find each other?

### Options Considered

| Method | Pros | Cons |
|--------|------|------|
| A. Manual (namedPeers) | Explicit trust, simple | Must update config |
| B. mDNS/Bonjour | Zero-config on LAN | LAN only, security concerns |
| C. Central registry | Universal | Needs server, privacy |
| D. Gossip protocol | Self-healing, dynamic | Complex, trust issues |

### Decision

**Option A: Manual discovery via `namedPeers`**

### Rationale

1. **Explicit trust**: You choose who to federate with. No surprise connections from unknown machines on the network.

2. **Works everywhere**: Not limited to LAN (unlike mDNS). Works across WAN, VPN, tunnels.

3. **Security**: Auto-discovery protocols can be exploited for node enumeration and injection. Manual listing eliminates this attack surface.

4. **Principle 3**: "External Brain, Not Command." The human decides who to trust. The oracle remembers the list.

### Tradeoffs Accepted

- **Setup friction**: Must know peer IPs and manually add them.
- **IP changes**: If a peer's IP changes, config must be updated.
- **Scaling burden**: Each new node requires updating all configs.

### Mitigations

- `/federation-sync --add-node` automates multi-node updates
- Tailscale provides stable IPs
- `scripts/federation-config-gen.sh` generates configs for N nodes

---

## ADR-005: tmux as Session Container

**Date**: April 2026
**Status**: Accepted
**Context**: How does `maw serve` discover and interact with oracle sessions?

### Options Considered

| Container | Pros | Cons |
|-----------|------|------|
| A. tmux | Universal, scriptable, persistent | Requires tmux |
| B. Docker | Isolated, reproducible | Heavy, complex |
| C. systemd units | Native Linux, logging | Linux only, rigid |
| D. Screen | Similar to tmux | Less scriptable |
| E. Custom daemon | Full control | Build everything from scratch |

### Decision

**Option A: tmux sessions**

### Rationale

1. **Already there**: Claude Code runs in terminals. tmux is the standard terminal multiplexer.

2. **Scriptable**: `tmux send-keys`, `tmux capture-pane` enable programmatic interaction.

3. **Persistent**: Sessions survive terminal close (unlike raw shell).

4. **Multi-window**: One session can have multiple windows/panes for different contexts.

5. **Cross-platform**: Works on macOS and Linux (the platforms Claude Code supports).

### Known Issues

- **pm2 + tmux visibility**: pm2-launched `maw serve` can't see tmux sessions started by the user. Workaround: `--force` flag.
- **Environment isolation**: SSH sessions may not have the same tmux socket. Set `TMUX_TMPDIR` in pm2 config.

---

## ADR-006: HTTP REST over WebSocket for Federation

**Date**: April 2026
**Status**: Accepted
**Context**: What protocol for cross-machine communication?

### Options Considered

| Protocol | Pros | Cons |
|----------|------|------|
| A. HTTP REST | Stateless, simple, debuggable | No push, polling needed |
| B. WebSocket | Real-time, bidirectional | Stateful, reconnection logic |
| C. gRPC | Fast, typed, streaming | Requires protobuf, binary |
| D. MQTT | Pub/sub, lightweight | Needs broker |

### Decision

**Option A: HTTP REST**

### Rationale

1. **Stateless**: Each request is independent. No connection state to manage, no reconnection logic, no heartbeat.

2. **Debuggable**: `curl` is all you need to test. No special client needed.

3. **Firewall-friendly**: HTTP on any port works through most firewalls. WebSocket upgrade can be blocked.

4. **Resilient**: If a peer is temporarily down, the next request just fails. No broken pipe, no reconnection storm.

5. **Composable**: Any HTTP client in any language can participate in federation.

### Tradeoffs Accepted

- **No real-time push**: Nodes must poll or use `maw hey` actively. No event streaming. (Hub WebSocket — transport layer 2 — fills this gap for local workspace.)
- **Higher overhead per message**: HTTP headers + TCP handshake per request vs persistent WebSocket. (Acceptable for the message volumes in Oracle federation.)

---

## ADR-007: Timestamp Window (±5 Minutes) over Nonce/Sequence

**Date**: April 2026
**Status**: Accepted
**Context**: How to prevent replay attacks in HMAC auth?

### Options Considered

| Method | Pros | Cons |
|--------|------|------|
| A. Timestamp ±5 min | Simple, no state | 5-min replay window, clock dependency |
| B. Nonce (one-time) | No replay at all | Requires nonce storage, sync |
| C. Sequence number | Ordered, no replay | Requires state per peer |
| D. Challenge-response | No replay, no clock | Extra round-trip, latency |

### Decision

**Option A: Timestamp with ±5 minute window**

### Rationale

1. **Stateless**: No nonce database to maintain. No sequence counters to sync.

2. **Simple implementation**: `Date.now()` on both sides. Compare. Done.

3. **5 minutes is generous**: NTP-synced machines drift by milliseconds. 5 minutes accommodates even poorly-synced clocks.

4. **Acceptable risk**: The 5-minute replay window is real but limited. In practice, an attacker needs both network access AND a captured request within 5 minutes. The threat model accepts this for non-adversarial environments.

### Future Hardening

If replay resistance matters:
- Reduce window to ±60 seconds (requires reliable NTP)
- Add request ID deduplication at the receiver
- Use HTTPS to prevent capture in the first place

---

## Summary Table

| ADR | Decision | Key Reason |
|-----|----------|-----------|
| 001 | Peer-to-Peer | Privacy, no central dependency |
| 002 | HMAC-SHA256 | Zero infrastructure auth |
| 003 | Full Mesh | Maximum resilience |
| 004 | Manual Discovery | Explicit trust |
| 005 | tmux Sessions | Already there, scriptable |
| 006 | HTTP REST | Stateless, debuggable |
| 007 | ±5 min Timestamp | Stateless replay prevention |

---

🤖 Federation Oracle 🗺️ — ADR v1.0
