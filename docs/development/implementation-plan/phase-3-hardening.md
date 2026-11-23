---
title: Implementation plan - Phase 3 hardening
description: Sweep, daily digest, scale test at 3 times the sizing reference, failure drills and self-monitoring
components: []
---

# Phase 3 — Hardening

Global constraints and protocol: [index](/unified/user/cj/knowledge/ai_agent/zabbix_agent/docs/development/implementation-plan/index.md). Needs Phase 2. Each task ends with a commit step (ask first, Q7).

### Task 3.1: Sweep for items with no trigger

**Files:**
- Create: `/unified/user/cj/ai_agent/zabbix_agent/src/zbxai/sweep.py`; add `untriggered_items(limit: int) -> Page[Item]` to `/unified/user/cj/ai_agent/zabbix_agent/src/zbxai/zabbix_client.py` (a `.get` call only)
- Test: `/unified/user/cj/ai_agent/zabbix_agent/tests/unit/test_sweep.py`

**Interfaces:**
- Produces: `Finding(kind: Literal["slope_change"], score: float, since: int)`;
  `detect_slope_change(points: Sequence[tuple[int, float]], *, min_points: int = 12, z: float = 3.0) -> Finding | None` (pure);
  `run_sweep(zbx: ZabbixClient, store: AnalysisStore, now: int) -> SweepReport`. A finding becomes a synthetic `ProblemEvent`
  (`event_id` `sweep:<item_id>:<now>`, severity 2, tag `source=sweep`) through the same queue, so the pipeline is unchanged.

- [ ] **Step 1: Write failing tests:** `test_flat_series_gives_none`, `test_flat_then_ramp_gives_finding`,
  `test_noisy_flat_series_not_flagged_over_20_seeds` (false-positive guard), `test_fewer_than_min_points_gives_none`,
  `test_unsorted_and_duplicate_timestamps_handled`, `test_nan_and_inf_rejected` (raises `ValueError`),
  `test_run_sweep_enqueues_through_same_queue_and_respects_cap`.
- [ ] **Step 2: Run, expecting FAIL. Step 3: Implement** with a robust slope estimate against the series' own residual spread.
  **Step 4: Run, expecting PASS.**

### Task 3.2: Daily digest

**Files:**
- Create: `build_digest` in `/unified/user/cj/ai_agent/zabbix_agent/src/zbxai/digest.py`; view `v_daily_digest` in a new migration `/unified/user/cj/ai_agent/zabbix_agent/deploy/postgres/migrations/002_digest.sql`;
  `/unified/user/cj/ai_agent/zabbix_agent/deploy/grafana/dashboards/digest.json`
- Test: `/unified/user/cj/ai_agent/zabbix_agent/tests/unit/test_digest.py`, `/unified/user/cj/ai_agent/zabbix_agent/tests/integration/test_store.py` (extend)

**Interfaces:**
- Produces: `AnalysisRow(event_id: str, host: str, severity: int, created_at: datetime, has_analysis: bool)`;
  `build_digest(rows: Sequence[AnalysisRow], day: date) -> DigestSummary(top_hosts: list[tuple[str, int]],
  counts_by_severity: dict[int, int], no_analysis_count: int)`; the view is SELECT-able by `zbxai_grafana_ro` without changing its grants.

- [ ] **Step 1: Write failing tests:** `test_digest_counts_by_severity`, `test_digest_top_hosts_ordered_and_capped_at_10`,
  `test_digest_day_boundary_is_utc`, `test_view_selectable_by_grafana_ro`.
- [ ] **Step 2: Run, expecting FAIL. Step 3: Implement. Step 4: Run, expecting PASS.**

### Task 3.3: Scale test

**Files:**
- Create: `/unified/user/cj/ai_agent/zabbix_agent/tools/scale/{evaluate.py,run_scale.sh}`
- Test: `/unified/user/cj/ai_agent/zabbix_agent/tests/unit/test_scale_evaluate.py`

**Interfaces:**
- Produces: `ScaleResult(received: int, accepted: int, duplicate: int, dropped: int, zabbix_problems: int, nvps_planned: float,
  nvps_achieved: float, peak_queue: int, queue_cap: int, drain_s: float)`; `evaluate_scale(r: ScaleResult) -> ScaleVerdict(passed: bool,
  failures: list[str])`. Pass requires: `received == accepted + duplicate + dropped`; no problem lost (every Zabbix problem was received
  or counted as dropped); `nvps_achieved >= 0.95 * nvps_planned`; `peak_queue <= queue_cap`; `drain_s <= 900`.

- [ ] **Step 1: Write failing tests:** `test_unaccounted_events_fail`, `test_slow_drain_fails` (901 s), `test_underdelivered_load_fails`,
  `test_peak_over_cap_fails`, `test_clean_run_passes`.
