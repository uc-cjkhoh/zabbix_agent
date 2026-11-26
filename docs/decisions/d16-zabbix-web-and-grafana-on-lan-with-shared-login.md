---
title: D16 Zabbix web and Grafana on the LAN with a shared development login
description: Owner decision to publish Zabbix web and Grafana on 0.0.0.0 and to use one shared development login, also for the llama web UI
components: []
---

# D16 — Zabbix web and Grafana on 0.0.0.0, one shared development login

**Status:** owner decision (2026-11-24): the owner asked to set up the Zabbix and Grafana containers first, bound to `0.0.0.0` for remote access, with one shared development login
for all three consoles, including the llama web UI on `0.0.0.0:18081`.

**Decision:**
- Zabbix web is published on `0.0.0.0:18080` and Grafana on `0.0.0.0:13000` (`ZBXAI_ZBXWEB_BIND`, `ZBXAI_GRAFANA_BIND`). This overrides the topology's earlier choice of loopback for Zabbix web
  and the testbed's LAN address for Grafana.
- Grafana's admin login is the shared development login, read from files in the named volume `zbxai_secrets` (`GF_SECURITY_ADMIN_*__FILE`), so it is in no compose file, `.env` or script.
- The llama web UI (the proxy's basic auth) uses the same login; the API key stays valid as `Authorization: Bearer <key>` for API clients. The old basic login `llama:<key>` is gone ([D15](d15-llama-lan-access-through-authenticated-proxy.md)).
- The login is written once, on the testbed, to the git-ignored `deploy/secrets/web-credential` (one line `user:password`) and in the git-ignored [credentials.local.md](../operations/credentials.local.md). It never appears in this KB.
- PostgreSQL's password is not the shared login: it is random, made by `scripts/secrets-init.sh`, and the database is on the internal `zbxai_app` network with no published port.

**Consequences (the owner accepted them):**
- The password is short and guessable, and both consoles are plain HTTP on the whole LAN. Zabbix web is admin-capable. Anyone on the LAN who guesses the login can change monitoring. Treat this as a rehearsal setting; before real use,
  set a strong password and put TLS in front, or return Zabbix web to loopback with the ssh tunnel described in the [topology](../architecture/topology.md).
- Zabbix's built-in password policy (minimum 8 characters, easy-to-guess check) rejected that password, so on the owner's choice it was relaxed (minimum length 1, easy-to-guess check off) and the default `Admin` account was renamed to the shared login. The relaxed policy applies to every future Zabbix user too; restore it (8, rules 8) with a strong password before real use. The default `Admin`/`zabbix` login no longer works.
- Grafana's startup plugin fetching (preinstall, auto-update, key retrieval) is switched off in compose, so Grafana makes no run-time download ([D12](d12-operational-data-stays-in-network.md)); `front` is not internal, so the setting is what enforces it.
- Grafana applies its admin login only when it first creates its database; a later change needs `grafana cli admin reset-admin-password`.
- Unchanged: Grafana is read-only and runs no alert rules ([D8](d8-grafana-only-notification.md), [D11](d11-grafana-monitoring-ui.md)); `zbxai_app` has no egress ([D12](d12-operational-data-stays-in-network.md)).
