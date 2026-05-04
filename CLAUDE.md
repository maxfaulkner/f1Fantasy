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

## Memory
Keep the project memory files at `/Users/maxfaulkner/.claude/projects/-Users-maxfaulkner-Documents-F1FantasyRepo-f1Fantasy/memory/` up to date throughout every session — do not wait to be asked. Update or create memory entries whenever you learn something worth preserving: project decisions, user preferences, architectural context, ongoing work, or anything non-obvious that would help a future agent pick up where you left off. Index every file in `MEMORY.md`. Prefer updating existing entries over creating duplicates.

## Out of scope for the swarm
- The other top-level folders mentioned above
- Anything in `.swarm/` (the swarm's own configuration)
- Anything in `.github/workflows/` (workflow files — only the human edits these)
