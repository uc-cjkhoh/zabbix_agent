---
title: Log replay rig implementation plan
description: Task-by-task plan to build the module-log replay rig (HTTP to the real Zabbix, plain file, monitor page) from the approved design
components: []
---

# Log Replay Rig Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (recommended: Native, the main session builds) or
> superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replay the 279 s common period of the `ss7mapesms_SGB51` module log (about 480 messages per second) one message at a
time to the real testbed Zabbix over HTTP and to a plain `.txt` file, with a read-only monitor page, repeatably.

**Architecture:** One Python package `tools/log_replay` (extract, schedule, sinks, run state, runner, page, CLI) runs in one container
`zbxai_replay` on `zbxai_front`. Runs start only from a host script by `docker exec`; the runner writes a state file on a tmpfs and
the page reads it. A sibling package `tools/zbx_replay_provision` creates and removes the five Zabbix objects W1 to W5 of the design.

**Tech Stack:** Python 3.12, `httpx`, `starlette`, `uvicorn`, `pydantic` (all already in `requirements.lock`), `pytest`, `ruff`, Docker Compose, POSIX `sh`.

**Spec:** [design](/unified/user/cj/ai_agent/zabbix_agent/kb/docs/development/log-replay-rig-design.md) (approved 2026-11-26, section
numbers below refer to it). Related: [testbed rules](/unified/user/cj/ai_agent/zabbix_agent/kb/docs/operations/testbed.md),
[coding standards](/unified/user/cj/ai_agent/zabbix_agent/kb/docs/development/coding-standards.md).

