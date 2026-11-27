---
title: Topology
description: Environment, Docker networks, containers, ports, flows and resource budget for the rehearsal testbed
components: []
---

# Topology

Detail behind the [overview](overview.md) and the [design plan](design-plan.md). It owns subnets and ports
([D3](../decisions/d3-network-isolation.md)). **Status: designed; on the testbed exist the networks `zbxai_front`, `zbxai_model` and `zbxai_app`, the volumes `zbxai_models`, `zbxai_edge_conf`, `zbxai_pgdata`, `zbxai_grafana` and `zbxai_secrets`, and the containers `zbxai_llama` (3B model), `zbxai_edge`, `zbxai_postgres`, `zbxai_zabbix_server`, `zbxai_zabbix_web` and `zbxai_grafana`, see [testbed](../operations/testbed.md). Checked 2026-11-26: after a pause since 2026-11-24, `zbxai_postgres`, `zbxai_zabbix_server` and `zbxai_zabbix_web` were started again at the owner's request and a new `zbxai_mcp` (the official Zabbix MCP server, [D17](../decisions/d17-official-zabbix-mcp-server-as-interim.md)) was added on `zbxai_app`; `zbxai_grafana` is still stopped (not removed, volume kept), so port 13000 does not answer; nothing else is created (no receiver, worker, custom MCP server, tools or test networks). Code for the receiver, worker, pipeline, clients and store exists in the code root but is not deployed.** A side-by-side picture of the built and target topology is in the [viewer](../topology/index.html); keep its `topology-data.js` in step with this file. Observed facts come from the
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
 LAN ─ Grafana :13000 ─┐  LAN ─ Zabbix web :18080 ─┐  LAN ─ Edge :18081 ─┐
                       │                           │                     │
 ┌─ zbxai_front ───────┴───────────────────────────┴─────────────────────┴─────────────────┐
 │  zbxai_grafana :3000         zbxai_zabbix_web :8080    zbxai_edge :8080 (D15)           │
 │  172.30.60.0/24, NOT internal (egress possible)                                         │
 └──────┬──────────────────────────────────────────────────────────────┬───────────────────┘
        │ (grafana, zabbix_web also on app)                            │
 ┌─ zbxai_app (172.30.61.0/24, internal: true) ────────────────────────┴────────────────────┐
 │  zbxai_postgres :5432     zbxai_zabbix_server :10051      zbxai_receiver :8000           │
 │  zbxai_mcp :8443          zbxai_worker                    zbxai_disk_reporter            │
 │  zbxai_loadgen / zbxai_fault_* (transient)                                               │
 └───────────────────────────────┬────────────────────────────────────┬─────────────────────┘
                                 │ (worker, zabbix_server and zbxai_edge also on model)
 ┌─ zbxai_model (172.30.62.0/24, internal: true) ──────────────────────┴────────────────────┐
 │  zbxai_llama :8080  (llama-server, --parallel 1, model file in volume zbxai_models)      │
 │  zbxai_edge (on front too) forwards authenticated requests to llama :8080 (D15)          │
 └───────────────────────────────────────────────────────────────────────────────────────────┘

 transient:  zbxai_test (172.30.63.0/24, internal) = zbxai_pgtest + zbxai_test_run (integration tests; created and removed by `scripts/test-store.sh` for each run, none exists between runs)
             zbxai_setup (172.30.64.0/24, NOT internal) = one-shot model download and lock-file generation (PyPI), removed after
