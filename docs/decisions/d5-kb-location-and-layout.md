---
title: D5 KB location and layout
description: Where the KB lives, why its layout follows agent-behavior, and where the code will not live
components: []
---

# D5 — KB location, layout and rulebook

**Decision:**
- The KB root is `/unified/user/cj/knowledge/ai_agent/zabbix_agent/`, docs only.
- Layout and conventions follow agent-behavior (`kb/size-and-layout.md`, `kb/conventions.md`,
  `kb/index-files.md`): `CLAUDE.md` index, `docs/` folders, front-matter on every doc, size limits (index
  files under 200 lines, other docs under 300), current state only.
- `/unified/user/cj/` is the project root on every machine; other folders stay clean and isolated.

**Why:** The owner requires agent-behavior as the system prompt for building the knowledge base. A generic
`<Project>_kb/` scaffold was set aside where it conflicted, per agent-behavior `core/precedence.md`
(the user's explicit instruction ranks above generic tooling).

**Note:** The owner's original requirement text spelled the path `/unified/usre/...`; the real directory is
`/unified/user/...`, which is used here.
