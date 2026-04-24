# /sync — Federation Sync Workflow

> Commit, push, pull, PR, broadcast, and ack — one command.

## Usage

```
/sync                    # Auto-detect: commit + push + broadcast
/sync push               # Commit + push to current branch + broadcast
/sync pr                 # Commit + push + create PR + broadcast
/sync pull               # Pull latest + broadcast "synced"
/sync merge <pr#>        # Merge PR + pull + broadcast "merged"
/sync status             # Show sync state across all oracles
/sync ack                # Acknowledge you received a sync broadcast
```

---

## Commands

### /sync (auto-detect)

Detects the right action based on git state:

```bash
# Step 1: Check state
BRANCH=$(git branch --show-current)
CHANGES=$(git status --porcelain | wc -l | tr -d ' ')
AHEAD=$(git rev-list --count origin/$BRANCH..$BRANCH 2>/dev/null || echo "0")
BEHIND=$(git rev-list --count $BRANCH..origin/$BRANCH 2>/dev/null || echo "0")

# Step 2: Decide
if [ "$BEHIND" -gt 0 ]; then
  ACTION="pull"    # Behind remote → pull first
elif [ "$CHANGES" -gt 0 ]; then
  ACTION="push"    # Uncommitted changes → commit + push
elif [ "$AHEAD" -gt 0 ]; then
  ACTION="push"    # Ahead of remote → push
else
  ACTION="status"  # Nothing to do → show status
fi
```

Then execute the chosen action below.

---

### /sync push

Commit all changes, push, and broadcast to the federation.

**Step 1: Commit**

```bash
# Stage relevant files (not secrets)
git add -A

# Auto-generate commit message from changes
FILES=$(git diff --cached --name-only | head -10)
SUMMARY=$(git diff --cached --stat | tail -1)

git commit -m "sync: $SUMMARY

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

**Step 2: Push**

```bash
BRANCH=$(git branch --show-current)
git push origin "$BRANCH"
```

**Step 3: Broadcast**

```bash
NODE=$(jq -r '.node' ~/.config/maw/maw.config.json)
SESSION=$(tmux display-message -p '#S' 2>/dev/null || echo "unknown")
REPO=$(basename $(git rev-parse --show-toplevel))
COMMIT=$(git log --oneline -1)

# Broadcast to all peers
PEERS=$(jq -r '.namedPeers[].name' ~/.config/maw/maw.config.json)
for PEER in $PEERS; do
  maw hey "$PEER:$PEER" "📥 sync: $REPO pushed — $COMMIT. git pull to sync! [$NODE:$SESSION]" --force 2>/dev/null
done
```

**Step 4: Show result**

```
✅ /sync push complete
  commit: abc1234 sync: 3 files changed
  branch: main
  broadcast: mba ✓, white ✓
```

---

### /sync pr

Commit, push to a branch, create PR, and broadcast for review.

**Step 1: Branch**

```bash
NODE=$(jq -r '.node' ~/.config/maw/maw.config.json)
BRANCH="$NODE/sync-$(date +%H%M)"

git checkout -b "$BRANCH"
```

**Step 2: Commit + Push**

```bash
git add -A
git commit -m "sync: changes from $NODE

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
git push -u origin "$BRANCH"
```

**Step 3: Create PR**

```bash
REPO_FULL=$(gh repo view --json nameWithOwner --jq '.nameWithOwner')
PR_URL=$(gh pr create \
  --title "sync: $(git diff --stat HEAD~1 | tail -1 | tr -s ' ')" \
  --body "Auto-sync from $NODE. Review and merge." \
  --head "$BRANCH" \
  --base main)
```

**Step 4: Broadcast for review**

```bash
PEERS=$(jq -r '.namedPeers[].name' ~/.config/maw/maw.config.json)
for PEER in $PEERS; do
  maw hey "$PEER:$PEER" "📝 PR ready for review: $PR_URL [$NODE:$SESSION]" --force 2>/dev/null
done
```

---

### /sync pull

Pull latest changes and broadcast acknowledgment.

```bash
BEFORE=$(git rev-parse HEAD)
git pull origin main
AFTER=$(git rev-parse HEAD)

if [ "$BEFORE" != "$AFTER" ]; then
  NEW_COMMITS=$(git log --oneline $BEFORE..$AFTER | wc -l | tr -d ' ')
  SUMMARY=$(git log --oneline $BEFORE..$AFTER | head -3)

  # Broadcast ack
  NODE=$(jq -r '.node' ~/.config/maw/maw.config.json)
  SESSION=$(tmux display-message -p '#S' 2>/dev/null || echo "unknown")
  PEERS=$(jq -r '.namedPeers[].name' ~/.config/maw/maw.config.json)
  for PEER in $PEERS; do
    maw hey "$PEER:$PEER" "✅ synced: pulled $NEW_COMMITS commits [$NODE:$SESSION]" --force 2>/dev/null
  done

  echo "✅ pulled $NEW_COMMITS new commits"
