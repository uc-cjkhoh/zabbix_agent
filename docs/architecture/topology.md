---
title: Topology
description: Environment, Docker networks, containers, ports, flows and resource budget for the rehearsal testbed
components: []
---

# Topology

Detail behind the [overview](overview.md) and the [design plan](design-plan.md). It owns subnets and ports
([D3](../decisions/d3-network-isolation.md)). **Status: designed, nothing created.** Observed facts come from the
[testbed survey](../operations/testbed.md); figures marked *estimate* are not measured; items marked *unverified* have a
check in the [verification backlog](../development/backlog/design-verification.md).

## 1. Environment
```
 workstation dataweb                  LAN 10.168.48.0/22 (gateway 10.168.50.254)
 10.168.49.20  (no Docker)  ----------------------------------------------+
   edits the code and this KB                                              |
   ssh (port 22): docker CLI + test streams                                |
   browser / curl to Grafana                                               |
                                                                           |
 testbed chcluster  10.168.50.40 (ens33)  AlmaLinux 9.8, 8 vCPU, 15 GiB, no GPU, 40 GB free
 ├── docker0               172.17.0.0/16   default bridge, unused         (Docker)
 ├── br-470f01c69c37       172.25.0.0/24   containers ch1..ch4, stopped   (another project: not ours)
 └── project block         172.30.60.0/21  reserved, not yet created       (this project, section 3)

 real 50+ modules: another host, not reachable, not connected (sizing reference only, D13)
```

## 2. Container and network topology
```
 LAN ── Grafana 10.168.50.40:13000 (published) ──┐          ssh tunnel ── Zabbix web 127.0.0.1:18080
                                                 │                              │
 ┌─ zbxai_front (172.30.60.0/24, NOT internal) ───┴──────────────────────────────┴───────────┐
 │   zbxai_grafana :3000                                      zbxai_zabbix_web :8080        │
 └──────┬──────────────────────────────────────────────────────────────┬───────────────────┘
        │ (both also on app)                                           │
 ┌─ zbxai_app (172.30.61.0/24, internal: true) ──────────────────────────┴──────────────────┐
 │  zbxai_postgres :5432     zbxai_zabbix_server :10051      zbxai_receiver :8000           │
 │  zbxai_mcp :8001          zbxai_worker                    zbxai_disk_reporter            │
 │  zbxai_loadgen / zbxai_fault_* (transient)                                               │
 └───────────────────────────────┬────────────────────────────────────┬─────────────────────┘
                                 │ (worker and zabbix_server also on model)
 ┌─ zbxai_model (172.30.62.0/24, internal: true) ──────────────────────┴────────────────────┐
 │  zbxai_llama :8080  (llama-server, --parallel 1, model file in volume zbxai_models)      │
 └───────────────────────────────────────────────────────────────────────────────────────────┘

 transient:  zbxai_test (172.30.63.0/24, internal) = zbxai_pgtest + zbxai_test_run
             zbxai_setup (172.30.64.0/24, NOT internal) = one-shot model download, removed after
```

## 3. Networks
| Network | Subnet | Internal | Members | Purpose |
|---|---|---|---|---|
| `zbxai_front` | 172.30.60.0/24 | no | grafana, zabbix_web | Only path to published ports |
| `zbxai_app` | 172.30.61.0/24 | yes | all services except llama | Service traffic; no egress |
| `zbxai_model` | 172.30.62.0/24 | yes | llama, worker, zabbix_server | Model traffic; no egress |
| `zbxai_test` | 172.30.63.0/24 | yes | pgtest, test_run | Throwaway test runs |
| `zbxai_setup` | 172.30.64.0/24 | no | the model download container | Setup downloads only |

- **Project block 172.30.60.0/21** (60 to 67; 65 to 67 spare). Containers use Docker DNS names (the container name), no
  fixed IPs.
- **Checked against** what the testbed showed: the LAN 10.168.48.0/22, `docker0` 172.17.0.0/16 and the ClickHouse
  network 172.25.0.0/24. No overlap.
