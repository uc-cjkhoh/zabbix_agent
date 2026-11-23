---
title: Implementation plan - Phase 4 packaging
description: Portable packaging for the real target and syncing the KB with what was built
components: []
---

# Phase 4 — Packaging for the real target

Global constraints and protocol: [index](/unified/user/cj/knowledge/ai_agent/zabbix_agent/docs/development/implementation-plan/index.md). Needs Phase 3. Each task ends with a commit step (ask first, Q7).

### Task 4.1: Portable packaging

**Files:**
- Modify: `/unified/user/cj/ai_agent/zabbix_agent/deploy/compose.yaml`, `/unified/user/cj/ai_agent/zabbix_agent/deploy/.env.example`
- Create: `/unified/user/cj/knowledge/ai_agent/zabbix_agent/docs/operations/sizing.md` (KB)
- Test: `/unified/user/cj/ai_agent/zabbix_agent/tests/unit/test_portable.py`

**Interfaces:**
- Produces: compose profiles `model-8b` and `model-3b` (exactly one selected), `bundled-db` (omit it to use an external PostgreSQL through
  `ZBXAI_PG_HOST`), an option for Grafana's own database to be external, and the template item type `agent` for hosts that run a real
  Zabbix agent (the rehearsal uses `trapper`).

- [ ] **Step 1: Write failing tests:** `test_no_testbed_values_in_src_or_deploy` (no `10.168.`, `172.17.`, `172.25.`, `/unified/`, `chcluster`,
  the testbed login, or a literal port in `/unified/user/cj/ai_agent/zabbix_agent/src/` or `/unified/user/cj/ai_agent/zabbix_agent/deploy/`), `test_exactly_one_model_profile_starts`, `test_external_db_needs_no_bundled_db`,
  `test_agent_item_type_template` (`item_type="agent"` produces agent-type items with the same keys and triggers).
- [ ] **Step 2: Run, expecting FAIL. Step 3: Implement** the profiles and options. **Step 4: Run, expecting PASS.**
- [ ] **Step 5: Write `/unified/user/cj/knowledge/ai_agent/zabbix_agent/docs/operations/sizing.md`** from the measured numbers in `/unified/user/cj/knowledge/ai_agent/zabbix_agent/docs/operations/benchmarks.md`: inputs (modules, items per module, interval, NVPS), the
  formulas (RAM = Zabbix and database + model file + context + agent; latency from `estimate_latency`; disk per day from NVPS and
  retention), and the measured values from the rehearsal, each labelled measured or estimated. State that the real target's numbers
  are measured again (D13).

### Task 4.2: Sync the KB with what was built

**Files:**
- Modify: KB docs under `/unified/user/cj/knowledge/ai_agent/zabbix_agent/docs/` (architecture, operations, decisions, development), `/unified/user/cj/knowledge/ai_agent/zabbix_agent/CLAUDE.md`

- [ ] **Step 1: For every built task,** move its description into the owning KB doc as current behaviour (the same-change rule), add the code
  paths to each doc's `components:` front-matter, and add `how-to` docs for deploy, test and teardown.
- [ ] **Step 2: Update `/unified/user/cj/knowledge/ai_agent/zabbix_agent/CLAUDE.md`** section 2 (code location), section 5 (build, run, test, deploy commands, how to stop a run safely), section 6
  (source layout) and the where-things-live table.
- [ ] **Step 3: Remove** this plan's files and any verification or backlog entry that passed; list anything left open in the backlog.
- [ ] **Step 4: Run** the KB check (recreate the lint script, or wire the `kb-lint-hook` backlog item, Q6) and confirm it reports no failures; run `command grep` for secrets across the KB and the
  code repo (only git-ignored `*.local.md` may hold a credential).
- [ ] **Step 5: One cold whole-branch review** by a fresh reviewer on the most capable model, given the diff and the design plan, not conclusions.
  Fix findings, then ask the owner before any merge (Q7).
