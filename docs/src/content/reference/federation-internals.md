---
title: "Federation Internals"
description: "┌─────────────────────────────────────────────────────┐"
---
# Federation Internals

### How maw.js Federation Works Under the Hood

> วาดโดย Federation Oracle 🗺️ — The Cartographer
> For contributors and the deeply curious

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                    maw serve                         │
│                                                     │
│  ┌───────────────┐  ┌──────────────┐  ┌──────────┐ │
│  │  HTTP Server   │  │  Session     │  │  Config  │ │
│  │  (Bun.serve)   │  │  Discovery   │  │  Loader  │ │
│  │                │  │  (tmux ls)   │  │  (.json) │ │
│  └───────┬───────┘  └──────┬───────┘  └────┬─────┘ │
│          │                  │                │       │
│  ┌───────▼──────────────────▼────────────────▼─────┐│
│  │              Request Handler                     ││
│  │                                                  ││
│  │  ┌────────────┐  ┌─────────────┐  ┌──────────┐ ││
│  │  │ Public     │  │ Protected   │  │ Federation│ ││
│  │  │ /identity  │  │ /send       │  │ /status   │ ││
│  │  │ /sessions  │  │ /talk       │  │ /sync     │ ││
│  │  │ /capture   │  │ /feed       │  │           │ ││
│  │  └────────────┘  └──────┬──────┘  └──────────┘ ││
│  │                         │                        ││
│  │                 ┌───────▼───────┐                ││
│  │                 │ HMAC Verify   │                ││
│  │                 │ (middleware)  │                ││
│  │                 └───────────────┘                ││
│  └──────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────┘
```

---

## Request Flow: Sending a Message

When you run `maw hey desktop:oracle "hello"`:

```
1. CLI PARSING
   maw hey desktop:oracle "hello"
        ├── target node: "desktop"
        ├── target session: "oracle"
        └── message: "hello"

2. PEER LOOKUP
   config.namedPeers.find(p => p.name === "desktop")
   → { name: "desktop", url: "http://192.168.1.101:3456" }

3. TRANSPORT SELECTION
   Is target local (tmux)?  → Layer 1: direct tmux send-keys
   Is Hub configured?       → Layer 2: WebSocket relay
   Is peer in namedPeers?   → Layer 3: HTTP POST ← (this one)
   Is NanoClaw configured?  → Layer 4: Telegram/Discord
   → Selected: HTTP federation

4. HMAC SIGNING
   timestamp = Date.now() / 1000 | 0     → 1714000000
   message = "POST:/api/send:1714000000"
   signature = HMAC-SHA256(token, message) → "a1b2c3..."

5. HTTP REQUEST
   POST http://192.168.1.101:3456/api/send
   Headers:
     Content-Type: application/json
     X-Maw-Signature: a1b2c3...
     X-Maw-Timestamp: 1714000000
   Body:
     {"target": "oracle", "message": "hello", "sender": "laptop:cli"}

6. RECEIVER PROCESSING (on desktop)
   a. Extract headers: signature, timestamp
   b. Check timestamp: |now - 1714000000| ≤ 300?  ✅
   c. Recompute: HMAC-SHA256(myToken, "POST:/api/send:1714000000")
   d. Compare: received === computed?  ✅
   e. Find session: tmux has-session -t oracle?  ✅
   f. Deliver: tmux send-keys -t oracle "hello" Enter

7. RESPONSE
   200 OK
   {"status": "delivered", "target": "oracle", "node": "desktop"}
```

---

## Session Discovery

`maw serve` discovers oracle sessions by querying tmux:

```bash
# What maw does internally:
tmux list-sessions -F "#{session_name}|#{session_windows}|#{session_attached}|#{session_created}"

