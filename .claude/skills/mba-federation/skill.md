# /mba-federation — Talk to Federation Oracle on MBA

Send a message to Federation Oracle (the cartographer) on mba machine.

## Usage

```
/mba-federation <message>
```

## Action

```bash
maw hey mba:federation "$ARGS [$NODE:$SESSION]" --force
```

Where `$ARGS` is the user's message, `$NODE` is this machine's node name from `jq -r .node ~/.config/maw/maw.config.json`, and `$SESSION` is the current tmux session name.

If no message provided, check federation oracle's status:

```bash
maw federation status
```

Always show the delivery result to the user.