## Global Constraints
Every task includes these.
- **Absolute paths only** in this plan (owner rule). Two roots: code repo `/unified/user/cj/ai_agent/zabbix_agent/codebase` (called `C/` below only in prose; every path in a step is written in full) and KB `/unified/user/cj/ai_agent/zabbix_agent/kb`. On the testbed the code root is `/unified/user/cj/ai_agent/zabbix_agent/` (no `codebase/` level).
- **Code goes in the code repo, never in the KB.** The KB gets docs only.
- **Tests run only in a container**: `/unified/user/cj/ai_agent/zabbix_agent/codebase/scripts/ship-test.sh <absolute pytest args>`; database or Zabbix-backed tests: `/unified/user/cj/ai_agent/zabbix_agent/codebase/scripts/test-store.sh` (with `ZBXAI_TEST_ZABBIX=1` for a throwaway Zabbix).
- Python 3.12, `ruff` line length 110, no new dependency. Rule 7: every run parameter is checked against a plain character set before use; model or log text is never put into a command, query or path.
- **Rule 6 and design section 8:** nothing is written to the real Zabbix until the owner gives the separate go for W1 to W5 (Task 9 gate). Never start, stop or reconfigure anything on the testbed unless the owner asks. Containers `ch1` to `ch4` and network `clickhouse-testing-env` are not ours.
- Rule 12: the push token is read from a file (0600), never from an environment variable, a URL, a log, the ledger, the page or a doc. Rule 17: log content stays on the testbed.
- Message text is held as **latin-1** (every byte maps to one character) so files round-trip byte for byte. A record is a timestamped line plus its continuation lines (design 6.3).
- **Commits:** the owner asks for commits; each task ends with a checkpoint (`git status` shows only that task's files), not a commit, unless the owner has asked.
- Same-change rule (15): a task that makes a documented fact true or false updates its doc in that task.

## Review Focus
Failure modes the design implies and the tests pin (the owning task holds the test):
1. A continuation line that begins with digits or a space must not start a new record; only `YYYYMMDD HHMMSS.mmm [` does (Task 1).
2. CR/LF, a missing final newline and non-ASCII bytes must survive extract, file sink and Zabbix value unchanged (Tasks 1 and 3).
3. Zabbix answers HTTP 200 and `success` with a per-value `error`: those values count as failed, not ok (Task 3).
4. Zabbix hangs: the file sink must not stall and the clock must not drift; the HTTP sink drops with `queue_full` instead (Task 4).
5. The state file is missing or half written when the page polls, and a run ID or output file already exists: the page says idle, never a 500, and a rerun never overwrites an earlier run (Tasks 3 and 5).

## File Structure
All under `/unified/user/cj/ai_agent/zabbix_agent/codebase`:
| File | Responsibility |
|---|---|
| `/unified/user/cj/ai_agent/zabbix_agent/codebase/tools/log_replay/model.py` | `Record`, `Manifest`, `stamp_to_ms` |
| `/unified/user/cj/ai_agent/zabbix_agent/codebase/tools/log_replay/extract.py` | parse a log stream into records, write parts, merge, load |
| `/unified/user/cj/ai_agent/zabbix_agent/codebase/tools/log_replay/schedule.py` | `Batch`, `plan_batches`, `Clock`, `RealClock` |
| `/unified/user/cj/ai_agent/zabbix_agent/codebase/tools/log_replay/sinks.py` | `SinkResult`, `SendContext`, `FileSink`, `ZabbixSink` |
| `/unified/user/cj/ai_agent/zabbix_agent/codebase/tools/log_replay/state.py` | `RunState`: counters, ring, ledger, atomic state file |
| `/unified/user/cj/ai_agent/zabbix_agent/codebase/tools/log_replay/guard.py` | `Guard`, `ProbeGuard`, ramp plan |
| `/unified/user/cj/ai_agent/zabbix_agent/codebase/tools/log_replay/runner.py` | `run_replay`, sink worker threads, abort |
| `/unified/user/cj/ai_agent/zabbix_agent/codebase/tools/log_replay/page.py` | `create_app` (read-only Starlette app) |
| `/unified/user/cj/ai_agent/zabbix_agent/codebase/tools/log_replay/__main__.py` | CLI: `part`, `merge`, `run`, `ramp`, `serve` |
| `/unified/user/cj/ai_agent/zabbix_agent/codebase/tools/zbx_replay_provision/{spec,apply,__main__}.py` | W1 to W5 builders, apply, teardown, reset-item |
| `/unified/user/cj/ai_agent/zabbix_agent/codebase/scripts/replay.sh` | host script: build, extract, up, run, ramp, reset, status, host guard |
| `/unified/user/cj/ai_agent/zabbix_agent/codebase/deploy/compose.yaml` | service `replay` (profile `replay`) |
| `/unified/user/cj/ai_agent/zabbix_agent/codebase/tests/unit/test_replay_*.py`, `test_zbx_replay_*.py`, `zbx_fake.py` | unit tests and the in-memory fake Zabbix |
| `/unified/user/cj/ai_agent/zabbix_agent/codebase/tests/integration/test_replay_live.py` | throwaway-Zabbix trial |

---

### Task 1: Records and extract
**Files:** Create `/unified/user/cj/ai_agent/zabbix_agent/codebase/tools/log_replay/__init__.py`, `model.py`, `extract.py`; Test `/unified/user/cj/ai_agent/zabbix_agent/codebase/tests/unit/test_replay_extract.py`.

**Interfaces:**
- Produces (`model.py`): `@dataclass(frozen=True) class Record: seq: int; t_ms: int; orig_stamp: str; source: str; text: str` (`source` is `"main"` or `"err"`; `text` is the raw lines with their own terminators, latin-1 decoded; `t_ms` is milliseconds since the first record of the extract). `@dataclass class Manifest: count: int; main_count: int; err_count: int; first_stamp: str; last_stamp: str; longest_bytes: int; skipped_lines: int; sha256: str`. `def stamp_to_ms(stamp: str) -> int` (`"20261014 085045.205"` to milliseconds on a naive timeline, date included).
- Produces (`extract.py`): `def parse_records(stream: BinaryIO) -> tuple[list[tuple[str, str]], int]` (records as `(stamp, text)`, and the number of lines before the first record, which are skipped); `def write_part(stream: BinaryIO, source: str, out: Path, *, start: str | None = None, end: str | None = None) -> int` (JSON lines `{"stamp","source","text"}`; returns the record count kept, `start`/`end` inclusive); `def merge_parts(main_part: Path, err_part: Path, out: Path) -> Manifest` (stable merge by time, ties main first; writes `out` as JSON lines of `Record` fields and `out + ".manifest.json"`); `def load_extract(path: Path) -> Iterator[Record]`.

- [ ] **Step 1: Write the failing tests.** Fixture `MAIN` (bytes): a leading blank line, then records `20261014 085045.205 [0020][->][0493A814] 1;0;0x20020`, `20261014 085045.205 [----][--][0493A814] SccpMsgDispatcher::handleMessage - Received SccpMsg Message.`, `20261014 085045.205 [----][--][0493A814] SccpMsgDispatcher::decodeSccpMsg - UCSccpMsg Debug - ` followed by continuation lines `value UCSccpMsg ::= {`, `  20261014 is inside` (digits and a space, not a record start) and `}`, then `20261014 085046.100 [0020][<-][0493B708] 2;1`. Fixture `ERR`: one line at `20261014 085045.900 ... TC_COMP_U_ERROR. [error:6]` and one at `20261014 085100.000` (outside the window). Tests:
  - `test_parse_records_attaches_continuation_lines`: 4 records, the third `text` has 4 lines (header plus 3), `skipped == 1`.
  - `test_digit_line_is_not_a_record_start`: record count stays 4 (Review Focus 1).
  - `test_crlf_and_latin1_roundtrip`: a record with `b"caf\xe9\r\n"` gives `text == "caf\xe9\r\n"`; no final newline on the last record is kept as is (Review Focus 2).
  - `test_write_part_filters_window`: the err part with `start="20261014 085045.205", end="20261014 085046.100"` keeps 1 record.
  - `test_merge_orders_and_manifests`: order is the three first main records, then the err record, then the `085046.100` record; `seq == 0..4`; `t_ms == [0, 0, 0, 695, 895]`; `manifest.main_count == 4`, `err_count == 1`, `count == 5`, `first_stamp == "20261014 085045.205"`, `last_stamp == "20261014 085046.100"`, `sha256` equals the SHA-256 of the extract file; `load_extract` yields the same five records.
- [ ] **Step 2: Run to see it fail.** `/unified/user/cj/ai_agent/zabbix_agent/codebase/scripts/ship-test.sh /unified/user/cj/ai_agent/zabbix_agent/codebase/tests/unit/test_replay_extract.py`. Expected: import error (module missing).
- [ ] **Step 3: Implement** the signatures above. Record start test: regex `^\d{8} \d{6}\.\d{3} \[` on the decoded line. Read the stream in binary and decode latin-1 line by line (never `splitlines()`, which splits on more than `\n`); split on `\n` keeping the terminator. Stream the input (the main log is 50 MB): do not read it all at once beyond the kept records.
- [ ] **Step 4: Run to see it pass**, plus `ruff check` through the same script. Expected: all pass, ruff clean.
- [ ] **Step 5: Checkpoint.** `git -C /unified/user/cj/ai_agent/zabbix_agent/codebase status --short` lists only these files.

### Task 2: Schedule and batches
**Files:** Create `/unified/user/cj/ai_agent/zabbix_agent/codebase/tools/log_replay/schedule.py`; Test `/unified/user/cj/ai_agent/zabbix_agent/codebase/tests/unit/test_replay_schedule.py`.

**Interfaces:**
- Consumes: `Record` (Task 1).
- Produces: `@dataclass(frozen=True) class Batch: due_s: float; records: tuple[Record, ...]`. `def plan_batches(records: Iterable[Record], *, tick_s: float = 0.1, speed: float = 1.0, batch_cap: int = 200) -> Iterator[Batch]`: a record is due in tick `floor((t_ms / speed) / tick_ms) + 1`, the batch is sent at `tick * tick_s` (never early); a tick with more than `batch_cap` records splits into several batches with the same `due_s`. `class Clock(Protocol): def now(self) -> float; def sleep_until(self, t: float) -> None` (seconds on a monotonic scale). `class RealClock` (uses `time.monotonic`).

- [ ] **Step 1: Failing tests** with 100 synthetic records at `t_ms = i * 10`: `test_ten_per_tick` (10 batches of 10, `due_s` from 0.1 to 1.0), `test_never_early` (for every record `t_ms / 1000 <= batch.due_s`), `test_speed_2_halves_due_times` (last `due_s == 0.5`, 5 batches), `test_batch_cap_splits_a_tick` (cap 4: batches of 4, 4, 2 per tick, same `due_s`), `test_empty_ticks_are_skipped`, `test_order_is_preserved`, `test_rejects_bad_params` (`speed <= 0`, `tick_s <= 0`, `batch_cap < 1` raise `ValueError`).
- [ ] **Step 2: Run to fail**, same script, file `test_replay_schedule.py`.
- [ ] **Step 3: Implement** with integer millisecond arithmetic (`tick_ms = round(tick_s * 1000)`) to avoid float drift. `RealClock.sleep_until` sleeps the remaining time and returns at once if the time has passed.
- [ ] **Step 4: Run to pass** and `ruff`. **Step 5: Checkpoint** as in Task 1.

### Task 3: Sinks
**Files:** Create `/unified/user/cj/ai_agent/zabbix_agent/codebase/tools/log_replay/sinks.py`; Test `/unified/user/cj/ai_agent/zabbix_agent/codebase/tests/unit/test_replay_sinks.py`.

**Interfaces:**
- Consumes: `Batch`, `Record`.
- Produces: `@dataclass(frozen=True) class SinkResult: seq: int; ok: bool; error: str | None = None; truncated: bool = False`. `@dataclass(frozen=True) class SendContext: run_start_epoch: float; elapsed_s: float; speed: float`. `class Sink(Protocol): name: str; def send(self, batch: Batch, ctx: SendContext) -> list[SinkResult]`. `class FileSink: __init__(self, path: Path)` (opens with mode `xb`, so an existing file raises `FileExistsError`; name `"file"`; writes `record.text.encode("latin-1")` verbatim and flushes per batch). `class ZabbixSink: __init__(self, url: str, token: SecretStr, host: str, key: str, *, http: httpx.Client, max_value_bytes: int = 60000, outage: tuple[float, float] | None = None)` (name `"zabbix"`; one `history.push` per batch: params list of `{"host","key","value","clock","ns"}`, `value = text.rstrip("\r\n")` cut to `max_value_bytes`, `clock = int(run_start_epoch + t_ms/1000/speed)` and `ns` its fraction; header `Authorization: Bearer <token>`; error strings `outage`, `http:<status or exception class>`, `api:<message>`, `value:<message>`).

- [ ] **Step 1: Failing tests** (httpx `MockTransport`): `test_file_sink_is_byte_exact` (records `"caf\xe9\r\n"` and a record with no final newline: file bytes equal `b"caf\xe9\r\n"` plus the second record's bytes), `test_file_sink_never_overwrites` (second `FileSink` on the same path raises `FileExistsError`; Review Focus 5), `test_push_request_shape` (one POST, method `history.push`, 2 values, keys `host key value clock ns`, bearer header present), `test_per_value_error_counts_as_failed` (answer `{"result":{"response":"success","data":[{"itemid":"1"},{"error":"Item is disabled."}]}}` gives `[ok, failed "value:Item is disabled."]`; Review Focus 3), `test_api_error_fails_all` (top-level `error` object gives all failed `api:...`), `test_http_500_and_timeout` (`http:500`, `http:ReadTimeout`; the call returns, never raises), `test_value_truncated_but_ok` (value over `max_value_bytes` is cut, `truncated is True`, `ok is True`), `test_outage_window_sends_nothing` (`elapsed_s` inside the window: handler never called, all failed `outage`; outside: sent), `test_token_never_leaks` (token text absent from every error string and from `repr` of the sink).
- [ ] **Step 2: Run to fail. Step 3: Implement** the signatures; the per-value mapping is by position in the `data` array. **Step 4: Run to pass** and `ruff`. **Step 5: Checkpoint.**

### Task 4: Run state, guard and runner
**Files:** Create `/unified/user/cj/ai_agent/zabbix_agent/codebase/tools/log_replay/state.py`, `guard.py`, `runner.py`; Test `/unified/user/cj/ai_agent/zabbix_agent/codebase/tests/unit/test_replay_runner.py`.

**Interfaces:**
- Consumes: `Batch`, `plan_batches`, `Clock`, `Sink`, `SinkResult`, `SendContext`.
- Produces (`state.py`): `class RunState: __init__(self, run_id: str, sinks: list[str], target_rate: float, total: int, *, state_file: Path, ledger: Path, ring: int = 200)`; `def record(self, sink: str, batch: Batch, results: list[SinkResult], actual_s: float) -> None` (counters sent/ok/failed/truncated per sink, lag = `actual_s - batch.due_s`, ring of the last 200 messages with text cut to 160 characters, one ledger JSON line per message per sink: `seq, orig_stamp, planned_s, actual_s, sink, ok, error`); `def snapshot(self) -> dict` (keys `run_id, state, elapsed_s, target_rate, achieved_rate, lag_p95_s, lag_max_s, sinks, ring, aborted`); `def flush(self) -> None` (writes the state file through a temporary file and `os.replace`); `def finish(self, aborted: str | None) -> None`.
- Produces (`guard.py`): `class Guard(Protocol): def check(self, snap: dict) -> str | None` (a reason or `None`). `class ProbeGuard(abort_file: Path, web_url: str, llama_url: str, http: httpx.Client, min_avail_mb: int = 3072)`; reasons: `abort-flag` (file exists), `mem` (`/proc/meminfo` MemAvailable under the floor), `rate` (achieved under 95% of target for 10 s), `lag` (p95 over 1 s), `errors` (over 1% of pushed values failed), `web-slow` (probe over 2 s), `llama-slow` (probe over 5 s or no answer). `def ramp_plan(avg_rate: float, steps=(10, 50, 150, 480), step_s: float = 20.0) -> list[RampStep]` with `RampStep(speed: float, max_records: int)`.
- Produces (`runner.py`): `@dataclass class RunConfig: speed: float = 1.0; tick_s: float = 0.1; batch_cap: int = 200; max_queue: int = 50; run_start_epoch: float | None = None`. `@dataclass class RunSummary: run_id: str; sent: dict[str, int]; ok: dict[str, int]; failed: dict[str, int]; aborted: str | None; elapsed_s: float`. `def run_replay(records: Iterable[Record], sinks: list[Sink], *, run_id: str, cfg: RunConfig, clock: Clock, state: RunState, guard: Guard) -> RunSummary`: each sink has its own worker thread and bounded queue (`max_queue` batches); the main loop sleeps to each `due_s`, offers the batch to every queue and, when a queue is full, records those messages as failed `queue_full` without waiting; late batches are sent at once; the guard is checked about once per second; on a reason the loop stops, queues drain, the state is flushed with `aborted` set.

- [ ] **Step 1: Failing tests** (a `FakeClock` whose `sleep_until` advances `now`, and recording fake sinks): `test_every_sink_gets_every_message_in_order`, `test_summary_counts_and_elapsed` (elapsed equals the last `due_s`), `test_slow_sink_does_not_stall_the_other` (sink B blocks on a `threading.Event`, `max_queue=2`: sink A still receives all batches on time, B records `queue_full` failures; Review Focus 4), `test_late_batch_is_sent_at_once_and_lag_recorded`, `test_guard_reason_stops_the_run` (guard returns `"lag"` after 3 s of fake time: `aborted == "lag"`, no later batch sent, state file says aborted), `test_ring_keeps_last_200_and_cuts_text` (300 messages: ring length 200, first `seq == 100`, every text at most 160 characters), `test_ledger_has_one_line_per_message_per_sink` (2 sinks, 5 messages: 10 lines, fields as listed), `test_state_file_is_valid_json_after_each_flush`, `test_probe_guard_reasons` (each reason from a fake `httpx` transport, a temp abort file and a fake meminfo path), `test_ramp_plan` (`ramp_plan(480)` gives speeds `10/480, 50/480, 150/480, 1.0` and `max_records` equal to rate times 20).
- [ ] **Step 2: Run to fail. Step 3: Implement.** Percentiles by sorting the recent lag samples (keep the last 2,000). **Step 4: Run to pass** and `ruff`. **Step 5: Checkpoint.**

### Task 5: Monitor page
**Files:** Create `/unified/user/cj/ai_agent/zabbix_agent/codebase/tools/log_replay/page.py`; Test `/unified/user/cj/ai_agent/zabbix_agent/codebase/tests/unit/test_replay_page.py`.

**Interfaces:**
- Consumes: the state file written by `RunState.flush`.
- Produces: `def create_app(state_file: Path) -> Starlette` with exactly two routes: `GET /` (one self-contained HTML page, no external script or font; polls `/api/state` every 1 s; shows run ID, state, elapsed, target versus achieved rate, lag, per-sink sent/ok/failed/truncated and the last 200 messages) and `GET /api/state` (the state file's JSON, or `{"state": "idle"}` when the file is missing, empty or not valid JSON).

- [ ] **Step 1: Failing tests** (Starlette `TestClient`): `test_idle_when_no_state_file`, `test_idle_when_state_file_is_torn` (file holds `{"run`; status 200, `state == "idle"`; Review Focus 5), `test_state_is_served_as_written`, `test_page_is_read_only` (`POST /`, `POST /api/state`, `DELETE /api/state` all give 405; `[r.path for r in app.routes]` equals `["/", "/api/state"]`), `test_page_has_no_external_urls` (no `http://` or `https://` in the HTML), `test_message_text_is_html_escaped_by_the_page_script` (the page script uses `textContent`, never `innerHTML`, for message text: assert the string `innerHTML` is absent).
- [ ] **Step 2: Run to fail. Step 3: Implement. Step 4: Run to pass** and `ruff`. **Step 5: Checkpoint.**

### Task 6: CLI
**Files:** Create `/unified/user/cj/ai_agent/zabbix_agent/codebase/tools/log_replay/__main__.py`; Test `/unified/user/cj/ai_agent/zabbix_agent/codebase/tests/unit/test_replay_cli.py`.

**Interfaces:**
- Consumes: Tasks 1 to 5. Produces `python -m tools.log_replay` with subcommands: `part --source {main,err} --out PATH [--start STAMP --end STAMP]` (reads stdin); `merge --main PATH --err PATH --out PATH`; `run --extract PATH --run-id ID [--speed F] [--tick-s F] [--batch-cap N] [--outage S:E] [--zabbix-url URL --zabbix-token-file PATH --host NAME --key KEY] [--out-dir DIR] [--state-dir DIR] [--abort-file PATH]`; `ramp` (same options, runs `ramp_plan`); `serve --state-dir DIR --port N`. Exit codes: 0 done, 1 aborted by the guard, 2 bad arguments.

- [ ] **Step 1: Failing tests:** `test_rejects_bad_run_id` (`run-id` must match `^[0-9]{8}T[0-9]{6}Z(-[a-z0-9]{1,8})?$`; `;`, `/`, spaces and `..` give exit 2; rule 7), `test_rejects_bad_outage_and_speed` (`5:2`, `abc`, `--speed 0`), `test_token_file_must_be_0600_and_nonempty`, `test_run_writes_file_ledger_and_state` (tiny extract, fake Zabbix via `MockTransport` injected by a hook the CLI exposes as `main(argv, *, http=None, clock=None)`: `out-dir` holds `<run-id>.txt` and `<run-id>.ledger.jsonl`, exit 0), `test_second_run_with_same_id_refuses` (exit 2, first file untouched; Review Focus 5), `test_two_runs_give_identical_files` (same extract, different run IDs: the two `.txt` files have equal SHA-256), `test_outage_run_still_writes_the_file`.
- [ ] **Step 2: Run to fail. Step 3: Implement** `main(argv: list[str], *, http: httpx.Client | None = None, clock: Clock | None = None) -> int`. **Step 4: Run to pass** and `ruff`. **Step 5: Checkpoint.**

### Task 7: Zabbix provisioning for the replay objects (W1 to W5)
**Files:** Create `/unified/user/cj/ai_agent/zabbix_agent/codebase/tools/zbx_replay_provision/__init__.py`, `spec.py`, `apply.py`, `__main__.py`; Create `/unified/user/cj/ai_agent/zabbix_agent/codebase/tests/unit/zbx_fake.py` (in-memory fake with `hostgroup.*`, `host.*`, `item.*`, `trigger.*`, `usergroup.*`, `role.*`, `user.*`, `token.*`, same style as `memory_store.py` and the fake in `test_zbx_apply.py`); Test `/unified/user/cj/ai_agent/zabbix_agent/codebase/tests/unit/test_zbx_replay_provision.py`.

**Interfaces:**
- Consumes: `tools.zbx_provision.client.ZabbixAdminClient` (`call(method, params)`), `ZbxApiError`.
- Produces (`spec.py`): `@dataclass(frozen=True) class ReplayConfig: group: str = "ZBXAI replay"; host: str = "ss7mapesms-SGB51-replay"; key: str = "ss7mapesms.log"; history: str = "1d"; allowed_hosts: str = "172.30.60.0/24"; pattern: str = "TC_COMP_U_ERROR"; window: str = "1m"; fire_at: int = 50; recover_below: int = 10; user: str = "zbxai_replay"`. Builders returning API parameter dicts: `build_group(cfg)`, `build_host(cfg, groupid)`, `build_item(cfg, hostid)` (type trapper `2`, value type log `2`, `trapper_hosts = cfg.allowed_hosts`, `history = cfg.history`), `build_trigger(cfg)` (expression `count(/ss7mapesms-SGB51-replay/ss7mapesms.log,1m,"like","TC_COMP_U_ERROR")>=50`; recovery mode expression with `<10`; priority Warning; name `SS7 MAP SMS: TC_COMP_U_ERROR rate high: {ITEM.LASTVALUE}`; tags `module=ss7mapesms`, `node=SGB51`), `build_access(cfg, groupid)` (user group with read-write on that host group only, role of type User, user `zbxai_replay`).
- Produces (`apply.py`): `def apply(client, cfg, token_dir: Path) -> ApplyReport` (idempotent, finds objects by name; the token file is written 0600 as `<token_dir>/zbxai_replay`); `def teardown(client, cfg) -> TeardownReport` (removes the user, token, user group, role, trigger, item, host, group named in `cfg`, in that order, and nothing else); `def reset_item(client, cfg) -> str` (deletes and re-creates the item, returns the new item ID). CLI: `python -m tools.zbx_replay_provision {apply,teardown,reset-item} --signoff W1,W2,W3,W4,W5`; without that exact flag it exits 2 and sends nothing.

- [ ] **Step 1: Failing tests:** `test_apply_creates_exactly_w1_to_w5` (the fake shows one group, one host, one item, one trigger, one user group, one role, one user, one token, and the trigger expression equals the string above), `test_apply_twice_creates_nothing_new`, `test_teardown_removes_only_named_objects` (a pre-seeded host `Zabbix server` and group `Zabbix servers` survive), `test_token_file_is_0600_and_not_in_report` (the report and the log text never contain the token), `test_cli_refuses_without_signoff` (exit 2, fake saw zero calls), `test_reset_item_gives_new_id_same_key`, `test_item_is_log_trapper_with_one_day_history`.
- [ ] **Step 2: Run to fail. Step 3: Implement. Step 4: Run to pass** and `ruff`.
- [ ] **Step 5: Throwaway-Zabbix trial** (design section 9 step 0). Create `/unified/user/cj/ai_agent/zabbix_agent/codebase/tests/integration/test_replay_live.py` (skipped unless the throwaway Zabbix runs): apply W1 to W5, wait 60 s, push one value with the push token and assert the per-value result has no `error`; push 60 `TC_COMP_U_ERROR` lines within one minute and assert the trigger reaches problem state and `problem.get` returns it with the sample text expanded in its name; stop pushing and assert recovery; teardown and assert nothing named remains. Run: `ZBXAI_TEST_ZABBIX=1 /unified/user/cj/ai_agent/zabbix_agent/codebase/scripts/test-store.sh /unified/user/cj/ai_agent/zabbix_agent/codebase/tests/integration/test_replay_live.py`. This is inside the owner's standing permission for isolated runs. **Report each result.** If `history.push` is absent on 8.0.0, stop and ask the owner (design 4).
- [ ] **Step 6: Docs, same change.** In `/unified/user/cj/ai_agent/zabbix_agent/kb/docs/development/log-replay-rig-design.md` section 9, replace *unverified* with the observed result for each of: `history.push` on 8.0.0, token role, allowed-hosts source address, log item behaviour, `count()`/`like`, macro expansion in the problem name, host without interface. Anything not observed stays *unverified*. **Checkpoint.**

### Task 8: Container, compose service and host script
**Files:** Modify `/unified/user/cj/ai_agent/zabbix_agent/codebase/deploy/compose.yaml` (add service `replay` with `profiles: ["replay"]`, so a plain `up -d` never starts it), `/unified/user/cj/ai_agent/zabbix_agent/codebase/.env` (add `ZBXAI_REPLAY_PORT`, `ZBXAI_REPLAY_OUT_DIR`; `.env` is git-ignored, so also document the names in the KB testbed doc); Create `/unified/user/cj/ai_agent/zabbix_agent/codebase/scripts/replay.sh`; Test `/unified/user/cj/ai_agent/zabbix_agent/codebase/tests/unit/test_replay_script.py`.

**Interfaces:**
- Service `replay`: container `${ZBXAI_PREFIX}_replay`, image `${ZBXAI_PREFIX}_runtime:dev`, command `python -m tools.log_replay serve --state-dir /run/replay --port 8090`, network `front` only, published `${ZBXAI_REPLAY_BIND:-0.0.0.0}:${ZBXAI_REPLAY_PORT}:8090`, `cap_drop: [ALL]`, `security_opt: [no-new-privileges:true]`, `read_only: true`, tmpfs `/run/replay` and `/tmp`, `cpus: 1`, `mem_limit: 512m`, volume `${ZBXAI_PREFIX}_replay_data` read-only at `/data`, bind `${ZBXAI_REPLAY_OUT_DIR}` at `/out`, token file bind read-only at `/run/secrets/replay-token`, user the owner's uid so the output files belong to `unified`.
- `scripts/replay.sh`: subcommands `build` (tar of the code over ssh into `docker build --target runtime`, as `ship-test.sh` does), `extract` (streams `cat <log file> | docker run -i ... part` for each source file, then `merge`; the source folder is never mounted), `up` / `down` (this one container only), `run <run-id> [options]`, `ramp`, `reset`, `status`, and `--dry-run` on all (prints, does nothing). Every argument is checked against a plain character set before it reaches a command line (rule 7). `run` and `ramp` also poll, every 3 s, the health of every other container (state, health, restart count) and the two read-only probes as `test-store.sh` does, and on any change `touch` the abort file inside the container. They refuse to start if a running container is unhealthy, memory is under 3 GB, or `zbxai_replay` or its output folder does not carry the project prefix.

- [ ] **Step 1: Failing tests** (script run with `--dry-run`, no Docker): `test_dry_run_prints_plan_and_runs_nothing`, `test_rejects_bad_run_id_and_path_characters` (`;`, `$(`, backtick, spaces), `test_refuses_foreign_container_names`, and a compose check `test_compose_service_is_hardened` that renders `docker compose config` text in the test container only if the Docker CLI exists there, else skips; assert `read_only`, `cap_drop ALL`, `front` as the only network, `mem_limit`, `profiles`.
- [ ] **Step 2: Run to fail. Step 3: Implement.** Pick `ZBXAI_REPLAY_PORT` from 18090 to 18099 after a read-only `ss -ltn` on the testbed shows it free (`testbed.md` lists 22, 18080 and 18081 as listening). **Step 4: Run to pass**; `sh -n` the script. **Step 5: Docs, same change:** add the container, volume, port and output folder to `/unified/user/cj/ai_agent/zabbix_agent/kb/docs/operations/testbed.md` and `/unified/user/cj/ai_agent/zabbix_agent/kb/docs/architecture/topology.md` as *built, not started*. **Checkpoint.**

### Task 9: Rollout on the testbed (gated)
**Gate (stop here and ask):** the owner's separate go for W1 to W5 on the real Zabbix, using the list in design section 8 and the Task 7 trial results. A second go is needed for the full run. The owner has said nothing yet on either.

- [ ] **Step 1 (read-only, allowed now):** on the testbed, confirm free disk (expect about 40 GB), free memory, the chosen port, and that `zbxai_zabbix_web`, `zbxai_zabbix_server`, `zbxai_postgres` and `zbxai_llama` are healthy. Report the numbers.
- [ ] **Step 2: Build and extract (asks the owner first, creates only our own image, volume and folder):** `/unified/user/cj/ai_agent/zabbix_agent/codebase/scripts/replay.sh build`, then `extract`. Expected: the manifest shows about 134,842 main records, 344 error records, window 08:50:45.205 to 08:55:24.237, and the longest record in bytes (compare with the 60,000-byte limit). Record the measured peak messages per second in the design (it was *unverified*).
- [ ] **Step 3: Provision (after the gate):** `python -m tools.zbx_replay_provision apply --signoff W1,W2,W3,W4,W5` from the container against the real Zabbix; verify read-back through the API; wait 60 s.
- [ ] **Step 4: Preflight and ramp:** `replay.sh up`, one value, then `replay.sh ramp`. Stop at the first failing step and report it with numbers.
- [ ] **Step 5: Full run (second go):** `replay.sh run <run-id>`; watch the page. Check: ledger totals equal page counters; per-value ok count equals the number of values the item received (bounded `history.get` with a limit and time window); trigger fired and recovered.
- [ ] **Step 6: Repeat and outage:** a second run with another run ID: the two `.txt` files have equal SHA-256. A run with `--outage 60:120`: HTTP failures counted for the window, the file complete.
- [ ] **Step 7: Clean up:** `replay.sh reset` (item history), and ask the owner whether to run teardown. Confirm `zbxai_llama`, Zabbix and every other container stayed healthy.
- [ ] **Step 8: Docs, same change:** update the design (status, section 9 results), `/unified/user/cj/ai_agent/zabbix_agent/kb/docs/operations/testbed.md` (what exists and its state), `/unified/user/cj/ai_agent/zabbix_agent/kb/docs/architecture/topology.md`, CLAUDE.md section 5 and 6 lines for the new package and script, the backlog, and a decision record D18 (next free number) with the owner's choices; the change log is generated by the hook.

---

## Self-review (run 2026-11-26)
- **Spec coverage:** extract and merge (6.1, Task 1), pace and batching (6.2, Task 2), timestamps and file sink (6.3, 6.4, Task 3), page (6.5, Task 5), safety and ramp (6.6, Task 4 and 8), outage (6.7, Task 3 and 6), what the agent sees (6.8, Task 7 trigger name and tags, Task 7 step 5 check), repeat and cleanup (7, Tasks 6, 8 and 9), writes and teardown (8, Task 7), preflight (9, Task 7 step 5 and Task 9), docs touched (10, Tasks 7 to 9). `--rewrite-stamps` and `--zabbix-filter` are optional in the design and **not planned** (YAGNI); add them only if the owner asks.
- **Type consistency:** `Record`, `Batch`, `SinkResult`, `SendContext`, `RunState.record(...)`, `Guard.check(snap)` are defined once (Tasks 1 to 4) and used with the same names later; `main(argv, *, http, clock)` is the single CLI entry.
- **Proportion:** the plan holds signatures, test names, values and commands; bodies are left to the implementer.
- **Open items outside the plan:** the owner's go for W1 to W5 (Task 9 gate); whether `history.push` works on 8.0.0 (Task 7 step 5 decides).
