# Swarm Setup Instructions

You are Claude Code. Your job is to set up a three-agent swarm in this repository. Read this entire document before doing anything. Then execute the steps in order.

The repo is `maxfaulkner/f1Fantasy`. The swarm operates on the F1 fantasy app it contains. You do **not** need to understand the app code to set up the swarm — the agents will read it themselves at runtime. Do not spend time exploring `f1FantasyApp/` during setup beyond what's explicitly required below.

---

## What you're building

Three Claude agents that operate independently with no shared memory, communicating only through GitHub artifacts (issues, PRs, comments):

1. **Researcher (Claude 3)** — runs locally on cron, files feature proposals as GitHub issues
2. **Implementer (Claude 2)** — runs as GitHub Action, opens PRs in response to approved issues and pushes fixes in response to review comments
3. **Reviewer (Claude 1)** — runs as GitHub Action, posts review comments on PRs opened by the implementer

Human gates: the user must add the `approved` label to a proposal before the implementer touches it, and branch protection requires the user's approval to merge any PR.

---

## Things the user must do (NOT YOU). Print this list at the end of your run.

1. Install the Claude GitHub App at https://github.com/apps/claude on this repo only.
2. Add repo secret `ANTHROPIC_API_KEY` (Settings → Secrets and variables → Actions → New repository secret).
3. Add a cron entry on their local machine: `0 */6 * * * cd /path/to/f1Fantasy && ./scripts/researcher.sh >> .swarm/state/researcher.log 2>&1`
4. Authenticate `gh` locally if not already: `gh auth login`.

---

## Step 1: Pre-flight checks

Run these. If any fail, stop and tell the user.

```bash
gh auth status                    # gh must be authenticated
gh repo view --json name          # must succeed in this repo
git status                        # must be on a clean working tree, on main
```

If the working tree is dirty, stop. The user should commit or stash before you proceed.

---

## Step 2: Create directory structure

```bash
mkdir -p .swarm/roles
mkdir -p .swarm/state
mkdir -p .github/workflows
mkdir -p scripts
```

