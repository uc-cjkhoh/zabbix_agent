---
title: Design plan
description: What the Zabbix AI agent does, why it is built this way, the approaches weighed, and what is still unverified
components: []
---

# Design plan

**Status: approved by the owner.** Items marked *proposal* were the agent's calls and are accepted with the plan;
verification items in section 12 can still overturn them.
Owner-decided: Grafana is the monitoring UI and the only notification surface, with no chat or push channel and no
on-call tooling ([D8](../decisions/d8-grafana-only-notification.md), [D11](../decisions/d11-grafana-monitoring-ui.md));
operational data stays in the network ([D12](../decisions/d12-operational-data-stays-in-network.md)); the testbed is a
rehearsal and the real 50+ modules are a sizing reference only
([D13](../decisions/d13-rehearsal-testbed-and-sizing-reference.md)); Llama 3.1 8B with a 3B fallback on llama.cpp
`llama-server` ([D9](../decisions/d9-model-and-runtime.md)); Zabbix 8.0 LTS ([D10](../decisions/d10-zabbix-version-and-database.md));
a read-only agent in v1. Unverified items are in section 12 and the
[verification backlog](../development/backlog/design-verification.md). Flow diagram: [overview](overview.md).
Subnets, ports and per-container detail are in the [topology](topology.md).

## 1. Purpose and success targets
Watch what Zabbix already collects, spot trouble before it hurts users, and show people the problem and its likely
cause in one place. Owner metrics with **proposed** measurable targets (the owner accepts or changes them):

| Owner metric | Proposed target |
|---|---|
| Handle more than 50 modules or services | Simulated 50+ hosts (the real modules are on a host we cannot reach and only shape the sizing): no problem lost; analysis backlog drains within 15 min of a burst |
| Detect issues in advance or at once | Resource-exhaustion problems flagged at least 1 h before the threshold; sudden failures shown within 60 s |
| A medium to notify users | The owner chose Grafana as that medium. A new Zabbix problem is visible in Grafana within one dashboard refresh (proposed 30 s), even if the model is down; the AI analysis appears there after |

Also tracked: false problems per day (proposed: at most 5) and p95 time from problem to analysis shown (proposed: 3 min,
set after the benchmark).

**Two tiers of target.** The problem display reads Zabbix directly, so it never waits on the agent or the model; it
depends on Grafana being reachable (port 3000, verification item `selinux-and-ports`). The analysis targets depend on
the benchmark: if the model misses them, the numbers change (relax, group more, expire analyses), the project does not
fail. The problem display is the commitment.

**Rehearsal scope.** The testbed is a rehearsal ([D13](../decisions/d13-rehearsal-testbed-and-sizing-reference.md)).
These are rehearsal targets: they show the design works and what it costs, and are measured again on the real hardware.

## 2. Goals, non-goals, anti-goals
- **Goals:** early warning from trends; faster diagnosis through context and explanation; one Grafana view where a
  problem and its analysis sit together; everything in Docker, rehearsed on the testbed, with all data inside the network.
- **Non-goals (v1):** changing anything in Zabbix or on monitored hosts; auto-remediation; a custom-built UI (Grafana is
  the UI); on-call tooling (rotations, escalation, paging) and push channels (chat, email, SMS), by owner decision;
  discovering or onboarding monitored modules; monitoring the real 50+ modules in the rehearsal; training a model.
- **Anti-goals (a failure even if it works):** a problem display that waits on the agent or model; a model that invents
  causes and states them as fact; an agent that can write to Zabbix; an analysis panel so noisy people ignore it; two
  alerting engines raising competing alerts for one fault; operational data leaving the network.

## 3. Constraints
- Owner rules: Docker only; network distinct from the host's; project root `/unified/user/cj/`; stack Llama, Zabbix,
  MCP, Grafana ([D1](../decisions/d1-stack.md) to [D3](../decisions/d3-network-isolation.md)).
- Testbed ([observed](../operations/testbed.md)): 8 vCPU, 15 GiB RAM, no GPU, 40 GB free on one disk, no Zabbix, SELinux
  Enforcing, firewalld active with unreadable rules, no `sudo`, shared with another project.
