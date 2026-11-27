---
title: Coding standards (golden rules)
description: Rules every change follows, from the owner's requirements and from agent-behavior's core safety rules
components: []
---

# Golden rules

Source tags: **Owner** = the owner's development restrictions; **Core n** = rule n in agent-behavior
`core/safety-data-network.md`; **Shared** = `core/shared-machine.md`.

## Environment (every change)
1. **Docker only.** Every runtime component runs in a container ([D2](../decisions/d2-docker-isolation.md)). *Owner.*
2. **No network clash.** Survey the host's bridges first; use a subnet and ports the host does not use
   ([D3](../decisions/d3-network-isolation.md)). *Owner.*
3. **Project root is `/unified/user/cj/`** on any machine; keep other folders clean and isolated. *Owner.*
4. **Prefix what you create** (containers, networks, volumes) so cleanup touches only ours; never `pkill -f`
   or a broad `rm` on a shared host. *Shared.*

## Data and tools (every server change)
5. **Read-only first.** The agent reads Zabbix through a read-only API account; add a second guard at the
   system level, not only in code. *Core 1.*
6. **A new write is its own decision.** Acknowledging, tagging, creating items or closing problems each need
   explicit sign-off; the adjacent write being approved does not extend. *Core 8.*
7. **Validate before interpolating.** Anything from outside, including model output and Zabbix-supplied
   names, is checked against an allow-list or the live source before it reaches a command, query or path,
   escaped by one shared helper. *Core 2.*
8. **Bind and bound.** MCP tools take typed parameters and a whitelist of operations; every history, trend or
   problem query has a validated item limit and a time limit. Out-of-range input is rejected, never clamped;
   a result that hit its limit says so. *Core 3.*
9. **One contract, both sides.** Each MCP tool has one schema (types, limits, error wording). The tool
   definition the model sees and the server-side validation both use it; the server is authoritative. *Core 4.*
10. **Assertions are not facts.** A threshold or relationship the owner declares and the system cannot verify
    is recorded as a declaration. *Core 6.*
11. **Multi-step actions tolerate partial failure:** idempotent, ordered so a failure leaves a duplicate, not
    a gap. *Core 9.*

## Secrets
12. **One place.** Never in a response, log, error, URL, shared doc or commit. Docs use `<user>` and
    `<password>`. Real values go only in git-ignored `*.local.md` files or a secret store. *Core 5.*
13. **Credentials given in chat** are used once through an environment variable and then revoked or scoped. *Shared.*

## Honesty and docs
14. **Mark the unverified.** Planned is not installed; declared is not observed.
15. **Docs follow the code, in the same change.** Where they disagree, the code wins and the doc is fixed.
    After any change that alters something a doc describes: overwrite the stale lines in the owning doc,
    search the docs for the old wording and fix every hit, and fix inbound links when moving a file or heading.
    A question or read-only check needs no edit.

## Monitoring UI
16. **Grafana is read-only and never a second alert engine.** Its Zabbix data source uses its own read-only API
    token, separate from the agent's; its analyses data source uses a SELECT-only database role enforced in the
    database; no Grafana alert rules; the default admin password is changed at first
    start; the admin credential and token live only in the secret store. *Core 1, Core 5.*

## Network and data
17. **Operational data stays in the network.** No external service receives alert, metric, log or analysis data; no
    run-time outbound dependency; downloads happen at setup only ([D12](../decisions/d12-operational-data-stays-in-network.md)). *Owner.*
