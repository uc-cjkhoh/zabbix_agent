---
title: Backlog - items the 2026-11-27 review rated required
description: The fixes the full review said must be done; everything it rated not needed or not must was cut or dropped by D19
components: []
---

# Backlog — required after the full review (2026-11-27)

Source: the full review of the architecture and the codebase. The rest of that review was cut or dropped in [D19](../../decisions/d19-scope-cut-after-full-review.md). Every item here is *unverified as fixed* until its check is run. Each needs its own go before it touches the testbed.

| ID | Item | Where | Check |
|---|---|---|---|
| `agent-service-in-compose` | No service runs the loop: compose has no receiver or worker. Add one `agent` service (receiver and worker) with its own command, networks `app` and `model`, secrets from files, a healthcheck. | `deploy/compose.yaml`, Dockerfile `runtime` target (`CMD []`) | The service starts clean and an event flows to a stored analysis |
| `apply-schema` | `001_init.sql` is not mounted into postgres and nothing applies it. Add a migration step. | `deploy/postgres/migrations/` | Tables exist in a fresh database |
| `database-roles` | The analysis tables would share the Zabbix database and the `zabbix` superuser. Create an agent role (write on its tables only) and the SELECT-only Grafana role; give Grafana its datasource provisioning. | Phase 1 Task 1.2, rule 16 | Grafana role cannot write; agent role cannot touch Zabbix tables |
| `bound-expiry-query` | `store.expire_older_than` has no LIMIT and runs on every idle poll (2 s). Bound it and batch it. | `src/zbxai/store.py:150-151`, `worker.py:44` | Test with a large backlog |
| `bound-zabbix-subselects` | `selectHosts`, `selectTags`, `selectItems`, `selectParentTemplates` have no `limitSelects`. | `src/zbxai/zabbix_client.py` (`event`, `host_overview`) | Unit test of the request params |
| `report-related-truncation` | `Page.truncated` of related problems is dropped; the prompt never says the list was cut. | `src/zbxai/pipeline.py:102-105` | Prompt carries a `related_problems_truncated` flag |
| `queue-cap-grouped` | Grouped inserts skip `queue_cap`. | `src/zbxai/store.py:105-115` | Unit and integration test |
| `webhook-payload` | Unverified: the receiver is strict about ints for `severity` and `clock`, and a RESOLVED event inside the 900 s dedupe window is dropped as DUPLICATE. The webhook media type is not in the repo. | `src/zbxai/models.py:28`, `store.py:96-99` | Send the real webhook payload to the receiver |
| `doc-code-contradictions` | Model: D9 says Llama 3.1 8B, the testbed runs the 3B file. Grafana port: 3000 in the design plan, 13000 published. Context size: compose 32768 against the design. | D9, design plan, topology | One number each, same change |
| `grafana-view-guard` | The Grafana view calls `jsonb_array_elements_text` on `hypotheses[0].evidence`; a non-array value fails the whole query. | `deploy/postgres/migrations/001_init.sql:50` | A row with a bad shape does not break the view |
| `runtime-image-contents` | The runtime image installs the dev extras (pytest, ruff) and copies all of `tools/`. Install runtime dependencies only; copy `tools/zbx_provision` only if the image needs it. | `Dockerfile` | Image listing |
| `regenerate-lock` | `requirements.lock` still lists `mcp` and its dependencies. Run `scripts/lock.sh` (throwaway network, download on the testbed; needs the owner's go). | `requirements.lock`, `scripts/lock.sh` | `mcp` absent from the lock; unit tests still pass |
| `testbed-cleanup` | Stop and remove `zbxai_mcp` and `zbxai_edge`; remove the volumes `zbxai_edge_conf` and `zbxai_replay_data`, the folder `/unified/user/cj/data/replay_out`, the old `ZBXAI_EDGE_*` and `ZBXAI_ZBXWEB_BIND` keys in the testbed `.env`, and the unused secrets (`llama-api-key`, the replay token folder); apply the new compose so Zabbix web leaves `0.0.0.0`. Needs the owner's go. | [testbed](../../operations/testbed.md) | Container, volume and port lists match the compose file |
