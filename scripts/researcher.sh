#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR"

STATE_DIR=".swarm/state"
mkdir -p "$STATE_DIR"
LAST_RUN_FILE="$STATE_DIR/last_proposal"

# Rate limit: max 1 proposal per 6 hours
if [[ -f "$LAST_RUN_FILE" ]]; then
  last=$(cat "$LAST_RUN_FILE")
  now=$(date +%s)
  elapsed=$((now - last))
  if [[ $elapsed -lt 21600 ]]; then
    echo "$(date): last proposal $((elapsed / 60)) min ago, skipping"
    exit 0
  fi
fi

# Cap open proposals at 5 to avoid flooding the user
open_proposals=$(gh issue list --label proposal --state open --json number --jq 'length')
if [[ $open_proposals -ge 5 ]]; then
  echo "$(date): 5 open proposals already, skipping"
  exit 0
fi

# Build context for the researcher
RECENT_COMMITS=$(git log --oneline -20)
OPEN_ISSUES=$(gh issue list --state open --limit 20 --json title --jq '.[].title' | sed 's/^/- /')
CLOSED_PROPOSALS=$(gh issue list --label proposal --state closed --limit 15 --json title --jq '.[].title' | sed 's/^/- /')

ROLE_PROMPT=$(cat .swarm/roles/researcher.md)

PROMPT=$(cat <<EOF
$ROLE_PROMPT

## Repo state right now

Recent commits:
$RECENT_COMMITS

Currently open issues (do not duplicate):
$OPEN_ISSUES

Recently closed proposals (do not repropose):
$CLOSED_PROPOSALS

## Your task

Read CLAUDE.md, then explore f1FantasyApp/ enough to understand what exists.
Propose ONE feature. Use the gh CLI to file the issue with the 'proposal' label.
When done, output only the issue URL.
EOF
)

claude -p "$PROMPT" \
  --allowedTools "Read,Glob,Grep,Bash(gh issue create:*),Bash(gh issue list:*),Bash(gh issue view:*),WebSearch" \
  --max-turns 25

date +%s > "$LAST_RUN_FILE"
echo "$(date): proposal filed"
