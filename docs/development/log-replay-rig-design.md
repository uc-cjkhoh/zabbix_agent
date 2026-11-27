---
title: Log replay rig — design (proposed)
description: Test rig that replays 4m39s of a real SS7/MAP module log to the real testbed Zabbix over HTTP and to a local .txt file, with a monitor page, to test the Llama agent's Zabbix-MCP path and its local-file fallback
components: []
---

# Log replay rig — design

**Status: design approved by the owner on 2026-11-26 with the agent's picks (one `history.push` per 100 ms tick; the file keeps the original lines). The five Zabbix writes W1 to W5 in section 8 are NOT yet approved: the owner gives that go separately, before anything touches the real Zabbix. Built and tested on 2026-11-26 (Tasks 1 to 8 of the plan; results in section 14). Nothing has been written to the real Zabbix.** Items marked *unverified* were not seen on the real system. Written 2026-11-26 after a read-only look at the testbed and two lookups (Zabbix `history.push` docs, the provisioning code).

## 1. Intent
The Llama agent is meant to analyse module errors that arrive at Zabbix (through the read-only MCP server), and to fall back to reading the module's local log file when Zabbix is not available. To test both paths we need a source of module log messages that behaves like a live module, can be run again identically, and can show what it sent. This rig is that source. It is **not** the agent, the MCP server or any Grafana work.

## 2. Goals, non-goals, anti-goals
**Goals**
- Replay one real time period of the module log, one message at a time, at the recorded pace (about 480 messages per second on average).
- Two sinks per message: (1) an HTTP request to the real testbed Zabbix, (2) an append to a plain `.txt` file on the testbed.
- Repeatable: the same input gives the same messages in the same order, every run, with a run ID and an output file of its own.
- A simple web page that shows each message as it is written or sent, with counters per sink.
- A way to make the Zabbix sink fail for a chosen interval while the file sink keeps writing, to test the agent's fallback.

**Non-goals:** the agent, the MCP server, Grafana, a custom UI beyond the monitor page, TLS (the testbed is plain HTTP, [D16](../decisions/d16-zabbix-web-and-grafana-on-lan-with-shared-login.md)).

**Anti-goals (a failure even if it "works"):** slowing or breaking `zbxai_llama`, Zabbix web or the server; leaving test objects or large history behind in the real Zabbix; changing or losing the source log files; the file sink holding anything but the original lines.

## 3. Source data (observed read-only, 2026-11-26)
Folder `/unified/user/cj/data/log_files` on the testbed (10.168.50.40), module `ss7mapesms_SGB51`, 2026-10-14:
| File | Size | Lines | Covers |
|---|---|---|---|
| `ss7mapesms_SGB51_20261014_085524.txt` | 50 MB | 867,371 | 08:50:45.205 to 08:55:24.237 only |
| `ss7mapesms_SGB51_err_20261014_235959.txt` | 25 MB | 172,877 | 00:00:00 to 23:59:59 |

- **Common period:** 08:50:45.205 to 08:55:24.237 (279 s), the span of the main log. The error log has 344 lines in it.
- **Main log:** 134,842 timestamped records and 732,529 continuation lines (message headers, ASN.1 dumps, a leading blank line). About 483 records per second on average; **measured on the extract: busiest second 1,363, 95th percentile 763, busiest 100 ms tick 549 messages** (the log is bursty, so the tick batch cap of 200 splits the busiest ticks into three requests).
- **Error log:** one line per record, `MtSmsDeliveryHandler::getInternalErrorCode - Received TC_COMP_U_ERROR. [error:N]` in the sample seen. Other error kinds in the day were not surveyed (*unverified*). **All 344 error-log lines in the common period are verbatim copies of lines already in the main log**, so the extract drops them rather than replaying every error twice (found 2026-11-26 by a byte comparison of the first test run; the first design assumed they were distinct).
- **Content:** hex payloads that may carry subscriber numbers (not decoded). Rule 17: they stay on the testbed. The page shows a truncated message (first 160 characters); full text lives only in the run file and in Zabbix.

## 4. Owner's decisions (2026-11-26)
- Target the **real testbed Zabbix** (not a stub, not a throwaway).
- Replay at the **real pace, 480 messages per second**.
- Brainstorming choices proposed by the agent and not yet confirmed are listed in section 11.

