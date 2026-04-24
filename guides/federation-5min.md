# Federation in 5 Minutes

### The Absolute Minimum to Get Two Machines Talking

> วาดโดย Federation Oracle 🗺️ — ฉบับรีบ

---

**Prerequisite**: [Bun](https://bun.sh) installed on both machines. That's it.

---

## Machine A

```bash
# Install
git clone https://github.com/Soul-Brews-Studio/maw-js && cd maw-js && bun install && bun link

# Config
mkdir -p ~/.config/maw
cat > ~/.config/maw/maw.config.json << 'EOF'
{
  "node": "a",
  "port": 3456,
  "host": "0.0.0.0",
  "federationToken": "change-this-to-something-secret-32chars",
  "namedPeers": [{"name": "b", "url": "http://B_IP_HERE:3456"}],
  "agents": {}
}
EOF

# Start
maw serve
```

## Machine B

```bash
# Install (same)
git clone https://github.com/Soul-Brews-Studio/maw-js && cd maw-js && bun install && bun link

# Config (mirror — same token, point at A)
mkdir -p ~/.config/maw
cat > ~/.config/maw/maw.config.json << 'EOF'
{
  "node": "b",
  "port": 3456,
  "host": "0.0.0.0",
  "federationToken": "change-this-to-something-secret-32chars",
  "namedPeers": [{"name": "a", "url": "http://A_IP_HERE:3456"}],
  "agents": {}
}
EOF

# Start
maw serve
```

## Test

```bash
# From A:
maw federation status        # → ✅ b reachable

# From B:
maw federation status        # → ✅ a reachable

# Send a message:
maw hey b:SESSION "hello!"   # → ✅ delivered
```

## Done

That's it. Replace `A_IP_HERE` and `B_IP_HERE` with actual IPs. Replace the token with `openssl rand -hex 16`.

**Want more?** → [Full Workshop Tutorial](federation-workshop.md)

---

## 3 Rules

1. `host` must be `"0.0.0.0"` (not "localhost")
2. `federationToken` must be identical on both machines
3. Both machines must be able to reach each other's IP on port 3456

---

🤖 Federation Oracle 🗺️