```

## 3. Networks
| Network | Subnet | Internal | Members | Purpose |
|---|---|---|---|---|
| `zbxai_front` | 172.30.60.0/24 | no | grafana, zabbix_web, edge, replay | Only path to published ports; the replay rig reaches `zabbix_web` and the edge `/health` here |
| `zbxai_app` | 172.30.61.0/24 | yes | all services except llama | Service traffic; no egress |
| `zbxai_model` | 172.30.62.0/24 | yes | llama, edge, worker, zabbix_server | Model traffic; no egress |
| `zbxai_test` | 172.30.63.0/24 | yes | pgtest, test_run | Throwaway test runs |
| `zbxai_setup` | 172.30.64.0/24 | no | the model download container and the lock-file container (`zbxai_lock_<pid>`, `scripts/lock.sh`) | Setup downloads only |

- **Project block 172.30.60.0/21** (60 to 67; 65 to 67 spare). Containers use Docker DNS names (the container name), no
  fixed IPs.
- **Checked against** what the testbed showed: the LAN 10.168.48.0/22, `docker0` 172.17.0.0/16 and the ClickHouse
  network 172.25.0.0/24. No overlap.
- **Not checked, owner to confirm:** that 172.30.60.0/21 is unused across the wider network. A bridge in a range your
  network already routes would hijack the testbed's route to it (resolvers, a proxy). Add any such addresses to
  `ZBXAI_USED_RANGES`. `deploy.sh` also compares against the live `docker network ls` subnets at deploy time.
- **Honest gap:** Grafana and Zabbix web are on `zbxai_front`, so they can reach out. Nothing depends on that at run time
  and nothing enforces it. Every other container is on internal networks only; the egress check proves it.
- **Verified (2026-11-24):** published ports work on containers attached to both `front` and `app` (Zabbix web 18080 and Grafana 13000 reached from the workstation).

## 4. Containers
All names start with `zbxai_`. Image tags and digests are fixed in `versions.env` (Task 0.2). RAM figures are *estimates*.

| Container | Networks | Listens (internal) | Published | Volumes | RAM est. |
|---|---|---|---|---|---|
| `zbxai_postgres` | app | 5432 | none | `zbxai_pgdata`, `zbxai_secrets/pg` | 0.16 GB observed idle |
| `zbxai_zabbix_server` | app, model | 10051 (trapper) | none | none | 1.0 GB |
| `zbxai_zabbix_web` | front, app | 8080 (observed) | 0.0.0.0:18080 ([D16](../decisions/d16-zabbix-web-and-grafana-on-lan-with-shared-login.md); first planned as 127.0.0.1) | none (reads `zbxai_secrets/zabbix`) | 0.05 GB observed |
| `zbxai_grafana` | front, app | 3000 | 0.0.0.0:13000 (D16; first planned as the LAN address) | `zbxai_grafana`, `zbxai_secrets/grafana` | 0.17 GB observed |
| `zbxai_receiver` | app | 8000 | none | none | 0.2 GB |
| `zbxai_worker` | app, model | none | none | none | 0.3 GB |
| `zbxai_mcp` | app | 8443 at `/mcp` (streamable HTTP; the official image, interim, [D17](../decisions/d17-official-zabbix-mcp-server-as-interim.md); D7's custom server was planned for 8001) | none | none | 0.1 GB estimate; 5 MiB observed idle |
| `zbxai_llama` | model | 8080 | none | `zbxai_models` (read-only) | 6.0 GB (8B); the 3B observed at 1.8 GB (4k context), 4.9 GB idle and 6.3 GB after a 12.5k prompt (32k context) |
| `zbxai_edge` (nginx, [D15](../decisions/d15-llama-lan-access-through-authenticated-proxy.md)) | front, model | 8080 | 0.0.0.0:18081 (needs the API key except `/health`) | `zbxai_edge_conf` (read-only) | 0.02 GB, *estimate* |
| `zbxai_replay` ([D18](../decisions/d18-log-replay-rig-on-the-real-zabbix.md), *built 2026-11-26, started only on request*) | front | 8090 (monitor page, read-only) | 0.0.0.0:18090 | `zbxai_replay_data` (read-only), `/unified/user/cj/data/replay_out` (run files), the push token file (read-only, once it exists) | 512 MB cap, 1 CPU cap; started by `scripts/replay.sh up`, not by compose |
| `zbxai_disk_reporter` | app | none | none | none | 0.05 GB |
| `zbxai_loadgen`, `zbxai_fault_*` | app | none | none | none | 0.4 GB |
| `zbxai_pgtest`, `zbxai_test_run` | test | 5432 (pgtest) | none | none | 0.5 GB, transient; `pgtest` (512 MB limit) lives only during `scripts/test-store.sh` (first run 2026-11-26). Unit-test runs today are `zbxai_test_run_<pid>` on `--network none` (`scripts/ship-test.sh`), a different, simpler path |

Also created, none long-lived: the volume `zbxai_secrets` (written by one-shot `zbxai_secrets_init`, read read-only by each service from its own
sub-directory) and the one-shots `zbxai_migrate` and `zbxai_provision` (app network, removed after they finish; section 10).

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
| replay (runs by `docker exec`) | zabbix_web | Zabbix JSON-RPC `history.push`, push-only token, batched per 100 ms tick | front | Replayed module log messages to the real Zabbix (D18; the objects exist on the real Zabbix since 2026-11-27; error messages also go to a second item that carries the trigger) |
| replay | edge, zabbix_web | HTTP GET `/health`, `/` | front | Run guard probes |
| people | replay | HTTP 18090 | LAN, front | Read-only monitor page of a replay |
| people, tools | edge | HTTP 18081, bearer or basic auth | LAN, front | Remote chat and web UI for the model (D15; not part of the agent flow) |
| edge | llama | HTTP 8080 | model | Forwards authenticated requests |
| owner | zabbix_web | HTTP 18080 through an ssh tunnel | ssh, front | Fallback view and administration |
| workstation | testbed | ssh 22 | LAN | Docker CLI and test streams |

Nothing leaves the network at run time ([D12](../decisions/d12-operational-data-stays-in-network.md)). Images and the
model are downloaded at setup by the Docker daemon and the one-shot container on `zbxai_setup`.

## 6. Access
- **Grafana** and **Zabbix web** are published on `0.0.0.0` (`ZBXAI_GRAFANA_BIND`, `ZBXAI_ZBXWEB_BIND`), ports 13000 and 18080, by owner decision ([D16](../decisions/d16-zabbix-web-and-grafana-on-lan-with-shared-login.md)), with one shared development login over plain HTTP. Zabbix web is admin-capable; the earlier plan kept it on loopback with an ssh tunnel (forward a local port to 127.0.0.1:18080 on the testbed), and that remains the way back: set `ZBXAI_ZBXWEB_BIND=127.0.0.1`. Both ports were reached from the workstation across the LAN with firewalld active (2026-11-24).
- **Llama** is reachable on `http://<testbed>:18081` through the authenticated proxy only ([D15](../decisions/d15-llama-lan-access-through-authenticated-proxy.md)); the key is in the git-ignored `deploy/secrets/llama-api-key`. Plain HTTP; the llama container itself publishes nothing.
- **Zabbix server 10051 is not published**: no outside agents report in (D13).
- **Firewall, unverified:** firewalld is active and its rules are unreadable here. Docker's own NAT rules may route
  published ports around firewalld zones, and Docker 29 may behave differently again, so the port may be reachable
  although the rules look closed, and firewalld may not be protecting it. Task 1.4 step 6 finds out; do not assume. If a
  port is blocked, use the tunnel and ask the owner; never change the firewall.
