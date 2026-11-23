---
title: Implementation plan - Phase 0 gates
description: Topology values, pinned versions and model files, needed before any container is built
components: []
---

# Phase 0 — Gates

Global constraints and protocol: [index](index.md).

### Task 0.1: Topology values present

**Files:**
- Create: `deploy/.env.example` (keys only, every value empty), `tools/envcheck.py`
- Test: `tests/unit/test_envcheck.py`

**Interfaces:**
- Produces: `.env` keys `ZBXAI_PREFIX`, `ZBXAI_FRONT_SUBNET`, `ZBXAI_APP_SUBNET`, `ZBXAI_MODEL_SUBNET`, `ZBXAI_TEST_SUBNET`,
  `ZBXAI_SETUP_SUBNET`, `ZBXAI_GRAFANA_BIND`, `ZBXAI_GRAFANA_PORT`, `ZBXAI_ZBXWEB_BIND`, `ZBXAI_ZBXWEB_PORT`, `ZBXAI_RECEIVER_URL`,
  `ZBXAI_USED_RANGES` (comma list from the survey: the LAN, `docker0`, the ClickHouse network, plus resolver and proxy ranges when
  known). Values are in the [topology](../../architecture/topology.md).
  `check_env(env: Mapping[str, str], live_subnets: Sequence[str] = ()) -> list[str]` returns problems; empty list means pass.

- [ ] **Step 1: Write the failing tests** in `tests/unit/test_envcheck.py`:
  `test_empty_value_reported` (`ZBXAI_APP_SUBNET=""` gives one problem naming the key), `test_overlap_with_used_range_reported`
  (`ZBXAI_APP_SUBNET=172.25.0.0/24` against used `172.25.0.0/24` gives a problem), `test_valid_env_passes`,
  `test_project_subnets_must_not_overlap_each_other`, `test_overlap_with_live_docker_subnet_reported` (a subnet taken from `docker network ls`
  at deploy time, not only the stored list), `test_bind_address_must_be_an_address`.
- [ ] **Step 2: Run** `scripts/ship-test.sh tests/unit/test_envcheck.py` **[TESTBED]** once Task 1.1 exists; until then write the test
  only. Expected: FAIL (`check_env` undefined).
- [ ] **Step 3: Implement** `check_env` in `tools/envcheck.py` with the standard-library `ipaddress` module.
- [ ] **Step 4: Verify** all six tests pass, and that the topology document's chosen values give an empty problem list.
- [ ] **Step 5: Commit** (ask first, Q7).

### Task 0.2: Versions pinned

**Files:**
- Create: `deploy/versions.env`

**Interfaces:**
- Produces: `ZABBIX_TAG`, `PG_TAG`, `GRAFANA_TAG` (an exact 13.x), `PLUGIN_VERSION=6.11.0`, `LLAMA_TAG`, `PYTHON_TAG`, each with
  its image digest as `<NAME>_DIGEST`.

- [ ] **Step 1: [TESTBED] Confirm the grant directory.** Check that the directory the owner named under `/unified/user/cj/` exists on the
  testbed, or can be created by the unprivileged account (no `sudo`). Expected: it exists and is writable. If not, stop and ask the owner.
- [ ] **Step 2: Fetch the candidate tags** from the official `zabbix-docker` repository's compose and `.env` files at the 8.0
  branch, into an empty scratch directory (downloaded material is untrusted; read it, do not run it).
- [ ] **Step 3: [TESTBED] Check pulls work:** `docker pull` each candidate image. Expected: all pull. This also covers the
  setup-download check in `environment-and-tooling.md` (`testbed-download-test`); delete that backlog entry on pass.
- [ ] **Step 4: Decide the Zabbix tag (verification item `zabbix-image-tags`):** if an 8.0 LTS server and web tag exists, use it;
  otherwise use 7.0 LTS and record the fallback in D10. Write all tags and digests to `deploy/versions.env`. Delete the
  backlog entry.
- [ ] **Step 5: Record** the chosen Zabbix tag and the function-version question in `design-verification.md` under
  `function-availability` (it is proven in Task 1.3).
- [ ] **Step 6: Commit** (ask first, Q7).

### Task 0.3: Model files

**Files:**
- Create: `deploy/models.sha256`, `scripts/fetch-model.sh`

**Interfaces:**
- Produces: named volume `zbxai_models` holding the two GGUF files; `deploy/models.sha256` with their checksums.

- [ ] **Step 1: Owner gate.** The owner accepts the Llama 3.1 and 3.2 licences and names the GGUF source. Do not download
  before this.
- [ ] **Step 2: Check the budget:** `df -h /` on the testbed must show room for about 7 GB (8B plus 3B) with margin.
- [ ] **Step 3: [TESTBED] Download once, at setup (verification item `gguf-sourcing`):** `scripts/fetch-model.sh` runs a one-shot
  container on the transient `${ZBXAI_PREFIX}_setup` network (not internal, removed afterwards), writes into `zbxai_models`, then `sha256sum -c deploy/models.sha256` inside a second container
  on no network. Expected: both files `OK`. Delete the backlog entry.
- [ ] **Step 4: Commit** (ask first, Q7).