- Consequences: inference is slow and single-lane; the DB, the model (about 5 GB) and images share 40 GB; bind mounts need
  SELinux labels (prefer named volumes); published ports may be blocked and cannot be opened by us.
- Owner decisions: operational data stays inside the network, with no run-time outbound dependency and downloads
  (images, model, plugin) at setup only; notification is Grafana only, with no on-call tools; the testbed is a
  rehearsal; the real 50+ modules are unreachable and a sizing reference only.

## 4. Approaches considered
| | A. Model watches everything | B. Zabbix detects, model triages (**proposal**) | C. External analytics engine plus model |
|---|---|---|---|
| Idea | The model polls metrics and decides | Zabbix triggers do detection; the model explains and ranks what fires | A separate service runs its own anomaly maths on history, then asks the model |
| Speed on CPU | Fails: too many tokens per cycle | Model runs only per problem, queued | Good for maths; model per finding |
| Reliability | Weakest: numeric reasoning by an 8B model | Detection is deterministic and already inside Zabbix | Good, but a second detection system to keep right |
| Build cost | Low | Low to medium | High |
| Fit to owner | Poor | Good: uses the stack as declared | Overbuilt for v1 |

**Pick B.** C is the growth path if Zabbix's own functions prove too coarse. A scheduled statistical sweep of items with no
trigger was dropped ([D19](../decisions/d19-scope-cut-after-full-review.md)): detection stays inside Zabbix.

## 5. Components
Role of each piece; the flow is in the [overview](overview.md).
| Component | Role | Notes |
|---|---|---|
| Zabbix server, web, PostgreSQL | Collect, store, detect, raise problems | Official images; Zabbix 8.0 LTS, falling back to 7.0 if the 8.0 tags are not there |
| Grafana | The monitoring UI and the only notification surface: problems view, trend dashboards, an AI-analyses table | Section 6a; read-only |
| Zabbix action to the agent | Posts each problem event to the agent's receiver | Custom webhook media type (JavaScript), to the receiver on the Docker network |
| Receiver and queue | Authenticates, validates, dedupes, queues events | Bounded queue; drops are counted, never silent; one agent service with the worker |
| Analysis worker | One problem at a time through the pipeline (section 8) | Single lane, because inference is CPU-bound |
| MCP server (read-only), gated | The only path from the model to Zabbix, if model lookups are ever enabled | Section 6; not built, none runs ([D19](../decisions/d19-scope-cut-after-full-review.md)) |
| Model runtime | llama.cpp `llama-server` serving Llama over a local OpenAI-compatible API | Section 9; internal-only Docker network |
| Analysis store | Analyses, dedupe keys, cooldowns, queue | A separate database in the existing PostgreSQL instance (proposal); the agent has read-write, Grafana a SELECT-only role |
| Self-monitoring | Zabbix watches the agent's, model's and Grafana's health and queue depth | The monitor must not depend on the thing it monitors |

## 6. The MCP server: build a thin one, only if tool calls prove reliable (proposal, gated)
**Gated by [D19](../decisions/d19-scope-cut-after-full-review.md):** the model's tool calls are unproven and off; no MCP server runs (the interim official server was removed from the repo); this server is built (Task 2.4) only if the benchmark shows at least 9 of 10 valid tool calls. Until then the code gathers all context and the model gets no tools (section 8).

| | Official `zabbix-mcp-server` | Thin custom server |
|---|---|---|
| Tools exposed | Wide API surface; restricted by allow and deny lists | A handful of purpose-built tools |
| Cost for an 8B CPU model | Every tool schema costs prefill time and hurts tool choice | Small schema, fast and reliable |
| Limits (safety rule 3) | Passthrough of `*.get` parameters: limits are the caller's problem | Each tool has typed inputs, a validated row limit and a time window |
| Read-only | No read-only flag; tool filters only | Read-only by construction |
| Version coupling | Documented for the matching Zabbix version | We own the compatibility |
| Effort | Lowest | Low: about six tools |

