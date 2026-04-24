# /federation-backup — Backup & Restore Federation Config

> Never lose your federation setup. Backup configs, export peer lists, restore from snapshots.

## Usage

```
/federation-backup                  # Backup current config
/federation-backup --all            # Backup config + peer state + feed
/federation-backup restore          # Restore from latest backup
/federation-backup restore <file>   # Restore from specific backup
/federation-backup list             # List available backups
/federation-backup export           # Export portable peer list
/federation-backup import <file>    # Import peer list
/federation-backup diff             # Compare current vs backup
```

## Action

### Step 1: Setup

```bash
CONFIG="${MAW_CONFIG:-$HOME/.config/maw/maw.config.json}"
BACKUP_DIR="$HOME/.config/maw/backups"
mkdir -p "$BACKUP_DIR"

if [ ! -f "$CONFIG" ]; then
  echo "❌ No maw config found."
  echo "   Use 'restore' to restore from backup, or /federation-setup to create new."
  exit 1
fi

NODE=$(jq -r '.node' "$CONFIG")
```

---

### Backup (default)

Create timestamped backup of current config:

```bash
TIMESTAMP=$(date '+%Y%m%d_%H%M%S')
BACKUP_FILE="$BACKUP_DIR/maw.config_${TIMESTAMP}.json"

# Copy config
cp "$CONFIG" "$BACKUP_FILE"

# Verify backup is valid JSON
if jq . "$BACKUP_FILE" > /dev/null 2>&1; then
  PEERS=$(jq '.namedPeers | length' "$BACKUP_FILE")
  TOKEN_LEN=$(jq -r '.federationToken | length' "$BACKUP_FILE")

  echo "✅ Backup created"
  echo ""
  echo "  File:   $BACKUP_FILE"
  echo "  Node:   $NODE"
  echo "  Peers:  $PEERS"
  echo "  Token:  ${TOKEN_LEN} chars"
  echo "  Size:   $(wc -c < "$BACKUP_FILE") bytes"
  echo ""
  echo "  Restore: /federation-backup restore"
else
  echo "❌ Backup failed — config is invalid JSON"
  rm -f "$BACKUP_FILE"
fi

# Cleanup old backups (keep last 20)
ls -t "$BACKUP_DIR"/maw.config_*.json 2>/dev/null | tail -n +21 | xargs rm -f 2>/dev/null
TOTAL=$(ls "$BACKUP_DIR"/maw.config_*.json 2>/dev/null | wc -l)
echo "  Backups: $TOTAL stored (max 20)"
```

---

### Backup --all

Full backup including federation state:

```bash
TIMESTAMP=$(date '+%Y%m%d_%H%M%S')
BUNDLE_DIR="$BACKUP_DIR/full_${TIMESTAMP}"
mkdir -p "$BUNDLE_DIR"

# 1. Config
cp "$CONFIG" "$BUNDLE_DIR/maw.config.json"
echo "  ✅ Config backed up"

# 2. Peer state snapshot
PORT=$(jq -r '.port // 3456' "$CONFIG")
FED_STATUS=$(curl -sf "http://localhost:$PORT/api/federation/status" 2>/dev/null)
if [ -n "$FED_STATUS" ]; then
  echo "$FED_STATUS" | jq . > "$BUNDLE_DIR/federation-status.json"
  echo "  ✅ Federation status saved"
fi

# 3. Identity snapshot
IDENTITY=$(curl -sf "http://localhost:$PORT/api/identity" 2>/dev/null)
if [ -n "$IDENTITY" ]; then
  echo "$IDENTITY" | jq . > "$BUNDLE_DIR/identity.json"
  echo "  ✅ Identity snapshot saved"
fi

# 4. Recent feed events
FEED=$(curl -sf "http://localhost:$PORT/api/feed?limit=100" 2>/dev/null)
if [ -n "$FEED" ]; then
  echo "$FEED" | jq . > "$BUNDLE_DIR/feed.json"
  echo "  ✅ Feed events saved ($(echo "$FEED" | jq '.events | length') events)"
fi

# 5. Metadata
cat > "$BUNDLE_DIR/backup-meta.json" << META
{
  "timestamp": "$(date -u '+%Y-%m-%dT%H:%M:%SZ')",
  "node": "$NODE",
  "hostname": "$(hostname)",
  "maw_version": "$(maw --version 2>/dev/null || echo 'unknown')",
  "type": "full"
}
META

echo ""
echo "📦 Full backup: $BUNDLE_DIR"
echo "   $(du -sh "$BUNDLE_DIR" | awk '{print $1}') total"
```

