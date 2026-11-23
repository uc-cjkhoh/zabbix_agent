---
title: D13 Testbed is a rehearsal; the 50+ modules are a sizing reference
description: Owner decision that the testbed rehearses the design and the real 50+ modules are unreachable and only shape sizing
components: []
---

# D13 — The testbed is a rehearsal; the 50+ modules are a sizing reference

**Status:** owner decision.

**Decision:** The testbed (10.168.50.40) rehearses the design; it is not the deployment target. The real
50+ modules run on another host that is not reachable from here. They serve only as a reference for
estimating performance and capacity.

**Consequences:**
- Targets in the [design plan](../architecture/design-plan.md) are rehearsal targets; numbers are measured
  again on the real hardware before any commitment.
- The scale test uses simulated load. Until the owner gives real numbers, the assumption is 100 items per
  module at a 60 s interval, about 83 new values per second, tested at 3 times that.
- No outside agents report in, so the Zabbix server port need not be published beyond the Docker network.
- The CPU-only sizing is the rehearsal's, not the target's. Compose files take the model, runtime, database
  and ports as config, with no testbed-specific values.
- SQLite for Grafana is enough for the rehearsal; a real target should use an external database.

**Open (optional, Q13):** the real target's hardware (GPU or not) and real per-module numbers.
