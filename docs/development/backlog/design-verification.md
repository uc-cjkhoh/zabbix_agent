---
title: Backlog - design verification
description: Checks that must pass before the design plan is relied on
components: []
---

# Design verification

Each item gates part of the [design plan](../../architecture/design-plan.md). Testbed items need the user's go-ahead; none
changes the host beyond this project's own containers.

- **zabbix-image-tags** (high; trivial) - open: confirm 8.0 LTS release and official image tags on the registry; fall back
  to 7.0 if absent ([D10](../../decisions/d10-zabbix-version-and-database.md)). Needs: nothing on the testbed.
- **function-availability** (high; small) - open: minimum Zabbix version of `forecast`, `timeleft`, `baselinewma`,
  `baselinedev`, `trendstl`. Needs: the chosen version's docs, then a test trigger.
- **readonly-role-test** (high; small) - open: show that a User-type role with only `*.get` allowed cannot write
  ([D7](../../decisions/d7-thin-readonly-mcp-server.md)). Needs: a running Zabbix.
- **gguf-sourcing** (high; small) - open: where the Llama 3.1 8B and 3.2 3B GGUF files come from, their
  checksums, and the Llama licence acceptance, downloaded at setup only ([D9](../../decisions/d9-model-and-runtime.md)).
  Needs: the owner to accept the licence, and the go-ahead to download about 5 GB of the 40 GB free.
- **model-benchmark** (high; small) - open: `llama-bench` for 8B and 3B on the testbed with the real prompt size; the
  server's own response timings as a check. Needs: the model files.
- **llama-server-checks** (medium; small) - open: whether `--jinja` is needed, whether tool calls are reliable, whether
  `tool_choice` and `json_schema` work on `/v1`; if not, extra model-driven lookups stay off. Needs: the model running.
- **receiver-reachability** (high; trivial) - open: a Zabbix webhook can post to the receiver's private Docker address (the
  docs show no restriction, which is not proof). Needs: running Zabbix and receiver.
- **internal-network-egress** (high; trivial) - open: an internal-only Docker network really blocks egress under firewalld, so
  the model runtime cannot reach out ([D12](../../decisions/d12-operational-data-stays-in-network.md)). Needs: containers running.
- **selinux-and-ports** (high; small) - open: official images (Zabbix, `llama-server`, Grafana) with named volumes under SELinux
  Enforcing; whether Zabbix web and Grafana on 3000 reach the LAN through firewalld. Grafana is the only notification path,
  so this gates the project. Testable from the workstation on the same LAN once containers run; a privileged session or the
  user's help may be needed ([testbed](../../operations/testbed.md)).
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
- **llama-bench-image** (medium; trivial) - open: whether the `llama.cpp` server image contains `llama-bench`; if not, a second image is
  pinned for the benchmark. Needs: the pinned image pulled.
- **cold-reproduction** (high; medium) - open: from nothing but Docker, the repo and a filled `.env`, `deploy.sh up` reaches the Phase 1
  acceptance with no manual step, and a second `up` changes nothing; repeated on a second clean host. Needs: the testbed, later a second host.
