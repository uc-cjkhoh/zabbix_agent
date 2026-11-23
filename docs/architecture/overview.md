---
title: Architecture overview
description: High-level flow and components of the Zabbix AI agent; behaviour and rationale are in the design plan
components: []
---

# Architecture overview

**Status: the [design plan](design-plan.md) is approved.** Nothing is installed. This file is the flow
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
                  receiver + queue (validate, dedupe, group)
                        |
                        v
                  analysis worker (fixed pipeline)
                     |            |
       read-only MCP server     llama-server (Llama, CPU, internal network)
                     |
                  Zabbix API (read-only role)
                        |
                        v
                  analysis store (database in the PostgreSQL instance)
                        |
                        +--> Grafana (PostgreSQL data source, SELECT-only role): AI-analyses table

 Zabbix also monitors the agent's, model's and Grafana's health and queue depth.
```

## Components (all proposed or approved, none installed)
| Component | Role | Source of the choice |
|---|---|---|
| Zabbix | Collects metrics, detects, raises problems | Owner; 8.0 LTS in [D10](../decisions/d10-zabbix-version-and-database.md) |
| Grafana | Monitoring UI and the only notification surface; read-only; no alert rules | Owner, [D8](../decisions/d8-grafana-only-notification.md), [D11](../decisions/d11-grafana-monitoring-ui.md) |
| Receiver, queue, worker | Turn problem events into analyses | Proposal, [D6](../decisions/d6-detection-split.md) |
| MCP server | Bounded, read-only tools between the model and Zabbix | Owner (MCP); thin custom server, [D7](../decisions/d7-thin-readonly-mcp-server.md) |
| Llama model and `llama-server` | Explains and ranks; never decides what is wrong | Owner, [D9](../decisions/d9-model-and-runtime.md) |
| Analysis store | Analyses and agent state; Grafana reads it with a SELECT-only role | Proposal, [D8](../decisions/d8-grafana-only-notification.md) |

## Constraints that shape the design
- Every component runs in Docker, on its own network, with subnet and ports distinct from the host
  ([D2](../decisions/d2-docker-isolation.md), [D3](../decisions/d3-network-isolation.md)).
- The agent reads Zabbix; any write back to Zabbix is a separate, signed-off decision
  ([coding standards](../development/coding-standards.md)). Grafana only reads.
- Target OS AlmaLinux 9.x. All operational data stays inside the network
  ([D12](../decisions/d12-operational-data-stays-in-network.md)); downloads happen at setup only.
