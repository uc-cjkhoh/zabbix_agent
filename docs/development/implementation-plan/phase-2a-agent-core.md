---
title: Implementation plan - Phase 2a agent core
description: Scaffold, models, analysis store, bounded Zabbix client and the six-tool MCP server
components: []
---

# Phase 2a — Agent core (tested library; no model needed yet)

Global constraints and protocol: [index](index.md). All tests run through `scripts/ship-test.sh` **[TESTBED]**. Each task
ends with a commit step (ask first, Q7).

### Task 2.0: Scaffold and settings

**Files:**
- Create: `pyproject.toml`, `Dockerfile`, `src/zbxai/__init__.py`, `src/zbxai/config.py`
- Test: `tests/unit/test_config.py`

**Interfaces:**
- Produces: `Settings` (frozen pydantic model; secrets are `SecretStr`); `load_settings(env: Mapping[str, str]) -> Settings`.
  A secret is read from the file named by `<NAME>_FILE`. Keys: `ZBX_URL`, `ZBX_TOKEN_FILE`, `PG_DSN_FILE`, `LLAMA_URL`,
  `RECEIVER_TOKEN_FILE`, `QUEUE_CAP` (default 200), `MAX_ROWS` (default 200), `MAX_WINDOW_S` (default 604800),
  `ENABLE_MODEL_LOOKUPS` (default `False`), `LLM_TIMEOUT_S`.

- [ ] **Step 1: Write failing tests:** `test_settings_reads_secret_from_file`, `test_settings_repr_hides_secrets` (neither `repr` nor
  `str` contains the secret), `test_missing_required_setting_names_key_only` (the error names the variable, never a value),
  `test_model_lookups_default_off`.
- [ ] **Step 2: Run, expecting FAIL. Step 3: Implement.** The `Dockerfile` is `python:3.12-slim` at the pinned digest, a non-root
  user, no build tools in the final image. Confirm the `mcp` SDK's current server API against its docs before Task 2.4.
- [ ] **Step 4: Run, expecting PASS.**

### Task 2.1: Domain models and event validation

**Files:**
- Create: `src/zbxai/models.py`
- Test: `tests/unit/test_models.py`

**Interfaces:**
- Produces: `ProblemEvent(event_id: str, trigger_id: str, host_id: str, host_name: str, trigger_name: str, severity: int, clock: int,
  status: Literal["PROBLEM","RESOLVED"], tags: dict[str, str])`; `validate_event(raw: bytes | dict, max_bytes: int = 16384) -> ProblemEvent`
  raising `EventRejected(reason: str)`; `dedupe_key(ev: ProblemEvent) -> str` returning `f"{trigger_id}:{host_id}"`;
  `Hypothesis(text: str, evidence: list[str], rank: int)`; `Analysis(event_id: str, severity_view: str, hypotheses: list[Hypothesis],
  checks: list[str], confidence: Literal["low","medium","high"])`; `NoAnalysis(event_id: str, reason: str)`;
  `as_utc(clock: int) -> datetime` (timezone-aware UTC).

- [ ] **Step 1: Write failing tests:** `test_oversize_event_rejected` (16385 bytes), `test_unknown_field_rejected`,
  `test_severity_out_of_range_rejected` (6 and -1), `test_markup_in_names_kept_verbatim` (`<img src=x onerror=1>` is stored unchanged,
  not interpreted), `test_dedupe_key_same_for_flapping`, `test_clock_is_utc` (`as_utc(0)` is `1970-01-01T00:00:00+00:00`).
- [ ] **Step 2: Run, expecting FAIL. Step 3: Implement** with strict validation (`extra="forbid"`). **Step 4: Run, expecting PASS.**

### Task 2.2: Analysis store

**Files:**
- Create: `src/zbxai/store.py`, `deploy/postgres/migrations/001_init.sql`
- Test: `tests/integration/test_store.py`

**Interfaces:**
- Consumes: `ProblemEvent`, `Analysis`, `NoAnalysis`, `dedupe_key` (Task 2.1).
- Produces: `AnalysisStore(dsn: str)`; `enqueue(ev: ProblemEvent, cap: int, window_s: int = 900, group_window_s: int = 60) -> EnqueueResult`
  (`ACCEPTED | DUPLICATE | GROUPED | DROPPED`; a different event on the same host inside `group_window_s` is `GROUPED` under the first one);
  `group_members(event_id: str) -> list[ProblemEvent]`; `claim_next() -> ProblemEvent | None` (one row, `FOR UPDATE SKIP LOCKED`);
  `save_analysis(a: Analysis) -> None`; `save_no_analysis(n: NoAnalysis) -> None`; `expire_older_than(seconds: int) -> int`;
  `stats() -> StoreStats(queued: int, dropped_total: int, oldest_age_s: float | None)`. Tables `events`, `analyses` (all times
  `timestamptz`) and view `v_ai_analyses` with plain-text columns `event_id, host, trigger, severity_view, top_hypothesis, evidence,
  confidence, created_at`.

