---
title: Implementation plan - Phase 1 platform
description: Compose and scripts, PostgreSQL and Zabbix, Zabbix content as code, Grafana problems view, load and fault tools
components: []
---

# Phase 1 — Platform (the commitment tier ships here, with no agent code)

Global constraints and protocol: [index](/unified/user/cj/knowledge/ai_agent/zabbix_agent/docs/development/implementation-plan/index.md). Acceptance for the phase: Task 1.5 step 5.

### Task 1.1: Compose skeleton, ship and deploy scripts

**Files:**
- Create: `/unified/user/cj/ai_agent/zabbix_agent/deploy/compose.yaml`, `/unified/user/cj/ai_agent/zabbix_agent/deploy/compose.test.yaml`, `/unified/user/cj/ai_agent/zabbix_agent/Dockerfile.test`, `/unified/user/cj/ai_agent/zabbix_agent/scripts/ship-test.sh`, `/unified/user/cj/ai_agent/zabbix_agent/scripts/deploy.sh`,
  `/unified/user/cj/ai_agent/zabbix_agent/scripts/teardown.sh`
- Test: `/unified/user/cj/ai_agent/zabbix_agent/tests/unit/test_smoke.py`, `/unified/user/cj/ai_agent/zabbix_agent/tests/unit/test_compose_naming.py`

**Interfaces:**
- Consumes: `/unified/user/cj/ai_agent/zabbix_agent/deploy/.env` keys and `/unified/user/cj/ai_agent/zabbix_agent/deploy/versions.env` from Phase 0.
- Produces: networks `${ZBXAI_PREFIX}_front` (the only one that is not `internal`), `_app` and `_model` (both `internal: true`), plus the
  transient `_test` (internal) and `_setup`; named volumes
  `${ZBXAI_PREFIX}_pgdata`, `_models`, `_grafana`; `/unified/user/cj/ai_agent/zabbix_agent/scripts/ship-test.sh [--live] [pytest-args...]` (tar, taken from `/unified/user/cj/ai_agent/zabbix_agent` with `-C`, of `src tests tools pyproject.toml`; any absolute path argument under `/unified/user/cj/ai_agent/zabbix_agent` is rewritten to the matching path inside the container, and a path outside it is refused; the script derives the repo root from its own location, not from a hard-coded prefix
  over ssh into a `--rm` container from the test image, joined to the internal test network with a `pgtest` PostgreSQL; `--live` joins `${ZBXAI_PREFIX}_app` instead, to reach the running stack);
  `/unified/user/cj/ai_agent/zabbix_agent/scripts/deploy.sh up|down|status` (`up` first runs `check_env` with the live subnets from `docker network ls`); `/unified/user/cj/ai_agent/zabbix_agent/scripts/teardown.sh` removes only resources whose names start with the prefix.

- [ ] **Step 1: Write failing tests.** `/unified/user/cj/ai_agent/zabbix_agent/tests/unit/test_smoke.py::test_runs_in_container` (asserts `/.dockerenv` exists, so a host run fails);
  `/unified/user/cj/ai_agent/zabbix_agent/tests/unit/test_compose_naming.py::test_every_resource_is_prefixed` (parses both compose files: every network, volume and
  `container_name` starts with `${ZBXAI_PREFIX}`), and, all in `/unified/user/cj/ai_agent/zabbix_agent/tests/unit/test_compose_naming.py`, `::test_only_front_network_is_not_internal`, `::test_zabbix_web_binds_loopback_by_default`, `::test_no_ports_published_except_web_and_grafana`.
- [ ] **Step 2: Write the compose files** to satisfy the tests. SELinux: named volumes only. Secrets as compose `secrets:` from
  files in a git-ignored `/unified/user/cj/ai_agent/zabbix_agent/deploy/secrets/`, created on the testbed by `/unified/user/cj/ai_agent/zabbix_agent/scripts/deploy.sh` with random values and never echoed; if
  SELinux blocks reading them, fall back to a `0600` env file and record it in D2.
- [ ] **Step 3: [TESTBED] Build the test image once** (`/unified/user/cj/ai_agent/zabbix_agent/Dockerfile.test`: `python:3.12-slim` at the pinned digest plus the
  dependencies from `/unified/user/cj/ai_agent/zabbix_agent/pyproject.toml`). Expected: image builds; its size is recorded for the disk budget.