**Zabbix version:** the testbed runs Zabbix 8.0.0 (the API answered `apiinfo.version` = `8.0.0` on 2026-11-26, [testbed.md](../operations/testbed.md)). The `history.push` method is documented on the 8.0 manual pages; that it works on this install is *unverified* until section 9 step 0. The push goes through the Zabbix web API, so the replayer needs only `zbxai_front` and `zabbix-web`, not the server's `zbxai_app` network. The plain trapper protocol (`zabbix_sender`, server port 10051) is **not** the fallback: it would need `zbxai_app` and drops the API token. If `history.push` does not work on 8.0.0, stop and ask the owner.

## 5. Approaches considered
| | Shape | Trade-off | Outcome |
|---|---|---|---|
| **A** | One Python container: replays from a stored extract, writes both sinks, serves the monitor page | Fewest parts and ports on a shared host; reuses the project's locked Python stack (`httpx`, `starlette`, `uvicorn`) | **Recommended** |
| B | Three containers (replayer, Zabbix stub, monitor page) | Cleaner separation; more networks and ports; the stub is not needed because the real Zabbix was chosen | Dropped |

Zabbix target options were: a stub first, a throwaway Zabbix, or the real one. The owner chose the real one, so section 8 lists every write it needs for sign-off.

## 6. Design (approach A)

### 6.1 Parts
```
 testbed host                                   zbxai_front network
 /unified/user/cj/data/log_files  (read once)
        |  stdin stream, no mount
        v
 [extract step] -> volume zbxai_replay_data (merged, sha256, manifest)
                          |  read-only
                          v
              container zbxai_replay  ---- history.push (batched) ---> zbxai_zabbix_web:8080
              (replayer + monitor page)
                |  append                  \
                v                           `-> page on LAN port (read-only view)
   /unified/user/cj/data/replay_out/<run_id>.txt
