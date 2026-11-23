---
title: Topology facts
description: Simplified topology diagram and the evidence for why it should work, split into observed, designed and unverified
components: []
---

# Topology facts

One-screen version of the [topology](topology.md). **Status: designed, nothing created.** The evidence below is what has
been observed on the testbed plus the design reasoning. No container has run, so nothing here is *proven to work*
([rule 14](../development/coding-standards.md)). Each claim carries a status:
**observed** (seen on the real host), **designed** (follows from the design, not yet run), **unverified** (has a check in the
[verification backlog](../development/backlog/design-verification.md)).

## 1. Simplified diagram
```
  people (LAN 10.168.48.0/22) ── http :13000 ──┐          owner ── ssh tunnel ──┐
                                               v                                v
  ┌─ front (not internal) ──────────────────────────────────────────────────────────┐
  │  Grafana     published on LAN 10.168.50.40:13000; reads only, no alert rules     │
  │  Zabbix web  published on testbed loopback 127.0.0.1:18080 only (admin fallback) │
  └───────────────────────────────┬──────────────────────────────────────────────────┘
                                  │ both also sit on app (read-only token / SELECT-only role)
  ┌─ app (internal, no egress) ───┴──────────────────────────────────────────────────┐
  │  Zabbix server --webhook--> receiver --> worker --> PostgreSQL (analyses)         │
  │       ^                                    |                                      │
  │  simulated modules                         +--> mcp (read-only, off by default)   │
  └────────────────────────────────────────────┼─────────────────────────────────────┘
  ┌─ model (internal, no egress) ──────────────┴─────────────────────────────────────┐
  │  llama-server (CPU, Llama 3.1 8B / 3.2 3B), one call at a time                    │
  └───────────────────────────────────────────────────────────────────────────────────┘

  Subnets: front 172.30.60.0/24, app .61.0/24, model .62.0/24 (block 172.30.60.0/21)
  Transient: setup 172.30.64.0/24 (egress, model download only), test 172.30.63.0/24 (internal)
```

## 2. Why it should work: evidence
| # | Claim | Evidence | Status |
|---|---|---|---|
| 1 | The project's subnets clash with nothing on the host | Survey found only LAN 10.168.48.0/22, `docker0` 172.17.0.0/16 and ClickHouse 172.25.0.0/24 ([testbed](../operations/testbed.md)); 172.30.60.0/21 overlaps none | observed |
| 2 | The ports are free | Only SSH :22 (plus chrony on localhost) listens; 13000 and 18080 are not in use | observed |
| 3 | The host can run the stack | 8 vCPU, 15 GiB RAM, 40 GB free, Docker 29.9.2 and Compose v5.6.0 active, account in `docker` group; budget about 10 to 11 GB RAM | observed host, *estimate* budget |
| 4 | The model can run without a GPU | Host has no GPU and has AVX2 and AVX512F (observed); CPU inference with `llama-server` and its speed are not yet seen | hardware observed; CPU inference designed, speed unverified (`model-benchmark`) |
| 5 | Images and model can be fetched at setup | `registry-1.docker.io`, `ghcr.io`, `huggingface.co` resolve; actual download not tested | observed DNS only |
| 6 | Zabbix is a clean install | No package, unit or listener found on the testbed | observed |
| 7 | The other project is untouched | `ch1` to `ch4` and `clickhouse-testing-env` are left alone; teardown removes only names starting `zbxai` | designed |
| 8 | Operational data cannot leave the network | `app` and `model` are `internal: true`; only `front` (Grafana, Zabbix web) and the transient `setup` network, removed after the model download, have egress ([D12](../decisions/d12-operational-data-stays-in-network.md)) | designed; `internal-network-egress` open |
| 9 | Grafana cannot become a second alert engine or write | Its own read-only Zabbix token and a SELECT-only PostgreSQL role; no alert rules ([D8](../decisions/d8-grafana-only-notification.md), [D11](../decisions/d11-grafana-monitoring-ui.md)) | designed; `pg-datasource-readonly` open |
| 10 | The model cannot change Zabbix | The MCP server is thin, read-only, and the only model path to Zabbix ([D7](../decisions/d7-thin-readonly-mcp-server.md)) | designed; `readonly-role-test` open |
| 11 | Problems show even if the model is down | Grafana reads Zabbix directly; the analysis is added beside the problem later ([D6](../decisions/d6-detection-split.md)) | designed |
| 12 | One model call at a time fits the CPU | `llama-server --parallel 1`, worker queue | designed; benchmark open |

## 3. Not yet shown (blocks "it works")
- **Published ports** on containers attached to two networks, and reachability from the workstation through firewalld
  (rules unreadable without root) and SELinux Enforcing: `selinux-and-ports`. Grafana is the only notification path, so this
  gates the project.
- **Egress really blocked** on internal networks under firewalld: `internal-network-egress`.
- **Webhook** from Zabbix to the receiver's private address: `receiver-reachability`.
- **Zabbix 8.0 LTS image tags** and the Grafana Zabbix plugin (v6.11.0) against that version: `zabbix-image-tags`,
  `grafana-plugin-compat`.
- **Block 172.30.60.0/21 unused** across the wider network (the owner confirms; only the host was checked).

## 4. What would turn this into proof
Run the checks listed in [topology section 11](topology.md) (Task 1.4 step 6, Task 2.5 step 5, Task 2.8 step 6) with the owner's
go-ahead on the testbed, then replace *designed* and *unverified* here with **observed** and the date-free result. Until
then this file is a claim list, not a test report.
