---
title: Backlog - environment and tooling
description: Remaining testbed checks, hooks wiring and KB check
components: []
---

# Environment and tooling

- **testbed-privileged-checks** (low; small) - open: firewalld rules, who owns each listening socket, and
  whether SELinux will block bind mounts are unverified because `sudo` needs a password. Needs: the user to
  run the commands or to authorise a privileged session.
- **testbed-download-test** (medium; trivial) - open: only DNS to the registries was checked. Confirm that an
  image pull and a model download actually work through the network path before the plan depends on them.
  Needs: the user's go-ahead to pull a small image on the testbed.
- **kb-lint-hook** (medium; small) - open: not wired. PostToolUse hook on `Write|Edit` reporting line-limit,
  front-matter, index and link problems, per agent-behavior `tooling/hooks.md`. Editing
  `.claude/settings.json` needs the user's approval (Q6).
- **update-log-hook** (low; small) - open: not wired; `CHANGELOG.md` points at it. Needs: a git repo with
  commits, and Q6.
- **git-push** (medium; trivial) - open: the KB repo is on branch `main` with remote `origin` (the owner's `zabbix_agent` repository
  on GitHub) and the first commit exists locally; `.gitignore` covers `*.local.md`. The push failed because this machine has no GitHub
  credentials (no `gh`, no credential helper, no token). Needs: the owner to push interactively or provide credentials through a
  one-shot mechanism, then scope or revoke them. The code repo is separate and not created yet.
