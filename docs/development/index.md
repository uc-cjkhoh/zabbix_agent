---
title: Development index
description: Standards, review gates, backlog and blocked-work log
components: []
---

# Development

| Doc | Holds |
|---|---|
| [coding-standards.md](coding-standards.md) | Golden rules for every change |
| [review-guidelines.md](review-guidelines.md) | Definition of done; change classes; review and merge policy |
| [llm-agent-proposal.md](llm-agent-proposal.md) | Proposal: best settings for the llama model as the Zabbix agent, capabilities, prediction, tools, topology |
| [llm-probe-plan.md](llm-probe-plan.md) | Read-only probe of the running model, restart tests, results |
| [log-replay-rig-design.md](log-replay-rig-design.md) | Proposed design: replay a real module log to the real Zabbix (HTTP) and a local file, with a monitor page, to test the agent (awaiting owner approval) |
| [implementation-plan/log-replay-rig.md](implementation-plan/log-replay-rig.md) | Task-by-task plan for the log replay rig (9 tasks; the last is gated on the owner's go for the Zabbix writes) |
| [implementation-plan/index.md](implementation-plan/index.md) | The task-by-task plan for building the system (transient: removed when built) |
| [../../CHANGELOG.md](../../CHANGELOG.md) | Generated change log; rebuilt after each commit by the update-log hook ([D14](../decisions/d14-changelog-generated-in-root.md)) |
| [backlog/index.md](backlog/index.md) | The only to-do list, with recommended order |
| [run-logs/blocked](run-logs/blocked) | Work that could not proceed, and what unblocks it |
