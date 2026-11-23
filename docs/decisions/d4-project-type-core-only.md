---
title: D4 Project type
description: No agent-behavior project type matches; only the core rules apply
components: []
---

# D4 — Core rules only

**Decision:** Apply agent-behavior's `core/` plus the workflow and KB files by task. Apply no project-type
folder.

**Why:** The available types are web development, data pipelines and database infrastructure. This is an
AI-agent and monitoring project. agent-behavior's `project-types/README.md` states there is no AI-deployment
type and forbids writing one from general knowledge; one is added only after a real project of that type exists.

**Adaptation:** The project builds no UI of its own (Grafana dashboards are configuration, [D11](d11-grafana-monitoring-ui.md)), so the UI and browser rules, token and contrast tests, browser launcher
and design hooks are dropped. Safety rules 1 to 4 and 9 are applied (restated for MCP and Zabbix in
[coding-standards](../development/coding-standards.md), with the core rule tagged on each), because the agent
will read a monitoring database and may eventually write to it.

**Revisit:** if the project later builds custom UI code (a Grafana plugin or its own web UI), load the web-development type for that part.