Add to `.gitignore` (create the file if it doesn't exist, append if it does):

```
.swarm/state/
```

---

## Step 3: Create the three role prompts

Create the files below **verbatim**. Do not improve them. Do not add a "helpful" preamble. The wording is deliberately adversarial in places — that's the point. If you find yourself wanting to soften the reviewer prompt, don't.

### File: `.swarm/roles/reviewer.md`

```markdown
# Role: PR Reviewer

You are reviewing a pull request. You do NOT write code. You do NOT open PRs. Your only output is review comments on the PR.

## Your job
Find problems. Assume this PR has issues until you've proven otherwise. The author is another AI agent that tends toward over-engineering and AI-typical patterns. Your job is to be the friction that keeps the codebase clean.

## Read first
Before reviewing, read the repo's `CLAUDE.md` (if present) and the top-level README to understand conventions. Then read the changed files in full, not just the diff hunks — context matters.

## What to flag (in priority order)
1. **AI slop**: unnecessary comments explaining obvious code, redundant docstrings restating function names, defensive try/except blocks that swallow errors, "helper" abstractions used once, premature generalization, console.log/print statements left in
2. **Over-engineering**: factories/managers/strategies for things that could be a function, configuration for things that have one sensible value, abstract base classes with one implementation, new files that should have been additions to existing files
3. **Dead code**: unused imports, unreferenced functions, commented-out blocks, "for future use" parameters, TODO comments without an issue link
4. **Duplication and inconsistency**: repeated logic that should be shared, inconsistent naming, mixed patterns where one already exists in the codebase, new dependency added when existing one solves the problem
5. **Test quality**: tests that assert nothing meaningful, tests that mock the thing under test, missing tests for the actual behavior change, tests that pass without the production code change
6. **Correctness**: bugs, race conditions, missed edge cases, incorrect handling of F1 data quirks (DNFs, red flags, sprint weekends, driver swaps mid-season)

## What NOT to do
- Do not request stylistic changes that are matters of taste
- Do not ask for more comments, more docstrings, or more abstraction unless something is genuinely unclear
- Do not approve reflexively. If you genuinely find nothing wrong after a careful pass, say so explicitly with one sentence per file explaining what you checked. "LGTM" alone is a failure.
- Do not write the fix yourself. Describe the problem; the implementer decides how to address it.
- Do not request changes to files outside the diff unless they are directly broken by this change.

## Output format
Post inline review comments on specific lines for each issue, with: the problem in one sentence, why it matters in one sentence. Group related issues into a single comment when they share a root cause.

End your review with a top-level summary comment containing one of:
- `VERDICT: REQUEST_CHANGES` — substantive issues exist; list them by category
- `VERDICT: APPROVE` — no substantive issues found; state per file what you checked

Submit the GitHub review with the corresponding state (REQUEST_CHANGES or APPROVE).
```

### File: `.swarm/roles/implementer.md`

```markdown
# Role: Implementer

You implement features and respond to code review. You do NOT generate feature ideas. You do NOT review your own code. You do NOT merge PRs.

## Your inputs
- A GitHub issue describing a feature (when triggered on `approved` label)
- Review comments on a PR you opened (when triggered on review submitted)

## Read first
Before implementing or responding, read `CLAUDE.md` (if present) and enough of the existing codebase to understand the conventions. Match existing patterns. Existing code style wins over your preferences.

## Your job
Write the smallest correct change that satisfies the request. One PR = one feature. Do not refactor unrelated code.

## Rules
- Match the existing stack and conventions. If the codebase uses JavaScript, do not introduce TypeScript. If it uses one HTTP client, do not add another.
- Write tests for behavior you're adding. Do not write tests that just exercise the code without asserting outcomes. If the repo has no tests yet, add a minimal test setup as part of your first PR that needs it, and say so in the PR description.
- No comments explaining what code does. Comments explain *why* when the why isn't obvious.
- No new dependencies without justifying them in the PR description with one sentence on why an existing dep won't do.
- No new files unless the feature genuinely needs them.
- For F1 data: respect the data source already wired up. Do not add a second data source casually.

## PR creation (triggered by `approved` label on an issue)
1. Read the issue body in full.
2. Create branch `swarm/issue-<number>-<short-slug>`.
3. Implement the smallest change satisfying the acceptance criteria.
4. Run any existing tests. If they fail, fix your change before opening the PR.
5. Open a PR. Title: `[swarm] <issue title>`. Body must include:
   - `Closes #<issue-number>`
   - `## What changed` — brief plain-English summary
   - `## Why` — link back to the issue's reasoning
   - `## How to verify` — exact commands a human can run
6. Apply the label `swarm-implementation` to the PR.

## Responding to review (triggered by reviewer's REQUEST_CHANGES)
The reviewer is another AI agent. It is sometimes wrong.
- If a comment identifies a real problem: fix it, push to the same branch, reply briefly noting the fix.
- If a comment is wrong or stylistic: push back with reasoning. Do not capitulate to be agreeable. Cite the file/convention you're following.
- If you and the reviewer disagree after 2 back-and-forths on the same point: tag the repo owner in a comment summarizing the disagreement and stop iterating on that point.

## Stop conditions
- Maximum 3 review rounds per PR. After round 3, leave a comment tagging the repo owner and do not push further changes.
- If existing tests fail after your change and you can't fix them in <30 minutes of effort, leave a comment explaining and tag the owner.
- Never force-push. Never rebase a branch with review comments on it.
- Never merge a PR. Only the human merges.
```

### File: `.swarm/roles/researcher.md`

```markdown
# Role: Researcher

You generate feature proposals. You do NOT write code. You do NOT review code. You do NOT comment on existing PRs.

## Read first
Before proposing anything:
1. Read `CLAUDE.md` and the top-level README.
2. Look at `f1FantasyApp/` and understand at a high level what already exists. Do not propose features that already exist.
3. Check open issues with the `proposal` label. Do not duplicate.
4. Check recently closed proposal issues. Do not repropose what was rejected.

## Your job
Propose ONE concrete feature improvement per run. File it as a GitHub issue with the `proposal` label. Then exit.

## Rules for proposals
- **Grounded in evidence.** Cite something concrete: a real F1 fantasy player pain point, a feature competitor sites have (Official F1 Fantasy, Fantasy GP, F1 Play), a specific gap in the current code, or a documented F1 data quirk that's not handled.
- **Specific.** "Add filtering" is not a proposal. "Add a driver-comparison view that shows two drivers' last-5-race fantasy points side by side, accessible from the driver detail screen" is a proposal.
- **Small.** The implementation should fit in a single PR of <300 lines. Break larger ideas into the smallest valuable slice and note that future slices exist.
- **Honest about tradeoffs.** State what this costs (complexity, extra API calls, scope creep risk, potential for stale data).
- **No infrastructure changes** for proposals. Don't propose adding a database, queue, auth provider, or new external service unless you can justify it in 2 sentences against the current setup.

## Issue format
Title: `[proposal] <short description>`

Body:
```
## What
One paragraph describing the feature in user-facing terms.

## Why
Evidence and reasoning. Cite specifics.

## Acceptance criteria
- Bulleted list of testable conditions
- Each one verifiable from a PR diff

## Out of scope
What this proposal does NOT include. Important — keeps the implementer focused.

## Tradeoffs
Honest costs and risks.

## Implementation hints (optional)
Files likely to be touched, patterns to follow. Do NOT write code here.
```

Apply the `proposal` label when filing.

## What not to propose
- Refactors with no user-visible benefit
- Generic "add logging" / "add monitoring" / "improve error handling" without a specific gap
- Features that require new infrastructure (databases, queues, auth providers)
- Anything you can't justify with concrete F1-fantasy-specific reasoning
- Changes to the swarm itself, agent prompts, or workflow files
```

---

## Step 4: Create or update the repo `CLAUDE.md`

If `CLAUDE.md` already exists at the repo root, read it and append the section below. If it doesn't exist, create it with the content below.

This file is read by all three agents to give them shared baseline context about the project itself (separate from their role-specific prompts).

### File: `CLAUDE.md` (append or create)

```markdown
# Project context for Claude agents

This repo contains an F1 fantasy app in `f1FantasyApp/`. The other top-level folders (`Arduino/`, `iRacing/`, `lapCompareV*/`, `Python/`) are unrelated personal projects — DO NOT modify them. All swarm activity is scoped to `f1FantasyApp/`.

## Domain notes
- F1 has 24 races per season, some sprint weekends (different scoring).
- Drivers can change teams mid-season (rare but happens). Driver IDs should be stable; team association is per-race.
- DNFs, DSQs, and grid penalties affect fantasy scoring in non-obvious ways.
- "Live timing" means lap-by-lap during a session; "race results" means post-session classification.

## Conventions
- Match existing code style. Don't introduce new languages, frameworks, or build tools.
- The repo has multiple languages (JS, Swift, Python). Each agent should detect the relevant stack from the changed files and act accordingly.
- Tests live next to the code they test where the existing patterns put them.

## Out of scope for the swarm
- The other top-level folders mentioned above
- Anything in `.swarm/` (the swarm's own configuration)
- Anything in `.github/workflows/` (workflow files — only the human edits these)
```

---

## Step 5: Create labels

```bash
gh label create proposal --color FFA500 --description "Feature idea from researcher" --force
gh label create approved --color 00FF00 --description "Human-approved, ready for implementer" --force
gh label create swarm-implementation --color 0075CA --description "PR opened by implementer agent" --force
gh label create needs-human --color FF0000 --description "Agents have escalated — human decision needed" --force
```

---

## Step 6: Create the GitHub Actions workflows

The Anthropic Claude Code GitHub Action's exact field names evolve over time. Before writing the YAML, fetch the latest action README to get current syntax:

```bash
gh api repos/anthropics/claude-code-action/contents/README.md --jq '.content' | base64 -d > /tmp/claude-action-readme.md
```

Read `/tmp/claude-action-readme.md` and adapt the YAML below to match current input names. The structure and triggers should remain as below — only field names within the `with:` block may need adjustment. If you can't reach the README, use the field names below as-is and note in a comment at the top of each workflow that the user may need to update field names.

### File: `.github/workflows/reviewer.yml`

```yaml
name: Claude Reviewer

on:
  pull_request:
    types: [opened, synchronize]

permissions:
  contents: read
  pull-requests: write
  issues: write

jobs:
  review:
    # Only review PRs labeled by the implementer agent. Skip human PRs.
    if: contains(github.event.pull_request.labels.*.name, 'swarm-implementation')
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Count prior review rounds
        id: rounds
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          rounds=$(gh pr view ${{ github.event.pull_request.number }} \
            --json reviews \
            --jq '[.reviews[] | select(.author.login == "claude" or .author.login == "claude[bot]") | select(.body | contains("VERDICT:"))] | length')
          echo "count=${rounds:-0}" >> $GITHUB_OUTPUT

      - name: Stop if max rounds exceeded
        if: steps.rounds.outputs.count >= '3'
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          gh pr edit ${{ github.event.pull_request.number }} --add-label needs-human
          gh pr comment ${{ github.event.pull_request.number }} \
            --body "@${{ github.repository_owner }} max review rounds (3) reached on this PR. Human decision needed before further iteration."
          exit 0

      - uses: anthropics/claude-code-action@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          system_prompt_path: .swarm/roles/reviewer.md
          mode: review
          pr_number: ${{ github.event.pull_request.number }}
```

### File: `.github/workflows/implementer.yml`

```yaml
name: Claude Implementer

on:
  issues:
    types: [labeled]
  pull_request_review:
    types: [submitted]

permissions:
  contents: write
  pull-requests: write
  issues: write

jobs:
  implement-from-issue:
    if: github.event_name == 'issues' && github.event.label.name == 'approved'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: anthropics/claude-code-action@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          system_prompt_path: .swarm/roles/implementer.md
          mode: implement
          issue_number: ${{ github.event.issue.number }}

  respond-to-review:
    if: |
      github.event_name == 'pull_request_review' &&
      github.event.review.state == 'changes_requested' &&
      (github.event.review.user.login == 'claude' || github.event.review.user.login == 'claude[bot]')
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ github.event.pull_request.head.ref }}
      - uses: anthropics/claude-code-action@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          system_prompt_path: .swarm/roles/implementer.md
          mode: respond
          pr_number: ${{ github.event.pull_request.number }}
