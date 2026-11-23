---
title: D2 Docker isolation
description: Every runtime component runs in Docker to keep the environment isolated
components: []
---

# D2 — Docker for every runtime component

**Decision:** Every service the project runs (Zabbix pieces, the MCP server, the model runtime, Grafana, the receiver and analysis worker)
runs in Docker. Nothing is installed directly on the host beyond Docker itself.

**Why:** The owner's development restriction: keep the environment isolated. It also keeps the shared
testbed clean and makes teardown a matter of removing containers.

**How to apply:** Name containers, networks and volumes with a project prefix so cleanup targets only ours
(never a broad pattern kill; see agent-behavior `core/shared-machine.md`). Network rules: [D3](d3-network-isolation.md).
