# Federation Patterns Cookbook

### Common Architectures for Oracle Federation

> วาดโดย Federation Oracle 🗺️ — The Cartographer
> "ไม่มีแผนที่ไหนที่ถูกต้องสมบูรณ์ — แต่ทุกแผนที่ช่วยให้ไม่หลง"

---

## Pattern 1: The Pair (2 Nodes)

The simplest federation. Two machines that can talk to each other.

```
┌──────────┐         ┌──────────┐
│  laptop  │◄───────►│  desktop │
│  :3456   │  HTTP   │  :3456   │
└──────────┘         └──────────┘
```

**When to use**: Workshop, learning, personal setup with 2 machines.

**Config (laptop)**:
```json
{
  "node": "laptop",
  "port": 3456,
  "host": "0.0.0.0",
  "federationToken": "shared-token",
  "namedPeers": [
    {"name": "desktop", "url": "http://192.168.1.101:3456"}
  ]
}
```

**Config (desktop)**: Mirror with laptop's IP.

**Strengths**: Simple, fast, easy to debug.
**Weaknesses**: Single point of failure (if one goes down, federation is empty).

---

## Pattern 2: The Triangle (3 Nodes)

Three machines in full mesh. The minimum for redundancy.

```
       laptop
      ╱      ╲
     ╱        ╲
  desktop ◄──► server
```

**When to use**: Small team, home + office + cloud setup.

**Each node lists the other 2 as peers.**

**Strengths**: If one node goes down, the other two still communicate.
**Weaknesses**: 6 peer entries to manage (3 nodes × 2 peers each).

---

## Pattern 3: The Star (Hub + Spokes)

One central "hub" machine that all others connect to. Not a true full mesh — spokes only know the hub.

```
        spoke-1
          │
          │
hub ◄─────┼─────► spoke-2
          │
          │
        spoke-3
```

**When to use**: When spokes can't reach each other (different networks), or to simplify config.

**Hub config**: Lists all spokes as peers.
**Spoke config**: Lists ONLY the hub as a peer.

```json
// spoke-1 config:
{
  "node": "spoke-1",
  "namedPeers": [
    {"name": "hub", "url": "http://HUB_IP:3456"}
  ]
}
```

**Strengths**: Spokes need minimal config (1 peer each). Hub handles routing.
**Weaknesses**: Hub is a single point of failure. Spokes can't talk directly to each other — messages must go through the hub.

**Note**: maw doesn't auto-relay messages through hub. Spoke-1 can only reach the hub, not spoke-2. For spoke-to-spoke, use full mesh (add all peers to every node).

---

## Pattern 4: The Full Mesh (4+ Nodes)

Every node connects to every other node. Maximum connectivity, maximum config.

```
  A ◄──► B
  │ ╲  ╱ │
  │  ╳   │
  │ ╱  ╲ │
  C ◄──► D
```

**When to use**: Production federation, team setups.

**Each node lists all others**: N nodes = N-1 peers per node.

**Our real setup** (4 nodes):
```
MBA ◄──► white ◄──► oracle-world
 │                       │
 └───► clinic-nat ◄──────┘
```

**Strengths**: Maximum redundancy. Any node can reach any other directly.
**Weaknesses**: O(n²) config management. Use `/federation-sync` to automate.

---

## Pattern 5: The Cluster + Remote

A local cluster of machines plus one or more remote nodes connected via Tailscale/tunnel.

```
   ┌─── LAN (192.168.1.x) ───┐        ┌── Cloud ──┐
   │                          │        │            │
   │  laptop ◄──► desktop    │◄──TS──►│  server    │
   │     │                    │        │            │
   │     └──► pi             │        └────────────┘
   │                          │
   └──────────────────────────┘
```

**When to use**: Home machines + a cloud VPS or remote office.

**LAN nodes**: Use LAN IPs for each other, Tailscale IP for the remote.
**Remote node**: Uses Tailscale IPs for everything.

```json
// laptop config:
{
  "namedPeers": [
    {"name": "desktop", "url": "http://192.168.1.101:3456"},
    {"name": "pi", "url": "http://192.168.1.200:3456"},
    {"name": "server", "url": "http://100.64.0.5:3456"}
  ]
}

// server config:
{
  "namedPeers": [
    {"name": "laptop", "url": "http://100.64.0.1:3456"},
    {"name": "desktop", "url": "http://100.64.0.2:3456"},
    {"name": "pi", "url": "http://100.64.0.3:3456"}
  ]
}
```

**Strengths**: LAN traffic stays fast. Remote access works.
**Weaknesses**: Mixed IPs in configs. Tailscale IP changes are rare but possible.

---

## Pattern 6: The Team Federation

Multiple people, each with their own machine(s), federated together.

```
┌─ Alice ─┐     ┌─ Bob ──┐     ┌─ Carol ─┐
│ laptop  │◄───►│ laptop │◄───►│ desktop │
│ :3456   │     │ :3456  │     │ :3456   │
└─────────┘     └────────┘     └─────────┘
```

**Key consideration**: Shared federation token means mutual trust. Anyone with the token can send messages to any oracle.

**Options**:
1. **Single shared token** — Simple. All peers trusted equally.
2. **Separate federations** — Each pair has its own token. Alice↔Bob is one federation, Bob↔Carol is another.
3. **Hub model** — One trusted server with the token. Members connect to it.

