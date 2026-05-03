# Work Log — May 2026

A running record of session work. Most recent first.

---

## 2026-05-02 — Swarm stabilisation, Railway fix, PR #10 close-out

### Railway deployment
- Pointed Railway away from `maxfaulkner/python` and onto `maxfaulkner/f1Fantasy`, main branch, root directory `f1FantasyApp/f1FantasyApp_V1`
- Verified live at https://f1fantasyapp.up.railway.app

### Three-agent swarm — workflow fixes
The reviewer→implementer feedback loop required several iterations to work autonomously. Root problems and fixes:

| Problem | Fix |
|---|---|
| `GITHUB_TOKEN` anti-loop: reviewer's formal `REQUEST_CHANGES` review doesn't fire implementer | Added `repository_dispatch: request-changes` bridge — reviewer fires dispatch, implementer listens on it |
| `403` on `repository_dispatch` API call | Reviewer had `contents: read`; changed to `contents: write` |
| `Workflow initiated by non-human actor` blocking implementer | Added `github-actions[bot]` to `allowed_bots` in implementer's `respond-to-review` step |
| Race condition: reviewer verdict empty | Added `sleep 5` before verdict check |
| Double reviewer/implementer loop | Removed `pull_request` trigger from reviewer entirely; reviewer now only fires via `review-requested` dispatch |
| Cancelled runs re-triggering the loop | Changed `notify reviewer` step from `if: always()` to `if: success()` |
| `/resume` re-triggering the resume job | Added `sender.type != 'Bot'` guard and used `startsWith` instead of `contains` |
| Reviewer not firing when implementer has nothing to push | Implementer always fires `review-requested` dispatch at the end (`if: success()`) |
| `gh --jq --arg` not supported | Piped `gh` output through standalone `jq` |
| Stale `CHANGES_REQUESTED` blocking merge | Added auto-dismiss step in reviewer before re-reviewing |

### Swarm configuration changes
- Review round limit raised from 3 → 5 (`.github/workflows/reviewer.yml`)
- Added `/resume` command: human comments `/resume` on a stalled swarm PR → resets round count, removes `needs-human` label, re-kicks the loop
- Round-count reset uses timestamp boundary (SWARM RESUME marker comment), so each `/resume` grants a fresh 5-round budget rather than counting against the old total

### iOS bugs filed as GitHub issues
- Issue #4: Results page showing spinner indefinitely (no data loading)
- Issue #5: Double bottom tab bar (layout offset)
Both picked up by the implementer; merged via normal swarm loop.

### 20 feature issues created (Issues #11–#30)
User-facing UX and feature improvements across team management, standings, stats, social, and live timing. Awaiting user's `approved` label to trigger implementer, at their own pace.

### PR #10 — code structure review close-out
PR had stalled at round 10 due to reviewer flip-flopping on two structural debates (JWT_SECRET location, raceImportJob import style). Resolution:
- Both patterns were already correct; reviewer was re-raising closed points
- Fixed the two genuine issues the reviewer identified:
  1. `weeklyRaceImportJob` mock was only in `auth.test.js` — moved to `__tests__/setup.js` globally (with `isRoundLocked` and `startWeeklyRaceImportJob` included so prices/teams routes don't 500)
  2. Added `chat_message` regression test to `bugs.test.js`, asserting the `title` field shape the route actually returns
- Dismissed the blocking `CHANGES_REQUESTED` review manually
- Fired a fresh `review-requested` dispatch for reviewer to re-evaluate

---

## Swarm quick reference

### Labels
| Label | Meaning |
|---|---|
| `proposal` | Researcher-filed feature idea |
| `approved` | Human approved — implementer picks it up |
| `swarm-implementation` | PR opened by implementer |
| `needs-human` | Round limit hit or agents escalated |

### Loop flow
```
researcher.sh (cron)
  → files issue with 'proposal' label

human adds 'approved' label
  → implementer.yml: implement-from-issue
  → opens PR, fires review-requested dispatch

reviewer.yml
  → reviews PR, posts VERDICT comment + formal review
  → APPROVE  → requests human merge
  → REQUEST_CHANGES → fires request-changes dispatch

implementer.yml: respond-to-review
  → pushes fix, fires review-requested dispatch
  → (loop, max 5 rounds)

human /resume comment on PR
  → resets round count, re-kicks loop
```

### CLI tools installed
- `gh` — GitHub CLI (authenticated)
- `claude` — Claude Code CLI (`npm install -g @anthropic-ai/claude-code`)