The official server's docs sit in the 8.0 manual and it is supported with a matching Zabbix version. Tools (all
read-only, all bounded): active problems for a host or service; one event with its trigger and host context; item history
or trend for a window; a host overview; recent problems on related hosts; agent self-status. Zabbix access uses a role of
type User with API access and only `*.get` methods allowed: a second guard beneath the tools
([coding standards](../development/coding-standards.md), rules 5 to 9). Read-only in v1 is confirmed by the owner.

## 6a. Grafana: monitoring UI and notification surface
- **Owner-decided:** Grafana is the monitoring UI and the only notification surface, through the Zabbix data-source plugin
  (pinned v6.11.0; needs Grafana 11.6 or later; an exact 13.x image tag). Licence AGPL v3; internal use.
- **Two data sources, both read-only (proposal):** Zabbix, through its own API token on the same User-type `*.get` role,
  separate from the agent's so either can be revoked alone; and the analysis store, through the built-in PostgreSQL data
  source with a SELECT-only role on that one database. Grafana's SQL data sources let dashboard editors run arbitrary
  queries, so the database-level guard is the real one (safety rule 1). Grafana never writes to Zabbix or to the store.
- **Not an engine:** no Grafana alert rules; Zabbix is the only alerting engine. The Grafana MCP server is not given to
  the model (same reason as D7). Writing analyses into Grafana through its annotations API is the alternative to the
  PostgreSQL route; it is a new write path and would need its own sign-off (safety rule 8).
- **Config as code (proposal):** dashboards and data sources are provisioned from files, not built by clicking, so they
  rebuild from the repo.
- **Storage and access:** SQLite on a named volume for v1 (the docs advise an external database for production: enough
  for the rehearsal, but a real target should use one). Port 3000 must pass firewalld, whose rules we cannot read or
  change; because Grafana is the only notification path, this is a hard dependency, and it is checkable from the
  workstation on the same LAN. Change the default admin password at first start; the admin credential, the Zabbix token
  and the database role's password live in the secret store.
- **On-call:** out of scope by owner decision. Self-hosted Grafana has no maintained on-call product (see
  [D11](../decisions/d11-grafana-monitoring-ui.md)).

## 7. Detection
Zabbix detects; the model never decides whether something is wrong.
- **Exhaustion** (disk, memory, queues, connection pools): triggers built on `forecast()` and `timeleft()` over a trend
  window, firing when the time to threshold drops under a lead time.
- **Seasonal anomalies** (load, traffic, error rate): baseline and anomaly functions (`baselinewma`, `baselinedev`,
  `trendstl`) on the metrics that have a daily or weekly rhythm.