- [ ] **Step 4: [TESTBED] Run** `/unified/user/cj/ai_agent/zabbix_agent/scripts/ship-test.sh /unified/user/cj/ai_agent/zabbix_agent/tests/unit`. Expected: all pass inside a container; no files left on the
  testbed filesystem (`ls` of the grant directory is unchanged).
- [ ] **Step 5: [TESTBED] Bring networks up and down:** `/unified/user/cj/ai_agent/zabbix_agent/scripts/deploy.sh up` then `docker network ls --filter name=zbxai`.
  Expected: front, app and model networks with the topology subnets; `/unified/user/cj/ai_agent/zabbix_agent/scripts/teardown.sh` leaves the ClickHouse resources untouched.
- [ ] **Step 6: Commit** (ask first, Q7).

### Task 1.2: PostgreSQL, Zabbix server and web, database roles

**Files:**
- Create: `/unified/user/cj/ai_agent/zabbix_agent/deploy/postgres/init/10-roles.sql`; add services `postgres`, `zabbix-server`, `zabbix-web` to `/unified/user/cj/ai_agent/zabbix_agent/deploy/compose.yaml`
- Test: `/unified/user/cj/ai_agent/zabbix_agent/tests/integration/test_roles.py`

**Interfaces:**
- Produces: database `zbxai_agent`; roles `zbxai_agent_rw` (owner, read-write) and `zbxai_grafana_ro` (`CONNECT` on `zbxai_agent`
  only, `USAGE` on schema `public`, `SELECT` on all tables and, through `ALTER DEFAULT PRIVILEGES`, on future ones;
  `CONNECT` on the Zabbix database revoked from `PUBLIC`).

- [ ] **Step 1: Write failing tests** against the test PostgreSQL: `test_grafana_ro_can_select_new_tables` (create a table as
  `zbxai_agent_rw`, then `SELECT` as `zbxai_grafana_ro` succeeds), `test_grafana_ro_cannot_write` (`INSERT`, `UPDATE`,
  `DELETE`, `CREATE TABLE`, `DROP` each raise `InsufficientPrivilege`), `test_grafana_ro_cannot_connect_to_zabbix_db`,
  `test_grafana_ro_cannot_read_pg_authid`.
- [ ] **Step 2: Run** `/unified/user/cj/ai_agent/zabbix_agent/scripts/ship-test.sh /unified/user/cj/ai_agent/zabbix_agent/tests/integration/test_roles.py` **[TESTBED]**. Expected: FAIL (roles absent).
- [ ] **Step 3: Write `/unified/user/cj/ai_agent/zabbix_agent/deploy/postgres/init/10-roles.sql`** (idempotent; passwords from secrets, not literals) and the three services with the
  official Zabbix 8.0 images, on the app network.
- [ ] **Step 4: Re-run the tests.** Expected: all pass.
- [ ] **Step 5: [TESTBED] Start the stack and change the default Zabbix `Admin` password** through the API at first start; the
  new value goes only to the secret store. Expected: `curl` of the web login page from inside the app network returns 200.
- [ ] **Step 6: Commit** (ask first, Q7).

### Task 1.3: Zabbix content as code

**Files:**
- Create: `/unified/user/cj/ai_agent/zabbix_agent/tools/zbx_provision/{__init__,client,spec,apply}.py`
- Test: `/unified/user/cj/ai_agent/zabbix_agent/tests/unit/test_zbx_spec.py`, `/unified/user/cj/ai_agent/zabbix_agent/tests/unit/test_zbx_apply.py`, `/unified/user/cj/ai_agent/zabbix_agent/tests/integration/test_zbx_live.py`

