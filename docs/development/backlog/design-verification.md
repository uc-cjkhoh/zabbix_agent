---
title: Backlog - design verification
description: Checks that must pass before the design plan is relied on
components: []
---

# Design verification

Each item gates part of the [design plan](../../architecture/design-plan.md). Testbed items need the user's go-ahead; none
changes the host beyond this project's own containers.

- **gguf-sourcing** (high; small) - partly done: the 3.2 3B file is sourced, pinned and verified (2026-11-23, see
  [testbed](../../operations/testbed.md)). Open: the Llama 3.1 8B GGUF source, checksum and licence acceptance, downloaded at
  setup only ([D9](../../decisions/d9-model-and-runtime.md)). Needs: the owner to name the 8B source, and the go-ahead to download about 5 GB.
- **model-benchmark** (high; small) - open: `llama-bench` for 8B and 3B on the testbed with the real prompt size; the
  server's own response timings as a check. Needs: the model files.
- **llama-server-checks** (medium; small) - open: whether `--jinja` is needed, whether tool calls are reliable, whether
  `tool_choice` and `json_schema` work on `/v1`; if not, extra model-driven lookups stay off. Needs: the model running.
- **receiver-reachability** (high; trivial) - open: a Zabbix webhook can post to the receiver's private Docker address (the
  docs show no restriction, which is not proof). Needs: running Zabbix and receiver.
- **internal-network-egress** (high; trivial) - partly done: `zbxai_model` (2026-11-23) and `zbxai_app` (2026-11-24) both block egress (a public address and the LAN gateway are unreachable). Open: the same check from the running worker and MCP containers once they exist ([D12](../../decisions/d12-operational-data-stays-in-network.md)).
- **selinux-and-ports** (high; small) - partly done: `llama-server` reads the model from a named volume under SELinux Enforcing,
  as a non-root user with a read-only root filesystem (2026-11-23). A port published by a container on two networks (`zbxai_edge`, 18081) was
reached from the workstation across the LAN with firewalld active (2026-11-23); this covers the mechanism, not Grafana's or Zabbix web's ports. Zabbix web (18080) and Grafana (13000), each on `front` and `app`, were reached from the workstation across the LAN with firewalld active, and the official Zabbix and Grafana images ran with named volumes (2026-11-24). Open: firewalld's rules and the other hosts' view are still unreadable here, so this tells us the mechanism works, not that the firewall is configured as the owner expects ([testbed](../../operations/testbed.md)).
- **pg-datasource-readonly** (high; small) - open: Grafana's PostgreSQL data source with a SELECT-only role shows the
  analyses, cannot write, and cannot read other databases; dashboards and data sources provision from files
  ([D8](../../decisions/d8-grafana-only-notification.md)). Needs: running PostgreSQL and Grafana.
- **grafana-plugin-compat** (high; small) - open: the Zabbix plugin (v6.11.0) against the chosen Zabbix version, using an API
  token on the read-only role ([D11](../../decisions/d11-grafana-monitoring-ui.md)). Needs: a running Zabbix and Grafana.
- **disk-budget** (medium; small) - open: history and trend retention sized against 40 GB shared with the model and images.
- **compose-remote-and-secrets** (high; small) - open: with Compose 5.6 and Engine 29 under SELinux Enforcing, a compose run
  against a remote daemon works with no host path; a named volume of secrets with per-service `subpath` mounts is readable by each
  official image's non-root user and not by the others ([D2](../../decisions/d2-docker-isolation.md)). Needs: the testbed and the go-ahead.
- **grafana-plugin-install-path** (medium; trivial) - open: the Zabbix app plugin installed outside the Grafana volume loads
  through `GF_PATHS_PLUGINS`, is enabled by provisioning (or needs a manual step, which would break reproducibility), and a rebuilt image
  replaces it. Needs: a running Grafana.
- **llama-bench-image** (medium; trivial) - answered: the pinned `server` image has no `llama-bench` binary (only its libraries; checked
  2026-11-23). Open: pin the `full` image (tag and digest) in `deploy/versions.env` for the benchmark. Needs: the go-ahead to pull it.
- **cold-reproduction** (high; medium) - open: from nothing but Docker, the repo and a filled `.env`, `deploy.sh up` reaches the Phase 1
  acceptance with no manual step, and a second `up` changes nothing; repeated on a second clean host. Needs: the testbed, later a second host.
- **official-mcp-checks** (high; small) - open: for the interim official `zabbix-mcp-server` ([D17](../../decisions/d17-official-zabbix-mcp-server-as-interim.md)) with a read-only token: the names of the 4 exposed tools, an authenticated call works, a write call is refused by both the deny list and the Zabbix role, `limit`, `MaxResponseSize` and `Timeout` truncate as documented, and nothing but the Zabbix web address is called (egress is blocked on `app`, so a failure would show in its log). Needs: the read-only role and token (owner's sign-off, rule 6).
- **pipeline-real-model** (high; small) - open: how often the 3B model returns valid JSON whose evidence ids all exist in the context is unknown; `pipeline.py` was tested only with fake answers. Needs: llama running and a handful of real events.
- **real-zabbix-provisioning** (high; small) - open: Task 1.3 was built and run only on a throwaway Zabbix 8.0.0 (the same pinned image digests, deleted after each run). Nothing has been applied to the real `zbxai_zabbix_web`: no template, role, users or tokens exist there, so the real read-only tokens, the `function-availability` and `readonly-role-test` results and the `zabbix-api-shapes` result are shown on the throwaway only. Needs: the owner's sign-off for the writes listed in the Task 1.3 status line (golden rule 6).
- **zabbix-api-tags-and-trends** (low; trivial) - open: `zabbix_client.py` parsing of event tags (`event.get` `tags`) and of `trend.get` rows (`value_min`, `value_avg`, `value_max`) was never seen with real data: the throwaway's event had no tags and no trends existed yet. Needs: an event with tags (a tagged trigger) and an hour of history on a throwaway.
- **replay-page-browser-check** (low; trivial) - open: the monitor page (`http://<testbed>:18090`) was only served and tested through its API and HTML, not rendered in a browser. Needs: someone to open it during a run.
- **replay-agent-reads-raw-log** (medium; small) - open: the official MCP server denies `history_get` and `item_get` ([D17](../../decisions/d17-official-zabbix-mcp-server-as-interim.md)), so the agent sees only triggers, problems and events from the replay (the problem name carries one sample log line). Needs: the owner's decision whether the agent should read raw log values through MCP.
- **replay-outage-run** (medium; small) - open: the outage run (`replay.sh run … --outage S:E`, the Zabbix sink fails for a window while the file keeps writing, for the agent's fallback test) is built and unit-tested but has not been run against the real Zabbix. Needs: the owner's word to run it.
