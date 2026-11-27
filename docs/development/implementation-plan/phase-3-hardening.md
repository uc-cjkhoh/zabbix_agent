---
title: Implementation plan - Phase 3 hardening
description: Scale test at 3 times the sizing reference, failure drills and self-monitoring
components: []
---

# Phase 3 — Hardening

Global constraints and protocol: [index](/unified/user/cj/ai_agent/zabbix_agent/kb/docs/development/implementation-plan/index.md). Needs Phase 2. Each task ends with a commit step (ask first, Q7).

Tasks 3.1 (sweep) and 3.2 (daily digest) were removed ([D19](/unified/user/cj/ai_agent/zabbix_agent/kb/docs/decisions/d19-scope-cut-after-full-review.md)): detection stays inside Zabbix ([D6](/unified/user/cj/ai_agent/zabbix_agent/kb/docs/decisions/d6-detection-split.md)). The numbers of 3.3 to 3.5 are unchanged.

### Task 3.3: Scale test

**Files:**
- Create: `/unified/user/cj/ai_agent/zabbix_agent/codebase/tools/scale/{evaluate.py,run_scale.sh}`
- Test: `/unified/user/cj/ai_agent/zabbix_agent/codebase/tests/unit/test_scale_evaluate.py`

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
  RAM, CPU and disk use in `/unified/user/cj/ai_agent/zabbix_agent/kb/docs/operations/benchmarks.md`. Expected: `evaluate_scale` passes. If it fails on drain time, report it and tune grouping or
  expiry; do not raise the target silently.

### Task 3.4: Failure drills

**Files:**
- Create: `/unified/user/cj/ai_agent/zabbix_agent/codebase/tools/drills/{evaluate.py,drill.sh}`
- Test: `/unified/user/cj/ai_agent/zabbix_agent/codebase/tests/unit/test_drill_evaluate.py`

**Interfaces:**
- Produces: `Observation(problems_view_ok: bool, receiver_status: int | None, analysis_stored: bool, self_monitor_problem: bool)`;
  `evaluate_drill(target: Literal["model","receiver","store"], obs: Observation) -> DrillVerdict(passed: bool, failures: list[str])`.
  Pass for every target: `problems_view_ok` is true. Model down: no analysis stored, receiver still 202. Receiver down: no events accepted,
  self-monitor problem raised. Store down: receiver answers 503, self-monitor problem raised.

- [ ] **Step 1: Write failing tests:** `test_problems_view_down_fails_every_target`, `test_model_drill_expects_202_and_no_analysis`,
  `test_store_drill_expects_503`, `test_receiver_drill_expects_self_monitor_problem`.
- [ ] **Step 2: Run, expecting FAIL. Step 3: Implement. Step 4: Run, expecting PASS.**
- [ ] **Step 5: [TESTBED] Run each drill:** `/unified/user/cj/ai_agent/zabbix_agent/codebase/tools/drills/drill.sh model`, `/unified/user/cj/ai_agent/zabbix_agent/codebase/tools/drills/drill.sh receiver`, `/unified/user/cj/ai_agent/zabbix_agent/codebase/tools/drills/drill.sh store` (stop one `zbxai_` container, seed a fault,
  observe, restart). Expected: all three pass. Never stop a container without the prefix.

### Task 3.5: Self-monitoring

**Files:**
- Create: `build_health_template` in `/unified/user/cj/ai_agent/zabbix_agent/codebase/tools/zbx_provision/spec.py`; `/unified/user/cj/ai_agent/zabbix_agent/codebase/tools/health/disk_reporter.py`; add service `disk_reporter` (`python -m tools.health.disk_reporter`; `statvfs("/")` inside the container reads its overlay root, which the survey shows is the host's single `/` filesystem, so no bind mount is needed; *unverified*) and attach `zabbix-server` to `${ZBXAI_PREFIX}_model` in `/unified/user/cj/ai_agent/zabbix_agent/codebase/deploy/compose.yaml`
- Test: `/unified/user/cj/ai_agent/zabbix_agent/codebase/tests/unit/test_health_template.py`

**Interfaces:**
- Produces: `build_health_template(cfg: ProvisionConfig) -> TemplateSpec` named `ZBXAI Stack health`: HTTP-agent items for the receiver
  `/healthz` (queue depth, oldest age, dropped total, `llama_ok`, `zabbix_ok`), Grafana `/api/health` and `llama-server` `/health`; triggers:
  oldest age above 300 s (Warning), dropped total increasing (High), `llama_ok` false (High), Grafana unhealthy (High), no data for 5 minutes (High).
  `disk_pct(total_blocks: int, free_blocks: int) -> float` in `/unified/user/cj/ai_agent/zabbix_agent/codebase/tools/health/disk_reporter.py`: a prefixed container reads the underlying root filesystem with `statvfs` and
  sends it as `vfs.fs.size[/,pused]` for host `zbxai-testbed`, so the same 80%, 90% and forecast triggers watch the testbed's own disk (no host agent).

- [ ] **Step 1: Write failing tests:** `test_template_has_all_five_triggers`, `test_thresholds_come_from_config`, `test_apply_is_idempotent`,
  `test_disk_pct` (`disk_pct(100, 20) == 80.0`; zero total raises `ValueError`).
- [ ] **Step 2: Run, expecting FAIL. Step 3: Implement. Step 4: Run, expecting PASS.**
- [ ] **Step 5: [TESTBED] Prove it:** stop `llama`; Expected: a Zabbix problem for the model appears in Grafana's problems view within 30 s of
  Zabbix raising it. Restart it. Note the limit from the design: if Grafana itself is down, only Zabbix web shows the problem.
