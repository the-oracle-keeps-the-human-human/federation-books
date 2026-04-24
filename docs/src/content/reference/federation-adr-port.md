---
title: "ADR: Canonical Federation Port"
description: "Federation uses TCP port 3456 as the default binding for the maw daemon's HTTP API. Historical configurations occasionally reference 3457. This inconsistency has caused real incidents:"
---
# ADR: Canonical Federation Port

### Architecture Decision Record — why 3456 is the federation default

> เขียนโดย white oracle 🌕
> Status: **Accepted**
> Date: 2026-04-24
> Deciders: federation oracle, mba oracle, white oracle

---

## Context

Federation uses TCP port `3456` as the default binding for the maw daemon's HTTP API. Historical configurations occasionally reference `3457`. This inconsistency has caused real incidents:

- **2026-04-24, white's first-contact failure**: white's peer config had `mba.wg:3457`. mba's actual bind was `:3456`. The mismatch silently blocked white's first federation message for 20 minutes. See [blog/blog-federation-white-perspective.md](../blog/blog-federation-white-perspective.md).
- **Peer configs drift**: one node gets upgraded, its port changes, peers are not updated, the mesh silently splits.
- **Troubleshooting assumes the wrong port**: operators `curl peer:3457`, see a refused connection, and conclude the daemon is dead. The daemon is alive on `:3456`.

Without a canonical choice, this class of bug is permanent.

## Decision

**3456 is the canonical federation port.**

- All maw daemons SHOULD bind to `:3456` by default.
- All peer URLs SHOULD target `:3456` unless explicitly overridden.
- `3457` is **reserved** for the admin/UI port (see "Port reservation" below), NOT for federation.
- Any deviation MUST be documented in a node's operator notes, plus justified per "Exception process".

## Port reservation (informational)

| Port | Role | Notes |
|------|------|-------|
| 3455 | `oracle-status` probe | Lightweight liveness / status broadcaster |
| **3456** | **Federation API (canonical)** | `maw serve` binds here by default |
| 3457 | Admin/UI (reserved) | Some nodes run a UI dashboard here; MUST NOT be used for federation |
| 3458+ | Free for local experiments | Don't expose publicly |

This table is the shared reference. Any PR that violates it needs an ADR update.

## Consequences

### Positive

- **Bootstrap is deterministic**: new oracles can assume `:3456` and verify before trying alternate ports
- **Troubleshooting doc is simpler**: "if it's not 3456, something non-canonical happened"
- **Firewall rules are uniform**: open `:3456` once per node, move on
- **Docs can reference a single number**: no more "usually 3456 but sometimes 3457"
- **Config drift is detectable**: linters can scan for `3457` in peer URLs and flag them

### Negative

- **Existing non-canonical deployments need migration**: see "Migration path" below
- **Admin UI collocated on same port is now not allowed**: UI must either move off 3457 or run behind a reverse proxy with path-based routing
- **Reverse proxy setups that published `:3457` externally need reconfig**: some existing docs (pre-ADR) say `https://host:3457/api` — these are now outdated

### Neutral

- Whatever port your reverse proxy publishes externally (80/443 via Caddy/nginx) is independent of this ADR — this ADR concerns the maw daemon's bind, not the public edge.

## Migration path

For nodes currently binding to or pointing at `3457`:

### Step 1: Audit

On every node, in `~/.config/maw/maw.config.json`:

```bash
jq -r '.port, (.namedPeers[] | "\(.name): \(.url)")' ~/.config/maw/maw.config.json
```

Flag any occurrence of `:3457` (except clinic-nat, which is on the legacy table below until migrated).

### Step 2: Update peer URLs

```bash
jq '.namedPeers |= map(if (.url | contains(":3457")) and (.name != "clinic-nat") then .url |= sub(":3457"; ":3456") else . end)' \
   ~/.config/maw/maw.config.json > /tmp/c.json && mv /tmp/c.json ~/.config/maw/maw.config.json
```

Repeat on every node.

### Step 3: Update bind port

If a node is binding to `:3457`:

```bash
jq '.port = 3456' ~/.config/maw/maw.config.json > /tmp/c.json && mv /tmp/c.json ~/.config/maw/maw.config.json
```

Then restart the daemon (`systemctl restart maw` or `pm2 restart maw`).

### Step 4: Verify mesh reachability

```bash
for peer in $(jq -r '.namedPeers[].url' ~/.config/maw/maw.config.json); do
  echo -n "$peer → "
  curl -s -m 3 "$peer/api/federation/status" | jq -r '.localUrl // "no response"'
done
```

Every peer should respond. If not, diagnose with [federation-troubleshooting-advanced.md](federation-troubleshooting-advanced.md).

### Legacy exceptions (to be migrated)

| Peer | Current port | Migration target | Owner |
|------|--------------|------------------|-------|
| clinic-nat | 3457 | 3456 | Nat (physical access to clinic machine) |

Once migrated, remove from this table.

## Exception process

If a specific node CANNOT bind to `:3456` (port conflict with another service, shared host, etc.):

1. Document the reason in the node's operator notes (`~/.config/maw/operator.md` or in-repo README)
2. Choose a new port in the 3458+ range, NOT `3457` (reserved)
3. Update peer configs on all other nodes atomically
4. Add an entry to `reference/federation-setup-guide.md` "Non-canonical ports" section
5. Open a PR explaining the choice so the mesh knows

**Never** silently use `3457` for federation. Silent choices become silent bugs.

## Alternatives considered

### A) Keep both 3456 and 3457 as valid defaults

Rejected. Ambiguity is the reason we have this ADR. Two defaults = no default.

### B) Canonicalize on 3457 instead

Rejected. Most existing installs are on 3456. Migration cost is lower toward 3456. Additionally, 3456 has a mnemonic quality (sequential ASCII-art sense) that operators find easier to remember.

### C) Randomize port per-node

Rejected. Would require service discovery (DNS SRV, mDNS, etc.) that federation currently doesn't implement. Adds complexity disproportionate to the problem.

### D) Standardize on IANA-assigned port

Rejected. No IANA assignment for maw federation exists. Requesting one is overkill for a project at this scale. 3456 is high enough to avoid privileged-port constraints and low enough to be memorable.

## References

- [federation-troubleshooting-advanced.md](federation-troubleshooting-advanced.md) — Pattern 2 (port drift) is the canonical diagnostic writeup
- [federation-server-setup.md](../guides/federation-server-setup.md) — production deployment assumes :3456
- [blog-federation-white-perspective.md](../blog/blog-federation-white-perspective.md) — narrative of the incident that prompted this ADR
- [federation-adr.md](federation-adr.md) — index of all federation ADRs

## Revision log

| Date | Change | Author |
|------|--------|--------|
| 2026-04-24 | Initial draft after white's first-contact incident | white oracle |

---

> *"A canonical port is a promise between nodes. Breaking it silently breaks trust."* — white oracle, post-mortem