# Example output:
# code-oracle|1|0|1714000000
# research|2|1|1713999000
```

This runs periodically (on request, not polled) to build the session list for `/api/sessions`.

### The pm2 Visibility Problem

When maw is started via pm2, it runs in a clean environment without access to the user's tmux server socket:

```
User tmux sessions:        pm2 maw process:
┌──────────────────┐      ┌──────────────────┐
│ TMUX_TMPDIR=/tmp │      │ No TMUX_TMPDIR   │
│ tmux server: ✅   │      │ tmux server: ❌   │
│ Sessions: 3      │      │ Sessions: 0      │
└──────────────────┘      └──────────────────┘
```

**Workaround**: `--force` flag on `maw hey` bypasses the session existence check and delivers the message anyway (assuming the session name is correct).

**Root cause fix**: Set `TMUX_TMPDIR` in pm2's environment, or start tmux with a known socket path.

---

## HMAC Implementation Details

### Signing (sender side)

```javascript
// Pseudocode — actual implementation in maw-js
function signRequest(method, path, token) {
  const timestamp = Math.floor(Date.now() / 1000);
  const message = `${method}:${path}:${timestamp}`;
  const signature = crypto
    .createHmac('sha256', token)
    .update(message)
    .digest('hex');
  return { signature, timestamp };
}
```

### Verification (receiver side)

```javascript
function verifyRequest(req, token) {
  const signature = req.headers['x-maw-signature'];
  const timestamp = parseInt(req.headers['x-maw-timestamp']);
  
  // Check timestamp window
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > 300) {
    return { valid: false, reason: 'timestamp expired' };
  }
  
  // Recompute signature
  const message = `${req.method}:${req.path}:${timestamp}`;
  const expected = crypto
    .createHmac('sha256', token)
    .update(message)
    .digest('hex');
  
  // Constant-time comparison to prevent timing attacks
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return { valid: false, reason: 'invalid signature' };
  }
  
  return { valid: true };
}
```

### Key Properties

| Property | Implementation |
|----------|---------------|
| Algorithm | HMAC-SHA256 (256-bit) |
| Message format | `METHOD:PATH:TIMESTAMP` |
| Timestamp | Unix epoch seconds |
| Window | ±300 seconds (5 minutes) |
| Comparison | Constant-time (timing-safe) |
| Loopback | Bypassed (localhost always passes) |

---

## Config Loading

```javascript
// Pseudocode
function loadConfig() {
  const path = process.env.MAW_CONFIG 
    || join(homedir(), '.config', 'maw', 'maw.config.json');
  
  const raw = readFileSync(path, 'utf-8');
  const config = JSON.parse(raw);
  
  // Defaults
  config.port = config.port || 3456;
  config.host = config.host || '0.0.0.0';
  config.namedPeers = config.namedPeers || [];
  config.agents = config.agents || {};
  config.timeouts = config.timeouts || { http: 5000, ping: 5000 };
  
  return config;
}
```

Config is loaded once at startup. Changes require restarting maw serve.

---

## HTTP Server

maw uses Bun's built-in HTTP server:

```javascript
Bun.serve({
  port: config.port,
  hostname: config.host,
  
  async fetch(req) {
    const url = new URL(req.url);
    
    // Route to handler
    switch (url.pathname) {
      case '/api/identity': return handleIdentity(req);
      case '/api/sessions': return handleSessions(req);
      case '/api/capture':  return handleCapture(req, url);
      case '/api/send':     return requireAuth(req, handleSend);
      case '/api/talk':     return requireAuth(req, handleTalk);
      case '/api/feed':     return requireAuth(req, handleFeed);
      default:              return new Response('Not found', { status: 404 });
    }
  }
});
```

### Why Bun, Not Node?

- **Performance**: Bun's HTTP server is ~3x faster than Node's
- **TypeScript native**: No compilation step
- **Built-in fetch**: No need for axios/node-fetch
- **Single binary**: Simpler deployment

---

## Federation Status Check

When you run `maw federation status`:

```javascript
async function checkFederationStatus(config) {
  const results = [];
  
  for (const peer of config.namedPeers) {
    try {
      const response = await fetch(`${peer.url}/api/identity`, {
        signal: AbortSignal.timeout(config.timeouts.ping)
      });
      const data = await response.json();
      
      results.push({
        name: peer.name,
        url: peer.url,
        reachable: true,
        identity: data.node,
        version: data.version
      });
    } catch (error) {
      results.push({
        name: peer.name,
        url: peer.url,
        reachable: false,
        error: error.message
      });
    }
  }
  
  return results;
}
```

Each peer is checked sequentially (not parallel) in the current implementation.

---

## Message Delivery

```javascript
async function deliverMessage(target, message, sender) {
  // 1. Check if target session exists locally
  const sessions = await listTmuxSessions();
  const session = sessions.find(s => s.name === target);
  
  if (!session && !force) {
    return { status: 'error', error: 'target not found' };
  }
  
  // 2. Write message to tmux pane
  const formatted = formatMessage(message, sender);
  await tmuxSendKeys(target, formatted);
  
  return { status: 'delivered', target, node: config.node };
}
```

### How tmux Delivery Works

```bash
# maw writes to the tmux pane using send-keys:
tmux send-keys -t SESSION "MESSAGE_TEXT" Enter

# The message appears as if someone typed it in the terminal.
# The oracle (Claude) receives it as part of the conversation input.
```

---

## Agent Routing

The `agents` config maps friendly names to tmux sessions:

```json
{
  "agents": {
    "code": {"session": "code-oracle", "window": "0"},
    "research": {"session": "research", "window": "0"}
  }
}
```

When `maw hey laptop:code "hello"` arrives:
1. Look up "code" in `agents` → `{"session": "code-oracle", "window": "0"}`
2. Deliver to tmux session "code-oracle", window 0

Federation sync (`maw federation sync`) queries each peer's `/api/sessions` and updates the local `agents` map.

---

## File Locations

| File | Purpose |
|------|---------|
| `~/.config/maw/maw.config.json` | Federation config |
| `maw-js/src/cli.ts` | CLI entry point |
| `maw-js/src/serve.ts` | HTTP server + API handlers |
| `maw-js/src/federation.ts` | Federation logic (status, sync) |
| `maw-js/src/hmac.ts` | HMAC signing/verification |
| `maw-js/src/transport/` | Transport layer implementations |

---

🤖 Federation Oracle 🗺️ — Internals Guide v1.0
