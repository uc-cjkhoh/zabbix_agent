---
title: D19 Scope cut after the full review
description: Owner decision to remove everything the full review of 2026-11-27 rated "not needed" or "not must", keeping the architecture clean and direct
components: []
---

# D19 — Scope cut after the full review

**Status:** owner decision (2026-11-27): after a full review of the architecture and codebase, "remove all `not must` and `not needed` components for good". Answers given in the session: remove only the interim MCP server and keep D7 as a gated future decision; tear down the replay objects on the real Zabbix first, then delete the code; checkpoint-commit both repos before the cut.

**Decision:** the product is Zabbix, one agent service (receiver and worker, one bounded Zabbix client, one model call), llama.cpp on an internal network, the analysis store in the existing PostgreSQL, and a read-only Grafana. Nothing else is built or kept.

**Withdrawn (code, config and decision text removed; git history keeps them):**
- [D15] the authenticated llama proxy on `0.0.0.0:18081` (service `edge`, `deploy/edge/`, `edge-init.sh`, `check-edge.sh`, volume `zbxai_edge_conf`). Llama is reachable only on the internal `model` network.
- [D17] the official `zabbix-mcp-server` (service `mcp`, `zbxai_mcp`, `MCP_TAG`, `MCP_DIGEST`) and the unused `mcp` Python dependency.
- [D18] the log replay rig: `tools/log_replay/`, `tools/zbx_replay_provision/`, `scripts/replay.sh`, `tools/bench/llm_probe.py`, their tests, the design and plan documents, and the llm probe plan.
- The statistical sweep and the daily risk digest (implementation plan Tasks 3.1 and 3.2). They contradict [D6](d6-detection-split.md): detection stays inside Zabbix.
- `docs/development/llm-agent-proposal.md`: it repeated and contradicted the design plan.
- Dead code: the `model_lookups` branch and the `enable_model_lookups` setting, `Context.similar`, the trend branch of `series()` (it takes no `kind` now), the no-host branch of `problems()`, and the unused `value_min` and `value_max` fields.

**Amended:**
- [D16](d16-zabbix-web-and-grafana-on-lan-with-shared-login.md): Zabbix web is published on host loopback only (`127.0.0.1`, reach it through an ssh tunnel); Grafana stays on the LAN with the shared development login; the llama web UI login is gone with the proxy.
- [D7](d7-thin-readonly-mcp-server.md): stays as a decision, now gated: model tool calls are unproven and off, nothing runs an MCP server, and Task 2.4 is built only if the 9 of 10 benchmark in the implementation plan passes.
- The agent runs as one service. The receiver and the worker stay separate modules in `src/zbxai/`; compose gets one `agent` service when Phase 2b builds it. The container name `zbxai_agent` and the receiver URL `http://zbxai_agent:8000/v1/events` in the topology are a proposal for Phase 2b, not a decision (the port is the receiver's own `PORT = 8000` in `receiver.py`; the test fixtures still use `zbxai_receiver` as sample data).
- The KB check is no longer a definition-of-done requirement (the hook was never wired; Q6 closed).

**Dropped from scope ("not must"):** not planned, not tracked. Each can come back only as a new decision.
- Queue index changes, an `mcp` healthcheck (gone with `mcp`), per-service resource limits, the grafana `depends_on` change, `:?` guards on subnets, `read_only` on more services, TLS and rate limits on a proxy that no longer exists.
- Schema hygiene: row constraints, a retention policy, an `events.clock` index.
- Stuck-event requeue, a connection pool, split connect and read timeouts for the llama client, the worker heartbeat path, error-text redaction in the provisioning client.
- Secrets or DSN in argv in `test-store.sh` and `ship-test.sh`, the `eval` in a script (gone with `replay.sh`), pinning `pip-tools` in `lock.sh`.
- Extra unit and entry-point tests, merging the copied shell helpers, one shared module for the three secret readers.
- Verifying that the internal `app` network does not block Zabbix polling.

**Still required (not decided here, tracked in the [backlog](../development/backlog/review-required.md)):** the missing agent service in compose, applying the schema, the SELECT-only Grafana role and a separate database role for the agent, rule 8 bounds in `store.py` and the Zabbix client, the doc and code contradictions, the Grafana view's `jsonb` guard, the runtime image shipping dev packages, and the unverified webhook payload (strict ints, dedupe versus RESOLVED).

**Live state after the cut (2026-11-27):**
- Done on the real Zabbix: the replay objects were removed with `provision teardown` under the owner's sign-off (token, user, user group, role, trigger, two items, host, host group; nothing kept).
- Done on the testbed (the owner's go, 2026-11-27, observed): the containers `zbxai_replay` (it was running, idle, with `0.0.0.0:18090` published, not stopped as the KB had it), `zbxai_edge` and `zbxai_mcp`, the volumes `zbxai_edge_conf` and `zbxai_replay_data`, the three images they used, the folder `/unified/user/cj/data/replay_out`, the secrets `llama-api-key` and `replay/`, the testbed copies of the edge files and scripts, and the three old `.env` keys were removed, all by exact name. The testbed's `zbxai-stack.sh` no longer starts `edge` and `mcp`. The new compose files were copied over (the old ones matched the pre-cut commit), `docker compose config -q` passed on the testbed, and `up -d --no-deps zabbix-web` recreated only that container: it is on `127.0.0.1:18080` now, healthy, and `18080`, `18081` and `18090` refuse connections from the LAN. llama, postgres and the Zabbix server were not restarted, and Grafana is still stopped. Details in the [testbed doc](../operations/testbed.md).
- Not done: `requirements.lock` still lists `mcp` and its dependencies (backlog `regenerate-lock`; `scripts/lock.sh` needs a throwaway network and a download on the testbed). It is not a leftover, so it was not part of the cleanup.
