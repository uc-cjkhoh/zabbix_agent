---
title: Implementation plan - Phase 0 gates
description: Topology values, pinned versions and model files, needed before any container is built
components: []
---

# Phase 0 — Gates

Global constraints and protocol: [index](/unified/user/cj/knowledge/ai_agent/zabbix_agent/docs/development/implementation-plan/index.md).

### Task 0.1: Topology values present

**Files:**
- Create: `/unified/user/cj/ai_agent/zabbix_agent/deploy/.env.example` (keys only, every value empty), `/unified/user/cj/ai_agent/zabbix_agent/.gitignore` (`/unified/user/cj/ai_agent/zabbix_agent/.env`, `/unified/user/cj/ai_agent/zabbix_agent/deploy/secrets/`, `*.local.*`), `/unified/user/cj/ai_agent/zabbix_agent/.dockerignore` (`/unified/user/cj/ai_agent/zabbix_agent/.env`, `.git`, secrets, caches), `/unified/user/cj/ai_agent/zabbix_agent/tools/envcheck.py`
- Test: `/unified/user/cj/ai_agent/zabbix_agent/tests/unit/test_envcheck.py`

**Interfaces:**
- Produces: `/unified/user/cj/ai_agent/zabbix_agent/.env` (git-ignored, repo root; created from `/unified/user/cj/ai_agent/zabbix_agent/deploy/.env.example`) keys `ZBXAI_PREFIX`, `ZBXAI_FRONT_SUBNET`, `ZBXAI_APP_SUBNET`, `ZBXAI_MODEL_SUBNET`, `ZBXAI_TEST_SUBNET`,
  `ZBXAI_SETUP_SUBNET`, `ZBXAI_GRAFANA_BIND`, `ZBXAI_GRAFANA_PORT`, `ZBXAI_ZBXWEB_BIND`, `ZBXAI_ZBXWEB_PORT`, `ZBXAI_RECEIVER_URL`,
  `ZBXAI_USED_RANGES` (comma list from the survey: the LAN, `docker0`, the ClickHouse network, plus resolver and proxy ranges when
  known). Also `LLAMA_CTX_SIZE` (32768), `LLAMA_THREADS` (6), `ZBXAI_EDGE_BIND` (0.0.0.0) and `ZBXAI_EDGE_PORT` (18081), which `compose.yaml` reads; they exist in `.env` since the llama slice and
  must stay in `.env.example` and in `check_env`'s key list, or Compose passes an empty `--ctx-size` or fails on the edge port. `ZBXAI_FRONT_SUBNET` is already used by `zbxai_front`, created by the llama edge proxy ([D15](/unified/user/cj/knowledge/ai_agent/zabbix_agent/docs/decisions/d15-llama-lan-access-through-authenticated-proxy.md)); Task 1.1 must adopt that network, not recreate it. Values are in the [topology](/unified/user/cj/knowledge/ai_agent/zabbix_agent/docs/architecture/topology.md).
  `check_env(env: Mapping[str, str], live_subnets: Sequence[str] = ()) -> list[str]` returns problems; empty list means pass.

- [ ] **Step 1: Write the failing tests** in `/unified/user/cj/ai_agent/zabbix_agent/tests/unit/test_envcheck.py`:
  `test_empty_value_reported` (`ZBXAI_APP_SUBNET=""` gives one problem naming the key), `test_overlap_with_used_range_reported`
  (`ZBXAI_APP_SUBNET=172.25.0.0/24` against used `172.25.0.0/24` gives a problem), `test_valid_env_passes`,
  `test_project_subnets_must_not_overlap_each_other`, `test_overlap_with_live_docker_subnet_reported` (a subnet taken from `docker network ls`
  at deploy time, not only the stored list), `test_bind_address_must_be_an_address`.
- [ ] **Step 2: Run** `/unified/user/cj/ai_agent/zabbix_agent/scripts/ship-test.sh /unified/user/cj/ai_agent/zabbix_agent/tests/unit/test_envcheck.py` **[TESTBED]** once Task 1.1 exists; until then write the test
  only. Expected: FAIL (`check_env` undefined).
- [ ] **Step 3: Implement** `check_env` in `/unified/user/cj/ai_agent/zabbix_agent/tools/envcheck.py` with the standard-library `ipaddress` module.
- [ ] **Step 4: Verify** all six tests pass, and that the topology document's chosen values give an empty problem list.
- [ ] **Step 5: Commit** (ask first, Q7).

### Task 0.2: Versions pinned

**Files:**
- Create: `/unified/user/cj/ai_agent/zabbix_agent/deploy/versions.env`

**Interfaces:**
- Produces: `ZABBIX_TAG`, `PG_TAG`, `GRAFANA_TAG` (an exact 13.x), `PLUGIN_VERSION=6.11.0`, `LLAMA_TAG`, `PYTHON_TAG`, and a tag
  and digest for each helper image a later task needs (`LLAMA_FULL_*` if `llama-bench` is not in the server image, Task 2.5), each with
  its image digest as `<NAME>_DIGEST` (the multi-architecture index digest; the testbed is linux/amd64). Compose and every `FROM` use
  `tag@digest` (contract R3).
