---
title: Backlog - environment and tooling
description: Remaining testbed checks and git
components: []
---

# Environment and tooling

- **testbed-privileged-checks** (low; small) - open: firewalld rules, who owns each listening socket, and
  whether SELinux will block bind mounts are unverified because `sudo` needs a password. Needs: the user to
  run the commands or to authorise a privileged session.
- **git-credentials** (low; trivial) - open: the KB repo is on branch `main`, tracking `origin` (the owner's `zabbix_agent` repository on
  GitHub); the first commit was pushed by the owner. This machine still has no GitHub credentials (no `gh`, no helper, no token), so
  the owner pushes. Needs: a one-shot credential or an ssh key if the agent should push, then scope or revoke it. The code repo is
  separate and not created yet.
