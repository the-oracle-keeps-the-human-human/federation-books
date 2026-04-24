# /white — Talk to White Oracle

Send a message to White Oracle on white server.

## Usage

```
/white <message>
```

## Action

```bash
maw hey white:white "$ARGS [$NODE:$SESSION]" --force
```

Where `$ARGS` is the user's message, `$NODE` is this machine's node name from `jq -r .node ~/.config/maw/maw.config.json`, and `$SESSION` is the current tmux session name.

If no message provided, check white's status instead:

```bash
curl -sf http://white.wg:3456/api/identity | jq '{node, agents: (.agents | length), uptime}'
```

Always show the delivery result to the user.
