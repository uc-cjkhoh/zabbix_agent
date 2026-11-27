---
title: Architecture overview
description: High-level flow and components of the Zabbix AI agent; behaviour and rationale are in the design plan
components: []
---

# Architecture overview

**Status: the [design plan](design-plan.md) is approved.** The agent's receiver, worker, pipeline, clients and store exist as tested code in the code root (unit tests with fakes; the store's SQL passed its tests once on a throwaway PostgreSQL) but none of it is deployed, so nothing of the agent runs; on the testbed llama and Zabbix (server, web, PostgreSQL) run, and Grafana is paused ([topology status](topology.md), 2026-11-26). The edge proxy and the interim MCP server were cut by [D19](../decisions/d19-scope-cut-after-full-review.md) and still run there until the owner approves cleanup. This file is the flow
only; why each part exists, the alternatives and the failure behaviour are in the design plan. The networks, subnets, ports and
containers are in the [topology](topology.md).

## Flow
```
 monitored modules / services (simulated in the rehearsal)
            |  Zabbix agents / checks
            v
        Zabbix (server, web, PostgreSQL)
        triggers: forecast, baseline, thresholds
            |
            +--> Grafana  <---- people          problems view, trends (Zabbix data source,
            |                                   read-only token): shown at once, no model involved
            |
            +--> action: webhook to the agent
                        |
                        v
                  agent service
                  receiver + queue (validate, dedupe, group)
                        |
                        v
                  analysis worker (fixed pipeline, one model call)
                     |            |
       bounded Zabbix client     llama-server (Llama, CPU, internal network)
                     |
                  Zabbix API (read-only role)
                        |
                        v
                  analysis store (database in the PostgreSQL instance)
                        |
                        +--> Grafana (PostgreSQL data source, SELECT-only role): AI-analyses table

 Zabbix also monitors the agent's, model's and Grafana's health and queue depth.
```

## Components (all proposed or approved; running on the testbed: llama and Zabbix; Grafana paused)
| Component | Role | Source of the choice |
|---|---|---|
| Zabbix | Collects metrics, detects, raises problems | Owner; 8.0 LTS in [D10](../decisions/d10-zabbix-version-and-database.md) |
| Grafana | Monitoring UI and the only notification surface; read-only; no alert rules | Owner, [D8](../decisions/d8-grafana-only-notification.md), [D11](../decisions/d11-grafana-monitoring-ui.md) |
| Receiver, queue, worker (one agent service) | Turn problem events into analyses; the code gathers the context and makes one model call | Proposal, [D6](../decisions/d6-detection-split.md), [D19](../decisions/d19-scope-cut-after-full-review.md) |
| MCP server (gated, not built, none runs) | Bounded, read-only tools between the model and Zabbix, only if the model's tool calls prove reliable | Owner (MCP); thin custom server, [D7](../decisions/d7-thin-readonly-mcp-server.md), gated by [D19](../decisions/d19-scope-cut-after-full-review.md) |
| Llama model and `llama-server` | Explains and ranks; never decides what is wrong | Owner, [D9](../decisions/d9-model-and-runtime.md) |
| Analysis store | Analyses and agent state; Grafana reads it with a SELECT-only role | Proposal, [D8](../decisions/d8-grafana-only-notification.md) |

## Constraints that shape the design
- Every component runs in Docker, on its own network, with subnet and ports distinct from the host
  ([D2](../decisions/d2-docker-isolation.md), [D3](../decisions/d3-network-isolation.md)).
- The agent reads Zabbix; any write back to Zabbix is a separate, signed-off decision
  ([coding standards](../development/coding-standards.md)). Grafana only reads.
- Target OS AlmaLinux 9.x. All operational data stays inside the network
  ([D12](../decisions/d12-operational-data-stays-in-network.md)); downloads happen at setup only.
