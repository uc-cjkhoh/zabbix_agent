---
title: D16 Zabbix web and Grafana on the LAN with a shared development login
description: Owner decision to publish Grafana on 0.0.0.0 with one shared development login; Zabbix web is on host loopback only since D19
components: []
---

# D16 — Grafana on 0.0.0.0, one shared development login (Zabbix web on loopback since D19)

**Status:** owner decision (2026-11-24): the owner asked to set up the Zabbix and Grafana containers first, bound to `0.0.0.0` for remote access, with one shared development login
for all consoles. **Amended 2026-11-27 by [D19](d19-scope-cut-after-full-review.md):** Zabbix web is published on host loopback only (`127.0.0.1:${ZBXAI_ZBXWEB_PORT}`, reach it through an ssh tunnel); the llama proxy and its web UI no longer exist. The text below is the original decision; the consequences that mention Zabbix web on the LAN no longer apply once the new compose file is applied on the testbed (until then the running container is still on `0.0.0.0:18080`, *unverified*).

**Decision:**
- Zabbix web was published on `0.0.0.0:18080` and Grafana on `0.0.0.0:13000` (`ZBXAI_ZBXWEB_BIND`, `ZBXAI_GRAFANA_BIND`). This overrode the topology's earlier choice of loopback for Zabbix web
  and the testbed's LAN address for Grafana. Since D19 only Grafana is on `0.0.0.0`; `ZBXAI_ZBXWEB_BIND` is gone from compose.
- Grafana's admin login is the shared development login, read from files in the named volume `zbxai_secrets` (`GF_SECURITY_ADMIN_*__FILE`), so it is in no compose file, `.env` or script.
- The llama web UI shared the same login through the proxy's basic auth. The proxy was removed by D19, so this no longer applies.
- The login is written once, on the testbed, to the git-ignored `deploy/secrets/web-credential` (one line `user:password`) and in the git-ignored [credentials.local.md](../operations/credentials.local.md). It never appears in this KB.
- PostgreSQL's password is not the shared login: it is random, made by `scripts/secrets-init.sh`, and the database is on the internal `zbxai_app` network with no published port.

**Consequences (the owner accepted them):**
- The password is short and guessable, and both consoles are plain HTTP on the whole LAN. Zabbix web is admin-capable. Anyone on the LAN who guesses the login can change monitoring. Treat this as a rehearsal setting; before real use,
  set a strong password and put TLS in front, or return Zabbix web to loopback with the ssh tunnel described in the [topology](../architecture/topology.md).
- Zabbix's built-in password policy (minimum 8 characters, easy-to-guess check) rejected that password, so on the owner's choice it was relaxed (minimum length 1, easy-to-guess check off) and the default `Admin` account was renamed to the shared login. The relaxed policy applies to every future Zabbix user too; restore it (8, rules 8) with a strong password before real use. The default `Admin`/`zabbix` login no longer works.
- Grafana's startup plugin fetching (preinstall, auto-update, key retrieval) is switched off in compose, so Grafana makes no run-time download ([D12](d12-operational-data-stays-in-network.md)); `front` is not internal, so the setting is what enforces it.
- Grafana applies its admin login only when it first creates its database; a later change needs `grafana cli admin reset-admin-password`.
- Unchanged: Grafana is read-only and runs no alert rules ([D8](d8-grafana-only-notification.md), [D11](d11-grafana-monitoring-ui.md)); `zbxai_app` has no egress ([D12](d12-operational-data-stays-in-network.md)).
