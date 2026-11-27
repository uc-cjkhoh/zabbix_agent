---
title: Topology facts
description: Simplified topology diagram and the evidence for why it should work, split into observed, designed and unverified
components: []
---

# Topology facts

One-screen version of the [topology](topology.md). **Status: partly built; Grafana is paused.** On the testbed exist the networks `front`, `app` and `model`, the volumes and the containers llama (3B model),
postgres, zabbix_server, zabbix_web and grafana ([topology status](topology.md)); of these llama, postgres, zabbix_server and zabbix_web run (restarted 2026-11-26); grafana has been stopped since 2026-11-24, not removed. The edge proxy and the interim MCP server were cut by [D19](../decisions/d19-scope-cut-after-full-review.md); they were last recorded running on 2026-11-26 and stay until the owner approves cleanup (*unverified* since). The agent service, reporters and test networks do not exist. The evidence below is what has
been observed on the testbed plus the design reasoning, so only the items marked *observed* are *proven to work*
([rule 14](../development/coding-standards.md)). Each claim carries a status:
**observed** (seen on the real host), **designed** (follows from the design, not yet run), **unverified** (has a check in the
[verification backlog](../development/backlog/design-verification.md)).

## 1. Simplified diagram
```
  people (LAN 10.168.48.0/22) ── http :13000 ──┐       owner ── ssh tunnel ──┐
                                                v                             v
  ┌─ front (not internal) ──────────────────────────────────────────────────────────┐
  │  Grafana     published on 0.0.0.0:13000 (D16); reads only, no alert rules        │
  │  Zabbix web  published on 127.0.0.1:18080 only (D16 amended by D19)              │
  └───────────────────────────────┬──────────────────────────────────────────────────┘
                                  │ Grafana, Zabbix web also on app (read-only token, SELECT-only role)
  ┌─ app (internal, no egress) ───┴──────────────────────────────────────────────────┐
  │  Zabbix server --webhook--> agent (receiver + worker) --> PostgreSQL (analyses)   │
  │       ^                           |                                               │
  │  simulated modules                |  bounded Zabbix client, in-process            │
  └───────────────────────────────────┼───────────────────────────────────────────────┘
  ┌─ model (internal, no egress) ─────┴──────────────────────────────────────────────┐
  │  llama-server (CPU, Llama 3.1 8B / 3.2 3B), one call at a time, no tools          │
  └───────────────────────────────────────────────────────────────────────────────────┘

  Subnets: front 172.30.60.0/24, app .61.0/24, model .62.0/24 (block 172.30.60.0/21)
  Transient: setup 172.30.64.0/24 (egress, model download only), test 172.30.63.0/24 (internal)

  Built: Grafana, Zabbix web, Zabbix server (on app only), PostgreSQL, llama-server (3B model).
  Running 2026-11-26: llama-server, PostgreSQL, Zabbix server and Zabbix web (the testbed still publishes it on :18080
  on 0.0.0.0 until the new compose is applied, unverified). Grafana is stopped (container, image and volume kept), so
  :13000 does not answer. The edge proxy and the official MCP server were also running; D19 cut them (cleanup pending).
  Designed, not created: the webhook, the agent service, simulated modules, Zabbix server on model,
  Grafana's Zabbix and PostgreSQL data sources (plugin not installed), and the read-only token and SELECT-only role.
```