```
- **Extract step (my call):** run once, from the same image, with the log files streamed on stdin (`cat file | docker run -i`). No bind mount of `log_files`, so SELinux relabelling never touches the owner's data and the source stays untouched.
  - It keeps the records of the common period, merges main and error lines by timestamp (ties: main first, then error; stable), and attaches continuation lines to the record above them.
  - Output: one extract file in the volume, plus a manifest (counts, window, longest record, SHA-256). It is immutable; a new extract gets a new name.
- **Replayer:** reads the extract, schedules each message at `start + (message time − first message time) / speed` on a monotonic clock, and writes both sinks. Late messages are sent at once, and the lag is recorded and shown.
- **Container:** started by `scripts/replay.sh up` with `docker run` (not by compose: the testbed's compose copy has no deploy path and the rig must start only on request).
- **Runs:** started only by a script on the host (`docker exec`), one run at a time. The page is read-only; it cannot start a run against the real Zabbix. Run parameters are validated against a plain character set (rule 7).

### 6.2 Request shape at 480 per second — needs the owner's answer
The owner asked for "one by one". One HTTP request per message is about 480 API calls per second, each ending in a database write, through `zbxai_zabbix_web` on an 8-vCPU host shared with llama (CPU inference). That is likely to overload it (*unverified*; no load has been tried).
**Proposal:** keep one Zabbix value per message at the original pace, but send the messages due in each 100 ms tick in one `history.push` call (about 48 values). `history.push` takes an array; the docs give no size limit (*unverified*).
- Tick length and batch cap are parameters. Setting the batch cap to 1 gives one request per message, if the owner insists; the ramp test (6.6) says whether the host survives it.
- 480 per second is the target, not a promise: the page shows the **achieved** rate and lag next to it.

### 6.3 Timestamps
- **Zabbix:** each value's `clock` and `ns` are the **replay time** (the recorded gaps kept), so Zabbix triggers that look at the last minute work. The value text is the original record, with its 14 Oct stamp inside it.
- **File:** the original lines, byte for byte, in the original order (my call: the agent's fallback then sees the production format). The catch: a fallback agent that reasons over time windows will see 14 Oct stamps in the file. Option for the owner: a `--rewrite-stamps` switch that shifts the stamps in the file to the replay time (default off). See section 11.

The ledger (6.5) records both the original stamp and the replay time of every message, so the two sources can be matched later without a time-mapping feature. The agent does not compare the two sources in this test (my call, the agent does not exist yet).

**What a message is (my call):** a whole record is one message and one Zabbix value: the timestamped line plus its continuation lines. Error-log lines are messages of their own, merged with the main-log records. A Zabbix log value is limited in size (about 64 KB, *unverified*): the extract manifest reports the longest record; the HTTP sink truncates anything over the limit, counts it as `truncated` and shows that count on the page, and the file always keeps the full record.

### 6.4 File sink
`/unified/user/cj/data/replay_out/<run_id>.txt`, created exclusively (never overwritten, so earlier runs stay as they were), flushed per tick. Repeatable means the same input produces a byte-identical file; two runs can be compared by SHA-256. The container runs as a non-root user that owns that folder (builder to settle the uid and SELinux label on a folder created for this, not on the owner's data).

### 6.5 Monitor page
Read-only page on a new LAN port outside the table in [testbed.md](../operations/testbed.md) (to be checked free before use). It polls the replayer once per second (not one event per message: 480 DOM updates per second would freeze a browser).
- Shows: run ID, state, elapsed time, target vs achieved rate, lag, per sink counters (sent, ok, failed, truncated), an **error monitor** (error messages sent of the total, their delivery per sink, the last error and its log time, errors per log minute as bars with the trigger threshold as a dashed line), and **two message lists side by side: normal messages on the left, error messages on the right**. The lists hold every message sent so far, newest first, paged (Newest, Newer, Older, rows per page 100 to 2000; live until the user pages back), read from the extract by `/api/messages?kind=normal|error&limit=&before=`; text is cut to 300 characters. An *error message* is a line the module's error log also has: the extract flags it (`is_error`), including the main-log copy of a duplicate. The extract of 2026-11-26 09:40 has no flag; re-extract after this change. The old per-message sink status column is gone from the lists (the sink table and the ledger still carry delivery).
- **Every message is captured once** in a per-run ledger file (`<run_id>.ledger.jsonl`: sequence, planned time, actual time, sink, status), about 25 MB per run (estimate). The page counters come from the same counters, so they can be checked against the ledger.

### 6.6 Safety on the shared host (my call, modelled on `scripts/test-store.sh`)
- Before and during a run, check that `zbxai_zabbix_server`, `zbxai_zabbix_web`, `zbxai_postgres` and `zbxai_llama` are healthy and that available memory stays above a floor (3 GB, as in the test guard). **Abort the run** and report which check failed if not.
- **Ramp test first:** 10, 50, 150, 480 messages per second for 20 s each, with the same checks, before the full replay. The first step that fails stops the ramp.
- Container caps: 1 CPU, 512 MB, `cap_drop: ALL`, `no-new-privileges`, read-only root with a tmpfs, no capabilities.
- Network: `zbxai_front` only (reaches `zabbix-web`). It does **not** join `zbxai_app`, which would expose PostgreSQL and the server. No new subnet.
- The run script refuses to start if the container, the volume or the output folder carries a name that is not the project's.

**Pass or fail thresholds (my starting values, not measured):** a ramp step fails, and the run aborts, if the slowest sink has delivered less than 95% of the messages already due (over the last 5 s) for 10 s (the log's own pace varies, so the average target would abort quiet seconds), lag (95th percentile) exceeds 1 s, more than 1% of pushed values come back with an error, a `zabbix-web` request takes over 2 s, or `zbxai_llama`'s `/health` takes over 5 s. The rig assumes llama is idle during a run; the guard records its health response time every 5 s and the run script says so if llama was busy.

### 6.7 Zabbix outage test
`--outage START:END` (seconds from run start): the HTTP sink counts each message as failed without sending it, and the file sink carries on. The same input and the same window repeat identically. This simulates "Zabbix not available" without stopping the real Zabbix. A real stop of Zabbix is a separate step that needs the owner's word.

### 6.8 What the agent can see (checked against the MCP configuration)
The official MCP server on the testbed exposes only `host`, `hostgroup`, `trigger`, `problem` and `event` `_get` tools; item and history reads are denied ([D17](../decisions/d17-official-zabbix-mcp-server-as-interim.md)). So **the agent cannot read the pushed log lines through MCP; it sees triggers, problems and events.** That makes W4 the test surface, not a side detail.
- My call: the trigger name carries a sample of the offending line (`{ITEM.LASTVALUE}`) and the event gets tags (`module=ss7mapesms`, `node=SGB51`), so a problem is something the agent can analyse. Whether the macro is expanded in the event name returned by `problem.get` is *unverified* (step 5 of section 9).
- If the owner wants the agent to read raw log values from Zabbix, that needs `history_get` and `item_get` allowed on the MCP server, a separate decision, not part of this rig.
- The file path for the fallback is `/unified/user/cj/data/replay_out/` (section 6.4); the agent is pointed at it when it is built. No other contract exists yet.

## 7. Repeatable runs and cleanup
- Each run: new `run_id` (timestamp), new output file, new ledger. The extract does not change.
- **Volume in Zabbix:** one run is about 135 thousand values, roughly 50 MB of text, probably two to three times that in the database (*unverified*). The disk has about 40 GB free and is shared. The item keeps history for **1 day** only, and a `reset` command deletes and re-creates the item between runs to free the history on purpose (Zabbix has no API call to empty an item's history).
- **Trigger recovers between runs:** its recovery condition is the same count falling back (section 8), so run 2 does not start with a problem still open.
- Run files and ledgers are never deleted by the rig; the owner removes them.

## 8. Zabbix writes to sign off (rule 6)
Choosing the real Zabbix is not sign-off for objects nobody has named. These are **all** the writes. Nothing here has been done. Existing hosts, templates, users and settings are not touched.
| # | Object | Value |
|---|---|---|
| W1 | Host group | `ZBXAI replay` |
| W2 | Host | `ss7mapesms-SGB51-replay`, in `ZBXAI replay`, no agent interface (*unverified* that a host without an interface takes trapper items) |
| W3 | Items | Two Zabbix trapper log items, history 1 day, allowed hosts the `zbxai_front` subnet: `ss7mapesms.log` (every message, **no trigger**) and `ss7mapesms.errors` (the error messages only, pushed a second time with the same timestamp). Zabbix refuses two values of one item with the same clock and ns, so each pushed value is stamped at least 1 ns after the previous one |
| W4 | Trigger | On the error item: problem `count(/ss7mapesms-SGB51-replay/ss7mapesms.errors,1m)>=50`; recovery `count(…errors,1m)<10 or nodata(…errors,1m)=1` (without `nodata()` a `count()` trigger is not re-evaluated when no data arrives); severity Warning; the name carries the sample line (`{ITEM.LASTVALUE}`). Threshold from about 74 error lines per minute on average (129 in the busiest log minute); a starting value, not tuned |
| W5 | Push account | A user group (read-write on `ZBXAI replay` only), a role of type User, a user `zbxai_replay` and one API token, written 0600 to a token directory, never into docs, logs or chat (rule 12). It is **separate** from the read-only MCP user and token of Task 1.3, because pushing is a write capability. Whether the token's role permits `history.push` is *unverified* |
**Teardown** removes W5, then W4, W3, W2, W1, and nothing else. Item history goes with the item.

**Code:** `tools/zbx_provision` creates no hosts and no log items (checked in the code), so this needs new provisioning code, either an extension or a sibling module, plus tests. It goes in `codebase/`, never in this KB. It is tried first on a throwaway Zabbix (`ZBXAI_TEST_ZABBIX=1 scripts/test-store.sh` style) and only then applied to the real one, with the owner's go.

## 9. Unverified, to be checked by preflight (before any full run)
*Update 2026-11-26: steps 0 to 5 were run on a throwaway Zabbix 8.0.0; the results are in section 14 and the items they settle are marked there. Everything on the real Zabbix is still unverified.*
0. **On a throwaway Zabbix first, before any write to the real one:** run the provisioning code and one `history.push` against `ZBXAI_TEST_ZABBIX=1 scripts/test-store.sh`'s isolated Zabbix. This settles whether `history.push` exists on 8.0.0, whether W2 to W5 are the right objects and what a trigger on a pushed log item does, so the owner signs off W1 to W5 knowing they work.

After the owner signs off the writes on the real Zabbix, and before the ramp (steps 1 to 5 repeat there):
1. One `history.push` with one value; read the per-value `error` field, because the overall response can say `success` while a value failed.
2. **Allowed hosts:** which source address Zabbix checks for a push over the API: the replayer's or `zabbix_web`'s. Plan: allow the `zbxai_front` subnet (172.30.60.0/24), nothing wider.
3. **Log item behaviour:** whether a log-type item accepts pushed values, and what becomes of `source`, `severity`, `logeventid` (the docs say nothing). The trigger uses the text only, so these do not matter unless the pushed values are rejected.
4. A new item can take up to 60 s before it accepts values (docs).
5. The trigger fires during a run and recovers after it; the `count()`/`like` form works.

## 10. Rules and docs touched
Rules: 1 (Docker only), 2 (no new subnet, a new port checked free), 5 and 6 (section 8), 7 (validated parameters), 8 (every Zabbix read is bounded; pushes are capped by tick and batch size, and a limit hit is shown on the page), 12 (token), 14 (unverified marked), 15 (same-change), 17 (data stays on the testbed).
In the change that builds this: [testbed.md](../operations/testbed.md) (container, volume, port, folder, Zabbix objects), [topology.md](../architecture/topology.md) (container and flow), the backlog, and a decision record (proposed D18) when approved.

## 11. Owner's answers (2026-11-26)
1. **Batching:** decided: each 100 ms tick is one `history.push` (batch cap 1 stays available as a parameter).
2. **Write list:** **still open.** W1 to W5 as named in section 8 need the owner's separate go, after the throwaway-Zabbix trial; approval of the design is not approval to run them.
3. **File timestamps:** decided: original lines unchanged (`--rewrite-stamps` stays an optional switch, default off).

## 12. Left to the builder (my calls, checkable)
- Python on `zbxai_runtime`; `httpx` for pushes, `starlette` and `uvicorn` for the page; no new dependency.
- Whether the Zabbix sink gets every message (default, as asked) or errors only (a `--zabbix-filter` switch, to cut volume).
- The exact monitor port, the output folder owner, the layout of the ledger.
- Order of the plan: provisioning code and tests on a throwaway Zabbix; extract; replayer and page with unit tests; then, with the owner's go, W1 to W5, preflight, ramp, full run, outage run.

## 13. Success looks like
- Two runs give byte-identical output files and equal ledger counts.
- The page counters equal the ledger totals; achieved rate and lag are shown.
- In the real Zabbix the item receives the pushed values (count of per-value successes equals the page's ok count), the trigger fires during the run and recovers after it.
- In an outage run, HTTP failures are counted for the window and the file is still complete.
- `zbxai_llama`, `zbxai_zabbix_*` and every other container stayed healthy during and after, and `reset`/teardown leaves nothing behind in Zabbix.

## 14. Build state and findings (2026-11-26)
**Built** (code repo `/unified/user/cj/ai_agent/zabbix_agent/codebase`, not committed): `tools/log_replay/` (extract, schedule, sinks, run state, guard, runner, monitor page, CLI), `tools/zbx_replay_provision/` (W1 to W5: apply, teardown, reset-item), `scripts/replay.sh`, 353 unit tests passing (41 skipped: they need a throwaway Zabbix or database), `tests/integration/test_replay_live.py`. A fresh Opus review of the whole build found 3 critical and 6 important problems; all were fixed with tests and each fix was checked by reverting it and watching its test fail. Six minor findings are deferred (ledger of the session).

**Where the build differs from the design as first written** (each is a ruling that the owner may overrule):
- **Error lines:** the 344 error-log lines in the window are verbatim copies of main-log lines; the extract drops them (section 3). The error log adds nothing for this window.
- **Order:** the extract keeps the source order (the main log has 34 stamps that go backwards), so the output file equals the source file; the schedule is made non-decreasing.
- **Container:** started with `docker run` by `scripts/replay.sh up`, not by compose (section 6.1).
- **Recovery:** the trigger's recovery expression has `nodata()` (section 8); without it the problem never closes.
- **Allowed hosts:** Zabbix checks the sender's address; the default is the `zbxai_front` subnet (section 8, W3).
- **Guard:** the rate rule compares messages delivered with messages due (section 6.6); a deliberately stopped container (Grafana) does not block a run, a running unhealthy one does; if the host script is interrupted it tells the replay to stop through the abort flag; the probes run on their own thread; the guard and the page state are served about every second even inside a quiet gap of the log.
- **Outage window:** counted on the planned time of a message, so the same messages fail in every run (section 6.7).
- **Values to Zabbix:** the raw bytes become UTF-8 text (invalid bytes as `\xNN`, NUL as `\x00`), the size limit counts UTF-8 bytes; the file always holds the original bytes.
- **Timeouts:** the Zabbix read timeout is 10 s. A push that times out may still have been stored by Zabbix, so "per-value successes equal the page's ok count" (section 13) holds only for a run without timeouts.
- **Not built:** `--rewrite-stamps` and `--zabbix-filter` (optional in the design, not asked for).

**Measured on the real testbed (file path only):** full-speed run of the whole window: 134,842 messages in 279.1 s, 0 failures, lag p95 5 ms; output byte-identical to the source main log minus its leading blank line; two runs gave the same SHA-256; no other container changed.
**Measured on a throwaway Zabbix 8.0.0:** see the testbed doc ([testbed.md](../operations/testbed.md), section "log replay rig").

**Still needs the owner:** the go for W1 to W5 on the real Zabbix (`scripts/replay.sh provision apply --signoff W1,W2,W3,W4,W5`), a second go for the ramp and the full run through Zabbix, and the decision whether the agent should read raw log values through MCP (section 6.8). Backlog: `replay-real-zabbix-go`, `replay-http-rate`, `replay-page-browser-check`, `replay-agent-reads-raw-log`.

## 15. The real Zabbix, 2026-11-27
W1 to W5 were applied to the real Zabbix with the owner's go and read back as designed. One preflight value and a ramp (up to 480 messages per second) passed. A full-speed replay through Zabbix does **not** hold: after 97 s the Zabbix server's history cache filled ("History cache is full. Sleeping for 1 second."), pushes stalled up to 31 s, 1,093 of 47,521 failed and the guard stopped the run; the server then drained about 24 values per second (one history syncer saturated by one busy item with a minute-long `count()` trigger; server defaults of 16 MB cache and 4 writers). Values that sat in the cache were minutes old when processed, so the trigger never fired.
Also found: Zabbix rejects a log value whose clock and ns equal an earlier one's, and the log has several messages per millisecond; the sink now stamps each value at least 1 ns after the previous one (test first, then fixed).
**Open for the owner:** how to get the errors through Zabbix in real time: (a) a second item for error lines only carrying the trigger, the all-lines item without trigger (changes W3 and W4), (b) only error lines to Zabbix (`--zabbix-filter`, the design's optional switch), (c) a larger history cache and more syncers on `zbxai_zabbix_server` (a reconfiguration of the real server), (d) a slower replay.

## 16. Resolution of the stall: the trigger moved to an error-only item (2026-11-27, owner chose option a)
A trigger counting matching lines over a minute of a busy item made the Zabbix server's single history syncer for that item the bottleneck (about 24 values per second). Now the trigger is on a second item that holds only the error messages (344 values), and the all-lines item has no trigger.
**Measured on the real Zabbix:** once the old trigger left the all-lines item, the server cleared its backlog at about 750 rows per second and fell to about 0.5% CPU. Full-speed replay through Zabbix: all 134,842 messages to both the file and Zabbix in 279.1 s, 0 failures, lag p95 8 ms and max 0.17 s at 129 s, no "History cache is full", the server at 5% CPU. Zabbix stored 134,844 values on `ss7mapesms.log` (the replay plus two preflight values) and 345 on `ss7mapesms.errors` (344 plus one preflight). The trigger raised one problem 61 s into the run (the log's busy error minutes) and recovered 85 s after the run ended. The file is byte-identical to the source, SHA-256 `5d22e34a…`, as in every earlier run.
**Still unverified:** the outage run (`--outage`), the monitor page in a browser, and whether the Zabbix server keeps up with the peak of 1,363 messages per second over longer logs (this window did).
