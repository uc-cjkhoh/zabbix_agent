---
title: D7 Thin read-only MCP server
description: A small custom MCP server with bounded read tools, not the official wide-surface one
components: []
---

# D7 — Thin custom read-only MCP server

**Status:** decided (design plan approved by the owner).

**Decision:** Build an MCP server with about six typed, bounded, read-only tools. Zabbix access uses a role of
type User with API access and only `*.get` methods allowed, as a second guard.

**Why:** An 8B CPU model pays prefill time for every tool schema and chooses worse as the list grows. Typed
tools let each carry a validated row limit and time window (core safety rule 3). The official
`zabbix-mcp-server` has no read-only flag, only allow and deny lists, and is documented for the matching
Zabbix version.

**Owner-confirmed:** the agent is read-only against Zabbix in v1.

**Unverified:** that a User-type role with a `*.get` allow-list blocks all writes (the subagent's suggestion,
not documented behaviour). Tracked in the [verification backlog](../development/backlog/design-verification.md).

**Revisit:** if the tool set grows past a handful, or the official server gains a read-only mode.