## 2. Why it should work: evidence
| # | Claim | Evidence | Status |
|---|---|---|---|
| 1 | The project's subnets clash with nothing on the host | Survey found only LAN 10.168.48.0/22, `docker0` 172.17.0.0/16 and ClickHouse 172.25.0.0/24 ([testbed](../operations/testbed.md)); 172.30.60.0/21 overlaps none | observed |
| 2 | The ports are free | Only SSH :22 (plus chrony on localhost) listens; 13000 and 18080 are not in use; 18081 was free when the edge proxy was added (the proxy is withdrawn, [D19](../decisions/d19-scope-cut-after-full-review.md)) | observed |
| 3 | The host can run the stack | 8 vCPU, 15 GiB RAM, 40 GB free, Docker 29.9.2 and Compose v5.6.0 active, account in `docker` group; budget about 10 to 11 GB RAM | observed host, *estimate* budget |
| 4 | The model can run without a GPU | Host has no GPU and has AVX2 and AVX512F (observed); CPU inference with the 3B model answers (one short prompt, about 64 tokens/s in and 14 out, 2026-11-23); the 8B and the real prompt size are not yet seen | hardware observed; 3B answers observed once; 8B and speed at the real prompt size unverified (`model-benchmark`) |
| 5 | Images and model can be fetched at setup | The images are pulled and the containers exist; `scripts/fetch-model.sh` put the model in the volume `zbxai_models` and llama answered from it ([testbed](../operations/testbed.md)); not re-run for this file | observed (recorded in the testbed doc) |
| 6 | Zabbix is a clean install | No package, unit or listener found on the testbed | observed |
| 7 | The other project is untouched | `ch1` to `ch4` and `clickhouse-testing-env` are left alone; teardown removes only names starting `zbxai` | designed |
| 8 | Operational data cannot leave the network | `app` and `model` are `internal: true`; only `front` (Grafana, Zabbix web) and the transient `setup` network, removed after the model download, have egress ([D12](../decisions/d12-operational-data-stays-in-network.md)) | `app` and `model` blocking egress observed (a public address and the LAN gateway unreachable; `model` 2026-11-23, `app` 2026-11-24); that `front` and `setup` are the only paths out is designed; the check from the running agent container is open (`internal-network-egress`) |
| 9 | Grafana cannot become a second alert engine or write | Its own read-only Zabbix token and a SELECT-only PostgreSQL role; no alert rules ([D8](../decisions/d8-grafana-only-notification.md), [D11](../decisions/d11-grafana-monitoring-ui.md)) | designed; `pg-datasource-readonly` open |
| 10 | The model cannot change Zabbix | The model has no tools: the code drives the pipeline and the model only reasons. An MCP path would be thin and read-only, built only if tool calls prove reliable ([D7](../decisions/d7-thin-readonly-mcp-server.md), gated by [D19](../decisions/d19-scope-cut-after-full-review.md)) | designed; `readonly-role-test` open |
| 11 | Problems show even if the model is down | Grafana reads Zabbix directly; the analysis is added beside the problem later ([D6](../decisions/d6-detection-split.md)) | designed |
| 12 | One model call at a time fits the CPU | `llama-server --parallel 1`, worker queue | designed; benchmark open |
| 13 | Published ports work on containers attached to two networks | Zabbix web 18080 and Grafana 13000, both on `front` and `app`, were reached from the workstation across the LAN with firewalld active (2026-11-24, [topology](topology.md) section 3) | observed |
| 14 | A Zabbix 8.0 server and web image exist and run | Tags `alpine-8.0.0` for server and web (pinned in `deploy/versions.env`); the running server reports 8.0.0, created its schema and reads the database password from a file ([testbed](../operations/testbed.md), 2026-11-24) | observed |

## 3. Not yet shown (blocks "it works")
- **Firewalld and SELinux effect on published ports** (`selinux-and-ports`): reachability is observed (row 13), but the firewalld rules are
  unreadable without root, so whether firewalld actually protects those ports, or Docker's NAT routes around it, stays *unverified*.
- **Egress blocked from the agent's own containers:** `app` and `model` block egress as seen from probes (row 8); the same check from the running agent container, once it exists: `internal-network-egress`.
- **Webhook** from Zabbix to the receiver's private address: `receiver-reachability`.
- **The Grafana Zabbix plugin (v6.11.0)** against Zabbix 8.0.0: `grafana-plugin-compat`. The 8.0.0 images run (row 14), but the plugin is not installed yet
  (its startup download is switched off; it is to be baked into an image).
- **Block 172.30.60.0/21 unused** across the wider network (the owner confirms; only the host was checked).

## 4. What would turn this into proof
Run the checks listed in [topology section 11](topology.md) (Task 1.4 step 6, Task 2.5 step 5, Task 2.8 step 6) with the owner's
go-ahead on the testbed, then replace *designed* and *unverified* here with **observed** and the date-free result. Until
then this file is a claim list, not a test report.
