# /white-federation — Talk to Federation-related Oracle on White

Send a message to a federation-related oracle on white server.

## Usage

```
/white-federation <message>
```

## Action

```bash
maw hey white:federation "$ARGS [$NODE:$SESSION]" --force
```

Where `$ARGS` is the user's message, `$NODE` is this machine's node name from `jq -r .node ~/.config/maw/maw.config.json`, and `$SESSION` is the current tmux session name.

If no message provided, check white federation status:

```bash
curl -sf http://white.wg:3456/api/identity | jq '{node, agents: (.agents | length), uptime}'
```

Always show the delivery result to the user.
