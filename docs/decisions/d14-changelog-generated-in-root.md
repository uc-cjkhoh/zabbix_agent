---
title: D14 Change log lives in CHANGELOG.md
description: The generated change log is the root CHANGELOG.md, in UTC+8, rebuilt by a hook after each commit
components: []
---

# D14 — `CHANGELOG.md` is the generated change log

**Status:** owner decision.

**Decision:** All change-log entries live in the root `CHANGELOG.md`, built from `main` history by
`.claude/hooks/update-changelog.py`. Times are UTC+8. It is never hand-edited. There is no `docs/development/updates/`.

**Why:** The owner wants one file to read. This departs from agent-behavior `kb/size-and-layout.md` (a pointer to
a generated log under `docs/`) and `tooling/hooks.md` (times in UTC); the user's instruction wins
(`core/precedence.md`). Do not "restore" the pointer layout.

**How it runs:**
- Claude Code: a PostToolUse hook on `Bash` in `.claude/settings.json` (committed). It acts only when the command can add
  commits (commit, merge, rebase, cherry-pick, revert, pull).
- Outside Claude: local git hooks `post-commit`, `post-merge`, `post-rewrite` call the script with `--force`. They are not
  versioned: recreate them in a fresh clone from the repo root:
  ```
  for h in post-commit post-merge post-rewrite; do
    printf '#!/bin/sh\npython3 -I "$(git rev-parse --show-toplevel)/.claude/hooks/update-changelog.py" --force >/dev/null 2>&1 || true\nexit 0\n' > .git/hooks/$h
    chmod +x .git/hooks/$h
  done
  ```
- Every commit leaves `CHANGELOG.md` modified with that commit's row. Commit the file on its own: that commit gets no row
  and the tree is clean again.
- The script is idempotent, fails open, and skips commits that only touch `CHANGELOG.md`, so committing the regenerated log
  leaves a clean tree. It does not commit; the owner decides ([Q7](README.md)).
- Manual rebuild: `python3 -I .claude/hooks/update-changelog.py --force`.