---

### Restore

```bash
# Find latest backup
if [ -n "$1" ]; then
  RESTORE_FILE="$1"
else
  RESTORE_FILE=$(ls -t "$BACKUP_DIR"/maw.config_*.json 2>/dev/null | head -1)
fi

if [ -z "$RESTORE_FILE" ] || [ ! -f "$RESTORE_FILE" ]; then
  echo "❌ No backup found"
  echo "   Available: /federation-backup list"
  exit 1
fi

# Validate backup
if ! jq . "$RESTORE_FILE" > /dev/null 2>&1; then
  echo "❌ Backup file is invalid JSON"
  exit 1
fi

# Show what will be restored
BACKUP_NODE=$(jq -r '.node' "$RESTORE_FILE")
BACKUP_PEERS=$(jq -r '.namedPeers | length' "$RESTORE_FILE")
CURRENT_NODE=$(jq -r '.node' "$CONFIG" 2>/dev/null)

echo "🔄 Restore Preview"
echo "━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  From:  $RESTORE_FILE"
echo "  Node:  $BACKUP_NODE"
echo "  Peers: $BACKUP_PEERS"
echo ""

if [ "$BACKUP_NODE" != "$CURRENT_NODE" ] 2>/dev/null; then
  echo "  ⚠️ Node name differs! Backup=$BACKUP_NODE, Current=$CURRENT_NODE"
fi

echo "  Current config will be backed up before overwriting."
echo ""
echo "  Proceed? (y/n)"
```

On confirmation:

```bash
# Safety backup of current
cp "$CONFIG" "$BACKUP_DIR/maw.config_pre-restore_$(date '+%Y%m%d_%H%M%S').json"

# Restore
cp "$RESTORE_FILE" "$CONFIG"

echo "✅ Restored from $RESTORE_FILE"
echo ""
echo "  ⚠️ Restart maw serve to pick up changes:"
echo "     pm2 restart maw   (or kill + maw serve &)"
```

---

### List Backups

```bash
echo "📋 Available Backups"
echo "━━━━━━━━━━━━━━━━━━━━"
echo ""

# Config backups
ls -lt "$BACKUP_DIR"/maw.config_*.json 2>/dev/null | while read -r line; do
  FILE=$(echo "$line" | awk '{print $NF}')
  SIZE=$(echo "$line" | awk '{print $5}')
  DATE=$(echo "$line" | awk '{print $6, $7, $8}')
  NODE=$(jq -r '.node' "$FILE" 2>/dev/null)
  PEERS=$(jq '.namedPeers | length' "$FILE" 2>/dev/null)

  echo "  📄 $(basename "$FILE")"
  echo "     $DATE | $NODE | $PEERS peers | ${SIZE}B"
done

echo ""

# Full backups
ls -d "$BACKUP_DIR"/full_* 2>/dev/null | while read -r dir; do
  SIZE=$(du -sh "$dir" | awk '{print $1}')
  META=$(cat "$dir/backup-meta.json" 2>/dev/null)
  TS=$(echo "$META" | jq -r '.timestamp' 2>/dev/null)
  echo "  📦 $(basename "$dir") (full) — $SIZE — $TS"
done

TOTAL=$(ls "$BACKUP_DIR"/maw.config_*.json 2>/dev/null | wc -l | tr -d ' ')
echo ""
echo "  Total: $TOTAL backups"
```

---

### Export — Portable Peer List

Export peers as a shareable format (no token!):

```bash
EXPORT_FILE="$HOME/federation-peers-$(date '+%Y%m%d').json"

jq '{
  exported_from: .node,
  exported_at: (now | strftime("%Y-%m-%dT%H:%M:%SZ")),
  peers: [.namedPeers[] | {name, url}]
}' "$CONFIG" > "$EXPORT_FILE"

echo "📤 Exported peer list (no token included)"
echo ""
echo "  File: $EXPORT_FILE"
echo "  Peers:"
jq -r '.peers[] | "    • \(.name) — \(.url)"' "$EXPORT_FILE"
echo ""
echo "  Share this file — recipient adds token themselves."
echo "  Import: /federation-backup import $EXPORT_FILE"
```

### Import — Add Peers from Export

