# Zabbix Agent — Knowledge Base

Docs-only knowledge base for a **local-host Zabbix AI agent** that analyses Zabbix trends and detects issues
early, so they can be prevented. Status: **planning**. The design plan is approved and the implementation plan is written for review; only part is built: the llama slice and a Zabbix, PostgreSQL and Grafana slice on the testbed, and the agent's core code (unit-tested, not deployed); the scope was cut on 2026-11-27 ([D19](docs/decisions/d19-scope-cut-after-full-review.md)); see [testbed](docs/operations/testbed.md).

Owner: chiajun. Created: 2026-11-23. The owner's requirements are recorded in this KB; there is no separate source brief.

## Start here
| I want to... | Open |
|---|---|
| Work in this KB (rules, directory map, where things live) | [CLAUDE.md](CLAUDE.md) |
| See the intended shape of the system | [docs/architecture/overview.md](docs/architecture/overview.md) |
| Know why a choice was made, or what is still open | [docs/decisions/README.md](docs/decisions/README.md) |
| Know the testbed and how to treat it | [docs/operations/testbed.md](docs/operations/testbed.md) |
| Write or review something | [docs/development/index.md](docs/development/index.md) |
| See what is left to do | [docs/development/backlog/index.md](docs/development/backlog/index.md) |

## Goal and success metrics (owner requirements)
- Handle more than 50 modules or services monitored through Zabbix, without strain.
- Detect issues in advance, or at the moment they occur.
- Notify users of any issue through a medium: Grafana, chosen by the owner ([D8](docs/decisions/d8-grafana-only-notification.md)).

## Declared stack
Llama (model, on llama.cpp), Zabbix (monitoring source), Grafana (monitoring UI and notification); MCP (tool protocol) is declared but gated, none runs ([D7](docs/decisions/d7-thin-readonly-mcp-server.md), [D19](docs/decisions/d19-scope-cut-after-full-review.md)). Target OS: AlmaLinux 9.x.

## What this is NOT
- Not code: this KB holds docs only. The code repository location is undecided.
- Not cloud: all operational data stays inside the network ([D12](docs/decisions/d12-operational-data-stays-in-network.md)).
- Not production sizing: the testbed is a rehearsal ([D13](docs/decisions/d13-rehearsal-testbed-and-sizing-reference.md)).
- Not a custom UI: Grafana is the monitoring UI.
- Not push: no chat, email, SMS or on-call tooling. Grafana is the only notification surface, so people have to look at
  it ([D8](docs/decisions/d8-grafana-only-notification.md)).
- Not installed: the testbed was surveyed read-only ([testbed](docs/operations/testbed.md)); no part of the
  stack runs there yet, and anything marked *unverified* was not observed.
- Not built: the design plan is approved, the [topology](docs/architecture/topology.md) is written, and the
  [implementation plan](docs/development/implementation-plan/index.md) awaits review. The agent's receiver, worker,
  pipeline, clients and store exist as unit-tested code in the code root (2026-11-26), not deployed; the webhook
  and the provisioning are not written, and no MCP server is planned until tool calls prove reliable ([D7](docs/decisions/d7-thin-readonly-mcp-server.md)).

## Rulebook
Agent behaviour follows `/unified/user/cj/general_kb/agent-behavior/` (see [decision D5](docs/decisions/d5-kb-location-and-layout.md)).
