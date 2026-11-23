#!/usr/bin/env python3
"""Rebuild CHANGELOG.md from the main-branch git history.

Two ways to run it:
  - as a Claude Code PostToolUse hook on Bash: reads the payload on stdin and acts only when the
    command can add commits (commit, merge, rebase, cherry-pick, revert, pull);
  - with --force (local git hooks, manual runs): always rebuild.

Idempotent: no state file, no run time or commit hash in the output, so a second run gives the
same bytes. Commits that only touch CHANGELOG.md are skipped, so committing the regenerated log
leaves a clean tree. Times are fixed UTC+8. Fails open: always exits 0.
"""
import datetime
import json
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
LOG = "CHANGELOG.md"
TZ = datetime.timezone(datetime.timedelta(hours=8))
BRANCH = "main"
ADDS_COMMITS = re.compile(
    r"(?:^|[;&|\n(])\s*git((?:\s+(?:-C\s+\S+|-c\s+\S+|--\S+))*)\s+"
    r"(?:commit|merge|rebase|cherry-pick|revert|pull)(?![\w-])"
)
HEADER = """# Changelog

Generated from `git log` on `main` by `.claude/hooks/update-changelog.py` after each commit. Do not edit by hand.
One table per date, times in UTC+8. Commits that only touch this file are not listed.
"""


def git(*args):
    return subprocess.run(["git", "-C", ROOT, *args], capture_output=True, text=True, check=True).stdout


def build():
    log = git("log", "--first-parent", "--no-merges", "--reverse", "--format=%H|%h|%ct|%s", BRANCH)
    days = {}
    for line in log.splitlines():
        full, short, ts, subject = line.split("|", 3)
        files = git("diff-tree", "--no-commit-id", "--name-only", "-r", "--root", full).split()
        if files == [LOG]:
            continue
        when = datetime.datetime.fromtimestamp(int(ts), TZ)
        days.setdefault(when.strftime("%Y-%m-%d"), []).append((when.strftime("%H:%M"), subject, short))
    out = HEADER
    for day in sorted(days, reverse=True):
        out += f"\n## {day}\n\n| Time (UTC+8) | Change | Commits |\n|---|---|---|\n"
        for hm, subject, short in reversed(days[day]):
            out += f"| {hm} | {subject.replace('|', '/')} | `{short}` |\n"
    return out


def main():
    if "--force" not in sys.argv:
        payload = json.load(sys.stdin)
        if not ADDS_COMMITS.search(payload.get("tool_input", {}).get("command", "")):
            return
    path = os.path.join(ROOT, LOG)
    new = build()
    old = open(path, encoding="utf-8").read() if os.path.exists(path) else None
    if new == old:
        return
    with open(path, "w", encoding="utf-8") as f:
        f.write(new)
    if "--force" not in sys.argv:
        print(json.dumps({"hookSpecificOutput": {
            "hookEventName": "PostToolUse",
            "additionalContext": "CHANGELOG.md was regenerated from git history and is not committed."}}))


if __name__ == "__main__":
    try:
        main()
    except Exception:
        pass
    sys.exit(0)