```bash
IMPORT_FILE="$1"

if [ ! -f "$IMPORT_FILE" ]; then
  echo "❌ File not found: $IMPORT_FILE"
  exit 1
fi

echo "📥 Import Preview"
echo ""

# Show what will be added
NEW_PEERS=$(jq -r '.peers[] | "  • \(.name) — \(.url)"' "$IMPORT_FILE")
echo "  New peers:"
echo "$NEW_PEERS"
echo ""

# Check for duplicates
EXISTING=$(jq -r '.namedPeers[].name' "$CONFIG")
jq -r '.peers[].name' "$IMPORT_FILE" | while read -r NAME; do
  if echo "$EXISTING" | grep -q "^${NAME}$"; then
    echo "  ⚠️ $NAME already exists — will skip"
  fi
done

echo ""
echo "  Add these peers? (y/n)"
```

On confirmation:

```bash
# Backup first
cp "$CONFIG" "$BACKUP_DIR/maw.config_pre-import_$(date '+%Y%m%d_%H%M%S').json"

# Merge peers (skip duplicates)
EXISTING_NAMES=$(jq -r '.namedPeers[].name' "$CONFIG")
jq -c '.peers[]' "$IMPORT_FILE" | while read -r PEER; do
  NAME=$(echo "$PEER" | jq -r '.name')
  URL=$(echo "$PEER" | jq -r '.url')

  if ! echo "$EXISTING_NAMES" | grep -q "^${NAME}$"; then
    jq --arg name "$NAME" --arg url "$URL" \
      '.namedPeers += [{"name":$name,"url":$url}]' \
      "$CONFIG" > /tmp/maw-import.json && mv /tmp/maw-import.json "$CONFIG"
    echo "  ✅ Added $NAME ($URL)"
  else
    echo "  ⏭️ Skipped $NAME (duplicate)"
  fi
done
```

---

### Diff — Compare Current vs Backup

```bash
LATEST_BACKUP=$(ls -t "$BACKUP_DIR"/maw.config_*.json 2>/dev/null | head -1)

if [ -z "$LATEST_BACKUP" ]; then
  echo "❌ No backup to compare against"
  exit 1
fi

echo "🔍 Config Diff"
echo "  Current: $CONFIG"
echo "  Backup:  $(basename "$LATEST_BACKUP")"
echo ""

# Compare key fields
CURR_NODE=$(jq -r '.node' "$CONFIG")
BACK_NODE=$(jq -r '.node' "$LATEST_BACKUP")
[ "$CURR_NODE" != "$BACK_NODE" ] && echo "  node: $BACK_NODE → $CURR_NODE"

CURR_PORT=$(jq -r '.port' "$CONFIG")
BACK_PORT=$(jq -r '.port' "$LATEST_BACKUP")
[ "$CURR_PORT" != "$BACK_PORT" ] && echo "  port: $BACK_PORT → $CURR_PORT"

CURR_HOST=$(jq -r '.host' "$CONFIG")
BACK_HOST=$(jq -r '.host' "$LATEST_BACKUP")
[ "$CURR_HOST" != "$BACK_HOST" ] && echo "  host: $BACK_HOST → $CURR_HOST"

# Compare peer lists
echo ""
echo "  Peers:"
CURR_PEERS=$(jq -r '.namedPeers[].name' "$CONFIG" | sort)
BACK_PEERS=$(jq -r '.namedPeers[].name' "$LATEST_BACKUP" | sort)

# Added peers
diff <(echo "$BACK_PEERS") <(echo "$CURR_PEERS") | grep '^>' | sed 's/^> /    + /'
# Removed peers
diff <(echo "$BACK_PEERS") <(echo "$CURR_PEERS") | grep '^<' | sed 's/^< /    - /'
# Unchanged
comm -12 <(echo "$BACK_PEERS") <(echo "$CURR_PEERS") | sed 's/^/    = /'
```

---

## Automatic Backup Schedule

Set up automatic daily backups:

```bash
# Using cron
(crontab -l 2>/dev/null; echo "0 0 * * * cp ~/.config/maw/maw.config.json ~/.config/maw/backups/maw.config_\$(date +\%Y\%m\%d).json") | crontab -

# Using launchd (macOS)
cat > ~/Library/LaunchAgents/com.maw.backup.plist << 'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.maw.backup</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>-c</string>
        <string>cp ~/.config/maw/maw.config.json ~/.config/maw/backups/maw.config_$(date +%Y%m%d).json</string>
    </array>
    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>0</integer>
        <key>Minute</key>
        <integer>0</integer>
    </dict>
</dict>
</plist>
PLIST
launchctl load ~/Library/LaunchAgents/com.maw.backup.plist
```

---

🤖 Federation Oracle 🗺️ — /federation-backup v1.0