- [ ] **Step 2: Run, expecting FAIL. Step 3: Implement. Step 4: Run, expecting PASS.**
- [ ] **Step 5: [TESTBED] Run the scale test:** 50 simulated hosts, 100 items each, at the 3-times rate (250 NVPS) for 30 minutes, with a burst
  of 200 problems inside 60 s. Collect the numbers from the receiver's `/healthz`, the Zabbix API and Grafana. Record the result and the
  RAM, CPU and disk use in `/unified/user/cj/knowledge/ai_agent/zabbix_agent/docs/operations/benchmarks.md`. Expected: `evaluate_scale` passes. If it fails on drain time, report it and tune grouping or
  expiry; do not raise the target silently.

### Task 3.4: Failure drills

**Files:**
- Create: `/unified/user/cj/ai_agent/zabbix_agent/tools/drills/{evaluate.py,drill.sh}`
- Test: `/unified/user/cj/ai_agent/zabbix_agent/tests/unit/test_drill_evaluate.py`

**Interfaces:**
- Produces: `Observation(problems_view_ok: bool, receiver_status: int | None, analysis_stored: bool, self_monitor_problem: bool)`;
  `evaluate_drill(target: Literal["model","receiver","store"], obs: Observation) -> DrillVerdict(passed: bool, failures: list[str])`.
  Pass for every target: `problems_view_ok` is true. Model down: no analysis stored, receiver still 202. Receiver down: no events accepted,
  self-monitor problem raised. Store down: receiver answers 503, self-monitor problem raised.

- [ ] **Step 1: Write failing tests:** `test_problems_view_down_fails_every_target`, `test_model_drill_expects_202_and_no_analysis`,
  `test_store_drill_expects_503`, `test_receiver_drill_expects_self_monitor_problem`.
- [ ] **Step 2: Run, expecting FAIL. Step 3: Implement. Step 4: Run, expecting PASS.**
- [ ] **Step 5: [TESTBED] Run each drill:** `/unified/user/cj/ai_agent/zabbix_agent/tools/drills/drill.sh model`, `/unified/user/cj/ai_agent/zabbix_agent/tools/drills/drill.sh receiver`, `/unified/user/cj/ai_agent/zabbix_agent/tools/drills/drill.sh store` (stop one `zbxai_` container, seed a fault,
  observe, restart). Expected: all three pass. Never stop a container without the prefix.

### Task 3.5: Self-monitoring

**Files:**
- Create: `build_health_template` in `/unified/user/cj/ai_agent/zabbix_agent/tools/zbx_provision/spec.py`; `/unified/user/cj/ai_agent/zabbix_agent/tools/health/disk_reporter.py`; add service `disk_reporter` (`python -m tools.health.disk_reporter`; `statvfs("/")` inside the container reads its overlay root, which the survey shows is the host's single `/` filesystem, so no bind mount is needed; *unverified*) and attach `zabbix-server` to `${ZBXAI_PREFIX}_model` in `/unified/user/cj/ai_agent/zabbix_agent/deploy/compose.yaml`
- Test: `/unified/user/cj/ai_agent/zabbix_agent/tests/unit/test_health_template.py`

**Interfaces:**
- Produces: `build_health_template(cfg: ProvisionConfig) -> TemplateSpec` named `ZBXAI Stack health`: HTTP-agent items for the receiver
  `/healthz` (queue depth, oldest age, dropped total, `llama_ok`, `zabbix_ok`), Grafana `/api/health` and `llama-server` `/health`; triggers:
  oldest age above 300 s (Warning), dropped total increasing (High), `llama_ok` false (High), Grafana unhealthy (High), no data for 5 minutes (High).
  `disk_pct(total_blocks: int, free_blocks: int) -> float` in `/unified/user/cj/ai_agent/zabbix_agent/tools/health/disk_reporter.py`: a prefixed container reads the underlying root filesystem with `statvfs` and
  sends it as `vfs.fs.size[/,pused]` for host `zbxai-testbed`, so the same 80%, 90% and forecast triggers watch the testbed's own disk (no host agent).

- [ ] **Step 1: Write failing tests:** `test_template_has_all_five_triggers`, `test_thresholds_come_from_config`, `test_apply_is_idempotent`,
  `test_disk_pct` (`disk_pct(100, 20) == 80.0`; zero total raises `ValueError`).
- [ ] **Step 2: Run, expecting FAIL. Step 3: Implement. Step 4: Run, expecting PASS.**
- [ ] **Step 5: [TESTBED] Prove it:** stop `llama`; Expected: a Zabbix problem for the model appears in Grafana's problems view within 30 s of
  Zabbix raising it. Restart it. Note the limit from the design: if Grafana itself is down, only Zabbix web shows the problem.
