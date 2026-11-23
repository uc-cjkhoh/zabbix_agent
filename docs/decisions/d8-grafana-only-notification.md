---
title: D8 Grafana is the only notification surface
description: Owner decision that Grafana is the notification medium, with no chat or push channel
components: []
---

# D8 — Grafana is the only notification surface

**Status:** the decision is the owner's (no chat or push channel; Grafana is the medium). The mechanism for the AI
analysis is decided with the approved [design plan](../architecture/design-plan.md).

**Decision:** Users are notified by looking at Grafana. A Zabbix problem shows in Grafana's problems view straight from
Zabbix, independent of the agent and the model. The AI analysis follows in a table beside it.

**Mechanism (proposal):** the agent stores each validated analysis, with the Zabbix event ID, in its own database in the
existing PostgreSQL instance. Grafana reads it through the built-in PostgreSQL data source with a SELECT-only role,
enforced in the database. Grafana never writes. The alternative, writing annotations through Grafana's API, is a new
write path and would need its own sign-off (core safety rule 8).

**Cost, accepted by the owner:** this is pull. Nobody is told anything unless they are looking; early warning only helps
if someone watches Grafana, and port 3000 becomes a hard dependency. Push (chat, email, SMS) is not designed and would
need a new decision; Grafana alerting would break the single-alert-engine rule. Zabbix web remains a fallback view.

**Supersedes** the earlier chat-webhook choice, which the owner withdrew along with the on-call tools ([D11](d11-grafana-monitoring-ui.md)).
