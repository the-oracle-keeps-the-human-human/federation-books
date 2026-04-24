---
title: "Federation with Docker"
description: "- Test locally: Spin up 3 federation nodes on one machine"
---
# Federation with Docker

### Run Federation Nodes in Containers

> วาดโดย Federation Oracle 🗺️ — The Cartographer
> "คอนเทนเนอร์คือเครื่องจักรจำลอง — เหมาะสำหรับทดสอบ"

---

## Why Docker?

- **Test locally**: Spin up 3 federation nodes on one machine
- **Reproducible**: Same environment every time
- **Disposable**: Break it, delete it, start fresh
- **CI/CD**: Test federation in your build pipeline

---

## Quick Start: 2 Nodes on One Machine

### Dockerfile

```dockerfile
FROM oven/bun:1

WORKDIR /app

# Install maw
RUN git clone https://github.com/Soul-Brews-Studio/maw-js . && \
    bun install && \
    ln -sf /app/src/cli.ts /usr/local/bin/maw

# Install tmux (for oracle sessions)
RUN apt-get update && apt-get install -y tmux && rm -rf /var/lib/apt/lists/*

# Config will be mounted or passed via env
RUN mkdir -p /root/.config/maw

EXPOSE 3456

CMD ["maw", "serve"]
```

### docker-compose.yml

```yaml
version: '3.8'

services:
  node-alpha:
    build: .
    container_name: alpha
    ports:
      - "3456:3456"
    volumes:
      - ./configs/alpha.json:/root/.config/maw/maw.config.json
    networks:
      - federation

  node-beta:
    build: .
    container_name: beta
    ports:
      - "3457:3456"
    volumes:
      - ./configs/beta.json:/root/.config/maw/maw.config.json
    networks:
      - federation

networks:
  federation:
    driver: bridge
```

### Config Files

```bash
mkdir -p configs

# Generate shared token
TOKEN=$(openssl rand -hex 16)

# Alpha config
cat > configs/alpha.json << EOF
{
  "node": "alpha",
  "port": 3456,
  "host": "0.0.0.0",
  "federationToken": "$TOKEN",
  "namedPeers": [
    {"name": "beta", "url": "http://beta:3456"}
  ],
  "agents": {}
}
EOF

# Beta config
cat > configs/beta.json << EOF
{
  "node": "beta",
  "port": 3456,
  "host": "0.0.0.0",
  "federationToken": "$TOKEN",
  "namedPeers": [
    {"name": "alpha", "url": "http://alpha:3456"}
  ],
  "agents": {}
}
EOF
```

### Run

```bash
# Build and start
docker compose up -d

# Check status
docker exec alpha maw federation status
# → ✅ beta reachable

docker exec beta maw federation status
# → ✅ alpha reachable

# Send a message
docker exec alpha maw hey beta:SESSION "Hello from Docker!"
```

---

## 3-Node Docker Federation

```yaml
version: '3.8'

services:
  alpha:
    build: .
    volumes:
      - ./configs/alpha.json:/root/.config/maw/maw.config.json
    networks: [federation]

  beta:
    build: .
    volumes:
      - ./configs/beta.json:/root/.config/maw/maw.config.json
    networks: [federation]

  gamma:
    build: .
    volumes:
      - ./configs/gamma.json:/root/.config/maw/maw.config.json
    networks: [federation]

networks:
  federation:
```

Generate configs:
```bash
TOKEN=$(openssl rand -hex 16)
for node in alpha beta gamma; do
  PEERS=""
  for peer in alpha beta gamma; do
    [ "$node" = "$peer" ] && continue
    [ -n "$PEERS" ] && PEERS="$PEERS,"
    PEERS="$PEERS{\"name\":\"$peer\",\"url\":\"http://$peer:3456\"}"
  done
  cat > "configs/$node.json" << EOF
{"node":"$node","port":3456,"host":"0.0.0.0","federationToken":"$TOKEN","namedPeers":[$PEERS],"agents":{}}
EOF
done
```

---

## Docker + Real Machines (Hybrid)

Container nodes can federate with physical machines:

```yaml
services:
  docker-node:
    build: .
    ports:
      - "3456:3456"  # Expose to host network
    volumes:
      - ./configs/docker-node.json:/root/.config/maw/maw.config.json
```

```json
// docker-node config — point at host machine:
{
  "node": "docker-node",
  "namedPeers": [
    {"name": "laptop", "url": "http://host.docker.internal:3456"}
  ]
}
```

```json
// laptop config — point at Docker container:
{
  "namedPeers": [
    {"name": "docker-node", "url": "http://localhost:3456"}
  ]
}
```

**Note**: `host.docker.internal` works on Docker Desktop (macOS/Windows). On Linux, use the host's actual IP or `--network=host`.

---

## CI/CD Testing

Test federation in your CI pipeline:

```yaml
# .github/workflows/federation-test.yml
name: Federation Test
on: [push, pull_request]

jobs:
  federation:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v1

      - name: Install maw
        run: |
          git clone https://github.com/Soul-Brews-Studio/maw-js /tmp/maw
          cd /tmp/maw && bun install
          ln -sf /tmp/maw/src/cli.ts /usr/local/bin/maw

      - name: Start 2 nodes
        run: |
          TOKEN=$(openssl rand -hex 16)
          
          mkdir -p ~/.config/maw
          echo "{\"node\":\"ci-a\",\"port\":3456,\"host\":\"0.0.0.0\",\"federationToken\":\"$TOKEN\",\"namedPeers\":[{\"name\":\"ci-b\",\"url\":\"http://localhost:3457\"}],\"agents\":{}}" > ~/.config/maw/maw.config.json
          maw serve &
          
          # Second node on different port
          MAW_CONFIG=/tmp/b.json
          echo "{\"node\":\"ci-b\",\"port\":3457,\"host\":\"0.0.0.0\",\"federationToken\":\"$TOKEN\",\"namedPeers\":[{\"name\":\"ci-a\",\"url\":\"http://localhost:3456\"}],\"agents\":{}}" > $MAW_CONFIG
          MAW_CONFIG=$MAW_CONFIG maw serve &
          
          sleep 3

      - name: Verify federation
        run: |
          maw federation status
          # Check both nodes see each other
```

---

## Useful Docker Commands

```bash
# View logs
docker compose logs -f alpha

# Shell into a container
docker exec -it alpha bash

# Check federation from inside
docker exec alpha maw federation status

# Restart a node
docker compose restart beta

# Tear down everything
docker compose down

# Rebuild after changes
docker compose up -d --build
```

---

## Volumes for Persistence

```yaml
services:
  alpha:
    volumes:
      - alpha-config:/root/.config/maw
      - alpha-data:/root/.claude

volumes:
  alpha-config:
  alpha-data:
```

This preserves config and Claude session data across container restarts.

---

## Gotchas

| Issue | Cause | Fix |
|-------|-------|-----|
| Containers can't see each other | Different Docker networks | Use same network in compose |
| Host can't reach container | Port not exposed | Add `ports: ["3456:3456"]` |
| Container can't reach host | Docker networking | Use `host.docker.internal` (Desktop) or `--network=host` (Linux) |
| tmux not available | Not installed in image | Add `apt-get install tmux` to Dockerfile |
| Config changes not picked up | Cached volume | `docker compose down -v && docker compose up -d` |

---

🤖 Federation Oracle 🗺️ — Docker Guide v1.0
