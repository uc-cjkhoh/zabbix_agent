---
title: LLM agent proposal
description: Best settings for the deployed Llama model as a Zabbix triage agent, what it can do, how it supports failure prediction, tools to add, and the target topology
components: [deploy/compose.yaml, deploy/versions.env, deploy/edge/default.conf.tmpl, tools/bench/llm_probe.py]
---

# LLM agent proposal

Status: **proposal, not a decision.** Nothing here changes a decision (D1 to D15) or the implementation plan until the owner accepts it; the changes it would cause are listed in section 9.
Based on the KB working tree, uncommitted edits included.

## 0. How to read the evidence labels

| Label | Meaning |
|---|---|
| **Measured** | Observed on the testbed and recorded in [testbed.md](../operations/testbed.md) (2026-11-23) |
| **Derived** | Computed from a measured number plus the model's published architecture; not observed |
| **Estimate** | Scaled or assumed; treat as a hypothesis |
| **Unverified** | Not seen on the real system (golden rule 14) |

**Live testing status: not run.** The API key exists only on the testbed, so a real request needs someone with SSH access there. A read-only probe script is ready ([llm-probe-plan.md](llm-probe-plan.md)); the owner runs it on the testbed and sends back the results file. Until those results are recorded, every setting below is a *recommended starting value*, not a tested optimum.

## 1. Summary

1. **Keep the deployed Llama 3.2 3B Instruct Q4_K_M as the working model.** By estimate it answers the design's reference request (1,500 tokens in, 300 out) in about 45 to 65 s, inside the 120 s gate. Scaling the same numbers to the 8B model (D9's first choice) gives about 110 to 150 s, which sits on or above the gate (Estimate). The benchmark in Task 2.5 decides; I expect it to select the 3B.
2. **Lower `--ctx-size` from 32768 to 8192.** The prompt is about 1,500 tokens, so 32k buys nothing for a triage prompt. It costs about 2.7 GiB of RAM on the 3B (Derived) and invites very long prompts: one 12.5k-token prompt took 283 s and generated at 2.9 tokens/s (Measured).
3. **Force valid output with a JSON schema (`response_format`) and a low temperature (0.1).** A 3B model drifts from free-form JSON often enough that the plan's "retry once, then NoAnalysis" would fire regularly. Constrained decoding makes the retry rare. It needs one plan change: the client field allow-list (section 9).
4. **Do not rely on model tool calls.** The 3B model is the weakest part of tool calling, and `--jinja` is not enabled. The design already fixes the pipeline (D6), so fetch the context in code and give the model one prompt. MCP lookups stay off, as the plan has it.
5. **Let Zabbix do the predicting; let the model explain it.** Forecast, trend and baseline functions find the coming failure and give a lead time. The model turns that into a short explanation with evidence and checks. Section 5.
6. **Throughput is the real limit, not quality.** One slot at about 53 s per analysis finishes about 17 analyses in the 900 s drain window. The 200-problem burst test passes only if grouping and dedupe reduce the burst to about 17 analyses or fewer. Section 3.3.

## 2. Constraints that shape every setting

| Constraint | Source | Effect on the model setup |
|---|---|---|
| CPU only: 8 vCPU Xeon Gold 6148 (AVX512F), 15 GiB RAM, 0.8 GiB swap, no GPU | testbed.md | Small quantised model; RAM shared with Zabbix, PostgreSQL, Grafana |
| Docker only; `zbxai_` prefix; own subnet and ports | rules 1, 2, 4 | No change; settings are compose flags |
| Read-only against Zabbix; each new write is its own sign-off | rules 5, 6; D7 | Model output is advice only; nothing it says is executed |
| Never interpolate model output into a command, query or path | rule 7 | Suggested checks are displayed as text; evidence ids are validated against the context |
| Bound every query, say when a limit was hit | rule 8 | Prompt cap, `max_tokens`, client timeout, series row cap |
| Operational data stays in the network; no outbound at run time | rule 17; D12 | No hosted model, no external embedding or search service |
| Grafana only shows; never a second alert engine | rule 16; D8; D11 | Predictions appear as analysis rows, not alert rules |
| Never start, stop or reconfigure the testbed without being asked | CLAUDE.md section 5 | Every server flag below is a recommendation until the owner approves a restart |