**Interfaces:**
- Produces: `ProvisionConfig(receiver_url: str, lead_time_s: int = 3600, warn_pct: int = 80, high_pct: int = 90, item_type: Literal["trapper","agent"] = "trapper")`
  (`receiver_url` is required and comes from the topology values, never a default); `TemplateSpec`, `RoleSpec`, `ApplyReport` are small dataclasses;
  `build_template(cfg: ProvisionConfig) -> TemplateSpec`; `build_roles() -> list[RoleSpec]`;
  `ZabbixAdminClient(base_url, user, password).call(method: str, params: dict) -> dict`;
  `apply(client, template: TemplateSpec, roles: list[RoleSpec]) -> ApplyReport` (idempotent: a second run reports zero changes).
  Template `ZBXAI Linux resources`, items keyed `vfs.fs.size[/,pused]`, `system.cpu.util`, `agent.ping`; triggers: disk above 80% (Warning),
  above 90% (High), `timeleft(/ZBXAI Linux resources/vfs.fs.size[/,pused],1d,100)<1h` (Average), `nodata(...agent.ping,5m)=1` (High),
  and a baseline anomaly trigger on `system.cpu.util` built from `baselinedev` or `trendstl`.
  Role: type User, API access on, mode allow-list, methods `["*.get"]`. Users `zbxai_agent` and `zbxai_grafana`, each with its own token.

- [ ] **Step 1: Write failing tests.** `test_disk_trigger_expressions_use_config_thresholds` (80 and 90 appear verbatim),
  `test_forecast_trigger_uses_lead_time` (`<1h` for 3600 s, `<2h` for 7200), `test_trapper_vs_agent_item_type`,
  `test_apply_is_idempotent` (fake client: second `apply` makes no create calls), `test_role_allows_only_get_methods`.
- [ ] **Step 2: Run, expecting FAIL** (`/unified/user/cj/ai_agent/zabbix_agent/scripts/ship-test.sh /unified/user/cj/ai_agent/zabbix_agent/tests/unit`). **Step 3: Implement** the pure builders and `apply` (look up by
  name before create).
- [ ] **Step 4: Run, expecting PASS.**
- [ ] **Step 5: [TESTBED] Function availability (verification item `function-availability`):** run `apply` against the live Zabbix.
  Expected: every `trigger.create` succeeds with no "unknown function" error. Record the first version that has each function and
  delete the backlog entry. If a baseline function is rejected, keep the others and record it in D6.
- [ ] **Step 6: [TESTBED] Read-only role (verification item `readonly-role-test`):** `/unified/user/cj/ai_agent/zabbix_agent/scripts/ship-test.sh --live /unified/user/cj/ai_agent/zabbix_agent/tests/integration/test_zbx_live.py::test_agent_token_reads_but_cannot_write`
  calls `host.get` (succeeds) and `host.create`, `trigger.delete`, `user.update` with the agent token (each refused). Delete the
  backlog entry on pass.
- [ ] **Step 7: Commit** (ask first, Q7).

### Task 1.4: Grafana with the Zabbix data source and problems view

**Files:**
- Create: `/unified/user/cj/ai_agent/zabbix_agent/deploy/grafana/Dockerfile`, `/unified/user/cj/ai_agent/zabbix_agent/deploy/grafana/provisioning/datasources/{zabbix,analyses}.yaml`,
  `/unified/user/cj/ai_agent/zabbix_agent/deploy/grafana/provisioning/dashboards/provider.yaml`, `/unified/user/cj/ai_agent/zabbix_agent/deploy/grafana/dashboards/{problems,trends}.json`
- Test: `/unified/user/cj/ai_agent/zabbix_agent/tests/unit/test_grafana_provisioning.py`

**Interfaces:**
- Produces: data source uids `zbxai-zabbix` and `zbxai-analyses`; dashboards `problems` and `trends`, both `"refresh": "30s"`.
  The `/unified/user/cj/ai_agent/zabbix_agent/deploy/grafana/Dockerfile` starts from `grafana/grafana:${GRAFANA_TAG}` and runs `grafana cli plugins install alexanderzobnin-zabbix-app ${PLUGIN_VERSION}`
  at build time, so no run-time download is needed.

- [ ] **Step 1: Write failing tests:** `test_dashboards_refresh_is_30s`, `test_no_alert_rules_provisioned` (no `alerting` directory, no
  `rules` key), `test_no_html_rendering_in_panels` (no text panel in `html` mode, no table cell display mode `html`),
  `test_datasource_credentials_come_from_env` (no literal token or password), `test_both_datasources_are_read_only_roles`
  (the analyses source user is `zbxai_grafana_ro`).
