---
title: Decision log
description: Lookup of decision records D1..D13 and the open questions that need the owner
components: []
---

# Decisions

All of D1 to D13 are decided: the owner made D1 to D5, D8 to D13 and read-only v1 directly; D6, D7's thin server and the mechanisms inside D8 and D11 were the agent's proposals, accepted with the approved [design plan](../architecture/design-plan.md). Verification items can still overturn one.

| ID | Decision | File |
|---|---|---|
| D1 | Stack as declared: Llama, Zabbix, MCP, Grafana | [d1-stack.md](d1-stack.md) |
| D2 | Docker isolates every runtime component | [d2-docker-isolation.md](d2-docker-isolation.md) |
| D3 | Network isolation from the host bridges | [d3-network-isolation.md](d3-network-isolation.md) |
| D4 | Project type: none matches, core rules only | [d4-project-type-core-only.md](d4-project-type-core-only.md) |
| D5 | KB location, layout and rulebook | [d5-kb-location-and-layout.md](d5-kb-location-and-layout.md) |
| D6 | Zabbix detects; the model only triages | [d6-detection-split.md](d6-detection-split.md) |
| D7 | Thin custom read-only MCP server | [d7-thin-readonly-mcp-server.md](d7-thin-readonly-mcp-server.md) |
| D8 | Grafana is the only notification surface; no chat or push channel (owner decision) | [d8-grafana-only-notification.md](d8-grafana-only-notification.md) |
| D9 | Llama 3.1 8B (3B fallback) on llama.cpp `llama-server`, CPU only (owner-approved) | [d9-model-and-runtime.md](d9-model-and-runtime.md) |
| D10 | Zabbix 8.0 LTS with PostgreSQL from official images (owner-approved) | [d10-zabbix-version-and-database.md](d10-zabbix-version-and-database.md) |
| D11 | Grafana: monitoring UI and notification surface, read-only, not an alert engine; on-call skipped (owner decision) | [d11-grafana-monitoring-ui.md](d11-grafana-monitoring-ui.md) |
| D12 | Operational data stays in the network (owner decision) | [d12-operational-data-stays-in-network.md](d12-operational-data-stays-in-network.md) |
| D13 | The testbed is a rehearsal; the 50+ modules are a sizing reference (owner decision) | [d13-rehearsal-testbed-and-sizing-reference.md](d13-rehearsal-testbed-and-sizing-reference.md) |

## Open questions (the owner's to decide; nothing is assumed)
| # | Question | Blocks |
|---|---|---|
| Q1 | Where does the code repository live (under `/unified/user/cj/`, which folder)? | `CLAUDE.md` section 2, bootstrap |
| Q2 | Answered: Llama 3.1 8B (3B fallback), gated by a benchmark; runtime llama.cpp `llama-server` ([D9](d9-model-and-runtime.md)) | none |
| Q3 | Answered: superseded; Grafana is the notification medium ([D8](d8-grafana-only-notification.md)) | none |
| Q4 | Answered: Zabbix 8.0 LTS, falling back to 7.0 ([D10](d10-zabbix-version-and-database.md)) | none |
| Q5 | Answered: the agent is read-only against Zabbix in v1 ([D7](d7-thin-readonly-mcp-server.md)) | none |
| Q6 | Do we wire the KB-lint and update-log hooks into `.claude/settings.json`? | [Backlog](../development/backlog/environment-and-tooling.md) |
| Q7 | Commit and merge policy for the KB repo: ask each time (default) or a standing grant? | First commit |
| Q9 | Answered ([D13](d13-rehearsal-testbed-and-sizing-reference.md)): the 50+ modules run on a host we cannot reach and are a sizing reference only; the rehearsal uses simulated load | none |
| Q10 | Answered: no chat system; Grafana only ([D8](d8-grafana-only-notification.md)) | none |
| Q11 | Answered ([D13](d13-rehearsal-testbed-and-sizing-reference.md)): the testbed is a rehearsal | none |
| Q12 | Answered: on-call tools are skipped ([D11](d11-grafana-monitoring-ui.md)) | none |
| Q13 | Optional: the real target's hardware (GPU or not) and real numbers per module (items, collection interval, problems per day); without them the plan uses the stated assumptions | Sizing, runtime choice on the target |