- **Not checked, owner to confirm:** that 172.30.60.0/21 is unused across the wider network. A bridge in a range your
  network already routes would hijack the testbed's route to it (resolvers, a proxy). Add any such addresses to
  `ZBXAI_USED_RANGES`. `deploy.sh` also compares against the live `docker network ls` subnets at deploy time.
- **Honest gap:** Grafana and Zabbix web are on `zbxai_front`, so they can reach out. Nothing depends on that at run time
  and nothing enforces it. Every other container is on internal networks only; the egress check proves it.
- **Unverified:** that published ports work on containers attached to both `front` and `app` (Task 1.4 step 6).

## 4. Containers
All names start with `zbxai_`. Image tags and digests are fixed in `versions.env` (Task 0.2). RAM figures are *estimates*.

| Container | Networks | Listens (internal) | Published | Volumes | RAM est. |
|---|---|---|---|---|---|
| `zbxai_postgres` | app | 5432 | none | `zbxai_pgdata` | 1.0 GB |
| `zbxai_zabbix_server` | app, model | 10051 (trapper) | none | none | 1.0 GB |
| `zbxai_zabbix_web` | front, app | 8080 (image default, confirm at Task 1.2) | 127.0.0.1:18080 | none | 0.3 GB |
| `zbxai_grafana` | front, app | 3000 | 10.168.50.40:13000 | `zbxai_grafana` | 0.3 GB |
| `zbxai_receiver` | app | 8000 | none | none | 0.2 GB |
| `zbxai_worker` | app, model | none | none | none | 0.3 GB |
| `zbxai_mcp` | app | 8001 (streamable HTTP) | none | none | 0.1 GB |
| `zbxai_llama` | model | 8080 | none | `zbxai_models` (read-only) | 6.0 GB |
| `zbxai_disk_reporter` | app | none | none | none | 0.05 GB |
| `zbxai_loadgen`, `zbxai_fault_*` | app | none | none | none | 0.4 GB |
| `zbxai_pgtest`, `zbxai_test_run` | test | 5432 (pgtest) | none | none | 0.5 GB, transient |

Total about 10 to 11 GB of 15 GiB, matching the design budget. The worker calls the bounded Zabbix client in-process;
the MCP server is the model's only path to Zabbix and is called only when model lookups are enabled (off by default).

## 5. Data flows
| From | To | Protocol and port | Network | Purpose |
|---|---|---|---|---|
| loadgen, fault reporters, disk reporter | zabbix_server | Zabbix trapper, 10051 | app | Simulated and measured values |
| zabbix_server | postgres | PostgreSQL, 5432 | app | Zabbix history and configuration |
| zabbix_web | postgres, zabbix_server | 5432, 10051 | app | Frontend |
| zabbix_server (webhook media type) | receiver | HTTP POST `/v1/events`, 8000 | app | Problem events to the agent |
| zabbix_server | receiver, grafana, llama | HTTP GET `/healthz`, `/api/health`, `/health` | app, model | Self-monitoring |
| receiver, worker | postgres | PostgreSQL as `zbxai_agent_rw` | app | Queue and analyses |
| worker | zabbix_web | Zabbix JSON-RPC `/api_jsonrpc.php`, read-only token | app | Bounded context reads |
| worker | llama | HTTP `/v1/chat/completions`, 8080 | model | One analysis call at a time |
| mcp | zabbix_web | JSON-RPC, read-only token | app | Model-driven lookups when enabled |
| grafana | zabbix_web | JSON-RPC, its own read-only token | app | Problems view, trends |
| grafana | postgres | PostgreSQL as `zbxai_grafana_ro` (SELECT-only) | app | AI-analyses table |
| people | grafana | HTTP 13000 | LAN, front | The only notification surface |
| owner | zabbix_web | HTTP 18080 through an ssh tunnel | ssh, front | Fallback view and administration |
| workstation | testbed | ssh 22 | LAN | Docker CLI and test streams |

Nothing leaves the network at run time ([D12](../decisions/d12-operational-data-stays-in-network.md)). Images and the
model are downloaded at setup by the Docker daemon and the one-shot container on `zbxai_setup`.