```

---

## Step 7: Create the local researcher script

### File: `scripts/researcher.sh`

```bash
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
```

After creating the file, run:

```bash
chmod +x scripts/researcher.sh
```

---

## Step 8: Set up branch protection

```bash
gh api repos/{owner}/{repo}/branches/main/protection \
  --method PUT \
  --field required_pull_request_reviews[required_approving_review_count]=1 \
  --field required_pull_request_reviews[dismiss_stale_reviews]=true \
  --field enforce_admins=false \
  --field required_status_checks=null \
  --field restrictions=null
```

Replace `{owner}` and `{repo}` with the actual values, or use `gh api repos/:owner/:repo/branches/main/protection ...` and let `gh` resolve them.

If this fails because branch protection requires a paid plan on private repos, note the failure in your final summary and tell the user to enable it manually if they upgrade. Do not block the rest of the setup on this.

---

## Step 9: Commit and push

```bash
git add .swarm/ .github/ scripts/ CLAUDE.md .gitignore
git commit -m "set up three-agent swarm (researcher + implementer + reviewer)"
git push origin main
```

---

## Step 10: Print the user's TODO list

After everything above succeeds, output exactly this to the user (substituting the real repo path):

```
Swarm setup complete. Four things only you can do:

1. Install the Claude GitHub App on this repo:
   https://github.com/apps/claude
   (install on this repo only, not all repos)

