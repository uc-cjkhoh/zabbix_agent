---
title: Implementation plan - Phase 2a agent core
description: Scaffold, models, analysis store, bounded Zabbix client and the six-tool MCP server
components: []
---

# Phase 2a — Agent core (tested library; no model needed yet)

Global constraints and protocol: [index](/unified/user/cj/ai_agent/zabbix_agent/kb/docs/development/implementation-plan/index.md). All tests run through `/unified/user/cj/ai_agent/zabbix_agent/codebase/scripts/ship-test.sh` **[TESTBED]**. Each task
ends with a commit step (ask first, Q7).

### Task 2.0: Scaffold and settings

**Status 2026-11-26: done** (14 unit tests pass in a container, `ruff check` clean; not committed, the codebase is not a git repo). Choices made: field mapping is the lowercase env key with `_FILE` dropped for secrets (`ZBX_TOKEN_FILE` gives `zbx_token`); required keys are `ZBX_URL`, `ZBX_TOKEN_FILE`, `PG_DSN_FILE`, `LLAMA_URL`, `RECEIVER_TOKEN_FILE`; `LLM_TIMEOUT_S` defaults to 300 s (the agent's own choice: a 12.5k-token prompt took 283 s on the 3B model, the real prompt is about 1.5k tokens; revisit after the benchmark); URLs must start with `http://` or `https://`; no `pydantic-settings`, a frozen pydantic model with `hide_input_in_errors`; errors name variables only. The `runtime` target copies `src/` and sets `PYTHONPATH=/app/src:/app` (image `zbxai_runtime:dev`, imports offline as uid 10001). **Open:** step 3's "confirm the `mcp` SDK's current server API against its docs before Task 2.4": only the names were checked (`mcp.server.fastmcp.FastMCP` and `mcp.client.streamable_http.streamablehttp_client` import in `mcp` 1.30.0, offline); the SDK's documentation was not read. Do it at the start of Task 2.4.

**Files:**
- Create: `/unified/user/cj/ai_agent/zabbix_agent/codebase/src/zbxai/__init__.py`; extend `/unified/user/cj/ai_agent/zabbix_agent/codebase/pyproject.toml` with the agent's dependencies, copy `/unified/user/cj/ai_agent/zabbix_agent/codebase/src/` into the `runtime` target of `/unified/user/cj/ai_agent/zabbix_agent/codebase/Dockerfile` (created in Task 1.1) and regenerate `/unified/user/cj/ai_agent/zabbix_agent/codebase/requirements.lock` in a container, `/unified/user/cj/ai_agent/zabbix_agent/codebase/src/zbxai/config.py`
- Test: `/unified/user/cj/ai_agent/zabbix_agent/codebase/tests/unit/test_config.py`

**Interfaces:**
- Produces: `Settings` (frozen pydantic model; secrets are `SecretStr`); `load_settings(env: Mapping[str, str]) -> Settings`.
  A secret is read from the file named by `<NAME>_FILE`. Keys: `ZBX_URL`, `ZBX_TOKEN_FILE`, `PG_DSN_FILE`, `LLAMA_URL`,
  `RECEIVER_TOKEN_FILE`, `QUEUE_CAP` (default 200), `MAX_ROWS` (default 200), `MAX_WINDOW_S` (default 604800),
  `ENABLE_MODEL_LOOKUPS` (default `False`), `LLM_TIMEOUT_S`.

- [ ] **Step 1: Write failing tests:** `test_settings_reads_secret_from_file`, `test_settings_repr_hides_secrets` (neither `repr` nor
  `str` contains the secret), `test_missing_required_setting_names_key_only` (the error names the variable, never a value),
  `test_model_lookups_default_off`.
- [ ] **Step 2: Run, expecting FAIL. Step 3: Implement.** The `runtime` target (a minimal one exists from Task 1.1) of `/unified/user/cj/ai_agent/zabbix_agent/codebase/Dockerfile` is `python:3.12-slim` taken from `PYTHON_TAG@PYTHON_DIGEST` through a build ARG, dependencies installed from `/unified/user/cj/ai_agent/zabbix_agent/codebase/requirements.lock` with `--require-hashes`, a non-root
  user, no build tools in the final image, `TZ=UTC`, and no `CMD` (each service sets its own command, contract R10). Confirm the `mcp` SDK's current server API against its docs before Task 2.4.
- [ ] **Step 4: Run, expecting PASS.**

### Task 2.1: Domain models and event validation

**Status 2026-11-26: done** (code `src/zbxai/models.py`, tests `tests/unit/test_models.py`, pass in a container). Choices made: models are frozen and strict (`extra="forbid"`); a rejection reason lists field names only; the size check runs on the raw bytes before parsing (a dict is serialised first); `DependencyError` (the base of every "a dependency is down" error) lives here; field lengths are bounded (ids 64, host name 512, trigger name 2048, 64 tags).

**Files:**
- Create: `/unified/user/cj/ai_agent/zabbix_agent/codebase/src/zbxai/models.py`
- Test: `/unified/user/cj/ai_agent/zabbix_agent/codebase/tests/unit/test_models.py`

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

**Status 2026-11-26: done, run once on a throwaway PostgreSQL.** Code `src/zbxai/store.py` (with a `Store` protocol), `deploy/postgres/migrations/001_init.sql`, `tests/integration/test_store.py`. `scripts/test-store.sh` creates the internal network `zbxai_test` (172.30.63.0/24, checked against the live subnets) and the container `zbxai_pgtest` (the pinned `postgres:16-alpine`, data on tmpfs, no published port, trust auth because only the test container can reach it), runs `tests/integration` through `ship-test.sh` (which now accepts `ZBXAI_TEST_NETWORK` and `ZBXAI_TEST_PG_DSN`), then removes both; it refuses to run if either name exists. **Result: 10 passed on the first run** (8 planned tests plus the group limit and the statement time limit), none skipped, nothing left behind on the testbed. A second file, `tests/integration/test_store_concurrency.py` (4 tests: one identical event from 16 threads is accepted once; the cap holds exactly under concurrent enqueues; 6 competing claimers get every event exactly once; enqueue and claim at the same time lose nothing), also passes. A mutation check showed the tests can fail: with the enqueue advisory lock removed, `test_identical_event_from_many_threads_is_accepted_once` failed (the cap test did not fail in that one run; it is timing-dependent). Not yet shown: the grants of the SELECT-only role (Task 1.2). Choices made: one connection per call; enqueue runs under one advisory lock; an event groups only under a parent that is still `queued` (once the parent is claimed, a later event on that host is accepted on its own); grouped events do not count towards the cap; the view's `created_at` is the problem's `clock` (the test name `test_timestamps_are_utc` needs that), the analysis time is `analyses.analysed_at`; no grants are made (the SELECT-only role is Task 1.2); `group_members` takes a limit (default 20, rule 8) and every connection sets `statement_timeout` 10 s and `lock_timeout` 5 s. Unit tests use `tests/unit/memory_store.py`, a stand-in that follows the same contract.

**Files:**
- Create: `/unified/user/cj/ai_agent/zabbix_agent/codebase/src/zbxai/store.py`, `/unified/user/cj/ai_agent/zabbix_agent/codebase/deploy/postgres/migrations/001_init.sql`
- Test: `/unified/user/cj/ai_agent/zabbix_agent/codebase/tests/integration/test_store.py`

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

**Status 2026-11-26: done against mocks** (code `src/zbxai/zabbix_client.py`, tests pass with `httpx.MockTransport`). The request and response shapes follow the Zabbix API documentation and have **not** been seen against the running Zabbix 8.0.0: *unverified*; no read-only token exists yet (Task 1.3 is not built). Choices made: `base_url` is the full endpoint (as in `ZBX_URL`); `event()` makes two calls (`event.get`, then `trigger.get` with `selectItems`) so that `EventDetail.items` carries the item ids that `series()` needs; `series("history")` first reads the item's `value_type`; ids must be digits only; `ping()` (one `host.get`, limit 1) serves the health check; `ZabbixBadResponse` is a subclass of `ZabbixUnavailable`.

**Files:**
- Create: `/unified/user/cj/ai_agent/zabbix_agent/codebase/src/zbxai/zabbix_client.py`
- Test: `/unified/user/cj/ai_agent/zabbix_agent/codebase/tests/unit/test_zabbix_client.py`

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
- Create: `/unified/user/cj/ai_agent/zabbix_agent/codebase/src/zbxai/mcp_server.py`
- Test: `/unified/user/cj/ai_agent/zabbix_agent/codebase/tests/unit/test_mcp_server.py`

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
