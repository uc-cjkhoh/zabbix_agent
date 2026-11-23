---
title: D3 Network isolation
description: Check the host bridges first; use a different subnet and ports than the host
components: []
---

# D3 — Isolate from the host's network

**Decision:** Before creating any Docker network, inspect the host's bridges and routes. Choose a subnet and
published ports that the host does not use. Record the chosen values in the topology document.

**Why:** The owner's requirement: avoid network conflicts with the host machine.

**How to apply:**
1. Read-only inspection first (`ip -br addr`, `ip route`, `docker network ls`, listening ports).
2. Pick a free subnet and ports; publish only what must be reachable.
3. The testbed is 10.168.50.40. Confirm which machine you are on before inspecting (the workstation `dataweb`,
   10.168.49.20, is not the testbed). Inspection on the testbed itself needs the user's go-ahead
   ([testbed](../operations/testbed.md)).

**Status:** values chosen in the [topology](../architecture/topology.md). The testbed's bridges were surveyed: in use were the LAN
10.168.48.0/22, `docker0` 172.17.0.0/16 and another project's 172.25.0.0/24, and only SSH listened. The project block is
172.30.60.0/21, split into five networks, with Grafana on the LAN address at 13000 and Zabbix web on loopback at 18080.
The agent's call: three persistent networks, where only `front` is not internal and only Grafana and Zabbix web join it, which
strengthens [D12](d12-operational-data-stays-in-network.md). Open: the owner confirms the block is unused across the wider
network, and that published ports work on dual-attached containers (Task 1.4 step 6).