- **Sudden failures:** ordinary threshold and no-data triggers, with trigger dependencies to cut cascades.
- **Templates:** triggers live in a few shared templates, so 50+ modules are onboarded by linking one, not by hand-tuning.
- **Defaults (agent's call, tuned with the owner):** exhaustion lead time 1 h; disk warning at 80% and high at 90%; the
  owner's own thresholds replace these when given.
- **History needed:** forecasts need trend data covering their window, and seasonal baselines need several seasons
  (minimum unverified). The "1 h ahead" target cannot be demonstrated on a fresh Zabbix; early demonstrations use
  seeded faults, and seasonal detection waits for history.

## 8. Analysis pipeline (fixed, not an open agent loop; proposal)
Tool-calling is unproven for this model and runtime, so the code drives and the model only reasons.
1. **Receive** a problem event; validate it against a schema; drop or merge a duplicate (same trigger and host).
2. **Gather** context with a fixed set of reads through the bounded Zabbix client (the worker calls it in-process): the trigger, the item's recent history, and other
   open problems on the host and on related hosts.
3. **Ask** the model once, with the gathered facts and a short instruction. Extra bounded lookups by the model are off and not built;
   they would be enabled only after the benchmark shows at least 9 of 10 valid tool calls for the chosen model and runtime (section 6, D19).
4. **Validate** the answer against a schema: severity view, ranked hypotheses, the evidence each rests on, suggested
   checks, confidence. Reject and retry once; then store "no analysis available".
5. **Store** the validated analysis with the Zabbix event ID. Grafana shows it beside the problem. A link to the Zabbix
   event is shown only when a base URL is configured and viewers can reach it; otherwise the event ID is plain text.

Grouping: events in a burst on one service or host become one analysis. The analysis states evidence versus guess; a
hypothesis with no cited evidence is dropped before it is stored.

## 9. Model and runtime
- **Model (owner-approved):** Llama 3.1 8B Instruct at 4-bit, about 5 GB, with Llama 3.2 3B (about 2 GB) as the fallback
  if the benchmark is too slow. The model is the same in the rehearsal as in any later deployment.
- **Runtime (owner's choice):** llama.cpp `llama-server`, official CPU image, local OpenAI-compatible API, started with
  one slot (`--parallel 1`) because inference is single-lane. One model per server process, so the 3B fallback is a
  second configuration, not a hot swap.
- **Runtime-agnostic by design:** production calls use only the OpenAI-compatible `/v1` chat endpoint, so the runtime can
  change by config; server-specific features stay in the benchmark harness.
- **In-network:** the runtime has no registry. It sits on an internal-only Docker network and loads a model file from a
  named volume. The GGUF source is settled by the `gguf-sourcing` check, and its checksum and the licence acceptance are recorded; the file
  is downloaded at setup only ([D12](../decisions/d12-operational-data-stays-in-network.md)).
- **Gate:** `llama-bench` on the testbed with the real prompt size decides 8B or 3B for the rehearsal and gives the
  sizing evidence for the real target. The server's own response timings are a check. No throughput is assumed here.
- **Alternatives, not chosen:** Ollama (easy pulls, JSON-schema output, `tool_choice` unsupported, pulls need the
  internet); vLLM (impractical here: 8B in BF16 needs about 16 GB against 15 GiB RAM; plausible on a GPU target).
- **Licence:** the Llama community licence and acceptable-use policy apply; internal use is the expected case (confirm
  before any distribution).

## 10. Notification surface: Grafana only
- **Problem first:** a Zabbix problem appears in Grafana's problems view straight from Zabbix, independent of the agent
  and the model. The analysis arrives later in an AI-analyses table beside it. A problem display never waits on the model.
- **Known limit, accepted by the owner:** this is pull. Nobody is told anything unless they are looking, so early warning
  only helps if someone watches Grafana. Push (chat, email, SMS, paging) is not designed; adding it later needs a new
  decision, and Grafana alerting would break the single-engine rule. Zabbix web remains a fallback view (through an ssh tunnel).
- **Noise control:** dedupe, per-host cooldown and burst grouping apply to analyses. A daily digest panel was dropped ([D19](../decisions/d19-scope-cut-after-full-review.md)).
- **Message content:** the data stays in-network, so detail is a readability choice. Default: host and service names,
  numbers and the evidence cited; short log excerpts only if the owner wants them. All text is escaped when shown.

## 11. Scale, capacity and failure
**Sizing reference (an assumption; real numbers from the owner replace it).** The real 50+ modules run on a host we cannot
reach and only shape the estimate. Assume 100 items per module at a 60 s interval: 50 x 100 / 60, about 83 new values per
second (NVPS), tested at 3 times that. Zabbix load, database growth and the scale test derive from it.

Budget, **estimates not measurements**, for the rehearsal: Zabbix plus PostgreSQL 2 to 3 GB RAM, model about 6 GB with its
cache, the agent under 1 GB, Grafana a few hundred MB (footprint not found); roughly 10 to 11 of 15 GiB. The analysis
store lives in the existing PostgreSQL instance to avoid another container; the coupling is acceptable for a rehearsal, and
a real target can separate it. Disk is the tighter limit: history and trends need retention and housekeeping from the start.

| Failure or risk | Behaviour |
|---|---|
| Model down or slow | Problems still show; analyses queue, then expire with a "no analysis" note |
| Problem storm | Group, dedupe, cap the queue, report drops; the model never blocks the problem display |
| Zabbix API unreachable | Retry with backoff; the analysis is marked incomplete; self-monitoring flags it |
| Untrusted text (trigger names, item values, log lines) in the prompt | Delimited as data; the model has no write tools; output stored and shown as escaped text |
| Analysis store or its data source down | Problems still show; the analyses table shows an error |
| Grafana down | The only notification path is down; self-monitoring cannot tell anyone; Zabbix web is the fallback view |
| Database role or token leaks | Held only in the secret store; the Grafana role is SELECT-only; rotated on suspicion; never logged |
| Disk fills | Retention limits, an exhaustion trigger on the testbed itself, model and images sized first |
| Grafana plugin and Zabbix version mismatch | Dashboards break after an upgrade; Zabbix, Grafana and plugin versions are pinned together and tested before any change |
| Wrong analysis | Evidence is cited; confidence shown; no automatic action follows from it |

## 12. Assumptions to verify (each has a backlog item)
- **Zabbix 8.0 LTS image tags exist** (owner-approved; fall back to 7.0 LTS). The source page contradicts itself on 8.0's
  release date, and 7.0's full support ends in June 2027.
- Minimum Zabbix version of each trend and baseline function.
- A User-type role with only `*.get` allowed really blocks writes.
- `llama-bench` speed of 8B and 3B on the testbed with the real prompt size; whether `--jinja` is needed and whether tool
  calls are reliable (decides if extra lookups are enabled); where the GGUF files come from.
- An internal-only Docker network really blocks egress under firewalld; setup downloads work from the testbed (only DNS was
  checked); Zabbix webhooks can post to the receiver's private Docker address (the docs show no restriction, not proof).
- Official images (Zabbix, `llama-server`, Grafana) run under SELinux Enforcing with named volumes; published ports (Zabbix
  web, Grafana on 3000) reach the LAN through firewalld.
- The Grafana Zabbix plugin works with the chosen Zabbix version (no compatibility table; 8.0 appears only in changelog
  fixes). The PostgreSQL data source works with a SELECT-only role and provisioned dashboards.

## 13. Verification plan
- **Seeded faults** on the testbed: fill a disk, leak memory, burn CPU, stop a service. Pass: the problem shows in Grafana
  within the target, with lead time measured, and the analysis follows.
- **Scale:** simulated load shaped by the sizing reference in section 11 (50+ simulated hosts, lightweight agents or trapper
  items, at about 3 times the assumed NVPS) with a fault burst; check lost problems, queue depth and drain time.
- **Failure drills:** stop the model; stop the receiver; stop the analysis store. The problems view must keep working.
- **Quality:** the owner scores analyses of the seeded faults, and of past problems if supplied, for correct cause and no
  invented evidence.

## 14. Phasing (detail lives in the implementation plan)
1. Zabbix up in Docker on its own network; templates and triggers; Grafana with the Zabbix data source and problems view.
2. `llama-bench`; receiver, analysis pipeline, analysis store, and the AI-analyses table in Grafana. The MCP server only if the tool-call gate passes (section 6).
3. Scale test, failure drills, self-monitoring.
4. Packaging for the real target: compose files with the model, runtime, database and ports as config and no testbed paths,
   plus a sizing rule from the measured NVPS and token rates.

## 15. Open questions
See [decisions](../decisions/README.md). Still needed from the owner: approval of this plan, and Q1 (where the code lives)
before the implementation plan names paths. Optional: Q13 (real target hardware, GPU or not, and real per-module numbers).

## 16. Calls the agent made, for the owner to check
Detection split (D6); thin MCP server, now gated (D7, D19); the Grafana-only notification mechanism, that is the analysis store read by a
SELECT-only PostgreSQL data source (D8); the store in the existing PostgreSQL instance; dashboards provisioned from files;
Zabbix as the single alert engine and a separate read-only Grafana token (D11); SQLite for Grafana in the rehearsal; the
proposed numeric targets in section 1; the default lead time and disk thresholds; the fixed pipeline over an open agent
loop; the message-content default in section 10; the Zabbix link rule in section 8; the two-tier target rule in section 1;
the assumed sizing in section 11 (100 items per module at 60 s); `--parallel 1`; and my reading of "Use Llama even for
rehearsal" as llama.cpp `llama-server` instead of Ollama.