## 6. Access
- **Grafana** is published on the testbed's LAN address only (`ZBXAI_GRAFANA_BIND`), port 13000.
- **Zabbix web** is admin-capable and only a fallback view, so it is published on the testbed's loopback only. Reach it with
  an ssh tunnel to the testbed's own loopback (forward a local port to 127.0.0.1:18080 on the testbed). Use the same tunnel for
  Grafana if the firewall blocks 13000: it needs no firewall change.
- **Zabbix server 10051 is not published**: no outside agents report in (D13).
- **Firewall, unverified:** firewalld is active and its rules are unreadable here. Docker's own NAT rules may route
  published ports around firewalld zones, and Docker 29 may behave differently again, so the port may be reachable
  although the rules look closed, and firewalld may not be protecting it. Task 1.4 step 6 finds out; do not assume. If a
  port is blocked, use the tunnel and ask the owner; never change the firewall.
- **Links:** `ZBXAI_ZBXWEB_BASE_URL` stays unset, so Grafana shows event IDs as text (viewers cannot reach loopback).

## 7. Storage, secrets, time
- **Named volumes only** (SELinux Enforcing, no bind labels): `zbxai_pgdata`, `zbxai_models`, `zbxai_grafana`.
- **Secrets** are files in a git-ignored `deploy/secrets/` in the grant directory, read by the services as compose secrets; if
  SELinux blocks them, a `0600` env file is the fallback (D2). Values never appear in this KB.
- **Disk (estimate, unverified):** images and the two model files take about 10 GB; Zabbix history grows with NVPS (83 at
  the reference, 250 at 3 times). The rehearsal starts at history 3 days and trends 30 days and is resized from the
  measurement in Task 1.4 step 8. The 40 GB free is shared.
- **Time zones:** every container runs `TZ=UTC`; Zabbix web `PHP_TZ=UTC`; PostgreSQL `timezone=UTC`; Grafana default
  timezone UTC. The testbed's own zone (America/New_York) is never used in code. Variable names to confirm at build.

## 8. Resource policy
- Set `mem_limit` on every container from measured usage plus headroom, after Phase 1. **No tight limit on `zbxai_llama` before
  the benchmark:** a memory-mapped model's page cache can count against a container limit and thrash.
- `llama-server` threads: benchmark at 6 and 8 on 8 vCPU; 6 leaves headroom for Zabbix and PostgreSQL. Pick from the result.
- The ClickHouse project shares the host; never exceed the grant, and stop transient containers when a run ends.

## 9. Values for `.env` (git-ignored; never in `deploy/` or `src/`)
| Key | Value |
|---|---|
| `ZBXAI_PREFIX` | `zbxai` |
| `ZBXAI_FRONT_SUBNET` / `_APP_` / `_MODEL_` / `_TEST_` / `_SETUP_` | 172.30.60.0/24, .61.0/24, .62.0/24, .63.0/24, .64.0/24 |
| `ZBXAI_GRAFANA_BIND`, `ZBXAI_GRAFANA_PORT` | 10.168.50.40, 13000 |
| `ZBXAI_ZBXWEB_BIND`, `ZBXAI_ZBXWEB_PORT` | 127.0.0.1, 18080 |
| `ZBXAI_USED_RANGES` | 10.168.48.0/22, 172.17.0.0/16, 172.25.0.0/24 (add resolver and proxy ranges once known) |
| `ZBXAI_RECEIVER_URL` | `http://zbxai_receiver:8000/v1/events` |

## 10. Order and teardown
- **Up:** `check_env` with live subnets, networks, `postgres` (roles), `zabbix_server`, `zabbix_web`, `grafana`, then `llama`,
  `receiver`, `worker`, `mcp`, then reporters. **Down:** reverse order. `teardown.sh` removes only names starting `zbxai`.
- The seeded-fault and load containers are transient and removed after each run.

## 11. Checks that confirm this topology
Egress blocked on `app` and `model` (Task 2.5 step 5); published ports on dual-attached containers and from the workstation
(Task 1.4 step 6); webhook to the receiver (Task 2.8 step 6); the SELECT-only role (Task 1.2, Task 2.9 step 5); disk budget
(Task 1.4 step 8).