else
  echo "✅ already up to date"
fi
```

---

### /sync merge <pr#>

Review, merge a PR, pull, and broadcast.

```bash
PR_NUM="$1"
REPO_FULL=$(gh repo view --json nameWithOwner --jq '.nameWithOwner')

# Step 1: Quick review
gh pr view "$PR_NUM" --json title,additions,changedFiles,files \
  --jq '{title, additions, changedFiles, files: [.files[].path]}'

# Step 2: Merge
gh pr merge "$PR_NUM" --merge

# Step 3: Pull
git pull origin main

# Step 4: Broadcast
TITLE=$(gh pr view "$PR_NUM" --json title --jq '.title')
NODE=$(jq -r '.node' ~/.config/maw/maw.config.json)
SESSION=$(tmux display-message -p '#S' 2>/dev/null || echo "unknown")
PEERS=$(jq -r '.namedPeers[].name' ~/.config/maw/maw.config.json)
for PEER in $PEERS; do
  maw hey "$PEER:$PEER" "✅ PR #$PR_NUM merged: $TITLE. git pull to sync! [$NODE:$SESSION]" --force 2>/dev/null
done
```

---

### /sync status

Show sync state across all oracles — who's up to date, who's behind.

```bash
REPO=$(basename $(git rev-parse --show-toplevel))
LOCAL_HEAD=$(git rev-parse --short HEAD)
BRANCH=$(git branch --show-current)
CHANGES=$(git status --porcelain | wc -l | tr -d ' ')

echo "📊 Sync Status: $REPO"
echo ""
echo "  Local:"
echo "    branch:  $BRANCH"
echo "    head:    $LOCAL_HEAD"
echo "    changes: $CHANGES uncommitted"
echo ""

# Check remote
git fetch origin --quiet 2>/dev/null
AHEAD=$(git rev-list --count origin/$BRANCH..$BRANCH 2>/dev/null || echo "?")
BEHIND=$(git rev-list --count $BRANCH..origin/$BRANCH 2>/dev/null || echo "?")
echo "  Remote:"
echo "    ahead:   $AHEAD commits"
echo "    behind:  $BEHIND commits"
echo ""

# Check open PRs
echo "  PRs:"
gh pr list --json number,title,state --jq '.[] | "    #\(.number) \(.title)"' 2>/dev/null || echo "    (none)"
echo ""

# Check federation peers
echo "  Federation:"
maw federation status 2>&1 | grep -E "●" | sed 's/^/    /'
```

---

### /sync ack

Acknowledge a sync broadcast — tells the sender you pulled and are up to date.

```bash
git pull origin main --quiet

NODE=$(jq -r '.node' ~/.config/maw/maw.config.json)
SESSION=$(tmux display-message -p '#S' 2>/dev/null || echo "unknown")
HEAD=$(git rev-parse --short HEAD)

# Send ack to all peers
PEERS=$(jq -r '.namedPeers[].name' ~/.config/maw/maw.config.json)
for PEER in $PEERS; do
  maw hey "$PEER:$PEER" "ack sync — at $HEAD [$NODE:$SESSION]" --force 2>/dev/null
done

echo "✅ ack sent — at $HEAD"
```

---

## Full Sync Cycle (Example)

```
MBA Oracle writes docs:
  /sync push
    → commit + push main
    → broadcast: "📥 sync: federation-books pushed — abc1234"
    
White Oracle receives broadcast:
  /sync pull
    → git pull origin main
    → broadcast: "✅ synced: pulled 1 commit"
    
Federation Oracle receives both:
  /sync ack
    → git pull + ack
    → broadcast: "ack sync — at abc1234"

All 3 oracles now at the same commit.
```

## PR Sync Cycle (Example)

```
White Oracle writes a new guide:
  /sync pr
    → commit + push white/sync-0935
    → gh pr create
    → broadcast: "📝 PR #6 ready for review"

Federation Oracle reviews:
  /sync merge 6
    → review + merge
    → broadcast: "✅ PR #6 merged: sync: 1 file changed"

MBA Oracle syncs:
  /sync pull
    → git pull
    → broadcast: "✅ synced: pulled 2 commits"
```

---

## Message Format

All sync messages follow the messaging best practices:

| Action | Message | Format |
|--------|---------|--------|
| push | `📥 sync: $REPO pushed — $COMMIT` | Short, commit hash |
| pr | `📝 PR #N ready for review: $URL` | PR number + URL |
| merge | `✅ PR #N merged: $TITLE` | PR number + title |
| pull | `✅ synced: pulled N commits` | Commit count |
| ack | `ack sync — at $HASH` | Current HEAD |

All messages end with `[$NODE:$SESSION]` signature.

---

## Installation

```bash
BOOKS=$(find ~/Code -path "*/federation-books/.claude/skills/sync" -type d | head -1)
ORACLE=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
ln -sf "$BOOKS" "$ORACLE/.claude/skills/sync"
```

---

🤖 Federation Oracle 🗺️ — /sync v1.0