- **Ruling (2026-11-23, llama slice):** `deploy/versions.env` already exists with `LLAMA_TAG=server`, `LLAMA_DIGEST`, `EDGE_TAG=stable-alpine` and `EDGE_DIGEST` (the nginx proxy; observed on the testbed). Add the other
  pins to it; keep these four, do not rewrite the file. Cost if wrong: Compose loses the llama image and `fetch-model.sh` fails.

- [ ] **Step 1: [TESTBED] Confirm the grant directory.** Check that the directory the owner named under `/unified/user/cj/` exists on the
  testbed, or can be created by the unprivileged account (no `sudo`). Expected: it exists and is writable. If not, stop and ask the owner.
- [ ] **Step 2: Fetch the candidate tags** from the official `zabbix-docker` repository's compose and `/unified/user/cj/ai_agent/zabbix_agent/.env` files at the 8.0
  branch, into an empty scratch directory (downloaded material is untrusted; read it, do not run it).
- [ ] **Step 3: [TESTBED] Check pulls work:** `docker pull` each candidate image. Expected: all pull. This also covers the
  setup-download check in `/unified/user/cj/knowledge/ai_agent/zabbix_agent/docs/development/backlog/environment-and-tooling.md` (`testbed-download-test`); delete that backlog entry on pass.
- [ ] **Step 4: Decide the Zabbix tag (verification item `zabbix-image-tags`):** if an 8.0 LTS server and web tag exists, use it;
  otherwise use 7.0 LTS and record the fallback in D10. Write all tags and digests to `/unified/user/cj/ai_agent/zabbix_agent/deploy/versions.env`. Delete the
  backlog entry.
- [ ] **Step 4a: Confirm Grafana and the plugin exist as planned** (the plan assumes both; only the Zabbix tag has a fallback today):
  an exact Grafana 13.x tag on the registry, and `alexanderzobnin-zabbix-app` 6.11.0 on the plugin catalogue with its stated minimum
  Grafana version. If either is missing, stop and ask the owner for the nearest supported pair; do not drift silently.
- [ ] **Step 5: Record** the chosen Zabbix tag and the function-version question in `/unified/user/cj/knowledge/ai_agent/zabbix_agent/docs/development/backlog/design-verification.md` under
  `function-availability` (it is proven in Task 1.3).
- [ ] **Step 6: Commit** (ask first, Q7).

### Task 0.3: Model files

**Files:**
- Create: `/unified/user/cj/ai_agent/zabbix_agent/deploy/models.sha256`, `/unified/user/cj/ai_agent/zabbix_agent/deploy/models.sources` (per file: URL pinned to a publisher repository revision, file name, size), `/unified/user/cj/ai_agent/zabbix_agent/scripts/fetch-model.sh`

**Interfaces:**
- Produces: named volume `zbxai_models` holding the two GGUF files; `/unified/user/cj/ai_agent/zabbix_agent/deploy/models.sha256` with their checksums.
- **Ruling (2026-11-23, llama slice):** only the 3.2 3B file is fetched so far (Llama 3.2 3B Instruct Q4_K_M, bartowski repository at commit `5ab33fa94d1d`); add the
  8B line to `models.sources` and `models.sha256` when the owner names its source. `scripts/fetch-model.sh` runs its one-shots in the pinned llama server image
  (it has `curl` and `sha256sum`), not a separate helper image, so no extra image is pulled. Cost if wrong: the helper-image pin in step 3 is unused.

- [ ] **Step 1: Owner gate.** The owner accepts the Llama 3.1 and 3.2 licences and names the GGUF source. Do not download
  before this. Record in `/unified/user/cj/ai_agent/zabbix_agent/deploy/models.sources` the repository revision (a commit hash, not a branch) and the SHA-256 the publisher lists for each
  file, copied before the download, so `/unified/user/cj/ai_agent/zabbix_agent/deploy/models.sha256` is the publisher's value and not what we happened to receive. If the source is gated,
  the access token is passed to the one-shot container on standard input and never written to a file or a command line.
- [ ] **Step 2: Check the budget:** `df -h /` on the testbed must show room for about 7 GB (8B plus 3B) with margin.
- [ ] **Step 3: [TESTBED] Download once, at setup (verification item `gguf-sourcing`):** `/unified/user/cj/ai_agent/zabbix_agent/scripts/fetch-model.sh` runs a one-shot
  container (the pinned helper image named in `/unified/user/cj/ai_agent/zabbix_agent/deploy/versions.env`; `python:3.12-slim` has no `curl`, so use its own `urllib` or a pinned `curl` image) on the transient `${ZBXAI_PREFIX}_setup` network (not internal, removed afterwards), writes into `zbxai_models`, then verifies in a second container
  on no network, with the host file `/unified/user/cj/ai_agent/zabbix_agent/deploy/models.sha256` streamed in on standard input (no bind mount) and checked with `sha256sum -c`. Expected: both files `OK`. Delete the backlog entry.
- [ ] **Step 4: Commit** (ask first, Q7).