**Security note**: The token is like a group password. Share it securely (not over email/Slack). Rotate it periodically.

---

## Pattern 7: The Dev/Staging/Prod Split

Three separate federations for different environments.

```
Dev Federation (token-dev)        Staging (token-stg)        Prod (token-prod)
┌────────┐  ┌────────┐          ┌────────┐                 ┌────────┐
│dev-1   │──│dev-2   │          │staging │                 │prod-1  │──│prod-2│
└────────┘  └────────┘          └────────┘                 └────────┘  └──────┘
```

**Each environment has its own token.** Dev machines can't accidentally message prod oracles.

---

## Anti-Patterns

### Anti-Pattern 1: Single Point of Failure

```
       ┌─── All traffic goes through hub ───┐
       │                                     │
spoke-1 ──► hub ◄── spoke-2                
                ◄── spoke-3
```

**Problem**: If hub goes down, nobody can communicate.
**Fix**: Add direct links between spokes (upgrade to full mesh), or have a backup hub.

### Anti-Pattern 2: Token in Git

```json
// NEVER DO THIS in a committed file:
{
  "federationToken": "my-secret-token-1234567890"
}
```

**Problem**: Anyone who clones the repo gets your federation access.
**Fix**: Keep `maw.config.json` in `~/.config/maw/` (not in repo). Add it to `.gitignore`.

### Anti-Pattern 3: `host: "localhost"`

```json
// DON'T:
{"host": "localhost"}

// DO:
{"host": "0.0.0.0"}
```

**Problem**: `localhost` means only local connections work. Peers can't reach you.
**Fix**: Always use `"0.0.0.0"` for federation.

### Anti-Pattern 4: One-Directional Testing

```bash
# WRONG — only testing from one side:
# Machine A:
maw federation status  # ✅ B is reachable!
# (But did you check from Machine B? B might not see A.)
```

**Problem**: Federation is bidirectional. Testing from one side can miss issues (bind address, firewall, NAT).
**Fix**: Always run `maw federation status` from EVERY node.

### Anti-Pattern 5: Same Node Name

```json
// Machine A: {"node": "oracle"}
// Machine B: {"node": "oracle"}  ← COLLISION!
```

**Problem**: Agent routing gets confused. Messages go to the wrong machine.
**Fix**: Every node must have a unique `node` name.

---

## Decision Tree: Which Pattern Should I Use?

```
How many machines?
├── 2 → Pattern 1: The Pair
├── 3 → Pattern 2: The Triangle
├── 4+ → Are they all on the same network?
│        ├── Yes → Pattern 4: Full Mesh
│        └── No  → Pattern 5: Cluster + Remote
│
Are you working with other people?
├── Yes → Pattern 6: Team Federation
└── No  → Pick by machine count above
│
Do you need environment separation?
├── Yes → Pattern 7: Dev/Staging/Prod
└── No  → Pick by count/team above
│
Can machines reach each other directly?
├── Yes → Full Mesh
├── Some can, some can't → Cluster + Remote
└── Only through one gateway → Pattern 3: Star (but upgrade to mesh ASAP)
```

---

## Config Templates

### 2-Node Template
```bash
# Generate configs for a 2-node federation:
NODE_A="laptop"
NODE_B="desktop"
IP_A="192.168.1.100"
IP_B="192.168.1.101"
TOKEN=$(openssl rand -hex 16)
PORT=3456

echo "Machine A ($NODE_A) config:"
echo "{\"node\":\"$NODE_A\",\"port\":$PORT,\"host\":\"0.0.0.0\",\"federationToken\":\"$TOKEN\",\"namedPeers\":[{\"name\":\"$NODE_B\",\"url\":\"http://$IP_B:$PORT\"}],\"agents\":{}}"

echo ""
echo "Machine B ($NODE_B) config:"
echo "{\"node\":\"$NODE_B\",\"port\":$PORT,\"host\":\"0.0.0.0\",\"federationToken\":\"$TOKEN\",\"namedPeers\":[{\"name\":\"$NODE_A\",\"url\":\"http://$IP_A:$PORT\"}],\"agents\":{}}"
```

### 3-Node Template
```bash
NODE_A="alpha"; IP_A="192.168.1.100"
NODE_B="beta";  IP_B="192.168.1.101"
NODE_C="gamma"; IP_C="192.168.1.102"
TOKEN=$(openssl rand -hex 16)
PORT=3456

for NODE in A B C; do
  eval "NAME=\$NODE_$NODE"
  echo "--- $NAME ---"
  PEERS=""
  for PEER in A B C; do
    [ "$NODE" = "$PEER" ] && continue
    eval "PNAME=\$NODE_$PEER; PIP=\$IP_$PEER"
    PEERS="$PEERS{\"name\":\"$PNAME\",\"url\":\"http://$PIP:$PORT\"},"
  done
  PEERS="${PEERS%,}"
  echo "{\"node\":\"$NAME\",\"port\":$PORT,\"host\":\"0.0.0.0\",\"federationToken\":\"$TOKEN\",\"namedPeers\":[$PEERS],\"agents\":{}}"
  echo ""
done
```

---

🤖 Federation Oracle 🗺️ — Patterns Cookbook v1.0
