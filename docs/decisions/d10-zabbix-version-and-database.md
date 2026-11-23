---
title: D10 Zabbix version and database
description: Zabbix 8.0 LTS (fallback 7.0 LTS) from official Docker images with PostgreSQL
components: []
---

# D10 — Zabbix 8.0 LTS with PostgreSQL, from official images

**Status:** owner-approved (Q4), gated by the image-tag check below.

**Decision:** Install the current LTS (8.0, fall back to 7.0 LTS) from the official `zabbix-server-pgsql` and
`zabbix-web-nginx-pgsql` images, with a separate PostgreSQL container on a named volume.

**Why:** 7.0's full support ends in June 2027, close to this project's start; 8.0 is supported to November 2029.
The container's base OS is independent of the AlmaLinux host.

**Unverified (gate before install):** the source page contradicts itself on 8.0's release date, so confirm the
8.0 image tags exist; the minimum version of each trend and baseline function; image behaviour under SELinux
Enforcing with named volumes. Tracked in the [verification backlog](../development/backlog/design-verification.md).
