---
title: D11 Grafana as the monitoring UI
description: Grafana is the monitoring UI and notification surface, read-only and not an alert engine; on-call is out of scope
components: []
---

# D11 — Grafana: monitoring UI and notification surface, read-only, not an alert engine

**Status:** owner decisions: Grafana is in the stack as the monitoring UI and the only notification surface
([D8](d8-grafana-only-notification.md)), and on-call tooling is skipped. The limits below are decided with the approved
[design plan](../architecture/design-plan.md).

**Decision:**
- Grafana (OSS, an exact 13.x image tag) gives dashboards, a problems view over Zabbix data through the Zabbix data-source
  plugin (v6.11.0, needs Grafana 11.6 or later), and the AI-analyses table.
- Two read-only data sources: Zabbix through its own API token on the User-type `*.get` role, separate from the agent's
  token so either can be revoked alone; and the analysis store through the PostgreSQL data source with a SELECT-only role.
- Grafana runs no alert rules: Zabbix is the only alerting engine. The Grafana MCP server is not given to the model (same
  reasoning as [D7](d7-thin-readonly-mcp-server.md)).
- Dashboards and data sources are provisioned from files. Grafana's own database is SQLite on a named volume: enough for
  the rehearsal, while a real target should use an external database.

**On-call is out of scope (owner decision).** For the record, why Grafana could not have been the on-call tool: self-hosted
Grafana has no maintained on-call product (Grafana OnCall OSS is archived and gets no fixes), its replacement Grafana IRM
is a Grafana Cloud service that [D12](d12-operational-data-stays-in-network.md) excludes, and Grafana alerting routes and
silences but has no rotations or escalation (none found).

**Unverified:** the plugin's support for the chosen Zabbix version (no matrix; 8.0 appears only in changelog fixes); that a
SELECT-only role works with the PostgreSQL data source and provisioned dashboards; Grafana's memory use; that port 3000
passes firewalld. Tracked in the [verification backlog](../development/backlog/design-verification.md).
