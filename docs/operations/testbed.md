---
title: Testbed
description: Observed state of the testbed host (read-only survey) and the rules for touching it
components: []
---

# Testbed

Host 10.168.50.40, a rehearsal box ([D13](../decisions/d13-rehearsal-testbed-and-sizing-reference.md)): the real target and the host running the 50+ modules are separate and not reachable from here. Observed by a read-only survey as the unprivileged `unified` account. Items marked
*unverified* were not checked, or could not be checked without root.

## Start and stop script
`/unified/user/cj/ai_agent/zabbix_agent/scripts/zbxai-stack.sh start|stop|status` (created 2026-11-26 at the owner's request, one file, **on the testbed host only**, in the code root's `scripts/` folder; it is in neither git repo and there is no copy on the workstation, so it is not overwritten by `ship-test.sh` or `deploy.sh`, which only add and overwrite the files they ship). It runs there with local Docker and reads `ZBXAI_PREFIX` from the code root's `.env`. `start` and `stop` act on every `zbxai_*` container in dependency order (postgres, zabbix_server, zabbix_web, grafana, llama, edge, mcp, then receiver, worker and others; stop is the reverse), wait for each healthcheck, skip containers already in the wanted state, and refuse while a test run is in progress. `--dry-run` prints the plan only, `--except grafana` leaves named containers alone, `status` is read-only. It never touches the transient test containers or another project's containers, and creates, removes and reconfigures nothing. **Grafana is included in `start`** (it has been stopped since 2026-11-24 by the owner's choice): use `--except grafana` to keep it stopped. Tested on the testbed with `status` and `--dry-run` only; a real start or stop has not been run (the stack was left as it was). It still lists `edge` and `mcp` in its order: it is outside the repo and was not changed by [D19](../decisions/d19-scope-cut-after-full-review.md) (2026-11-27).

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
| Listening | 2026-11-27 after the cleanup (observed with `ss`): SSH 22 and `127.0.0.1:18080` (Zabbix web, host loopback only); 18081 and 18090 no longer listen; 13000 does not listen (Grafana stopped). From the workstation the LAN ports 18080, 18081 and 18090 refuse connections. Before the cleanup (2026-11-27, about 06:55 UTC) 18081 (llama proxy), 18080 (Zabbix web on `0.0.0.0`) and 18090 (replay monitor page) were published. Before the 2026-11-26 restart only 22 and 18081 listened |
| DNS to registries | `registry-1.docker.io`, `ghcr.io`, `huggingface.co` resolve; actual download not tested |

## Networks in use (avoid these)
| Network | Subnet | Owner |
|---|---|---|
| LAN, `ens33` | 10.168.48.0/22 (host 10.168.50.40, gateway 10.168.50.254) | host |
| `docker0` (default bridge) | 172.17.0.0/16 | Docker |
| `clickhouse-testing-env` (bridge `br-470f01c69c37`) | 172.25.0.0/24 | another project |
| Project block, reserved | 172.30.60.0/21 | this project ([topology](../architecture/topology.md)) |
| `zbxai_model` (created 2026-11-23) | 172.30.62.0/24, internal | this project (llama) |
| `zbxai_front` (created 2026-11-23) | 172.30.60.0/24 | this project (the edge proxy, withdrawn by D19, and Zabbix web attached on 2026-11-26; Grafana belongs here but is stopped) |
| `zbxai_app` (created 2026-11-24, internal) | 172.30.61.0/24 | this project (PostgreSQL, Zabbix server, Zabbix web and the MCP server, withdrawn by D19, attached on 2026-11-26; Grafana belongs here but is stopped) |

No route to `172.30.x` existed on the host before this (`ip route`, 2026-11-23). `zbxai_setup` is still not created. `zbxai_test` (172.30.63.0/24, internal) and the container `zbxai_pgtest` exist only while `scripts/test-store.sh` runs (first run 2026-11-26, at the owner's request): the script creates both, runs the store integration tests and removes both, and refuses to run if either name already exists; after the run none remained (checked). **Standing permission (owner, 2026-11-26):** the agent may run tests on the testbed on its own judgement, provided (1) they run in an isolated environment, (2) all test data is deleted afterwards and (3) every other container and service stays healthy during and after. `scripts/test-store.sh` enforces this: it snapshots every other container on the host, of any project (state, health, restarts, start time) plus one read-only HTTP probe of the published Zabbix web port (it answered 200 before, during and after; the llama edge probe went with the proxy, D19), refuses to start if a running one is unhealthy or less than 3 GB of memory is available, compares the snapshot every 3 s and at the end, caps the test containers (2 CPUs and 1 GB for the test run, 1 CPU and 512 MB for `pgtest`), and compares the host's containers, networks and volumes before and after; any difference exits 1. What "healthy" means here: containers with a healthcheck stayed healthy; `zbxai_mcp` (removed 2026-11-27) had none, so the guard showed only that it stayed running with no restart, not that it served. Plain `ship-test.sh` unit runs have no such guard: they rely on isolation (`--network none`, 2 CPUs, 1 GB). The throwaway database and the test container are removed after each run, the test image `zbxai_test:<lock hash>` is kept as tooling, and the two anonymous volumes on the host belong to `zbxai_zabbix_server` (created 2026-11-23), not to the tests. `ZBXAI_TEST_ZABBIX=1 scripts/test-store.sh` also starts a throwaway Zabbix server and web (pinned production images, 1 GB and 512 MB, 1 CPU each; `pgtest` then gets 1.5 GB) on the same isolated network and removes them with `-v`; a failed run prints the throwaway server's log tail. This covers only runs inside that isolation (fake Zabbix and llama servers); calls to the real `zbxai_llama` or the real Zabbix API are not covered and still need the owner's word. On 2026-11-24 the clickhouse containers `ch1` to `ch4` no longer showed in `docker ps -a`; the network `clickhouse-testing-env` is still there. Not ours either way.

## Created by this project (llama slice, 2026-11-23)
Built ahead of the plan's order at the owner's request: only the model runtime, none of Zabbix, PostgreSQL or Grafana.
| Item | State |
|---|---|
| Code root on the testbed | `/unified/user/cj/ai_agent/zabbix_agent/` (the files of the workstation's `codebase/` folder, copied before the 2026-11-26 folder reorganisation and left at that path; no shared filesystem between the two hosts) |
| Volume `zbxai_models` | Holds `Llama-3.2-3B-Instruct-Q4_K_M.gguf` (2,019,377,696 bytes), SHA-256 checked against the publisher's value (bartowski repository at commit `5ab33fa94d1d`) |
| Container `zbxai_llama` | `llama-server` (digest pinned in `deploy/versions.env`), `--parallel 1`, `--ctx-size 32768` (raised from 4096 on 2026-11-23; the model's trained limit is 131072), `--threads 6`; healthy; non-root, read-only root filesystem, no capabilities; internal network only, no published port |
| Container `zbxai_edge` (withdrawn by [D19](../decisions/d19-scope-cut-after-full-review.md); **removed 2026-11-27**, see [Cleanup done](#cleanup-done-d19-2026-11-27)) | Was an unprivileged nginx: published `0.0.0.0:18081`, needed the API key on everything except `/health`; on `zbxai_front` and `zbxai_model`; non-root, read-only root, no capabilities. It was running (healthy) when it was removed; no longer defined in `compose.yaml` |
| Volume `zbxai_edge_conf` (withdrawn by D19; **removed 2026-11-27**) | Held the rendered nginx config (it held the key; mode 0400, owned by the nginx user). The key file `deploy/secrets/llama-api-key` was removed too |
| Pulled images | `ghcr.io/ggml-org/llama.cpp:server` (no `llama-bench` binary inside); `nginxinc/nginx-unprivileged:stable-alpine` (nginx 1.30.6, for the withdrawn proxy; **removed 2026-11-27**) |
| Pulls and downloads | Image pulls from `ghcr.io` and `docker.io` and a model download from `huggingface.co` all worked |

Observed: one 46-token prompt answered in about 2.9 s of server time (0.72 s for the prompt, about 64 tokens/s; 2.22 s to generate 33 tokens, about 14 tokens/s).
The container held about 1.8 GiB of RAM afterwards (at `--ctx-size 4096`).
At `--ctx-size 32768` (2026-11-23): 4.9 GiB when idle, and 6.3 GiB after one 12,523-token prompt; a completely full 32k context was not run, so its peak is *unverified*
(expect more than 6.3 GiB). That 12.5k prompt took 283 s (44 tokens/s in) and generation fell to 2.9 tokens/s at that depth (14 on a short prompt). Hardening was read back with `docker inspect` and `docker exec`: user `nobody`, read-only root, all
capabilities dropped, no published ports, SELinux `Enforcing`. This is one short request, not the benchmark; the 120 s gate in Task 2.5 step 6 is still open.
`llama-server` itself has no API key and allows all origins; it is only on the internal network.
Remote access through the proxy (verified 2026-11-23 and 2026-11-24 from the workstation, same LAN) is withdrawn by [D19](../decisions/d19-scope-cut-after-full-review.md): llama is reachable only on the internal network, and `scripts/check-edge.sh` is gone. The licence acceptance for the 3.2 3B file is the owner's, given in chat on 2026-11-23.

## Created by this project (Zabbix and Grafana slice, 2026-11-24)
Built ahead of the plan's order at the owner's request ([D16](../decisions/d16-zabbix-web-and-grafana-on-lan-with-shared-login.md)): no receiver, worker, MCP server or Grafana plugin yet.

**Update 2026-11-26 (later, at the owner's request): the Zabbix core is running again.** `zbxai_postgres`, `zbxai_zabbix_server` and `zbxai_zabbix_web` were started by name and reported healthy; `zbxai_grafana` is still stopped. The images pinned by digest were found locally, nothing was re-pulled for them, and no container was recreated. Zabbix web was published on `0.0.0.0:18080` again (not re-reached from the workstation then). On 2026-11-27 its container was recreated from the new compose file and now publishes `127.0.0.1:18080->8080` only (D19; see [Cleanup done](#cleanup-done-d19-2026-11-27)). The Zabbix API answered `apiinfo.version` = `8.0.0` from inside `zbxai_app`. A `zbxai_mcp` container was added the same day; D19 withdrew it (see the section after the table below).

**Earlier state (checked read-only 2026-11-26, before that restart): paused, stopped but not removed.** The owner said the containers and images were deleted; the testbed showed otherwise, and the owner confirmed the slice is *paused*, not dropped.
- `zbxai_postgres`, `zbxai_zabbix_server`, `zbxai_zabbix_web` and `zbxai_grafana` still exist, all `Exited` since 2026-11-24 04:34 UTC (exit code 0, the server 137; no out-of-memory kill; restart policy `unless-stopped`, which Docker does not apply to a container that was stopped by hand). *Unverified:* who or what stopped them, and that 137 was a kill after the stop grace period.
- Images still on disk: `postgres:16-alpine`, `grafana/grafana-oss:13.0.2`, and the Zabbix server and web images, which now carry no tag (`<none>`). *Unverified:* how the tags were lost (the owner's removal attempt is a guess, not seen).
- Volumes `zbxai_pgdata`, `zbxai_grafana` and `zbxai_secrets` are intact (the Zabbix database, Grafana state, secrets). The network `zbxai_app` exists with no members. Ports 13000 and 18080 are not listening.
- Running: only `zbxai_llama` (healthy) and `zbxai_edge` (healthy, 18081). Both slice definitions were still in `compose.yaml` on both hosts then; the edge definition is gone from the repo since D19 (2026-11-27).
- The "All healthy" and the access results in the table below are the 2026-11-24 observations, kept as history; they are not the present state. Starting the slice again needs the owner's go ([rules](#rules)). *Unverified:* whether compose finds the untagged Zabbix images or pulls them again.

| Item | State (2026-11-24 unless dated) |
|---|---|
| Containers | `zbxai_postgres` (PostgreSQL 16, user 70, `zbxai_app` only, no published port), `zbxai_zabbix_server` 8.0.0 (`zbxai_app` only), `zbxai_zabbix_web` (`0.0.0.0:18080`, `front` and `app`), `zbxai_grafana` 13.0.2 (`0.0.0.0:13000`, `front` and `app`). All healthy; non-root, all capabilities dropped, `no-new-privileges`. Root filesystems are writable (read-only not tried). Images pinned by tag and digest in `deploy/versions.env` |
| Volumes | `zbxai_pgdata`, `zbxai_grafana`, `zbxai_secrets` (random database password, and the web login as Grafana's `*__FILE` files; written by `scripts/secrets-init.sh`, each sub-directory owned by its image's user, mode 0400) |
| Login | `unified` with the shared development password on Grafana and Zabbix web (the default `Admin` account was renamed; `Admin`/`zabbix` is rejected); it also opened the llama web UI until the proxy was withdrawn (D19). The old `admin`/`admin` on Grafana is rejected. Zabbix's password policy was relaxed (minimum length 1, easy-to-guess check off) to allow it. The values are only in `deploy/secrets/web-credential` and [credentials.local.md](credentials.local.md) |
| Observed | Zabbix server started and created its schema; PostgreSQL password read from a file by the 8.0 image (`POSTGRES_PASSWORD_FILE` works, checked by it starting); `zbxai_app` has no egress (a public address and the LAN gateway both unreachable); a second `up -d` recreated nothing; reached from the workstation across the LAN: Zabbix web 200 on 18080, its API logs in, Grafana `/api/health` ok with the login accepted on 13000. Grafana's startup plugin fetching is switched off in compose (its log showed a preinstall attempt before that, 2026-11-24) and its logs now show no install or download; the running Zabbix server reports 8.0.0. Idle memory: PostgreSQL 156 MiB, Zabbix server 53 MiB, web 54 MiB, Grafana 167 MiB |
| Not done | Grafana's Zabbix plugin (it would download at start; to be baked into an image, Task 1.4), the read-only role and tokens, the PostgreSQL SELECT-only role, the webhook. The built-in host `Zabbix server` shows its agent item errors because no agent runs |

## Withdrawn by D19: Zabbix MCP server (interim, added 2026-11-26)
Added at the owner's request on 2026-11-26; [D19](../decisions/d19-scope-cut-after-full-review.md) (2026-11-27) withdrew it and removed it from `compose.yaml` and `versions.env`. It was never used: the agent that would call it does not exist.
| Item | State |
|---|---|
| Container `zbxai_mcp` | Was running when it was removed on 2026-11-27 (`docker rm -f -v`). On `zbxai_app` only (internal, no egress), no published port, user 1997 (non-root), all capabilities dropped, `no-new-privileges`, listened on 8443 at `/mcp`, no healthcheck |
| Image | `zabbix/zabbix-mcp-server:alpine-8.0-latest`, pinned by digest when it was added (the pin is gone from `deploy/versions.env`); removed from the host on 2026-11-27 (only `zbxai_mcp` used it) |
| What was seen | Its log showed 4 tools exposed and 18 denied by configuration; a call from `zbxai_app` with no token returned 401; 4.95 MiB idle |
| On the real Zabbix | This record shows no MCP role, user or token was ever created: the read-only role, user and token were "not done" (a Zabbix write needing its own sign-off, rule 6), so no authenticated call was ever made. Not re-checked on the real Zabbix after 2026-11-26 (*unverified*) |

## Created by this project (Python test and runtime images, 2026-11-26)
Needed to run Task 2.0's tests in a container ([plan](../development/implementation-plan/phase-1-platform.md), Task 1.1 subset). From the workstation: `./scripts/ship-test.sh` (code travels as a tar on stdin; nothing is written to the testbed filesystem).
| Item | State |
|---|---|
| Images | `python:3.12-slim` (pinned `sha256:191083cd…1b4b`, Python 3.12.16); `zbxai_test:3f1fc1c51283` (303 MB; the tag is the first 12 hex of the lock file's SHA-256, so it rebuilds when the lock changes); `zbxai_runtime:dev` (303 MB; `CMD` and entrypoint empty, checked after clearing the `python3` inherited from the base; user 10001). Disk: `df` free space went from 38G to 37G this session (used stays about 12G); `docker system df` shows 3.79 GB of images in total |
| Test containers | `--rm`, `--network none`, read-only root, all capabilities dropped, `no-new-privileges`, code on a tmpfs. None left behind |
| Lock generation | `scripts/lock.sh`: a throwaway container on a temporary `zbxai_setup` network (172.30.64.0/24, not internal) downloads from PyPI; the network is removed afterwards. 37 hashed packages (for example `mcp` 1.30.0, `pydantic` 2.14.4; `mcp` is no longer declared since D19, so the lock needs regenerating, backlog `regenerate-lock`). Image builds also download packages; which network a build uses was not checked (*unverified*) |
| Verified | 14 unit tests pass; `ruff check` clean; the runtime image imports `zbxai.config` with no network. *Unverified:* the image builds from a cold cache on a second host; running the tests twice at once |

## Withdrawn by D19: log replay rig (built 2026-11-26)
The rig replayed a real module log to the real Zabbix and a local file. [D19](../decisions/d19-scope-cut-after-full-review.md) (2026-11-27) removed its code, scripts, tests and design documents from both repos.
| Item | State |
|---|---|
| Objects on the real Zabbix (W1 to W5) | Created 2026-11-27 with the owner's go, **removed 2026-11-27** with `provision teardown --signoff W1,W2,W3,W4,W5` under the owner's sign-off for that call. The tool reported removed: token and user `zbxai_replay`, user group and role `ZBXAI replay push`, the trigger `TC_COMP_U_ERROR`, the items `ss7mapesms.log` and `ss7mapesms.errors`, the host `ss7mapesms-SGB51-replay` and the host group `ZBXAI replay`; kept nothing. Nothing else on the real Zabbix was touched by it. Not read back through the API afterwards (*unverified*) |
| Image `zbxai_replay:dev` | Removed 2026-11-27 (the teardown had run through it; only `zbxai_replay` used it) |
| Volume `zbxai_replay_data` | Removed 2026-11-27 (it held the extract of the source log: 134,842 records) |
| Folder `/unified/user/cj/data/replay_out/` | Removed 2026-11-27: 18 run files, 258 MB (two verification runs from 2026-11-26 and the full-speed run `20261127T025922Z`); the rig itself never deleted them |
| Token file `deploy/secrets/replay/zbxai_replay` | Removed 2026-11-27 with its folder; the token it held had already been removed from the Zabbix |
| Container `zbxai_replay` | **Was running at the cleanup**, although this record had it stopped and removed (that record was wrong, or it was started since): started 2026-11-27 06:09 UTC, restart policy `no`, published `0.0.0.0:18090`, only the idle monitor-page process, no run active, no new run file since 2026-11-26 22:04. Removed 2026-11-27 |
| Source logs `/unified/user/cj/data/log_files` | Only ever read (streamed into a container), never mounted, never changed |

Result kept as history: the full-speed replay through the real Zabbix on 2026-11-27 (run `20261127T025922Z`) sent 134,842 messages in 279.1 s with 0 failures and a lag p95 of 8 ms, and raised one problem. An earlier full-speed attempt stalled because a minute-long `count()` trigger on the busy all-lines item saturated the single history syncer that handles that item (`History cache is full`); the fix was to put the trigger on an error-only item and leave the busy item without a trigger. Keep that in mind for any future load on the real Zabbix.

## Cleanup done (D19), 2026-11-27
Done at the owner's request on 2026-11-27, about 06:55 to 07:05 UTC testbed time, after a read-only survey and a check that each target was used only by the thing being removed. Everything was removed by exact name; nothing was matched by a pattern across the host.

**State found first (observed):** `zbxai_replay` was **running** (started 2026-11-27 06:09 UTC, restart policy `no`, published `0.0.0.0:18090`, only the idle monitor-page process, no run active, no new run file since 2026-11-26 22:04), although this KB had it stopped and removed; `zbxai_edge` and `zbxai_mcp` were running; `zbxai_llama`, `zbxai_postgres`, `zbxai_zabbix_server` and `zbxai_zabbix_web` had started at 05:42 UTC; `zbxai_grafana` had been exited since 2026-11-24.

**Removed:**
- Containers `zbxai_replay`, `zbxai_edge` and `zbxai_mcp` (`docker rm -f -v`).
- Volumes `zbxai_edge_conf` and `zbxai_replay_data`.
- Images `zbxai_replay:dev`, `nginxinc/nginx-unprivileged:stable-alpine` and `zabbix/zabbix-mcp-server:alpine-8.0-latest`, each used only by its removed container.
- The folder `/unified/user/cj/data/replay_out` (18 run files, 258 MB); `/unified/user/cj/data/log_files` was not touched.
- The secrets `deploy/secrets/llama-api-key` and `deploy/secrets/replay/`; `deploy/secrets/web-credential` was kept.
- The testbed's copies of `deploy/edge/`, `scripts/edge-init.sh` and `scripts/check-edge.sh`.
- The `.env` keys `ZBXAI_EDGE_BIND`, `ZBXAI_EDGE_PORT` and `ZBXAI_ZBXWEB_BIND` (values not read; a temporary backup of `.env` was deleted again).

**Changed:**
- `scripts/zbxai-stack.sh` (testbed only, in neither git repo): `edge` and `mcp` were taken out of its start order and its comment; `receiver`, `worker` and `disk_reporter` stay. A backup of the old file exists only in the working session's scratchpad.
- `deploy/compose.yaml`, `deploy/versions.env` and `deploy/.env.example` were replaced by the codebase files of commit `ebc71e3` (verified identical). The testbed's old `compose.yaml` had been identical to the pre-cut commit `b3d3392`; its `versions.env` only lacked the `PYTHON_*` pins.
- `docker compose config -q` is valid on the testbed with the real `.env` (this settles the earlier note that the edited compose file was not validated).
- `docker compose up -d --no-deps zabbix-web` recreated only `zbxai_zabbix_web`, now `127.0.0.1:18080->8080` and healthy. `zbxai_llama`, `zbxai_postgres` and `zbxai_zabbix_server` kept their start times and restart counts (0); `zbxai_grafana` is still exited.

**Verified afterwards (observed):**
- Containers: `zbxai_grafana` (exited), `zbxai_llama`, `zbxai_postgres`, `zbxai_zabbix_server` and `zbxai_zabbix_web` (all healthy).
- Volumes: `zbxai_grafana`, `zbxai_models`, `zbxai_pgdata` and `zbxai_secrets`.
- Images `zbxai_runtime:dev` and `zbxai_test:3f1fc1c51283` were kept as tooling.
- `ss` shows only 22 and `127.0.0.1:18080` listening; `GET http://127.0.0.1:18080/` on the testbed answers 200; from the workstation the LAN ports 18080, 18081 and 18090 refuse connections.
- The `ch1` to `ch4` containers do not show in `docker ps -a` (as already noted 2026-11-24); the network `clickhouse-testing-env` is still there. None of it was touched.

**Zabbix web now needs an ssh tunnel:** `ssh -L 18080:127.0.0.1:18080 <testbed>`, then `http://127.0.0.1:18080` on the workstation.

**Still open:** regenerating `requirements.lock`, which still lists `mcp` and its dependencies (backlog `regenerate-lock`). It is not a leftover; `scripts/lock.sh` needs a throwaway network and a download on the testbed, so it still needs its own go. The testbed code root holds only `deploy/`, `scripts/`, `.env`, `.dockerignore` and `.gitignore` (no `src/`, `tools/` or `tests/`; it never held them).

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
- Once containers exist, check that Grafana is reachable from the workstation (same 10.168.48.0/22 LAN) without touching
  the testbed's configuration. Zabbix web is loopback-only after D19: reach it through an ssh tunnel.
- The owner gave the go on 2026-11-27 to remove what D19 cut from the testbed; it is done ([Cleanup done](#cleanup-done-d19-2026-11-27)). Anything else on the testbed still needs its own go.

## Not the same machine
The workstation `dataweb` (10.168.49.20), where this KB was initialised, is not the testbed. Confirm which
machine you are on, and do not treat one host's state as the other's.
