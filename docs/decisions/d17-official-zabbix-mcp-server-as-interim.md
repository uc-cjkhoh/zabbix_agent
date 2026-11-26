---
title: D17 Official Zabbix MCP server as an interim step
description: Owner decision to run Zabbix's own zabbix-mcp-server image first, while D7's thin custom server stays the target
components: []
---

# D17 — Official Zabbix MCP server first (interim)

**Status:** owner decision (2026-11-26): "install zabbix mcp server with docker first", and chose the official server over building the custom one.

**Decision:** Run `zabbix/zabbix-mcp-server` (8.0 line, pinned by digest) as `zbxai_mcp` on `zbxai_app`, with an allow list of `host`, `hostgroup`, `trigger`, `problem` and `event` `_get` tools and every other tool denied. [D7](d7-thin-readonly-mcp-server.md) is not replaced: the thin custom server stays the target.

**Why:** It lets the Zabbix side and the MCP path be tried before the agent exists, with no code to write. D7's reasons against it still stand (no read-only flag, only allow and deny lists; Zabbix's own tools are wider than the agent needs), so this is not the production choice.

**Guards:** the allow and deny rules, a read-only Zabbix token held by the caller (not by the server), and no published port.

**Bounds (rule 8):** the server's config comments describe a per-call `limit` (default 100, maximum 1000), `MaxResponseSize` (default 64K) and a request `Timeout` (default 10 s). None is set in compose, so the defaults apply; the caller must still send its own smaller limit and time window, and the server's behaviour is *unverified*. Rule 8 is not claimed as met.

**Unverified:** that the exposed tools can only read, once a token exists; which tools the allow rule actually exposes; the bounds above; whether the server makes any call other than to Zabbix; memory under load (4.95 MiB idle). Check: backlog item `official-mcp-checks` in the [verification backlog](../development/backlog/design-verification.md); state in the [testbed](../operations/testbed.md).

**Revisit:** when the thin server of D7 is built (implementation plan Tasks 2.0 to 2.4), or if the official server gains a read-only mode.
