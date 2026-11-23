---
title: Implementation plan
description: Header, global constraints, review focus, execution protocol and task index for building the Zabbix AI agent
components: []
---

# Zabbix AI Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (recommended: Native, the main session builds) or
> superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build, on the rehearsal testbed, a Zabbix stack with Grafana as the problem view, plus an agent that stores a
Llama-written analysis for each problem where Grafana shows it beside the problem.

**Architecture:** Zabbix detects and Grafana shows problems straight from Zabbix (Phase 1, shippable alone). A Python
agent (receiver, queue, worker, thin read-only MCP server) calls `llama-server` and stores validated analyses in a
database that Grafana reads with a SELECT-only role (Phase 2). Phases 3 and 4 add sweep, scale and failure proof, and
portable packaging.

**Tech Stack:** Python 3.12 in `python:3.12-slim` containers; the `mcp` Python SDK, `httpx`, `psycopg` 3, `pydantic` 2,
`starlette` with `uvicorn`, `pytest`, `ruff`; Docker Compose (v5.6.0 observed on the testbed); Zabbix 8.0 LTS official
images; PostgreSQL; Grafana OSS with the Zabbix plugin; llama.cpp `llama-server`. Exact tags and digests are fixed by
Task 0.2 in `/unified/user/cj/ai_agent/zabbix_agent/deploy/versions.env`.

**Spec:** [design plan](/unified/user/cj/knowledge/ai_agent/zabbix_agent/docs/architecture/design-plan.md) (approved), with decisions
[D1 to D13](/unified/user/cj/knowledge/ai_agent/zabbix_agent/docs/decisions/README.md) and the [verification backlog](/unified/user/cj/knowledge/ai_agent/zabbix_agent/docs/development/backlog/design-verification.md).

## Global Constraints
Every task includes these.
- **Absolute paths only** in this plan: every file, directory and script path is written in full, from `/`. Two roots: the code repo
  `/unified/user/cj/ai_agent/zabbix_agent` (Q1; if the owner moves it, replace this prefix everywhere in this plan) and this KB
  `/unified/user/cj/knowledge/ai_agent/zabbix_agent` (paths under its `docs/`). Commands run with these paths work from any current directory.
