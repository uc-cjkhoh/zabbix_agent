---
title: Testbed
description: Observed state of the testbed host (read-only survey) and the rules for touching it
components: []
---

# Testbed

Host 10.168.50.40, a rehearsal box ([D13](../decisions/d13-rehearsal-testbed-and-sizing-reference.md)): the real target and the host running the 50+ modules are separate and not reachable from here. Observed by a read-only survey as the unprivileged `unified` account. Items marked
*unverified* were not checked, or could not be checked without root.

## Start and stop script
`/unified/user/cj/ai_agent/zabbix_agent/scripts/zbxai-stack.sh start|stop|status` (created 2026-11-26 at the owner's request, one file, **on the testbed host only**, in the code root's `scripts/` folder; it is in neither git repo and there is no copy on the workstation, so it is not overwritten by `ship-test.sh` or `deploy.sh`, which only add and overwrite the files they ship). It runs there with local Docker and reads `ZBXAI_PREFIX` from the code root's `.env`. `start` and `stop` act on every `zbxai_*` container in dependency order (postgres, zabbix_server, zabbix_web, grafana, llama, edge, mcp, then receiver, worker and others; stop is the reverse), wait for each healthcheck, skip containers already in the wanted state, and refuse while a test run is in progress. `--dry-run` prints the plan only, `--except grafana` leaves named containers alone, `status` is read-only. It never touches the transient test containers or another project's containers, and creates, removes and reconfigures nothing. **Grafana is included in `start`** (it has been stopped since 2026-11-24 by the owner's choice): use `--except grafana` to keep it stopped. Tested on the testbed with `status` and `--dry-run` only; a real start or stop has not been run (the stack was left as it was).

## Observed
| Item | Value |
|---|---|
| Hostname, OS | `chcluster`, AlmaLinux 9.8, kernel 5.14 el9 |
| Machine | VMware VM; Intel Xeon Gold 6148, 8 vCPU, AVX2 and AVX512F present |
| Memory | 15 GiB RAM, 0.8 GiB swap; about 14 GiB available when idle |
| GPU | None (VMware SVGA only; no `nvidia-smi`): model inference is CPU-only |
| Disk | One 49 GB `/` (xfs), 40 GB free; `/boot` 1 GB. No separate Docker or data volume |
| Docker | Engine 29.9.2, Compose v5.6.0, service active; account is in the `docker` group |
| Access | SSH password login works; account is in `wheel`, but `sudo` needs a password (not available to us) |
| Security | SELinux Enforcing; firewalld active (rules not readable without root, *unverified*) |
| Time | Chrony active, clock synchronised, zone America/New_York |
| Zabbix | Not installed on the host (no package, no unit); only as containers. Restarted 2026-11-26 except Grafana (see below) |
| Listening | 2026-11-26 after the restart: SSH 22, 18081 (llama proxy) and 18080 (Zabbix web), all `0.0.0.0` per `docker ps`; 13000 does not listen (Grafana stopped). Before the restart only 22 and 18081 listened |
| DNS to registries | `registry-1.docker.io`, `ghcr.io`, `huggingface.co` resolve; actual download not tested |

## Networks in use (avoid these)
| Network | Subnet | Owner |
|---|---|---|
| LAN, `ens33` | 10.168.48.0/22 (host 10.168.50.40, gateway 10.168.50.254) | host |
| `docker0` (default bridge) | 172.17.0.0/16 | Docker |
| `clickhouse-testing-env` (bridge `br-470f01c69c37`) | 172.25.0.0/24 | another project |
| Project block, reserved | 172.30.60.0/21 | this project ([topology](../architecture/topology.md)) |
| `zbxai_model` (created 2026-11-23) | 172.30.62.0/24, internal | this project (llama) |
| `zbxai_front` (created 2026-11-23) | 172.30.60.0/24 | this project (llama edge proxy and Zabbix web attached on 2026-11-26; Grafana belongs here but is stopped) |
| `zbxai_app` (created 2026-11-24, internal) | 172.30.61.0/24 | this project (PostgreSQL, Zabbix server, Zabbix web and the MCP server attached on 2026-11-26; Grafana belongs here but is stopped) |

No route to `172.30.x` existed on the host before this (`ip route`, 2026-11-23). `zbxai_setup` is still not created. `zbxai_test` (172.30.63.0/24, internal) and the container `zbxai_pgtest` exist only while `scripts/test-store.sh` runs (first run 2026-11-26, at the owner's request): the script creates both, runs the store integration tests and removes both, and refuses to run if either name already exists; after the run none remained (checked). **Standing permission (owner, 2026-11-26):** the agent may run tests on the testbed on its own judgement, provided (1) they run in an isolated environment, (2) all test data is deleted afterwards and (3) every other container and service stays healthy during and after. `scripts/test-store.sh` enforces this: it snapshots every other container on the host, of any project (state, health, restarts, start time) plus two read-only HTTP probes of the published Zabbix web and llama edge ports (both answered 200 before, during and after), refuses to start if a running one is unhealthy or less than 3 GB of memory is available, compares the snapshot every 3 s and at the end, caps the test containers (2 CPUs and 1 GB for the test run, 1 CPU and 512 MB for `pgtest`), and compares the host's containers, networks and volumes before and after; any difference exits 1. What "healthy" means here: containers with a healthcheck stayed healthy; `zbxai_mcp` has none, so the guard shows only that it stayed running with no restart, not that it serves. Plain `ship-test.sh` unit runs have no such guard: they rely on isolation (`--network none`, 2 CPUs, 1 GB). The throwaway database and the test container are removed after each run, the test image `zbxai_test:<lock hash>` is kept as tooling, and the two anonymous volumes on the host belong to `zbxai_zabbix_server` (created 2026-11-23), not to the tests. `ZBXAI_TEST_ZABBIX=1 scripts/test-store.sh` also starts a throwaway Zabbix server and web (pinned production images, 1 GB and 512 MB, 1 CPU each; `pgtest` then gets 1.5 GB) on the same isolated network and removes them with `-v`; a failed run prints the throwaway server's log tail. This covers only runs inside that isolation (fake Zabbix and llama servers); calls to the real `zbxai_llama` or the real Zabbix API are not covered and still need the owner's word. On 2026-11-24 the clickhouse containers `ch1` to `ch4` no longer showed in `docker ps -a`; the network `clickhouse-testing-env` is still there. Not ours either way.

## Created by this project (llama slice, 2026-11-23)
Built ahead of the plan's order at the owner's request: only the model runtime, none of Zabbix, PostgreSQL or Grafana.
| Item | State |
|---|---|
| Code root on the testbed | `/unified/user/cj/ai_agent/zabbix_agent/` (the files of the workstation's `codebase/` folder, copied before the 2026-11-26 folder reorganisation and left at that path; no shared filesystem between the two hosts) |
| Volume `zbxai_models` | Holds `Llama-3.2-3B-Instruct-Q4_K_M.gguf` (2,019,377,696 bytes), SHA-256 checked against the publisher's value (bartowski repository at commit `5ab33fa94d1d`) |
| Container `zbxai_llama` | `llama-server` (digest pinned in `deploy/versions.env`), `--parallel 1`, `--ctx-size 32768` (raised from 4096 on 2026-11-23; the model's trained limit is 131072), `--threads 6`; healthy; non-root, read-only root filesystem, no capabilities; internal network only, no published port |
| Container `zbxai_edge` | Unprivileged nginx ([D15](../decisions/d15-llama-lan-access-through-authenticated-proxy.md)): publishes `0.0.0.0:18081`, needs the API key on everything except `/health`; on `zbxai_front` and `zbxai_model`; non-root, read-only root, no capabilities |
| Volume `zbxai_edge_conf` | The rendered nginx config (it holds the key; mode 0400, owned by the nginx user). The key itself is in the git-ignored `deploy/secrets/llama-api-key` on the testbed; read it there, never copy it into chat or docs |
| Pulled images | `ghcr.io/ggml-org/llama.cpp:server` (no `llama-bench` binary inside); `nginxinc/nginx-unprivileged:stable-alpine` (nginx 1.30.6) |
| Pulls and downloads | Image pulls from `ghcr.io` and `docker.io` and a model download from `huggingface.co` all worked |

Observed: one 46-token prompt answered in about 2.9 s of server time (0.72 s for the prompt, about 64 tokens/s; 2.22 s to generate 33 tokens, about 14 tokens/s).
The container held about 1.8 GiB of RAM afterwards (at `--ctx-size 4096`).
At `--ctx-size 32768` (2026-11-23): 4.9 GiB when idle, and 6.3 GiB after one 12,523-token prompt; a completely full 32k context was not run, so its peak is *unverified*
(expect more than 6.3 GiB). That 12.5k prompt took 283 s (44 tokens/s in) and generation fell to 2.9 tokens/s at that depth (14 on a short prompt). `zbxai_edge`'s
`proxy_read_timeout` is 600 s, so a very long prompt through the proxy can time out before it finishes. Hardening was read back with `docker inspect` and `docker exec`: user `nobody`, read-only root, all
capabilities dropped, no published ports, SELinux `Enforcing`. This is one short request, not the benchmark; the 120 s gate in Task 2.5 step 6 is still open.
`llama-server` itself still has no API key and allows all origins; it is only on the internal network, and the proxy adds the key.
Remote access (verified 2026-11-23 from the workstation, same LAN): `http://10.168.50.40:18081`, `/health` open; other paths 401 without or with a wrong key; 200 with the key, as
`Authorization: Bearer <key>` or, since 2026-11-24, basic auth with the shared web login ([D16](../decisions/d16-zabbix-web-and-grafana-on-lan-with-shared-login.md)); the old basic login `llama:<key>` is rejected. The web UI opens at `/` and the browser asks for the login. Plain HTTP, so the key and the login are readable on the LAN.
`./scripts/check-edge.sh <url> <credential file> < <key file>` repeats the check. firewalld did not block the port (its rules are still unreadable). The licence acceptance for the 3.2 3B file is the owner's, given in chat on 2026-11-23.

## Created by this project (Zabbix and Grafana slice, 2026-11-24)
Built ahead of the plan's order at the owner's request ([D16](../decisions/d16-zabbix-web-and-grafana-on-lan-with-shared-login.md)): no receiver, worker, MCP server or Grafana plugin yet.

**Update 2026-11-26 (later, at the owner's request): the Zabbix core is running again, with the official MCP server added.** `zbxai_postgres`, `zbxai_zabbix_server` and `zbxai_zabbix_web` were started by name and reported healthy; `zbxai_grafana` is still stopped. The images pinned by digest were found locally, nothing was re-pulled for them, and no container was recreated. Zabbix web is published on `0.0.0.0:18080` again (not re-reached from the workstation yet). The Zabbix API answered `apiinfo.version` = `8.0.0` from inside `zbxai_app`. Details of the new container are in the section after the table below.

**Earlier state (checked read-only 2026-11-26, before that restart): paused, stopped but not removed.** The owner said the containers and images were deleted; the testbed showed otherwise, and the owner confirmed the slice is *paused*, not dropped.
- `zbxai_postgres`, `zbxai_zabbix_server`, `zbxai_zabbix_web` and `zbxai_grafana` still exist, all `Exited` since 2026-11-24 04:34 UTC (exit code 0, the server 137; no out-of-memory kill; restart policy `unless-stopped`, which Docker does not apply to a container that was stopped by hand). *Unverified:* who or what stopped them, and that 137 was a kill after the stop grace period.
- Images still on disk: `postgres:16-alpine`, `grafana/grafana-oss:13.0.2`, and the Zabbix server and web images, which now carry no tag (`<none>`). *Unverified:* how the tags were lost (the owner's removal attempt is a guess, not seen).
- Volumes `zbxai_pgdata`, `zbxai_grafana` and `zbxai_secrets` are intact (the Zabbix database, Grafana state, secrets). The network `zbxai_app` exists with no members. Ports 13000 and 18080 are not listening.
- Running: only `zbxai_llama` (healthy) and `zbxai_edge` (healthy, 18081). Both slice definitions are still in `compose.yaml` on both hosts.
- The "All healthy" and the access results in the table below are the 2026-11-24 observations, kept as history; they are not the present state. Starting the slice again needs the owner's go ([rules](#rules)). *Unverified:* whether compose finds the untagged Zabbix images or pulls them again.

| Item | State (2026-11-24 unless dated) |
|---|---|
| Containers | `zbxai_postgres` (PostgreSQL 16, user 70, `zbxai_app` only, no published port), `zbxai_zabbix_server` 8.0.0 (`zbxai_app` only), `zbxai_zabbix_web` (`0.0.0.0:18080`, `front` and `app`), `zbxai_grafana` 13.0.2 (`0.0.0.0:13000`, `front` and `app`). All healthy; non-root, all capabilities dropped, `no-new-privileges`. Root filesystems are writable (read-only not tried). Images pinned by tag and digest in `deploy/versions.env` |
| Volumes | `zbxai_pgdata`, `zbxai_grafana`, `zbxai_secrets` (random database password, and the web login as Grafana's `*__FILE` files; written by `scripts/secrets-init.sh`, each sub-directory owned by its image's user, mode 0400) |
| Login | `unified` with the shared development password on Grafana, Zabbix web (the default `Admin` account was renamed; `Admin`/`zabbix` is rejected) and the llama web UI. The old `admin`/`admin` on Grafana is rejected. Zabbix's password policy was relaxed (minimum length 1, easy-to-guess check off) to allow it. The values are only in `deploy/secrets/web-credential` and [credentials.local.md](credentials.local.md) |
| Observed | Zabbix server started and created its schema; PostgreSQL password read from a file by the 8.0 image (`POSTGRES_PASSWORD_FILE` works, checked by it starting); `zbxai_app` has no egress (a public address and the LAN gateway both unreachable); a second `up -d` recreated nothing; reached from the workstation across the LAN: Zabbix web 200 on 18080, its API logs in, Grafana `/api/health` ok with the login accepted on 13000. Grafana's startup plugin fetching is switched off in compose (its log showed a preinstall attempt before that, 2026-11-24) and its logs now show no install or download; the running Zabbix server reports 8.0.0. Idle memory: PostgreSQL 156 MiB, Zabbix server 53 MiB, web 54 MiB, Grafana 167 MiB |
| Not done | Grafana's Zabbix plugin (it would download at start; to be baked into an image, Task 1.4), the read-only role and tokens, the PostgreSQL SELECT-only role, the webhook. The built-in host `Zabbix server` shows its agent item errors because no agent runs |

## Created by this project (Zabbix MCP server, interim, 2026-11-26)
Added at the owner's request ([D17](../decisions/d17-official-zabbix-mcp-server-as-interim.md)); the agent that calls it does not exist yet.
| Item | State |
|---|---|
| Image | `zabbix/zabbix-mcp-server:alpine-8.0-latest`, pinned by digest `sha256:0b40d680…09b3` in `deploy/versions.env` (Zabbix's own image, AGPL-3.0; label version 8.0.0, built 2026-11-22). The exact tag `alpine-8.0.0` has a different digest and was not used |
| Container `zbxai_mcp` | On `zbxai_app` only (internal, no egress), no published port; user 1997 (non-root), all capabilities dropped, `no-new-privileges`; listens on 8443 at `/mcp` (streamable HTTP). Root filesystem not made read-only (not tried); no healthcheck defined yet |
| Read-only guard | `ZBX_ALLOWTOOL_REGEXP_0=^(host\|hostgroup\|trigger\|problem\|event)_get$` and `ZBX_DENYTOOL_1=*`. Observed in its log: 4 tools exposed and 18 tools denied by configuration, including every `problem_*` write tool and `maintenance_*` |
| Auth | The server keeps no Zabbix credential: the caller sends the Zabbix API token as a bearer header on every request. A call from `zbxai_app` with no token returned 401. `ZBX_ALLOWEDIP` is the `zbxai_app` subnet; the probe from that network got 401, not a refusal |
| Bounds (rule 8) | Per the server's own config comments, not tested: each list tool takes a per-call `limit` (default 100, maximum 1000), `MaxResponseSize` caps a response (default 64K, range 16K to 256K) and `Timeout` caps a Zabbix API request (default 10 s, range 3 to 30). The compose file sets none of them, so the defaults apply (the container environment showed no `ZBX_TIMEOUT` or `ZBX_MAX_RESPONSE_SIZE`). The server does not make the caller pass a limit: the default is 100, so the caller must still pass its own smaller limit and time window. Effective values and truncation are *unverified*. Rule 8 is not claimed as met |
| Not done | The read-only Zabbix role, user and token (a Zabbix write, needs its own sign-off, rule 6), so no authenticated call has been made. *Unverified:* which 4 tools are exposed, that a call with a token works, that a User-type role blocks writes (backlog), memory under load (4.95 MiB idle, `docker stats` 2026-11-26), and whether the server makes any call other than to Zabbix (none documented) |

## Created by this project (Python test and runtime images, 2026-11-26)
Needed to run Task 2.0's tests in a container ([plan](../development/implementation-plan/phase-1-platform.md), Task 1.1 subset). From the workstation: `./scripts/ship-test.sh` (code travels as a tar on stdin; nothing is written to the testbed filesystem).
| Item | State |
|---|---|
| Images | `python:3.12-slim` (pinned `sha256:191083cd…1b4b`, Python 3.12.16); `zbxai_test:3f1fc1c51283` (303 MB; the tag is the first 12 hex of the lock file's SHA-256, so it rebuilds when the lock changes); `zbxai_runtime:dev` (303 MB; `CMD` and entrypoint empty, checked after clearing the `python3` inherited from the base; user 10001). Disk: `df` free space went from 38G to 37G this session (used stays about 12G); `docker system df` shows 3.79 GB of images in total |
| Test containers | `--rm`, `--network none`, read-only root, all capabilities dropped, `no-new-privileges`, code on a tmpfs. None left behind |
| Lock generation | `scripts/lock.sh`: a throwaway container on a temporary `zbxai_setup` network (172.30.64.0/24, not internal) downloads from PyPI; the network is removed afterwards. 37 hashed packages (for example `mcp` 1.30.0, `pydantic` 2.14.4). Image builds also download packages; which network a build uses was not checked (*unverified*) |
| Verified | 14 unit tests pass; `ruff check` clean; the runtime image imports `zbxai.config` with no network. *Unverified:* the image builds from a cold cache on a second host; running the tests twice at once |

## Created by this project (log replay rig, 2026-11-26)
Built at the owner's request ([D18](../decisions/d18-log-replay-rig-on-the-real-zabbix.md), [design](../development/log-replay-rig-design.md)). **Since 2026-11-27 ~21:24 (testbed time) the five objects W1 to W5 exist on the real Zabbix** (owner's go, `scripts/replay.sh provision apply --signoff W1,W2,W3,W4,W5`: host group `ZBXAI replay`, host `ss7mapesms-SGB51-replay` without interface, two log trapper items with 1 day history and allowed hosts `172.30.60.0/24` (`ss7mapesms.log` for every message, no trigger; `ss7mapesms.errors` for the error messages only), trigger `SS7 MAP SMS: TC_COMP_U_ERROR rate high: {ITEM.LASTVALUE}` on the error item firing at 50 errors per minute, user group/role/user `zbxai_replay` that can call `history.push` only; the token is in `deploy/secrets/replay/zbxai_replay`, mode 0600). Read back through the API: they are as designed. Teardown: `scripts/replay.sh provision teardown --signoff W1,W2,W3,W4,W5`; `reset-item` empties the item's history (and re-creates the trigger).
| Item | State |
|---|---|
| Source logs | `/unified/user/cj/data/log_files` (`ss7mapesms_SGB51_20261014_085524.txt` 50 MB, `ss7mapesms_SGB51_err_20261014_235959.txt` 25 MB): only read, by streaming into a container; never mounted, never changed |
| Image | `zbxai_replay:dev` (304 MB, the `runtime` target of the Dockerfile; code is baked in, so `scripts/replay.sh build` again after a code change) |
| Volume `zbxai_replay_data` | The extract `extract-20261126T094045Z.jsonl` plus its manifest, and `main.part`, `err.part`: **134,842 records** (the whole main log; its 344 error-log lines are verbatim copies of main-log lines and are not replayed twice), longest record 1,994 bytes, window 08:50:45.205 to 08:55:24.237 (279 s), 34 stamps in the main log go backwards (the source order is kept). Measured pace: 483 messages per second on average, busiest second 1,363, busiest 100 ms tick 549 |
| Container `zbxai_replay` | Started with `docker run` by `scripts/replay.sh up --no-token` (not by compose): `zbxai_front` only, publishes `0.0.0.0:18090` to 8090 (read-only monitor page), read-only root, all capabilities dropped, `no-new-privileges`, 1 CPU, 512 MB, runs as the host user `unified`, no Docker socket. **State at the end of 2026-11-26: stopped and removed** (`scripts/replay.sh up` starts it again; the image, volume and run files stay) |
| Folder `/unified/user/cj/data/replay_out/` (holds two verification runs, `20261126T094102Z` and `20261126T094551Z`, same SHA-256) | One `<run-id>.txt` (the replayed lines, exclusive create) and one `<run-id>.ledger.jsonl` (every message and sink, with planned and actual time) per run. The rig never deletes them |
| Zabbix objects | Created, see above. The container is now started with the token mounted (`scripts/replay.sh up`, without `--no-token`) |

**Verified on the testbed (file path only, no Zabbix):** full-speed runs of the whole window, 134,842 messages in 279.1 s (the window's own length), 0 failures, lag 95th percentile 5 ms and maximum 123 ms in the first run; the host guard (a snapshot of every other container every 3 s) found no change; the output file is **byte-identical to the source main log minus its leading blank line, in the source order**, and two runs gave the same SHA-256. During the first full run the page API served live state from the workstation across the LAN.
**Verified on a throwaway Zabbix 8.0.0 (isolated test network, deleted afterwards; three runs of `tests/integration/test_replay_live.py`, 41 tests):** `history.push` through the API accepts the real sink's values for a log-type trapper item on a host without an interface; Zabbix checks the **sender's** address against the item's allowed hosts; a push-only role is refused `host.get`; the trigger fires and the problem name carries the sample line; the trigger recovers only with `nodata()` in its recovery expression; deleting an item deletes its trigger (so `reset-item` re-creates it); teardown leaves nothing behind.
**Through the real Zabbix (2026-11-27):** one preflight push and a ramp (10, 50, 150, 480 messages per second, 20 s each: 13,800 messages, 0 failures, lag p95 6 ms at 480 per second) passed; allowed hosts `172.30.60.0/24` is right on the real Zabbix. **The first full-speed attempt stalled** (a minute-long `count()` trigger on the busy all-lines item saturated the one history syncer that handles that item: `History cache is full`, about 24 values per second drained, 1,093 pushes failed, the guard stopped the run). **Fixed with the owner's choice (option a):** the trigger moved to an error-only item and the all-lines item has no trigger (design section 16). A first push also failed with `Duplicate timestamp found.` (two values of one item with the same clock and ns): each pushed value is now at least 1 ns after the previous one.
**Full-speed replay through the real Zabbix (2026-11-27, run `20261127T025922Z`):** 134,842 messages to the file and to Zabbix in 279.1 s, 0 failures, lag p95 8 ms, no cache-full message, server CPU about 5%, no other container changed. Zabbix stored 134,844 values on `ss7mapesms.log` and 345 on `ss7mapesms.errors` (two preflight values included). The trigger raised one problem 61 s into the run and recovered 85 s after the run ended. The output file equals the source main log byte for byte (SHA-256 `5d22e34a…`).
**Unverified:** the outage run (`--outage`); the monitor page in a browser.
**Rules for this rig:** start it only when the owner asks (`scripts/replay.sh up`), stop it with `scripts/replay.sh down`; never run `provision` without the owner's go and `--signoff W1,W2,W3,W4,W5`; do not edit `scripts/replay.sh` while a run is executing (a running `sh` reads its script by offset).

## Not ours: leave alone
Four stopped containers `ch1` to `ch4` (image `clickhouse-testenv:almalinux9-systemd`) and the network
`clickhouse-testing-env` belong to another project. Never stop, remove or reuse them, and never run a
cleanup that could match them.

## Rules
- The host is shared: follow agent-behavior `core/shared-machine.md`.
- Connect only when the user asks. Survey and inspection are read-only unless the user approves a change.
- Credentials: used once through an environment variable, never in a URL, config, file or doc (placeholders
  `<user>` / `<password>`; real values only in the git-ignored [credentials.local.md](credentials.local.md)).
  Tell the user to scope or revoke them afterwards.
- Only containers, networks and volumes carrying this project's prefix are ours to remove.
- Pick the project's subnet and ports from outside the table above ([D3](../decisions/d3-network-isolation.md)).
- Once containers exist, check that Grafana and Zabbix web are reachable from the workstation (same 10.168.48.0/22 LAN)
  without touching the testbed's configuration.

## Not the same machine
The workstation `dataweb` (10.168.49.20), where this KB was initialised, is not the testbed. Confirm which
machine you are on, and do not treat one host's state as the other's.
