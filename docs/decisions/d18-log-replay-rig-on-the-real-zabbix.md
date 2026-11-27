---
title: D18 Log replay rig against the real testbed Zabbix
description: Owner decision to test the agent with a replay of a real module log sent to the real testbed Zabbix over HTTP and to a local file, at the recorded pace
components: []
---

# D18 — Log replay rig against the real testbed Zabbix

**Status:** owner decision (2026-11-26): "use the real testbed zabbix, 480 messages per second", design approved with the agent's picks (one `history.push` per 100 ms tick, the file keeps the original lines). Design: [log-replay-rig-design.md](../development/log-replay-rig-design.md); plan: [log-replay-rig.md](../development/implementation-plan/log-replay-rig.md).

**Decision:** Replay 4m39s of the real `ss7mapesms_SGB51` module log (2026-10-14 08:50:45 to 08:55:24) at its recorded pace to two sinks: HTTP (`history.push` to the real Zabbix) and a plain file, with a read-only monitor page, to test the Llama agent's Zabbix-MCP path and its local-file fallback.

**Why:** The agent has to be tried on real module errors both through Zabbix and, when Zabbix is down, from the module's own log file. The owner chose the real Zabbix over a stub or a throwaway so the test is the real path.

**Guards:** every Zabbix write is named in the design (W1 to W5) and needs the owner's separate go (rule 6); a host script snapshots every other container and aborts the run on any change; the push account can call `history.push` only; log content stays on the testbed (rule 17); the rig starts nothing but its own container.

**Facts found while building (2026-11-26):**
- On a throwaway Zabbix 8.0.0 (not the real one): `history.push` through the API works for a log-type trapper item on a host with no interface; Zabbix checks the **sender's** address against the item's allowed hosts (allowing only the web container was refused); a trigger on `count()` alone never recovers without new data, so the recovery expression carries `nodata()`; the problem name expands `{ITEM.LASTVALUE}` with the full log line; a role with `history.push` only is refused `host.get`.
- The error log's 344 lines in the common period are verbatim copies of lines already in the main log; the extract does not replay them twice.
- The log is bursty: 483 messages per second on average, 1,363 at the busiest second, 549 in the busiest 100 ms tick.

**On the real Zabbix (2026-11-27, owner's go):** the five objects were created and read back as designed; allowed hosts `172.30.60.0/24` is right. The first full-speed replay stalled after 97 s (`History cache is full`: a minute-long `count()` trigger on one busy log item saturated the single history syncer that handles an item, about 24 values per second). **Owner decision (option a): the trigger moved to a second, error-only item; the all-lines item has no trigger.** Zabbix also refuses two values of one item with the same clock and ns: each pushed value is stamped at least 1 ns after the previous one. Result: the full window (134,842 messages) went to the file and to Zabbix in 279.1 s with 0 failures; Zabbix stored every message and every error; the trigger fired once and recovered after the run.

**Unverified:** the outage run; behaviour on longer or busier logs than this window.

**Revisit:** after the first run against the real Zabbix, or if the agent needs raw log values through MCP (`history_get`, `item_get` are denied by [D17](d17-official-zabbix-mcp-server-as-interim.md)).