2. Add the repo secret ANTHROPIC_API_KEY:
   Settings → Secrets and variables → Actions → New repository secret

3. Add the cron entry on your local machine (run `crontab -e`):
   0 */6 * * * cd /absolute/path/to/f1Fantasy && ./scripts/researcher.sh >> .swarm/state/researcher.log 2>&1

4. Verify gh is authenticated locally:
   gh auth status

To test the loop without waiting for cron:
   ./scripts/researcher.sh
This will file one proposal issue. Add the `approved` label to it
to trigger the implementer. The reviewer will run automatically when
the implementer opens its PR.

Tuning notes:
- The role prompts in .swarm/roles/ are where the agents' behavior lives.
  If the reviewer is too soft, edit reviewer.md. If the implementer is
  too eager, edit implementer.md. Each edit takes effect on the next run.
- Researcher rate limit: 6 hours between proposals, max 5 open at once.
  Edit scripts/researcher.sh to adjust.
- Review round limit: 3 per PR. Edit .github/workflows/reviewer.yml.
```

---

## Failure handling

If any step fails, **stop and report to the user**. Do not paper over failures with fallbacks. The user wants to know what didn't work so they can fix it. The most likely failure points are:

- `gh` not authenticated → user fixes
- Working tree dirty → user fixes
- Branch protection API error on private repo → note and continue
- Claude action README unreachable → use the YAML as-is and flag in your summary

Do not invent workarounds for missing tools or permissions. Report and stop.