- [ ] **Step 2: Run, expecting FAIL. Step 3: Write** the provisioning files and dashboards (problems view panel from the plugin,
  trend panels for the template items). **Step 4: Run, expecting PASS.**
- [ ] **Step 5: [TESTBED] Build and start Grafana;** change the default admin password at first start.
- [ ] **Step 6: [TESTBED] Ports and SELinux (verification item `selinux-and-ports`):** from the workstation,
  `curl -fsS http://${ZBXAI_GRAFANA_BIND}:${ZBXAI_GRAFANA_PORT}/api/health` returns 200, and through an ssh tunnel (no firewall change) Zabbix web
  on its loopback port returns 200. Grafana and Zabbix web sit on both `front` and `app`: confirm published ports work on these dual-attached
  containers (if not, find how this Docker version picks the gateway network; do not assume). Record whether firewalld filters Docker-published
  ports at all; the Zabbix and Grafana containers run with named volumes under SELinux Enforcing (the
  `llama-server` check is in Task 2.5). If firewalld blocks a port, stop and ask the owner;
  do not change the firewall. The backlog entry is deleted only after Task 2.5 step 5 also passes.
- [ ] **Step 7: [TESTBED] Plugin compatibility (verification item `grafana-plugin-compat`):** the Zabbix data source health check
  returns OK using the Grafana token, a seeded problem appears in the problems panel, and the panel's acknowledge action is
  refused by the read-only token. Delete the backlog entry on pass.
- [ ] **Step 8: [TESTBED] Disk budget (verification item `disk-budget`):** record `docker system df` and `df -h /`; set Zabbix
  history and trend retention so the 3-times load fits in the free space with 30% margin. Delete the backlog entry.
- [ ] **Step 9: Commit** (ask first, Q7).

### Task 1.5: Simulated load and seeded faults

**Files:**
- Create: `/unified/user/cj/ai_agent/zabbix_agent/tools/loadgen/{packet,plan,run}.py`, `/unified/user/cj/ai_agent/zabbix_agent/tools/faults/{reporter.py,disk_fill.sh,cpu_burn.sh,mem_leak.sh,stop_service.sh}`
- Test: `/unified/user/cj/ai_agent/zabbix_agent/tests/unit/test_loadgen.py`

**Interfaces:**
- Produces: `rate_plan(modules: int, items_per_module: int, interval_s: int, factor: float) -> RatePlan(nvps: float)`;
  `SenderItem(host: str, key: str, value: str, clock: int)`; `build_sender_packet(items: Sequence[SenderItem]) -> bytes` (the Zabbix trapper wire format: `ZBXD\x01`, little-endian 8-byte
  length, JSON body `{"request":"sender data","data":[...]}`). Faults run only inside `zbxai_fault_*` containers with a size
  or memory limit; `/unified/user/cj/ai_agent/zabbix_agent/tools/faults/reporter.py` measures the container's real state and sends it as trapper items for host `zbxai-sim-001`.

- [ ] **Step 1: Write failing tests:** `test_rate_plan_matches_sizing_reference` (`rate_plan(50, 100, 60, 3).nvps == 250.0`),
  `test_rate_plan_base_is_83_nvps` (`round(rate_plan(50,100,60,1).nvps) == 83`), `test_packet_header_and_length`,
  `test_packet_body_is_valid_json_with_request_sender_data`.
- [ ] **Step 2: Run, expecting FAIL. Step 3: Implement** both functions; `/unified/user/cj/ai_agent/zabbix_agent/tools/loadgen/run.py` sends at the planned rate with no more than
  one connection per host. **Step 4: Run, expecting PASS.**
- [ ] **Step 5: Phase 1 acceptance [TESTBED]:** start `/unified/user/cj/ai_agent/zabbix_agent/tools/faults/disk_fill.sh` in its container, with Zabbix and Grafana only (no agent
  code). Expected: the "disk full within 1h" problem appears in Grafana's problems view within 30 s of Zabbix raising it
  (event clock from the Zabbix API versus the Grafana query time, difference at most 30 s). Record the lead time between the
  forecast problem and the 90% threshold. This is the shippable commitment tier.
- [ ] **Step 6: Commit** (ask first, Q7).
