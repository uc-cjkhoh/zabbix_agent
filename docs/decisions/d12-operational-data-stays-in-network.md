---
title: D12 Operational data stays in the network
description: Owner decision that no operational data leaves the network and nothing depends on outbound access at run time
components: []
---

# D12 — Operational data stays in the network

**Status:** owner decision.

**Decision:** No alert, metric, log line or analysis text is sent to any service outside the network, and
nothing depends on outbound access at run time. Downloads (container images, model files, the Grafana
plugin) happen at setup only.

**Consequences:**
- No cloud service receives data: no cloud chat, no Grafana Cloud. Notification is Grafana only ([D8](d8-grafana-only-notification.md)).
- The model runtime sits on an internal-only Docker network, with the model file loaded into a named volume
  at setup ([D9](d9-model-and-runtime.md)).
- What the analysis shows is a readability choice, not a data-leak one; text is still escaped.

**Unverified (verification backlog):** an internal-only Docker network really blocks egress under firewalld;
setup downloads work from the testbed (only DNS was checked); Zabbix webhooks may post to the receiver's private
Docker address (the docs show no restriction, which is not proof).