- [ ] **Step 1: Write failing tests:** `test_duplicate_within_window_is_merged` (1000 identical events give one `ACCEPTED`, 999 `DUPLICATE`),
  `test_burst_on_one_host_grouped_into_one_analysis` (five different triggers on one host inside 60 s give one `ACCEPTED`, four `GROUPED`, one claimable event),
  `test_cap_exceeded_drops_and_counts` (`dropped_total` rises, nothing raises), `test_claim_is_single_lane` (two concurrent claims
  never return the same event), `test_expired_events_get_no_analysis_note`, `test_timestamps_are_utc` (stored `created_at` equals
  `as_utc(clock)` regardless of the session `TimeZone`), `test_view_exposes_plain_text_only`.
- [ ] **Step 2: Run, expecting FAIL. Step 3: Implement** with `psycopg` and parameterised SQL only. **Step 4: Run, expecting PASS.**

### Task 2.3: Bounded, read-only Zabbix client

**Files:**
- Create: `src/zbxai/zabbix_client.py`
- Test: `tests/unit/test_zabbix_client.py`

**Interfaces:**
- Produces: `ZabbixClient(base_url: str, token: SecretStr, *, max_rows: int = 200, max_window_s: int = 604800, http: httpx.Client | None = None)`;
  `problems(host_id: str | None, limit: int, since_s: int) -> Page[Problem]`; `event(event_id: str) -> EventDetail`;
  `series(item_id: str, kind: Literal["history","trend"], window_s: int, limit: int) -> Page[Point]`;
  `host_overview(host_id: str) -> HostOverview`; `related_problems(host_id: str, limit: int) -> Page[Problem]`;
  `Page(rows: list, truncated: bool)`; errors `BoundsError`, `ForbiddenMethod`, `ZabbixUnavailable`. Only API methods ending in `.get`
  are ever sent; the token travels in the `Authorization: Bearer` header.

- [ ] **Step 1: Write failing tests** with `httpx.MockTransport`: `test_limit_zero_negative_and_huge_rejected` (0, -1, 10**9 raise
  `BoundsError`, never clamped), `test_window_beyond_max_rejected`, `test_more_rows_than_limit_sets_truncated`,
  `test_non_get_method_forbidden_client_side` (`host.create` raises `ForbiddenMethod` before any request), `test_error_does_not_leak_token`
  (the token text is absent from the exception message and `repr`), `test_unavailable_maps_to_zabbix_unavailable`.
- [ ] **Step 2: Run, expecting FAIL. Step 3: Implement** with one private `_call(method, params)` that enforces the `.get` rule.
  **Step 4: Run, expecting PASS.**

### Task 2.4: MCP server with six read-only tools

**Files:**
- Create: `src/zbxai/mcp_server.py`
- Test: `tests/unit/test_mcp_server.py`

**Interfaces:**
- Consumes: `ZabbixClient` (Task 2.3).
- Produces: `build_server(zbx: ZabbixClient, status: Callable[[], dict]) -> FastMCP` (the SDK's server class) with exactly these tools:
  `get_active_problems(host_id: str | None, limit: int, since_s: int)`, `get_event(event_id: str)`,
  `get_item_series(item_id: str, kind: str, window_s: int, limit: int)`, `get_host_overview(host_id: str)`,
  `get_related_problems(host_id: str, limit: int)`, `get_agent_status()`. Served over streamable HTTP on the app network.

- [ ] **Step 1: Write failing tests:** `test_tool_surface_is_exactly_six`, `test_every_numeric_input_has_minimum_and_maximum` (read each tool's
  `inputSchema`), `test_out_of_range_returns_error_not_clamped` (the call result has `isError` true), `test_truncated_flag_in_result`,
  `test_no_tool_can_write` (no tool name lacks the `get_` prefix and none calls a non-`.get` method, checked with a recording client).
- [ ] **Step 2: Run, expecting FAIL. Step 3: Implement** the tools as thin wrappers. **Step 4: Run, expecting PASS.**