## 3. Best settings for the current LLM

### 3.1 Facts the settings start from

| Item | Value | Label |
|---|---|---|
| Model | Llama 3.2 3B Instruct, Q4_K_M, 2,019,377,696 bytes | Measured |
| Server flags now | `--parallel 1 --ctx-size 32768 --threads 6`; no `--jinja`, no sampling flags | compose.yaml, .env |
| Short request (46 tokens in) | prompt 64 tok/s, generation 14 tok/s | Measured |
| 12,523-token prompt | prompt 44 tok/s, 283 s total, generation 2.9 tok/s | Measured |
| RAM at ctx 4096 / 32768 | 1.8 GiB / 4.9 GiB idle, 6.3 GiB after the 12.5k prompt | Measured |
| KV cache per token (3B: 28 layers, 8 KV heads, head dim 128, f16) | about 0.109 MiB, so 8192 tokens is about 0.9 GiB and 32768 is about 3.5 GiB | Derived; it reproduces the measured 1.8 to 4.9 GiB step |
| Proxy read timeout | 600 s | Measured |

### 3.2 Recommended server flags (need an approved restart)

| Flag | Now | Recommend | Why | Label |
|---|---|---|---|---|
| `--ctx-size` | 32768 | **8192** | Prompt about 1.5k plus 300 out, with 5x headroom. RAM about 2.2 GiB instead of 4.9 GiB | Derived |
| `--threads` | 6 | 6, then test 8 | 6 leaves CPU for Zabbix and PostgreSQL; the 8 vs 6 benchmark is already open in Task 2.5 | Unverified |
| `--threads-batch` | unset (follows `--threads`) | test 8 | Prompt processing uses every core well; generation does not. 44 to 64 tok/s prefill looks low for AVX512 | Unverified |
| `--parallel` | 1 | **1** | One slot gives full speed; two slots halve per-request context and split the same CPU | Estimate |
| `--flash-attn` | unset | test `on` | Lower memory and often faster prefill on CPU. The option takes a value in recent builds; confirm with `--help` on the pinned image | Unverified |
| `--cache-type-k/-v` | f16 | test `q8_0` (needs flash-attn) | Halves the KV cache; check output quality with the probe | Unverified |
| `--batch-size`, `--ubatch-size` | default | test 512/512 vs 1024/256 | Affects prefill speed only | Unverified |
| `--temp 0.1 --top-k 40 --top-p 0.9 --min-p 0.05 --seed 7` | llama defaults | **set as server defaults** | Keeps the client inside the plan's four request fields (`model, messages, max_tokens, temperature`) while still pinning sampling | Estimate |
| `--jinja` | off | leave off | Only needed for tool calls, which this design does not use | n/a |
| `--mlock` | off | leave off | 15 GiB host shared with other services | n/a |