- Docker only: every runtime component and every test run is a container. **Never run project code, tests or tools on the
  workstation host** (it has no Docker and Python 3.9, and the owner's rule is Docker only; editing files and the KB lint may run there).
- Names, networks and volumes are prefixed `zbxai`. Never touch the ClickHouse containers (`ch1` to `ch4`) or network
  `clickhouse-testing-env`.
- Zabbix 8.0 LTS official images (`zabbix-server-pgsql`, `zabbix-web-nginx-pgsql`); fall back to 7.0 LTS only if the 8.0 tags
  are absent (Task 0.2).
- Grafana OSS at an exact 13.x tag; plugin `alexanderzobnin-zabbix-app` v6.11.0 (needs Grafana 11.6 or later).
- Model: Llama 3.1 8B Instruct 4-bit (about 5 GB); fallback Llama 3.2 3B (about 2 GB). Runtime: llama.cpp `llama-server`
  with `--parallel 1`, one model per process. Production calls use only the OpenAI-compatible `/v1` chat endpoint.
- The model runtime sits on an internal-only Docker network (`internal: true`); the model file lives in a named volume and
  is downloaded at setup only. No outbound access at run time (D12). Only `${ZBXAI_PREFIX}_front` is not internal, and only Grafana
  and Zabbix web join it; the networks and ports are in the [topology](/unified/user/cj/knowledge/ai_agent/zabbix_agent/docs/architecture/topology.md).
- Zabbix access is read-only: a User-type role with API access and only `*.get` allowed. The agent and Grafana have separate
  API tokens. The analysis store is a separate database in the existing PostgreSQL instance: the agent has read-write,
  Grafana a SELECT-only role enforced in the database.
- Grafana runs no alert rules; dashboards and data sources are provisioned from files; dashboard refresh 30 s; Grafana's own
  database is SQLite on a named volume; the default admin password is changed at first start.
- Sizing reference: 100 items per module at a 60 s interval, 50 modules, about 83 NVPS, tested at 3 times (250 NVPS).
- Defaults: exhaustion lead time 1 h; disk warning at 80%, high at 90%.
- Targets (rehearsal): a problem is visible in Grafana within 30 s; analysis p95 3 min, set after the benchmark; analysis
  backlog drains within 15 min of a burst; at most 5 false problems per day.
- All timestamps are epoch seconds in UTC in code and `timestamptz` in the database (the testbed zone is America/New_York).
- Secrets never appear in logs, error text, responses, URLs or commits; only in the secret store.
- Subnets and ports come from the topology document; `/unified/user/cj/ai_agent/zabbix_agent/deploy/.env.example` has no real defaults. No testbed-specific value
  (addresses, hostnames, paths) appears in `/unified/user/cj/ai_agent/zabbix_agent/src/` or `/unified/user/cj/ai_agent/zabbix_agent/deploy/` (Task 4.1 tests this).
- Testbed budget: 8 vCPU, 15 GiB RAM, about 40 GB free disk shared with images and the model.

## Review Focus
Failure modes the spec implies that no single task's happy path covers; each has a test in the task named.
1. Prompt injection: a Zabbix trigger or host name saying "ignore previous instructions" must stay inside the data block,
   never reach the instruction message, and never cause a tool call or write (Task 2.7).
2. Flapping duplicates: one trigger firing 1000 times yields one queued analysis, a bounded queue and a visible drop
   counter (Tasks 2.2, 2.8).
3. Out-of-range parameters (limit 0, negative, 10**9; window beyond the maximum) are rejected with an error, never clamped,
   and truncated results say so (Tasks 2.3, 2.4).
4. Malformed, empty, evidence-free or oversized model output becomes "no analysis available" and never disturbs the
   problems view (Task 2.7).
5. Dependencies down or slow (Zabbix API, PostgreSQL, `llama-server`): retry with backoff, correct status codes, the
   problems view keeps working (Tasks 2.8, 3.4).
6. Time zones: testbed zone, container zone, PostgreSQL timestamps and Grafana panels agree on UTC (Tasks 2.1, 2.2, 2.9).
7. Markup or HTML in host and trigger names renders as text in Grafana's table, not as markup (Tasks 1.4, 2.9).
8. Secrets in logs or error bodies, including the token in exception text (Tasks 2.0, 2.3, 2.8).

## Code repository and layout
Default location, the agent's call (Q1, change it if you prefer): `/unified/user/cj/ai_agent/zabbix_agent/`, a code repo
separate from this docs-only KB. Not created yet; no `git init` for it until the owner agrees (Q7). This KB is already a separate git repo.
```
/unified/user/cj/ai_agent/zabbix_agent/
├── Dockerfile  Dockerfile.test  pyproject.toml
├── deploy/        compose.yaml  compose.test.yaml  .env.example  versions.env
│                  postgres/ (init, migrations)  grafana/ (Dockerfile, provisioning, dashboards)  zabbix/ (media)
├── src/zbxai/     config  models  store  zabbix_client  mcp_server  llm  pipeline  receiver  worker  sweep
├── tools/         zbx_provision/  loadgen/  faults/  bench/  scale/  drills/  envcheck.py
├── tests/         unit/  integration/  e2e/
└── scripts/       ship-test.sh  deploy.sh  teardown.sh
```

## Execution protocol
- **Edit on the workstation, run on the testbed.** `/unified/user/cj/ai_agent/zabbix_agent/scripts/ship-test.sh` streams the source as a tar over ssh into a throwaway
  `--rm` test container (and a test PostgreSQL on an internal network), so nothing lands on the testbed filesystem per cycle
  and no bind-mount SELinux labels are needed. Heavy files (images, model, caches) stay off the workstation (6 GB free).
- **Testbed access needs the owner's scoped grant** (see Gates). Every step marked **[TESTBED]** uses it. Credentials: ssh key
  if provided, else a one-shot environment variable; never written to a file or a command line.
- **Two credential classes.** A Zabbix admin login is used only by `/unified/user/cj/ai_agent/zabbix_agent/tools/zbx_provision` at setup and never enters an agent
  container. The agent and Grafana get only the read-only tokens. The default Zabbix Admin password is changed at first start.
- **Verification items.** Each item in the verification backlog is one step below; when it passes, delete its backlog entry.
- **Commits:** "commit" steps mean: ask the owner first unless a standing grant exists for that repo (Q7).
- **Docs in the same change:** a built task moves its description into the owning KB doc and removes its backlog entry.

| Verification item | Step |
|---|---|
| zabbix-image-tags | Task 0.2 step 4 |
| gguf-sourcing | Task 0.3 step 3 |
| function-availability | Task 1.3 step 5 |
| readonly-role-test | Task 1.3 step 6 |
| selinux-and-ports | Task 1.4 step 6 and Task 2.5 step 5 |
| grafana-plugin-compat | Task 1.4 step 7 |
| disk-budget | Task 1.4 step 8 |
| internal-network-egress | Task 2.5 step 5 |
| model-benchmark | Task 2.5 step 6 |
| llama-server-checks | Task 2.5 step 7 |
| receiver-reachability | Task 2.8 step 6 |
| pg-datasource-readonly | Task 2.9 step 5 |

## Gates before execution (the owner's)
1. **Scoped standing grant for the testbed:** containers, networks and volumes prefixed `zbxai`, and one directory under
   `/unified/user/cj/` on the testbed (it must be the code root `/unified/user/cj/ai_agent/zabbix_agent`, because scripts and secrets paths assume it); excluding host packages, firewall changes, `sudo` and the ClickHouse project. Recorded in
   `/unified/user/cj/knowledge/ai_agent/zabbix_agent/docs/operations/testbed.md` and memory with who, when, scope and how to revoke.
2. **ssh key access** (or authorisation to add a key), and rotating the current login.
3. **Commit policy for the code repo** (Q7): ask each time, or a standing grant for that named repo.
4. **Llama licence accepted** by the owner (Task 0.3).
5. **Topology document:** written ([topology](/unified/user/cj/knowledge/ai_agent/zabbix_agent/docs/architecture/topology.md)). The owner confirms that 172.30.60.0/21 is unused across their network.
6. Confirm the code location above (Q1).

## Task index
| Task | Delivers | Needs |
|---|---|---|
| [0.1](/unified/user/cj/knowledge/ai_agent/zabbix_agent/docs/development/implementation-plan/phase-0-gates.md) Topology values | `/unified/user/cj/ai_agent/zabbix_agent/deploy/.env` keys filled, overlap-checked against used and live subnets | topology doc (written) |
| [0.2](/unified/user/cj/knowledge/ai_agent/zabbix_agent/docs/development/implementation-plan/phase-0-gates.md) Versions pinned | `/unified/user/cj/ai_agent/zabbix_agent/deploy/versions.env` with tags and digests | testbed grant |
| [0.3](/unified/user/cj/knowledge/ai_agent/zabbix_agent/docs/development/implementation-plan/phase-0-gates.md) Model files | GGUF in named volume, checksums | licence accepted |
| [1.1](/unified/user/cj/knowledge/ai_agent/zabbix_agent/docs/development/implementation-plan/phase-1-platform.md) Compose, ship and deploy scripts | networks, volumes, test harness | 0.1, 0.2 |
| [1.2](/unified/user/cj/knowledge/ai_agent/zabbix_agent/docs/development/implementation-plan/phase-1-platform.md) PostgreSQL, Zabbix, roles | Zabbix up, SELECT-only role proven | 1.1 |
| [1.3](/unified/user/cj/knowledge/ai_agent/zabbix_agent/docs/development/implementation-plan/phase-1-platform.md) Zabbix content as code | read-only role, tokens, template | 1.2 |
| [1.4](/unified/user/cj/knowledge/ai_agent/zabbix_agent/docs/development/implementation-plan/phase-1-platform.md) Grafana problems view | **Commitment tier shippable** | 1.3 |
| [1.5](/unified/user/cj/knowledge/ai_agent/zabbix_agent/docs/development/implementation-plan/phase-1-platform.md) Load and fault tools | seeded faults, simulated load | 1.3 |
| [2.0 to 2.4](/unified/user/cj/knowledge/ai_agent/zabbix_agent/docs/development/implementation-plan/phase-2a-agent-core.md) Scaffold, models, store, Zabbix client, MCP | tested core library | 1.2 |
| [2.5 to 2.10](/unified/user/cj/knowledge/ai_agent/zabbix_agent/docs/development/implementation-plan/phase-2b-agent-service.md) Runtime, LLM, pipeline, receiver, panel, e2e | analysis in Grafana | 0.3, 1.4, 2.4 |
| [3.1 to 3.5](/unified/user/cj/knowledge/ai_agent/zabbix_agent/docs/development/implementation-plan/phase-3-hardening.md) Sweep, digest, scale, drills, self-monitoring | proven at 3 times load | Phase 2 |
| [4.1 to 4.2](/unified/user/cj/knowledge/ai_agent/zabbix_agent/docs/development/implementation-plan/phase-4-packaging.md) Portable packaging, KB sync | real-target ready | Phase 3 |
