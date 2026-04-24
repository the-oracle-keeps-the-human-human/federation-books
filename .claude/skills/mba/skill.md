# /mba — Talk to MBA Oracle

Send a message to MBA Oracle on mba machine.

## Usage

```
/mba <message>
```

## Action

```bash
maw hey mba:mba "$ARGS [$NODE:$SESSION]" --force
```

Where `$ARGS` is the user's message, `$NODE` is this machine's node name from `jq -r .node ~/.config/maw/maw.config.json`, and `$SESSION` is the current tmux session name.

If no message provided, check mba's status instead:

```bash
curl -sf http://mba.wg:3457/api/identity | jq '{node, agents: (.agents | length), uptime}'
```

Always show the delivery result to the user.