If the 8B model is ever selected: KV is about 0.125 MiB/token, so ctx 8192 costs about 1 GiB and the process lands near 6 GiB (Derived). At ctx 32768 it would be near 9 GiB, which probably does not fit beside the rest of the stack (Estimate; D9's design budget is 10 to 11 GB for the whole stack).

### 3.3 Per-request settings and the throughput check

| Setting | Value | Why |
|---|---|---|
| `temperature` | 0.1 | Triage is extraction and explanation, not creative writing; 0 risks repetition loops, above 0.3 invents causes |
| `max_tokens` | 400 | The analysis is about 300 tokens; the cap bounds a runaway answer (rule 8) |
| `response_format` | `json_schema` for `Analysis` | Output always parses; evidence ids are still checked in code against the context |
| Prompt size cap | 3,000 tokens, reject or trim above it, and say so | A 12.5k prompt took 283 s; the limit must be reported when hit |
| Client timeout | 180 s | Above the 120 s gate, far below the proxy's 600 s |
| Prompt layout | Fixed system message first, then one delimited `<data>` block | Keeps the prefix identical so the server can reuse its prompt cache on the retry path |
| Evidence ids | Every Zabbix object in the context carries a short id; the model must cite ids | Lets code drop any hypothesis that cites something not in the context |
| Unknown allowed | "Not enough data" with confidence `low` is a valid answer | A 3B model otherwise fills gaps with plausible fiction |

**Latency, 1,500 tokens in and 300 out** (the plan's `estimate_latency`):

| Model | Prompt rate | Generation rate | Result | Gate (120 s) | Label |
|---|---|---|---|---|---|
| 3B Q4_K_M | 44 to 64 tok/s | 10 to 14 tok/s | about 45 to 65 s | passes | Estimate (rates Measured on short and long prompts, generation at 1.5k depth not measured) |
| 8B Q4 | about 18 to 27 tok/s | about 4 to 6 tok/s | about 110 to 150 s | borderline or fails | Estimate (3B rates divided by the roughly 2.4x file-size ratio) |

**Burst check.** Capacity in the 900 s drain window is about 900 / 53, so about 17 analyses on the 3B and about 7 on the 8B (Estimate). The design's "problem lost = none" is about problems being stored and shown, which is fast; the "analysis backlog drains within 15 min" target is about analyses. A 200-problem burst therefore passes only if grouping (60 s same-host window), dedupe (`trigger_id:host_id`) and a per-host cooldown cut it to about 17 analyses. Recommendations:

1. Treat 17 as the planning number for the Task 3.x scale test and say in the test which of the two the 200 problems are reduced to.
2. Add a priority order to the queue: High and Disaster first, Warning last, and let Warning-level problems skip analysis when the queue is above a depth threshold (shown as `NoAnalysis: queue full`, never silently dropped).
3. Re-measure after `--ctx-size` and thread changes; prefill speed is the lever, since it is more than half the time.

## 4. What the agent can do

Inside D6 (Zabbix detects, the model triages) and D7 (read-only):

| Capability | Output the user sees in Grafana | Notes |
|---|---|---|
| Explain a problem in plain language | One paragraph, what the trigger means and why it fired | Uses trigger expression, item history, host tags |
| Rank likely causes | Up to three hypotheses, each with evidence ids and a rank | Hypotheses with no or invented evidence are dropped in code |
| Suggest read-only checks | A short list such as "check which process holds the disk" | Shown as text only; never run, never interpolated (rule 7) |
| Suggest a fix | Human-readable remediation steps, marked as advice | Never executed; any automation is its own sign-off (rule 6) |
| Group a burst into one story | One analysis for five triggers on one host inside 60 s | Already in the plan |
| Say what it does not know | Confidence `low` and the missing data | Required behaviour |
| Summarise on resolution | One line, what cleared it and how long it lasted | Optional second prompt on `RESOLVED`; low cost, short output |
| Daily digest | Top recurring problems, flapping triggers, hosts at risk | Phase 3 already plans a digest panel |
| Compare with history | "Seen 3 times in 30 days, last on 2026-11-02" | Needs a recurrence tool (section 6) |

Out of scope by decision: acknowledging or closing problems, changing triggers or hosts, sending email or chat messages (Grafana is the only surface, D8), and anything that calls out of the network (D12).

## 5. Predicting future errors in connected modules

**Principle:** a 3B language model is not a forecaster. Give it Zabbix's computed prediction and let it explain. This keeps the false-prediction target (at most 5 per day, design plan) measurable and keeps the maths deterministic.

### 5.1 Failure classes, detection, and the model's part

| Failure class | Signal (item key, Zabbix 8.0 names to confirm; function availability is *unverified*, backlog `function-availability`) | Prediction method | Typical lead time | Model's part |
|---|---|---|---|---|
| Disk filling | `vfs.fs.size[/,pused]` | `timeleft(...,1d,100)<1h` already planned; widen to a 24 h warning tier | hours to days | Name likely growth source, suggest checks |
| Memory leak | `vm.memory.size[available]` | `forecast` on a 7-day trend to zero; slope above a limit | days | Explain that the pattern matches a leak, not load |
| Swap or memory pressure | `system.swap.size[,pfree]` | Threshold plus rising trend | hours | Correlate with the process list item if present |
| CPU saturation and unusual load | `system.cpu.util` | `baselinedev` or `trendstl` (planned) for seasonal load | hours | Say whether the deviation is new or recurring |
| Flapping service or module | Problem events per trigger from `event.get` | Count above N in 24 h; rising count over 7 days | hours to days | Explain the pattern, link earlier events |
| Heartbeat decay | `agent.ping` with `nodata` | Rising gaps before total silence | minutes | Say which host-level cause is likelier |
| Certificate or licence expiry | `web.certificate.get` or a module-specific date item | Days left below a limit | days to weeks | Write the plain-language notice |
| Error-rate growth | `log.count[...]`, `net.if.in[...,errors]` | Slope-change detector (Task 3.x, `detect_slope_change`, 12+ points, z=3.0) | minutes to hours | Pair the rise with the first-seen time |
| Queue or latency creep in a module | A per-module latency and queue item (section 5.2) | `baselinedev` on that item | minutes to hours | Explain against the module's last changes |

### 5.2 A module template standard

Predictions are only as good as the items. Every module should expose the same five signals, so one set of triggers and one prompt fits all 50+:

1. **Availability** (`agent.ping` or a health check item)
2. **Latency** (response time of its main call)
3. **Errors** (rate of failed requests or error log lines)
4. **Saturation** (queue depth, thread or connection pool use)
5. **Traffic** (requests per minute, for baselining)

plus two tags on the host: `module_version` and `owner`. The model then always receives the same shaped context, which is the main thing a small model needs to behave.

### 5.3 A nightly risk sweep (extends the planned sweep)

Phase 3 already plans a sweep that finds slope changes in items without triggers. Extend it to produce a **risk list**: for each host and item, a score from trend slope, distance to a limit, recent flap count, and time since the last change. The model then writes one digest of the top N, with a "why it matters" line each. Grafana shows it beside the problems. No alert is raised from the model (rule 16).

### 5.4 How to know the predictions are good

Backtest first: replay 30 days of exported history, count how many predicted failures happened within the lead time (precision) and how many real incidents were predicted (recall). Keep a golden set of seeded faults (the plan already seeds faults) and rerun it after every model, prompt or flag change. Report false predictions per day against the 5 per day target. Until that run exists, all lead times above are *unverified*.

## 6. Tools to add

All read-only, typed, bounded (limit and time limit), names start with `get_`, backed by `*.get` methods only. Adding any of them changes D7, which says about six tools, so it needs an owner decision.

| Tool | Zabbix API method | Purpose | Priority |
|---|---|---|---|
| `get_item_trends(item_id, window_s)` | `trend.get` | Hourly min/avg/max for forecasts without pulling raw history | High |
| `get_trigger_recurrence(trigger_id, days)` | `event.get` | Count and last times; powers "seen before" and flap detection | High |
| `get_trigger_definition(trigger_id)` | `trigger.get` | Expression and dependencies, so the model explains why it fired | High |
| `get_maintenance(host_id)` | `maintenance.get` | Avoids explaining a planned outage as a fault | Medium |
| `get_host_context(host_id)` | `host.get` with tags and inventory | Module version, owner, group, template list | Medium |
| `get_service_impact(host_id)` | `service.get` | Which modelled service a problem touches. SLA report calls are not `*.get` methods, so they would need an allow-list exception and their own sign-off | Medium (only if services exist) |
| `get_problem_timeline(event_id)` | `event.get` with acknowledgements | What the humans already tried | Medium |

Beyond MCP tools:

| Addition | What it gives | Rule check | Priority |
|---|---|---|---|
| **Constrained output** (`response_format` json_schema) | Valid analyses almost every time | Within the model container; no new service | High |
| **Seeded-fault evaluation harness** | Regression test for model, prompt and flag changes; scores correct cause and no invented evidence | Runs on `zbxai_test` (already planned) | High |
| **Runbook notes store** | Owner-written fix notes per trigger or module, found by keyword and shown to the model | Notes live in PostgreSQL full-text search, no extra model, no outbound; adds a new table, so its own write sign-off | Medium |
| **Past-analysis lookup** | "Similar problem" from earlier analyses | Reads the existing `analyses` table; `similar` is already in the plan's `Context` | Medium |
| **Owner rating of an analysis** (useful / wrong) | Data to improve prompts and measure quality | A new write path: needs its own sign-off (rule 6, safety rule 8) | Medium |
| **Statistical detectors in the worker** (slope change now; seasonal decomposition later) | Prediction without the model | Standard library first; any new dependency needs a reason | Medium |
| **Bigger model (8B)** | Better reasoning if the benchmark allows | D9 gate; needs a named GGUF source and the owner's licence acceptance | Only if the gate passes |
| **Embedding-based retrieval** | Better runbook matching | A second model in RAM; skip until keyword search proves too weak | Low |

## 7. Architecture topology

Legend: **[BUILT]** = on the testbed now (the llama slice); **[PLANNED]** = in the implementation plan; **[PROPOSED]** = added by this document. Subnets and ports are from [topology.md](../architecture/topology.md); those marked "planned" are not yet created.

```
                    LAN 10.168.48.0/22  (gateway 10.168.50.254)
 +----------------+       +-----------------+        +----------------------+
 | Owner browser  |       | Owner SSH       |        | Tools: curl, scripts |
 +--------+-------+       +--------+--------+        +-----------+----------+
          | F12 :13000             | F12 tunnel to              | F12 :18081
          |                        | 127.0.0.1:18080            | Bearer key, HTTP
==========|========================|============================|=== TESTBED 10.168.50.40 ===
          v                        v                            v
+- zbxai_front 172.30.60.0/24  (outbound allowed) -----------------------------------------+
| +--------------+   +--------------+   +------------------------------+                   |
| | grafana      |   | zabbix_web   |   | edge  nginx          [BUILT] |                   |
| | :3000        |   | :8080        |   | :18081, key check            |                   |
| | [PLANNED]    |   | [PLANNED]    |   | /health open                 |                   |
| | F8, F9 out   |   | F3 out       |   | F11 out                      |                   |
| +--------------+   | F6,F7,F8 in  |   +------------------------------+                   |
| also on app        +--------------+   also on model                                      |
|                    also on app                                                           |
+------------------------------------------------------------------------------------------+
          | grafana and zabbix_web are also on zbxai_app
+- zbxai_app 172.30.61.0/24  (internal, no outbound)  [PLANNED] ---------------------------+
| +------------+   +---------------+   +--------------+   +----------------------------+   |
| | reporters  |   | zabbix_server |   | postgres     |   | receiver :8000             |   |
| | load, disk |   | :10051        |   | :5432        |   | dedupe, group 60 s, queue  |   |
| | F1 out     |   | F1 in         |   | events,      |   | F2 in, F4 out              |   |
| +------------+   | F2, F3 out    |   | analyses,    |   +----------------------------+   |
|                  +---------------+   | v_ai_analyses|   +----------------------------+   |
| +------------+                       | runbooks     |   | worker                     |   |
| | mcp :8001  |                       |   [PROPOSED] |   | context, prompt, validate  |   |
| | get_* tools|                       | F3,F4,F5,F9  |   | nightly risk sweep         |   |
| | F7 out     |                       | in           |   |   [PROPOSED]               |   |
| +------------+                       +--------------+   | F5, F6, F10 out            |   |
|                                                         +----------------------------+   |
+------------------------------------------------------------------------------------------+
          | worker is also on zbxai_model (F10); edge reaches llama (F11)
+- zbxai_model 172.30.62.0/24  (internal, no outbound)  [BUILT] ---------------------------+
| +--------------------------------------------------+                                     |
| | llama  llama-server                      [BUILT] |                                     |
| | Llama 3.2 3B Q4_K_M, :8080, --parallel 1         |                                     |
| | ctx 32768 now, 8192 PROPOSED                     |                                     |
| | volume zbxai_models (read-only)                  |                                     |
| | F10, F11 in                                      |                                     |
| +--------------------------------------------------+                                     |
+------------------------------------------------------------------------------------------+

Transient, planned: zbxai_test 172.30.63.0/24 (internal), seeded-fault harness [PROPOSED use];
zbxai_setup 172.30.64.0/24 (outbound), one-time model download.
```

| Flow | From to | What | Net |
|---|---|---|---|
| F1 | reporters to zabbix_server :10051 | Item values (trapper) | app |
| F2 | zabbix_server to receiver :8000 | Webhook `POST /v1/events` | app |
| F3 | zabbix_server, zabbix_web to postgres :5432 | Zabbix's own database | app |
| F4 | receiver to postgres | Store event and queue (`zbxai_agent_rw`) | app |
| F5 | worker to postgres | Claim queue, store analysis (`zbxai_agent_rw`) | app |
| F6 | worker to zabbix_web | JSON-RPC, read-only token; **direct, not through mcp** | app |
| F7 | mcp to zabbix_web | JSON-RPC, read-only; off by default for the model | app |
| F8 | grafana to zabbix_web | Zabbix data source, its own read-only token | app |
| F9 | grafana to postgres | `v_ai_analyses` through `zbxai_grafana_ro` (SELECT-only) | app |
| F10 | worker to llama :8080 | `POST /v1/chat/completions` | model |
| F11 | edge to llama :8080 | Proxied LAN requests | model |
| F12 | people and tools to grafana :13000, edge :18081, zabbix_web (SSH tunnel to 127.0.0.1:18080) | Only these cross the LAN | front |

One problem, end to end:

1. A reporter sends an item value to the Zabbix trapper (F1). A trigger fires.
2. Grafana shows the problem within about 30 s through its own Zabbix token (F8). No model is involved yet (D6).
3. The Zabbix webhook posts the event to the receiver (F2). The receiver dedupes, groups a burst and queues one analysis (F4).
4. The worker claims it (F5) and builds the context by reading Zabbix directly with the read-only token (F6), highest priority first. The `mcp` service (F7) is a separate path, off by default; the proposed `get_*` tools extend what either path can fetch.
5. The worker sends one prompt to llama (F10) and validates the JSON in code: schema, evidence ids exist, size cap.
6. The worker stores the analysis (F5). Grafana reads `v_ai_analyses` with a SELECT-only role (F9) and shows it beside the problem.
7. Nightly, the worker's risk sweep writes a ranked risk list and digest the same way. Nothing leaves the network (D12).

Network additions in this proposal: **none.** No new subnet and no new published port; the edge proxy keeps 18081.

## 8. Live test plan and results

The probe script, the restart tests and the results table are in [llm-probe-plan.md](llm-probe-plan.md). **No live test has run yet.**

## 9. What accepting this proposal would change

| Document | Change |
|---|---|
| [D9](../decisions/d9-model-and-runtime.md) | Record the measured benchmark result and the model it selects; note the 3B is the deployed model |
| [Phase 2b](implementation-plan/phase-2b-agent-service.md), Task 2.6 | Allow `response_format` in the request allow-list; Task 2.7 retry logic becomes a fallback |
| Phase 2b, Task 2.5 | Add `--ctx-size 8192`, sampling defaults and the flag tests; record results in `docs/operations/benchmarks.md` |
| [Phase 3](implementation-plan/phase-3-hardening.md) | State what the 200-problem burst is reduced to before the 900 s drain; add queue priority |
| [D7](../decisions/d7-thin-readonly-mcp-server.md) | Raise "about six tools" if any section 6 tool is adopted |
| [testbed.md](../operations/testbed.md) | Update the llama row if ctx or threads change (same-change rule) |
| `CLAUDE.md` sections 6 and 8 | Section 8 (directory map): add this file and `llm-probe-plan.md`. Section 6 (source layout): add `tools/bench/`. **Pending**: CLAUDE.md has uncommitted edits and was not touched here |

## 10. Open decisions for the owner

1. Run the read-only probe on the testbed and send back its results file ([llm-probe-plan.md](llm-probe-plan.md)); later, approve the restart tests one at a time.
2. Accept 8192 as the context size, or keep 32768 for a stated reason.
3. Accept `response_format` json_schema in the client.
4. Which of the section 6 tools to add, and whether services (`service.get`) are modelled in Zabbix.
5. Whether the owner-rating write path and the runbook table are wanted (each is its own sign-off).
6. Name the 8B GGUF source and accept its licence, or close the 8B option and keep the 3B.