- **Links:** `ZBXAI_ZBXWEB_BASE_URL` stays unset, so Grafana shows event IDs as text (viewers cannot reach loopback).

## 7. Storage, secrets, time
- **Named volumes only** (SELinux Enforcing, no bind labels, and the daemon may be remote): `zbxai_pgdata`, `zbxai_models`, `zbxai_grafana`, `zbxai_secrets`.
  Grafana's plugin lives in the image (outside the volume); provisioning, dashboards, PostgreSQL init and migrations are baked into images. Compose sets explicit
  `name:` on every network and volume so no name gets a second prefix.
- **Secrets** are created by a one-shot container in the named volume `zbxai_secrets` (one sub-directory per consuming service, mounted
  read-only, owner and mode set for that service's non-root user), not bind-mounted files; if the volume `subpath` option or SELinux blocks this, a `0600` env
  file inside the same volume is the fallback (D2). *Unverified* (backlog `compose-remote-and-secrets`). Values never appear in this KB.
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

## 9. Values for `.env` (git-ignored, at the code repo root; never in `deploy/` or `src/`)
| Key | Value |
|---|---|
| `ZBXAI_PREFIX` | `zbxai` |
| `ZBXAI_FRONT_SUBNET` / `_APP_` / `_MODEL_` / `_TEST_` / `_SETUP_` | 172.30.60.0/24, .61.0/24, .62.0/24, .63.0/24, .64.0/24 |
| `ZBXAI_GRAFANA_BIND`, `ZBXAI_GRAFANA_PORT` | 0.0.0.0, 13000 (D16) |
| `ZBXAI_ZBXWEB_BIND`, `ZBXAI_ZBXWEB_PORT` | 0.0.0.0, 18080 (D16) |
| `ZBXAI_APP_SUBNET` | 172.30.61.0/24 |
| `ZBXAI_EDGE_BIND`, `ZBXAI_EDGE_PORT` | 0.0.0.0, 18081 (llama proxy, [D15](../decisions/d15-llama-lan-access-through-authenticated-proxy.md)) |
| `LLAMA_CTX_SIZE`, `LLAMA_THREADS` | 32768, 6 (threads: benchmark decides, 6 or 8; the agent's prompts are about 1500 tokens, so lower the context before the full stack runs if RAM is short) |
| `ZBXAI_USED_RANGES` | 10.168.48.0/22, 172.17.0.0/16, 172.25.0.0/24 (add resolver and proxy ranges once known) |
| `ZBXAI_RECEIVER_URL` | `http://zbxai_receiver:8000/v1/events` |
| `ZBXAI_SSH_TARGET` | `<user>@<testbed>`: when set, `scripts/ship-test.sh` and `scripts/lock.sh` run docker over ssh; unset means local docker. Set only on the workstation |

## 10. Order and teardown
- **Up** (each step idempotent, one command, no manual step; plan contract R7): `check_env` with live subnets (in a container), networks, `secrets-init` (one-shot),
  `postgres` (roles), `migrate` (one-shot), `zabbix_server`, `zabbix_web`, `provision` (one-shot: the Zabbix admin account, which is no longer `Admin` but the renamed `unified` of [D16](../decisions/d16-zabbix-web-and-grafana-on-lan-with-shared-login.md), template, roles, users, the two tokens),
  `grafana`, then `llama`, `receiver`, `worker`, `mcp`, then reporters. Services wait on healthchecks. **Down:** reverse order. `teardown.sh` removes only
  names starting `zbxai`; `--volumes` adds the named volumes and `--models` the model volume. The one-shots are transient containers named `zbxai_secrets_init`, `zbxai_migrate`, `zbxai_provision`.
- The seeded-fault and load containers are transient and removed after each run.

## 11. Checks that confirm this topology
Cold rebuild from nothing and a second `up` with no change (Task 1.5 step 6, Task 4.1 step 6); secrets volume readable only by its service (Task 1.1 step 5); egress blocked on `app` and `model` (Task 2.5 step 5); published ports on dual-attached containers and from the workstation
(Task 1.4 step 6); webhook to the receiver (Task 2.8 step 6); the SELECT-only role (Task 1.2, Task 2.9 step 5); disk budget
(Task 1.4 step 8).
